#!/usr/bin/env node
/**
 * LPSN MCP Server
 *
 * A Model Context Protocol (MCP) server that provides access to the
 * LPSN (List of Prokaryotic names with Standing in Nomenclature)
 * database hosted by DSMZ (https://lpsn.dsmz.de/).
 *
 * The server exposes the following tools:
 *   1. search_taxa          – search for prokaryotic names
 *   2. get_taxon_detail      – retrieve full detail for a taxon
 *   3. get_classification    – get the complete lineage / classification
 *   4. browse_by_rank        – browse taxa by rank (species, genus, …)
 *   5. get_nomenclature_info – read the nomenclature rules page
 *   6. get_classification_info – read the classification info page
 *   7. get_text_page         – read any LPSN info text page
 *
 * It communicates over stdio using the MCP protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  searchLpsn,
  getTaxonDetail,
  getClassification,
  getTextPage,
  getNomenclatureInfo,
  getClassificationInfo,
  browseByRank,
  LPSN_BASE,
} from "./lpsn-fetcher.js";

/* ----------------------------------------------------------------------- *
 *  Tool definitions
 * ----------------------------------------------------------------------- */

const SERVER_NAME = "lpsn-mcp";
const SERVER_VERSION = "0.1.0";

/** Zod schema for each tool's input. */
const searchSchema = z.object({
  query: z.string().describe("The prokaryotic name (or part of it) to search for, e.g. 'Escherichia coli' or 'Bacillus'."),
  exact: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, request an exact-name match. Default is false (fuzzy search)."),
});

const detailSchema = z.object({
  name_or_url: z
    .string()
    .describe(
      "Either the full URL of a taxon page on LPSN (obtained from a previous search) " +
      "or the scientific name of the taxon to look up, e.g. 'Escherichia coli'."
    ),
});

const classificationSchema = z.object({
  name_or_url: z
    .string()
    .describe(
      "Either the full URL of a taxon page on LPSN or the scientific name " +
      "of the taxon to classify, e.g. 'Escherichia coli'."
    ),
});

const browseSchema = z.object({
  rank: z
    .enum(["domain", "kingdom", "phylum", "class", "order", "family", "genus", "species"])
    .describe("The taxonomic rank to browse."),
  letter: z
    .string()
    .optional()
    .describe("Optional first letter to filter the list (e.g. 'A')."),
});

const textPageSchema = z.object({
  path: z
    .string()
    .describe(
      "The path of the LPSN text page, e.g. 'text/nomenclature', " +
      "'text/navigation', or 'text/etymology'."
    ),
});

/* ----------------------------------------------------------------------- *
 *  Helpers
 * ----------------------------------------------------------------------- */

