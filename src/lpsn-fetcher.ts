/**
 * LPSN Fetcher
 *
 * Responsible for all HTTP communication with the LPSN website
 * (https://lpsn.dsmz.de/).  It downloads HTML pages, parses them with
 * cheerio and returns structured JavaScript objects that the MCP tools
 * can consume.
 */

import * as cheerio from "cheerio";

/** Type alias for a loaded cheerio instance. */
type CheerioAPI = ReturnType<typeof cheerio.load>;

/** Base URL of the LPSN portal. */
export const LPSN_BASE = "https://lpsn.dsmz.de";

/** Default request timeout in milliseconds. */
const DEFAULT_TIMEOUT = 30_000;

/** A single search result returned by the LPSN search page. */
export interface LpsnSearchResult {
  /** The scientific name (e.g. "Escherichia coli"). */
  name: string;
  /** Rank of the taxon (e.g. "species", "genus"). */
  rank: string;
  /** Short status / standing string. */
  status: string;
  /** Relative or absolute URL to the detail page. */
  url: string;
  /** The type strain if listed on the search result. */
  typeStrain?: string;
  /** Etymology text if shown. */
  etymology?: string;
}

/** Detailed information about a single taxon. */
export interface LpsnTaxonDetail {
  /** Canonical name. */
  name: string;
  /** Taxonomic rank. */
  rank: string;
  /** Full URL of the detail page on LPSN. */
  url: string;
  /** Current nomenclatural status. */
  status: string;
  /** Etymology / derivation of the name. */
  etymology?: string;
  /** Gender of the name (where applicable). */
  gender?: string;
  /** Type strain information. */
  typeStrain?: string;
  /** Type species of the genus (for genus entries). */
  typeSpecies?: string;
  /** Higher-rank parents, ordered from immediate parent upward. */
  parentTaxa: LpsnParentLink[];
  /** Child taxa (for genera and higher ranks). */
  childTaxa: LpsnChildLink[];
  /** Synonyms and alternative names. */
  synonyms: string[];
  /** Basonyms / replaced names. */
  basonyms: string[];
  /** Free-text notes (combined). */
  notes: string[];
  /** IJSEM notification / effective publication references. */
  references: string[];
  /** Risk group (biosafety) if listed. */
  riskGroup?: string;
}

export interface LpsnParentLink {
  name: string;
  rank: string;
  url: string;
}

export interface LpsnChildLink {
  name: string;
  rank: string;
  url: string;
}

/** Classification tree node. */
export interface LpsnClassificationNode {
  name: string;
  rank: string;
  url: string;
  children?: LpsnClassificationNode[];
}

/** Nomenclature info page content. */
export interface LpsnNomenclatureInfo {
  title: string;
  url: string;
  /** Headings → paragraph texts. */
  sections: { heading: string; paragraphs: string[] }[];
}

/** Generic info text page (e.g. /text/...). */
export interface LpsnTextPage {
  title: string;
  url: string;
  sections: { heading: string; paragraphs: string[] }[];
}

/* ----------------------------------------------------------------------- *
 *  HTTP helper
 * ----------------------------------------------------------------------- */

async function fetchText(url: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // LPSN is a public site; a normal browser UA keeps it happy.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    }
    const text = await res.text();
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve a possibly-relative href to an absolute URL. */
function resolveUrl(href: string | undefined): string {
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("/")) return LPSN_BASE + href;
  return LPSN_BASE + "/" + href;
}

/** Collapse whitespace in a string. */
function clean(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/\s+/g, " ").trim();
}

/* ----------------------------------------------------------------------- *
 *  Search
 * ----------------------------------------------------------------------- */

/**
 * Search the LPSN database for prokaryotic names.
 *
 * The LPSN search page (/search?word=<query>) renders results as a series of
 * <ul class="tree-view"> elements, each headed by a rank label (e.g. "species (1)").
 * Inside each <ul> there is a nested <ul> with <li><a> entries for every match.
 * Each entry may be followed by an <abbr> tag whose `title` attribute describes
 * the nomenclatural status.
 *
 * @param query     search term (taxon name or part of it)
 * @param exact     if true, request an exact match (appends &match=exact)
 * @returns list of search results
 */
