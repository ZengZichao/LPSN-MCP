# LPSN-MCP

**Version 0.1.0**

> **⚠️ Disclaimer: This is an unofficial, community-driven MCP server.**
> It is not affiliated with, endorsed by, or officially associated with
> the Leibniz Institute DSMZ or the LPSN database.

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that provides AI assistants with access to the [LPSN (List of Prokaryotic names with Standing in Nomenclature)](https://lpsn.dsmz.de/) database, hosted by [DSMZ](https://www.dsmz.de/) (Leibniz Institute DSMZ – German Collection of Microorganisms and Cell Cultures).

---

## Table of Contents

1. [Overview](#overview)
2. [What is LPSN?](#what-is-lpsn)
3. [Features / Available Tools](#features--available-tools)
4. [Prerequisites](#prerequisites)
5. [Installation](#installation)
6. [Build](#build)
7. [Configuration](#configuration)
8. [Usage](#usage)
9. [Tool Reference](#tool-reference)
10. [Architecture](#architecture)
11. [Development](#development)
12. [Limitations & Disclaimer](#limitations--disclaimer)
13. [License](#license)

---

## Overview

LPSN-MCP is a bridge between Large Language Model (LLM) assistants that support the Model Context Protocol and the LPSN prokaryotic nomenclature database. It allows an AI assistant (such as Claude Desktop, Cursor, or any MCP-compatible client) to:

- **Search** for prokaryotic names (bacteria and archaea)
- **Retrieve detailed information** about any taxon (etymology, type strain, status, synonyms, parent/child taxa, references, etc.)
- **Get the full classification** (lineage) of any prokaryotic name from domain down to species
- **Browse** taxa by taxonomic rank (domain, phylum, class, order, family, genus, species)
- **Read** the nomenclature rules and classification information pages on LPSN

All data is fetched in real time from the public LPSN website at `https://lpsn.dsmz.de/`. No API key or registration is required.

---

## What is LPSN?

The **List of Prokaryotic names with Standing in Nomenclature (LPSN)** is a publicly available, curated database maintained by the Leibniz Institute DSMZ. It provides:

- Up-to-date information on **all prokaryotic names** (Bacteria and Archaea) that have standing in nomenclature under the *International Code of Nomenclature of Prokaryotes (ICNP)*.
- **Taxonomic classification** of each named taxon.
- **Nomenclatural status** (e.g., validly published, illegitimate, rejected).
- **Etymology** of names.
- **Type strains** and type species.
- **Synonyms** and **basonyms**.
- References to the *International Journal of Systematic and Evolutionary Microbiology (IJSEM)* and other validation sources.

LPSN is widely used by microbiologists, taxonomists, bioinformaticians, and students worldwide.

---

## Features / Available Tools

This MCP server exposes **7 tools**:

| # | Tool | Description |
|---|------|-------------|
| 1 | `search_taxa` | Search for prokaryotic names by full or partial name |
| 2 | `get_taxon_detail` | Get full detail for a specific taxon (etymology, type strain, synonyms, etc.) |
| 3 | `get_classification` | Get the complete lineage from domain to the target taxon |
| 4 | `browse_by_rank` | Browse all taxa at a given rank (domain, kingdom, phylum, class, order, family, genus, species), optionally filtered by first letter |
| 5 | `get_nomenclature_info` | Read the nomenclature rules page from LPSN |
| 6 | `get_classification_info` | Read the classification information page from LPSN |
| 7 | `get_text_page` | Read any LPSN informational text page by path |

---

## Prerequisites

- **Node.js** ≥ 18.0.0 (required for native `fetch` and `AbortController`)
- **npm** ≥ 9.0.0 (or **pnpm** / **yarn** – adjust commands accordingly)

---

## Installation

### Option A: Clone & Install

```bash
git clone <your-repo-url> lpsn-mcp
cd lpsn-mcp
npm install
```

### Option B: Use in an existing project

```bash
npm install lpsn-mcp
```

---

## Build

Compile the TypeScript source to JavaScript:

```bash
npm run build
```

This produces a `dist/` directory containing the compiled `index.js` and `lpsn-fetcher.js` (along with `.d.ts` declaration files and source maps).

For development without compilation, you can use `tsx`:

```bash
npm run dev
```

---

## Configuration

### Claude Desktop

Add the following to your `claude_desktop_config.json` file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "lpsn": {
      "command": "node",
      "args": [
        "/absolute/path/to/lpsn-mcp/dist/index.js"
      ]
    }
  }
}
```

### Cursor

In Cursor, go to **Settings → MCP Servers → Add Server**, or edit your settings:

```json
{
  "mcp.servers": {
    "lpsn": {
      "command": "node",
      "args": ["/absolute/path/to/lpsn-mcp/dist/index.js"]
    }
  }
}
```

### Generic MCP Client

Any MCP-compatible client can launch this server via:

```bash
node /path/to/lpsn-mcp/dist/index.js
```

The server communicates over **stdio** using the standard MCP JSON-RPC protocol.

---

## Usage

Once configured, you can ask your AI assistant natural-language questions such as:

- *"Search LPSN for Escherichia coli"*
- *"Get detailed information about the genus Bacillus from LPSN"*
- *"What is the full classification of Methanococcus jannaschii?"*
- *"Browse all families in LPSN starting with the letter 'A'"*
- *"What are the prokaryotic nomenclature rules according to LPSN?"*

The assistant will automatically invoke the appropriate MCP tool and present the results.

### Direct CLI Testing

You can also test the server directly by sending MCP JSON-RPC messages via stdin:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/index.js
```

---

## Tool Reference

### 1. `search_taxa`

Search the LPSN database for prokaryotic names.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | The name (or part of it) to search for, e.g. `"Escherichia coli"` or `"Bacillus"` |
| `exact` | boolean | No | If `true`, request an exact match. Default: `false` |

**Example output:**

```
Found 3 result(s):

• Escherichia coli
  Rank: species
  Status: validly published
  URL: https://lpsn.dsmz.de/species/escherichia-coli

• Escherichia
  Rank: genus
  Status: validly published
  URL: https://lpsn.dsmz.de/genus/escherichia
  ...
```

---

### 2. `get_taxon_detail`

Retrieve detailed information about a specific taxon.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name_or_url` | string | Yes | The scientific name (e.g. `"Escherichia coli"`) or a full LPSN URL from a previous search |

**Returns:** name, rank, URL, status, etymology, gender, type strain, type species, risk group, parent taxa, child taxa, synonyms, basonyms, notes, and references.

---

### 3. `get_classification`

Get the complete taxonomic lineage for a taxon.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name_or_url` | string | Yes | The scientific name or LPSN URL |

**Returns:** The full lineage from domain → phylum → class → order → family → genus → species, with the target taxon marked.

---

### 4. `browse_by_rank`

Browse the list of all taxa at a given rank.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rank` | enum | Yes | One of: `domain`, `kingdom`, `phylum`, `class`, `order`, `family`, `genus`, `species` |
| `letter` | string | No | Optional first-letter filter (e.g. `"A"`) |

---

### 5. `get_nomenclature_info`

Read the LPSN nomenclature information page. No parameters.

Returns structured text about how prokaryotic nomenclature works under the ICNP.

---

### 6. `get_classification_info`

Read the LPSN navigation and classification information page. No parameters.

Returns structured text about how prokaryotes are organized and how to browse taxa on LPSN.

---

### 7. `get_text_page`

Read any LPSN text page.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | The page path, e.g. `"text/nomenclature"`, `"text/navigation"`, `"text/etymology"` |

---

## Architecture

```
lpsn-mcp/
├── package.json          – NPM package definition & scripts
├── tsconfig.json         – TypeScript compiler configuration
├── src/
│   ├── index.ts          – MCP server entry point & tool definitions
│   └── lpsn-fetcher.ts   – LPSN website fetcher & HTML parser
├── dist/                 – Compiled output (generated by `npm run build`)
├── README.md             – English documentation (this file)
└── README.zh-CN.md       – Chinese documentation
```

### `lpsn-fetcher.ts`

This module handles all HTTP communication with the LPSN website. It uses the native `fetch` API to download HTML pages and `cheerio` to parse them. Key exported functions:

- `searchLpsn(query, exact)` — search for taxa
- `getTaxonDetail(nameOrUrl)` — get full detail
- `getClassification(nameOrUrl)` — get lineage
- `browseByRank(rank, letter)` — browse by rank
- `getTextPage(path)` — read a text page
- `getNomenclatureInfo()` — read nomenclature page
- `getClassificationInfo()` — read classification page

### `index.ts`

This module implements the MCP server using `@modelcontextprotocol/sdk`. It registers all 7 tools, validates input with `zod`, calls the appropriate fetcher function, and formats the results as human-readable text returned to the LLM.

---

## Development

### Project Structure

The project is written in **TypeScript** (strict mode) and targets **ES2022**. It uses ES modules (`"type": "module"`).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run the compiled server |
| `npm run dev` | Run with `tsx` (no compilation needed) |

### Adding a New Tool

1. Add a new export function in `lpsn-fetcher.ts`.
2. Define a Zod schema and a format function in `index.ts`.
3. Add the tool to the `ListToolsRequestSchema` handler's `tools` array.
4. Add a `case` in the `CallToolRequestSchema` handler's `switch` statement.

### Type Checking

```bash
npx tsc --noEmit
```

---

## Limitations & Disclaimer

1. **Unofficial project**: This is an **unofficial, community-driven MCP server**. It is not affiliated with, endorsed by, or officially associated with the Leibniz Institute DSMZ or the LPSN database.
2. **Web scraping, not official API**: This server fetches data by parsing the public LPSN website HTML. If LPSN changes its page layout, some parsing may break. The code is designed with multiple fallback selectors to be resilient.
3. **Rate limiting**: LPSN is a public resource. Please use this tool responsibly. Avoid making excessive requests in a short period.
4. **No warranty**: The data is provided "as is" from LPSN. Always verify critical taxonomic information directly on the [LPSN website](https://lpsn.dsmz.de/).
5. **Network dependency**: The server requires an active internet connection to reach `https://lpsn.dsmz.de/`.

---

## License

MIT