/** Format search results as human-readable text. */
function formatSearchResults(results: Awaited<ReturnType<typeof searchLpsn>>): string {
  if (results.length === 0) {
    return "No results found.";
  }
  const lines: string[] = [`Found ${results.length} result(s):\n`];
  for (const r of results) {
    lines.push(`• ${r.name}`);
    if (r.rank) lines.push(`  Rank: ${r.rank}`);
    if (r.status) lines.push(`  Status: ${r.status}`);
    if (r.typeStrain) lines.push(`  Type strain: ${r.typeStrain}`);
    if (r.etymology) lines.push(`  Etymology: ${r.etymology}`);
    lines.push(`  URL: ${r.url}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Format taxon detail as human-readable text. */
function formatTaxonDetail(d: NonNullable<Awaited<ReturnType<typeof getTaxonDetail>>>): string {
  const lines: string[] = [];
  lines.push(`Name: ${d.name}`);
  lines.push(`Rank: ${d.rank || "(unknown)"}`);
  lines.push(`URL: ${d.url}`);
  if (d.status) lines.push(`Status: ${d.status}`);
  if (d.etymology) lines.push(`Etymology: ${d.etymology}`);
  if (d.gender) lines.push(`Gender: ${d.gender}`);
  if (d.typeStrain) lines.push(`Type strain: ${d.typeStrain}`);
  if (d.typeSpecies) lines.push(`Type species: ${d.typeSpecies}`);
  if (d.riskGroup) lines.push(`Risk group: ${d.riskGroup}`);

  if (d.parentTaxa.length) {
    lines.push("\nParent taxa (lineage):");
    for (const p of d.parentTaxa) {
      lines.push(`  • ${p.name} (${p.rank})`);
    }
  }

  if (d.childTaxa.length) {
    lines.push(`\nChild taxa (${d.childTaxa.length}):`);
    // Show up to 50 to avoid very long output.
    for (const c of d.childTaxa.slice(0, 50)) {
      lines.push(`  • ${c.name} (${c.rank})`);
    }
    if (d.childTaxa.length > 50) {
      lines.push(`  … and ${d.childTaxa.length - 50} more`);
    }
  }

  if (d.synonyms.length) {
    lines.push(`\nSynonyms: ${d.synonyms.join(", ")}`);
  }
  if (d.basonyms.length) {
    lines.push(`\nBasonyms: ${d.basonyms.join(", ")}`);
  }

  if (d.notes.length) {
    lines.push("\nNotes:");
    for (const n of d.notes) {
      lines.push(`  ${n}`);
    }
  }

  if (d.references.length) {
    lines.push("\nReferences:");
    for (const ref of d.references) {
      lines.push(`  • ${ref}`);
    }
  }

  return lines.join("\n");
}

/** Format classification result as human-readable text. */
function formatClassification(
  result: NonNullable<Awaited<ReturnType<typeof getClassification>>>
): string {
  const lines: string[] = [];
  lines.push(`Classification for: ${result.target.name} (${result.target.rank})`);
  lines.push(`URL: ${result.target.url}`);
  lines.push("\nLineage (domain → species):");
  for (const node of result.lineage) {
    lines.push(`  ${node.rank || "?"}: ${node.name}`);
  }
  lines.push(`  ${result.target.rank || "?"}: ${result.target.name}  ← target`);
  return lines.join("\n");
}

/** Format a text page as human-readable text. */
function formatTextPage(
  page: Awaited<ReturnType<typeof getTextPage>>
): string {
  const lines: string[] = [];
  lines.push(`Title: ${page.title}`);
  lines.push(`URL: ${page.url}`);
  for (const sec of page.sections) {
    lines.push(`\n## ${sec.heading}`);
    for (const p of sec.paragraphs) {
      lines.push(p);
    }
  }
  return lines.join("\n");
}

/* ----------------------------------------------------------------------- *
 *  Server setup
 * ----------------------------------------------------------------------- */

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

/** List tools handler. */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_taxa",
        description:
          "Search the LPSN database for prokaryotic names (bacteria and archaea). " +
          "Returns matching taxon names with their rank, status, and LPSN URL. " +
          "Use this tool to find taxa by scientific name or partial name. " +
          "LPSN URL: https://lpsn.dsmz.de/",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "The prokaryotic name (or part of it) to search for, e.g. 'Escherichia coli' or 'Bacillus'.",
            },
            exact: {
              type: "boolean",
              description:
                "If true, request an exact-name match. Default is false (fuzzy search).",
              default: false,
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_taxon_detail",
        description:
          "Retrieve detailed information about a specific prokaryotic taxon from LPSN, " +
          "including etymology, type strain, status, synonyms, basonyms, parent and child taxa, " +
          "notes, and references. Provide either a scientific name or a full LPSN URL.",
        inputSchema: {
          type: "object",
          properties: {
            name_or_url: {
              type: "string",
              description:
                "Either the full URL of a taxon page on LPSN (from a previous search) " +
                "or the scientific name, e.g. 'Escherichia coli'.",
            },
          },
          required: ["name_or_url"],
        },
      },
      {
        name: "get_classification",
        description:
          "Get the complete taxonomic classification (lineage) for a prokaryotic name, " +
          "from domain down to the target taxon. Walks up the parent chain on LPSN.",
        inputSchema: {
          type: "object",
          properties: {
            name_or_url: {
              type: "string",
              description:
                "Either the full URL of a taxon page on LPSN or the scientific name.",
            },
          },
          required: ["name_or_url"],
        },
      },
      {
        name: "browse_by_rank",
        description:
          "Browse the list of all taxa at a given taxonomic rank on LPSN " +
          "(domain, phylum, class, order, family, genus, species). " +
          "Optionally filter by the first letter of the name.",
        inputSchema: {
          type: "object",
          properties: {
            rank: {
              type: "string",
              enum: ["domain", "kingdom", "phylum", "class", "order", "family", "genus", "species"],
              description: "The taxonomic rank to browse.",
            },
            letter: {
              type: "string",
              description: "Optional first letter to filter (e.g. 'A').",
            },
          },
          required: ["rank"],
        },
      },
      {
        name: "get_nomenclature_info",
        description:
          "Read the nomenclature rules and guidelines page from LPSN. " +
          "Returns structured text explaining how prokaryotic nomenclature works " +
          "according to the International Code of Nomenclature of Prokaryotes (ICNP).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_classification_info",
        description:
          "Read the navigation and classification information page from LPSN. " +
          "Returns structured text explaining how prokaryotes are organized, " +
          "how to browse taxa by rank, and what taxonomic ranks are used on LPSN.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_text_page",
        description:
          "Read any informational text page from the LPSN website. " +
          "Useful for pages like 'text/nomenclature', 'text/navigation', " +
          "'text/etymology', 'text/faq', etc.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "The path of the LPSN text page, e.g. 'text/nomenclature', " +
                "'text/navigation', or 'text/etymology'.",
            },
          },
          required: ["path"],
        },
      },
    ],
  };
});