export async function searchLpsn(query: string, exact = false): Promise<LpsnSearchResult[]> {
  const params = new URLSearchParams();
  params.set("word", query);
  if (exact) params.set("match", "exact");
  const url = `${LPSN_BASE}/search?${params.toString()}`;

  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const results: LpsnSearchResult[] = [];

  // Each <ul class="tree-view"> represents a rank group.
  // Structure:
  //   <ul class="tree-view">
  //     <li>
  //       <span class="open"><b>species (1)</b></span>
  //       <ul>
  //         <li><a href="/species/...">name</a> <abbr title="...">emoji</abbr></li>
  //       </ul>
  //     </li>
  //   </ul>
  $("ul.tree-view").each((_i: number, el) => {
    const $tree = $(el);
    // The rank label is inside the first <b> tag.
    const rankLabel = clean($tree.find("> li > span > b").first().text());
    // e.g. "species (1)" → rank = "species"
    const rank = rankLabel.replace(/\s*\(\d+\)\s*/g, "").trim().toLowerCase();

    // Each result is an <a> inside the nested <ul><li>.
    $tree.find("ul li a").each((_j: number, a) => {
      const $a = $(a);
      const name = clean($a.text());
      const href = resolveUrl($a.attr("href"));
      if (!name || !href) return;

      // The status may be in an adjacent <abbr> tag.
      let status = "";
      const $abbr = $a.next("abbr");
      if ($abbr.length) {
        status = clean($abbr.attr("title")) || clean($abbr.text());
      }

      results.push({ name, rank, status, url: href });
    });
  });

  // Fallback: look for any <a> whose text contains the query (case-insensitive).
  if (results.length === 0) {
    const lowerQuery = query.toLowerCase();
    $("a").each((_i: number, el) => {
      const $a = $(el);
      const text = clean($a.text());
      const href = resolveUrl($a.attr("href"));
      if (
        text &&
        href.startsWith(LPSN_BASE) &&
        text.toLowerCase().includes(lowerQuery) &&
        !results.some((r) => r.url === href)
      ) {
        // Only keep links that look like taxon pages (contain /species/, /genus/, etc.)
        if (/\/(species|genus|family|order|class|phylum|domain|kingdom|subspecies|variety|tribe)\//i.test(href)) {
          results.push({ name: text, rank: detectRankFromUrl(href), status: "", url: href });
        }
      }
    });
  }

  return results;
}

/* ----------------------------------------------------------------------- *
 *  Taxon detail
 * ----------------------------------------------------------------------- */

/**
 * Fetch the detail page for a single taxon.
 *
 * @param urlOrName  Either a full URL (from a previous search) or a taxon name
 *                   that will be searched first.
 */