/** Call tool handler. */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_taxa": {
        const parsed = searchSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid arguments: ${parsed.error.message}`,
              },
            ],
            isError: true,
          };
        }
        const results = await searchLpsn(parsed.data.query, parsed.data.exact);
        return {
          content: [{ type: "text", text: formatSearchResults(results) }],
        };
      }

      case "get_taxon_detail": {
        const parsed = detailSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              { type: "text", text: `Invalid arguments: ${parsed.error.message}` },
            ],
            isError: true,
          };
        }
        const detail = await getTaxonDetail(parsed.data.name_or_url);
        if (!detail) {
          return {
            content: [
              {
                type: "text",
                text: `Taxon "${parsed.data.name_or_url}" was not found on LPSN.`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: formatTaxonDetail(detail) }],
        };
      }

      case "get_classification": {
        const parsed = classificationSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              { type: "text", text: `Invalid arguments: ${parsed.error.message}` },
            ],
            isError: true,
          };
        }
        const result = await getClassification(parsed.data.name_or_url);
        if (!result) {
          return {
            content: [
              {
                type: "text",
                text: `Could not retrieve classification for "${parsed.data.name_or_url}".`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: formatClassification(result) }],
        };
      }

      case "browse_by_rank": {
        const parsed = browseSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              { type: "text", text: `Invalid arguments: ${parsed.error.message}` },
            ],
            isError: true,
          };
        }
        const results = await browseByRank(parsed.data.rank, parsed.data.letter);
        return {
          content: [{ type: "text", text: formatSearchResults(results) }],
        };
      }

      case "get_nomenclature_info": {
        const page = await getNomenclatureInfo();
        return {
          content: [{ type: "text", text: formatTextPage(page) }],
        };
      }

      case "get_classification_info": {
        const page = await getClassificationInfo();
        return {
          content: [{ type: "text", text: formatTextPage(page) }],
        };
      }

      case "get_text_page": {
        const parsed = textPageSchema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [
              { type: "text", text: `Invalid arguments: ${parsed.error.message}` },
            ],
            isError: true,
          };
        }
        const page = await getTextPage(parsed.data.path);
        return {
          content: [{ type: "text", text: formatTextPage(page) }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: `Error calling tool "${name}": ${message}`,
        },
      ],
      isError: true,
    };
  }
});

/* ----------------------------------------------------------------------- *
 *  Main entry point
 * ----------------------------------------------------------------------- */

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't interfere with stdio MCP protocol.
  console.error(`[${SERVER_NAME} v${SERVER_VERSION}] server started — connected to LPSN at ${LPSN_BASE}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