export async function getTaxonDetail(urlOrName: string): Promise<LpsnTaxonDetail | null> {
  let url: string;
  let name: string;

  if (/^https?:\/\//i.test(urlOrName)) {
    url = urlOrName;
    // Try to extract the name from the URL.
    const m = url.match(/\/([^/]+)$/);
    name = m ? decodeURIComponent(m[1]).replace(/-/g, " ") : "unknown";
  } else {
    // Search for the name first.
    const results = await searchLpsn(urlOrName, true);
    if (results.length === 0) {
      // Try a non-exact search.
      const loose = await searchLpsn(urlOrName, false);
      if (loose.length === 0) return null;
      url = loose[0].url;
      name = loose[0].name;
    } else {
      url = results[0].url;
      name = results[0].name;
    }
  }

  const html = await fetchText(url);
  const $ = cheerio.load(html);

  const rank = detectRankFromUrl(url);

  // The nomenclatural status is in the <abbr> tag inside .nav-symbol.
  let status = "";
  const navSymbolAbbr = $(".nav-symbol abbr");
  if (navSymbolAbbr.length) {
    status = clean(navSymbolAbbr.attr("title")) || clean(navSymbolAbbr.text());
  }
  if (!status) {
    status = extractLabeledField($, ["nomenclatural status", "status"]) ?? "";
  }

  // The taxonomic status is a separate labeled field.
  // We merge it into status for convenience.
  const taxonomicStatus = extractLabeledField($, ["taxonomic status"]);
  if (taxonomicStatus) {
    status = status ? `${status}; ${taxonomicStatus}` : taxonomicStatus;
  }

  const etymology = extractLabeledField($, ["etymology"]);
  const gender = extractPronunciationGender($);
  const typeStrain = extractLabeledField($, ["type strain"]);
  const typeSpecies = extractLabeledField($, ["type species"]);
  const riskGroup = extractLabeledField($, ["risk group"]);

  // Parent taxa: LPSN detail pages have a .header-parent-taxa .classification
  // that contains the full lineage as <a> links. We also look for a "parent" link.
  const parentTaxa = extractParentTaxa($);
  const childTaxa = extractChildTaxa($, rank);
  const synonyms = extractListField($, ["synonym", "synonyms"]);
  const basonyms = extractListField($, ["basonym", "basonyms"]);
  const notes = extractNotes($);
  const references = extractReferences($);

  return {
    name,
    rank,
    url,
    status,
    etymology,
    gender,
    typeStrain,
    typeSpecies,
    parentTaxa,
    childTaxa,
    synonyms,
    basonyms,
    notes,
    references,
    riskGroup,
  };
}

/** Determine the taxonomic rank from a URL path segment. */
function detectRankFromUrl(url: string): string {
  const m = url.match(/\/(domain|kingdom|phylum|class|order|family|genus|species|subspecies|subgenus|tribe|variety)\//i);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Extract a single-value field whose label is inside a <b> tag.
 *
 * On LPSN detail pages, fields are formatted as:
 *   <p><b>Etymology:</b> <span>co'li.</span> L. neut. n. <i>coli</i>, of the colon</p>
 *   <p><b>Type strain:</b> <a href="...">ATCC 11775</a>; ...</p>
 *
 * The <b> tag contains the label (e.g. "Etymology:", "Type strain:").
 * The value is the remaining text of the parent element after the <b> tag.
 */
function extractLabeledField($: CheerioAPI, keywords: string[]): string | undefined {
  let value: string | undefined;
  $("b").each((_i: number, el) => {
    if (value) return;
    const $el = $(el);
    const label = clean($el.text()).toLowerCase().replace(/:$/, "");
    if (!keywords.some((k) => label.includes(k))) return;

    // Get the parent <p> element's full text, then remove the label part.
    const $parent = $el.parent("p");
    if ($parent.length) {
      // Clone and remove the <b> and any <a class="helper"> to get just the value.
      const $clone = $parent.clone();
      $clone.find("b").first().remove();
      $clone.find("a.helper").remove();
      const v = clean($clone.text());
      if (v) value = v;
    }
  });
  return value;
}

/**
 * Extract the gender from the "Pronunciation (Latin), gender:" field.
 * Format: <p><b>Pronunciation (Latin), gender:</b> e-s͡he-RI-kʰi-a KO-li, feminine</p>
 * We return only the gender part (e.g. "feminine").
 */
function extractPronunciationGender($: CheerioAPI): string | undefined {
  let gender: string | undefined;
  $("b").each((_i: number, el) => {
    if (gender) return;
    const $el = $(el);
    const label = clean($el.text()).toLowerCase();
    if (!label.includes("gender") || !label.includes("pronunciation")) return;
    const $parent = $el.parent("p");
    if ($parent.length) {
      const $clone = $parent.clone();
      $clone.find("b").first().remove();
      $clone.find("a.helper").remove();
      const fullText = clean($clone.text());
      // The gender is the last word after the last comma.
      const parts = fullText.split(",").map((s) => clean(s));
      if (parts.length >= 2) {
        const last = parts[parts.length - 1];
        if (last) gender = last;
      }
    }
  });
  return gender;
}

/**
 * Extract a list-type field (synonyms, basonyms, etc.).
 *
 * On LPSN detail pages, basonyms are formatted as:
 *   <p><b>Basonym:</b> <a href="/species/...">"Bacillus coli" Migula 1895</a></p>
 *
 * We look for <b> tags whose text matches the keywords, then collect the
 * text from the parent <p> (excluding the label itself).
 */
function extractListField($: CheerioAPI, keywords: string[]): string[] {
  const items: string[] = [];
  $("b").each((_i: number, el) => {
    const $el = $(el);
    const label = clean($el.text()).toLowerCase().replace(/:$/, "");
    if (!keywords.some((k) => label.includes(k))) return;

    // Collect text from the parent <p> after the <b> tag.
    const $parent = $el.parent("p");
    if ($parent.length) {
      const $clone = $parent.clone();
      $clone.find("b").first().remove();
      $clone.find("a.helper").remove();
      const text = clean($clone.text());
      if (text) {
        // Split on semicolons or commas for multiple values.
        items.push(...text.split(/[;,]/).map((s) => clean(s)).filter(Boolean));
      }
    }
  });
  // Deduplicate.
  return [...new Set(items)];
}

/**
 * Extract parent taxa (lineage) links.
 *
 * On LPSN detail pages, the full classification is in:
 *   <div class="header-parent-taxa">
 *     <div class="classification">
 *       <a href="/domain/bacteria">Bacteria</a>
 *       <a href="/kingdom/...">...</a>
 *       <a href="/phylum/...">...</a>
 *       ...
 *       <a href="/species/escherichia-coli">Escherichia coli</a>  ← target (included)
 *     </div>
 *   </div>
 *
 * We also check for a "parent" link in .nav-parent.
 */
function extractParentTaxa($: CheerioAPI): LpsnParentLink[] {
  const parents: LpsnParentLink[] = [];
  const seen = new Set<string>();

  // Primary: the .classification div contains the full lineage.
  $(".classification a, .header-parent-taxa a").each((_i: number, el) => {
    const $a = $(el);
    const name = clean($a.text());
    const href = resolveUrl($a.attr("href"));
    if (!name || !href || href === LPSN_BASE + "/") return;
    if (seen.has(href)) return;
    seen.add(href);
    parents.push({ name, rank: detectRankFromUrl(href), url: href });
  });

  // Fallback: look for a "parent" link in the navigation.
  if (parents.length === 0) {
    $(".nav-parent a").each((_i: number, el) => {
      const $a = $(el);
      const name = clean($a.text());
      const href = resolveUrl($a.attr("href"));
      if (!name || !href || name === "parent") return;
      if (seen.has(href)) return;
      seen.add(href);
      parents.push({ name, rank: detectRankFromUrl(href), url: href });
    });
  }

  return parents;
}

/**
 * Extract child taxa links.
 *
 * On LPSN detail pages, children are in the navigation:
 *   <li class="nav-child">
 *     <span class="open-children">children</span>
 *     <ul>
 *       <li class="title">Children</li>
 *       <li><a href="/subspecies/...">name</a></li>
 *       <li><a href="/variety/...">name</a></li>
 *     </ul>
 *   </li>
 *
 * We also check .nav-sibling for sibling taxa.
 */
function extractChildTaxa($: CheerioAPI, _rank: string): LpsnChildLink[] {
  const children: LpsnChildLink[] = [];
  const seen = new Set<string>();

  // Primary: .nav-child contains direct children.
  $(".nav-child a").each((_i: number, el) => {
    const $a = $(el);
    const name = clean($a.text());
    const href = resolveUrl($a.attr("href"));
    if (!name || !href) return;
    if (seen.has(href)) return;
    seen.add(href);
    children.push({ name, rank: detectRankFromUrl(href), url: href });
  });

  return children;
}

/**
 * Extract free-text notes.
 *
 * On LPSN detail pages, notes may be in <p> elements with <b> labels such as
 * "Note:", "Comment:", or in the general content area. We collect paragraphs
 * that are not already captured by other field extractors.
 */
function extractNotes($: CheerioAPI): string[] {
  const notes: string[] = [];
  const noteKeywords = ["note", "comment", "remark", "description"];

  // Look for <b> tags whose label matches note keywords.
  $("b").each((_i: number, el) => {
    const $el = $(el);
    const label = clean($el.text()).toLowerCase().replace(/:$/, "");
    if (!noteKeywords.some((k) => label.includes(k))) return;
    const $parent = $el.parent("p");
    if ($parent.length) {
      const $clone = $parent.clone();
      $clone.find("b").first().remove();
      $clone.find("a.helper").remove();
      const text = clean($clone.text());
      if (text) notes.push(text);
    }
  });

  return notes;
}

/**
 * Extract reference / publication entries.
 *
 * On LPSN detail pages, references are in <p> elements with <b> labels such as
 * "Effective publication:", "IJSEM list:", "Valid publication:".
 */
function extractReferences($: CheerioAPI): string[] {
  const refs: string[] = [];
  const refKeywords = ["effective publication", "ijsem list", "valid publication", "reference", "publication"];

  $("b").each((_i: number, el) => {
    const $el = $(el);
    const label = clean($el.text()).toLowerCase().replace(/:$/, "");
    if (!refKeywords.some((k) => label.includes(k))) return;
    const $parent = $el.parent("p");
    if ($parent.length) {
      const $clone = $parent.clone();
      $clone.find("b").first().remove();
      $clone.find("a.helper").remove();
      $clone.find("img").remove();
      const text = clean($clone.text());
      if (text && text.length > 10) refs.push(text);
    }
  });

  return refs;
}

/* ----------------------------------------------------------------------- *
 *  Classification
 * ----------------------------------------------------------------------- */

/**
 * Get the full classification (lineage) for a taxon.
 * Returns the list of parent taxa from domain down to the taxon itself.
 */
export async function getClassification(
  urlOrName: string
): Promise<{ lineage: LpsnParentLink[]; target: { name: string; rank: string; url: string } } | null> {
  const detail = await getTaxonDetail(urlOrName);
  if (!detail) return null;

  // LPSN detail pages include a .classification div that already contains
  // the complete lineage from domain down to the target taxon. The
  // extractParentTaxa() function collects all <a> links in that div, so
  // detail.parentTaxa already has the full lineage (including the target
  // itself as the last entry).
  const lineage: LpsnParentLink[] = detail.parentTaxa.filter(
    (p) => p.url !== detail.url
  );

  // Sort lineage from domain → species (highest rank first).
  const rankOrder = [
    "domain", "kingdom", "phylum", "class", "order",
    "family", "genus", "species", "subspecies", "variety", "tribe",
  ];
  lineage.sort((a, b) => {
    const ia = rankOrder.indexOf(a.rank);
    const ib = rankOrder.indexOf(b.rank);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return {
    lineage,
    target: { name: detail.name, rank: detail.rank, url: detail.url },
  };
}

/* ----------------------------------------------------------------------- *
 *  Nomenclature / text pages
 * ----------------------------------------------------------------------- */

/**
 * Fetch a generic info text page from LPSN (e.g. /text/nomenclature,
 * /text/classification, /text/lpsn-history).
 */
export async function getTextPage(path: string): Promise<LpsnTextPage> {
  const url = path.startsWith("http") ? path : `${LPSN_BASE}/${path.replace(/^\//, "")}`;
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const title = clean($("title").text()) || clean($("h1").first().text()) || path;

  const sections: { heading: string; paragraphs: string[] }[] = [];

  // LPSN text pages use <button class="accordion">Title</button> <div class="panel">...</div>
  // Each accordion button is followed by a panel div containing <p> elements.
  let hasAccordion = false;
  $("button.accordion").each((_i: number, el) => {
    const $btn = $(el);
    const heading = clean($btn.text());
    if (!heading) return;
    hasAccordion = true;

    // The panel is the next sibling div.panel.
    const $panel = $btn.next("div.panel");
    const paragraphs: string[] = [];
    if ($panel.length) {
      $panel.find("p").each((_j: number, p) => {
        const text = clean($(p).text());
        if (text) paragraphs.push(text);
      });
    }
    sections.push({ heading, paragraphs });
  });

  // Fallback: standard heading + paragraph structure.
  if (!hasAccordion) {
    const contentRoot =
      $("main").first().length ? $("main").first() :
      $("#content").first().length ? $("#content").first() :
      $("#static-page").first().length ? $("#static-page").first() :
      $(".content").first().length ? $(".content").first() :
      $("body");

    let currentHeading = "Overview";
    let currentParas: string[] = [];

    contentRoot.find("h1, h2, h3, h4, h5, h6, p, li").each((_i: number, el) => {
      const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? "";
      const $el = $(el);
      const text = clean($el.text());
      if (!text) return;
      if (/^h[1-6]$/.test(tag)) {
        if (currentParas.length) {
          sections.push({ heading: currentHeading, paragraphs: currentParas });
        }
        currentHeading = text;
        currentParas = [];
      } else {
        currentParas.push(text);
      }
    });
    if (currentParas.length) {
      sections.push({ heading: currentHeading, paragraphs: currentParas });
    }
  }

  return { title, url, sections };
}

/**
 * Get nomenclature information page content.
 */
export async function getNomenclatureInfo(): Promise<LpsnNomenclatureInfo> {
  const page = await getTextPage("text/nomenclature");
  return page;
}

/**
 * Get classification / navigation information page content.
 *
 * Note: LPSN previously had a dedicated /text/classification page, but it
 * has been removed. The /text/navigation page now contains the relevant
 * information about how taxa are organized and browsed on LPSN.
 */
export async function getClassificationInfo(): Promise<LpsnNomenclatureInfo> {
  const page = await getTextPage("text/navigation");
  return page;
}

/* ----------------------------------------------------------------------- *
 *  Browse by rank
 * ----------------------------------------------------------------------- */

/**
 * Browse taxa at a given rank.  LPSN provides list pages such as
 * /species, /genus, /family, etc.
 *
 * The list pages use pagination via ?page=<LETTER> (e.g. /genus?page=A).
 * Results are rendered in a <ul class="main-list"> with <li> entries,
 * each containing a .tax-breadcrumb with lineage links and a link to the
 * taxon itself. The taxon's own link has a class like "last-child color-<rank>".
 */
export async function browseByRank(
  rank: string,
  letter?: string
): Promise<LpsnSearchResult[]> {
  const validRanks = ["domain", "kingdom", "phylum", "class", "order", "family", "genus", "species"];
  const r = rank.toLowerCase();
  if (!validRanks.includes(r)) {
    throw new Error(`Invalid rank "${rank}". Valid ranks: ${validRanks.join(", ")}`);
  }
  let url = `${LPSN_BASE}/${r}`;
  if (letter) {
    url += `?page=${encodeURIComponent(letter.toUpperCase())}`;
  }
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const results: LpsnSearchResult[] = [];
  const seen = new Set<string>();

  // Each <li> in the main list contains a .tax-tree with lineage links.
  // The taxon itself is the last <a> with class "last-child".
  $("ul.main-list > li").each((_i: number, el) => {
    const $li = $(el);
    // The taxon link has class "last-child" or is the last <a> in .tax-tree.
    let $link = $li.find("a.last-child").first();
    if (!$link.length) {
      $link = $li.find(".tax-tree a").last();
    }
    if (!$link.length) return;
    const name = clean($link.text());
    const href = resolveUrl($link.attr("href"));
    if (!name || !href) return;
    if (seen.has(href)) return;
    seen.add(href);

    // Try to find status from an adjacent <abbr> tag.
    let status = "";
    const $abbr = $li.find("abbr").first();
    if ($abbr.length) {
      status = clean($abbr.attr("title")) || clean($abbr.text());
    }

    results.push({ name, rank: r, status, url: href });
  });

  // Fallback: collect all links that look like taxon pages of this rank.
  if (results.length === 0) {
    $("a").each((_i: number, el) => {
      const $a = $(el);
      const href = resolveUrl($a.attr("href"));
      const name = clean($a.text());
      if (
        name &&
        href &&
        new RegExp(`/${r}/`, "i").test(href) &&
        !seen.has(href)
      ) {
        seen.add(href);
        results.push({ name, rank: r, status: "", url: href });
      }
    });
  }

  return results;
}
