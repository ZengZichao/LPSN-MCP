# LPSN-MCP

**版本 0.1.0**

> **⚠️ 免责声明：这是一个非官方的、社区驱动的 MCP 服务器。**
> 本项目与莱布尼茨研究所 DSMZ 或 LPSN 数据库无任何官方关联，
> 也未获得其认可或支持。

一个 [MCP（模型上下文协议）](https://modelcontextprotocol.io/) 服务器，为 AI 助手提供对 [LPSN（原核生物名称名录，List of Prokaryotic names with Standing in Nomenclature）](https://lpsn.dsmz.de/) 数据库的访问能力。该数据库由 [DSMZ](https://www.dsmz.de/)（莱布尼茨研究所 DSMZ —— 德国微生物与细胞培养物保藏中心）维护。

---

## 目录

1. [项目简介](#项目简介)
2. [什么是 LPSN？](#什么是-lpsn)
3. [功能与可用工具](#功能与可用工具)
4. [环境要求](#环境要求)
5. [安装](#安装)
6. [编译](#编译)
7. [配置](#配置)
8. [使用方法](#使用方法)
9. [工具详解](#工具详解)
10. [架构说明](#架构说明)
11. [开发指南](#开发指南)
12. [限制与免责声明](#限制与免责声明)
13. [开源许可证](#开源许可证)

---

## 项目简介

LPSN-MCP 是连接支持模型上下文协议（MCP）的大语言模型助手与 LPSN 原核生物命名数据库之间的桥梁。它使得 AI 助手（如 Claude Desktop、Cursor 或任何兼容 MCP 的客户端）能够：

- **搜索**原核生物（细菌和古菌）的名称
- **获取详细信息**：包括任意分类单元的词源学、模式菌株、命名状态、同义词、上下级分类单元、参考文献等
- **获取完整分类谱系**：从域（Domain）到种（Species）的完整分类路径
- **按分类等级浏览**：支持按域、门、纲、目、科、属、种等等级浏览所有分类单元
- **阅读** LPSN 上的命名法规和分类信息页面

所有数据均实时从 LPSN 公共网站 `https://lpsn.dsmz.de/` 获取，无需 API 密钥或注册。

---

## 什么是 LPSN？

**原核生物名称名录（LPSN）** 是由莱布尼茨研究所 DSMZ 维护的公开、经过人工校验的数据库。它提供以下信息：

- 所有在《**国际原核生物命名法规（ICNP）**》下具有命名地位的原核生物（细菌和古菌）名称的**最新信息**。
- 每个命名分类单元的**分类学位置**。
- **命名状态**（如：有效发表、不合法、被拒绝等）。
- 名称的**词源学**解释。
- **模式菌株**和模式种。
- **同义词**和**基名**。
- 与《**国际系统和进化微生物学杂志（IJSEM）**》及其他验证来源相关的参考文献。

LPSN 被全球的微生物学家、分类学家、生物信息学家和学生广泛使用。

---

## 功能与可用工具

本 MCP 服务器提供 **7 个工具**：

| 序号 | 工具名称 | 功能说明 |
|------|----------|----------|
| 1 | `search_taxa` | 按全名或部分名称搜索原核生物名称 |
| 2 | `get_taxon_detail` | 获取特定分类单元的完整详情（词源学、模式菌株、同义词等） |
| 3 | `get_classification` | 获取从域到目标分类单元的完整谱系 |
| 4 | `browse_by_rank` | 按分类等级浏览所有分类单元（域、界、门、纲、目、科、属、种），可选按首字母筛选 |
| 5 | `get_nomenclature_info` | 阅读 LPSN 上的命名法规信息页 |
| 6 | `get_classification_info` | 阅读 LPSN 上的分类信息页 |
| 7 | `get_text_page` | 阅读 LPSN 上任意信息文本页面 |

---

## 环境要求

- **Node.js** ≥ 18.0.0（需要原生 `fetch` 和 `AbortController` 支持）
- **npm** ≥ 9.0.0（或 **pnpm** / **yarn**，请相应调整命令）

---

## 安装

### 方式一：克隆并安装

```bash
git clone <你的仓库地址> lpsn-mcp
cd lpsn-mcp
npm install
```

### 方式二：在现有项目中安装

```bash
npm install lpsn-mcp
```

---

## 编译

将 TypeScript 源码编译为 JavaScript：

```bash
npm run build
```

编译后会在 `dist/` 目录生成 `index.js` 和 `lpsn-fetcher.js`（附带 `.d.ts` 类型声明文件和 source map）。

开发模式下可使用 `tsx` 直接运行，无需编译：

```bash
npm run dev
```

---

## 配置

### Claude Desktop

将以下配置添加到你的 `claude_desktop_config.json` 文件中：

**macOS 路径：** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows 路径：** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "lpsn": {
      "command": "node",
      "args": [
        "/lpsn-mcp/dist/index.js的绝对路径"
      ]
    }
  }
}
```

### Cursor

在 Cursor 中，前往 **Settings → MCP Servers → Add Server**，或直接编辑设置文件：

```json
{
  "mcp.servers": {
    "lpsn": {
      "command": "node",
      "args": ["/lpsn-mcp/dist/index.js的绝对路径"]
    }
  }
}
```

### 通用 MCP 客户端

任何兼容 MCP 的客户端均可通过以下命令启动本服务器：

```bash
node /path/to/lpsn-mcp/dist/index.js
```

本服务器通过 **stdio** 使用标准 MCP JSON-RPC 协议进行通信。

---

## 使用方法

配置完成后，你可以用自然语言向 AI 助手提问，例如：

- *"在 LPSN 中搜索 Escherichia coli"*
- *"从 LPSN 获取芽孢杆菌属（Bacillus）的详细信息"*
- *"Methanococcus jannaschii 的完整分类谱系是什么？"*
- *"浏览 LPSN 中所有以字母 'A' 开头的科"*
- *"根据 LPSN，原核生物的命名法规是什么？"*

助手会自动调用相应的 MCP 工具并展示结果。

### 命令行直接测试

你也可以通过 stdin 直接发送 MCP JSON-RPC 消息来测试服务器：

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/index.js
```

---

## 工具详解

### 1. `search_taxa`（搜索分类单元）

在 LPSN 数据库中搜索原核生物名称。

**参数：**

| 参数名 | 类型 | 是否必填 | 说明 |
|--------|------|----------|------|
| `query` | string | 是 | 要搜索的名称（或部分名称），如 `"Escherichia coli"` 或 `"Bacillus"` |
| `exact` | boolean | 否 | 是否精确匹配。默认：`false`（模糊搜索） |

**输出示例：**

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

### 2. `get_taxon_detail`（获取分类单元详情）

获取特定分类单元的详细信息。

**参数：**

| 参数名 | 类型 | 是否必填 | 说明 |
|--------|------|----------|------|
| `name_or_url` | string | 是 | 学名（如 `"Escherichia coli"`）或从搜索结果中获得的 LPSN 完整 URL |

**返回内容：** 名称、分类等级、URL、命名状态、词源学、性别、模式菌株、模式种、风险等级、上级分类单元、下级分类单元、同义词、基名、注释和参考文献。

---

### 3. `get_classification`（获取分类谱系）

获取某个分类单元的完整分类谱系。

**参数：**

| 参数名 | 类型 | 是否必填 | 说明 |
|--------|------|----------|------|
| `name_or_url` | string | 是 | 学名或 LPSN URL |

**返回内容：** 从域 → 门 → 纲 → 目 → 科 → 属 → 种的完整谱系，目标分类单元会被标记。

---

### 4. `browse_by_rank`（按等级浏览）

按分类等级浏览所有分类单元。

**参数：**

| 参数名 | 类型 | 是否必填 | 说明 |
|--------|------|----------|------|
| `rank` | enum | 是 | 可选值：`domain`（域）、`kingdom`（界）、`phylum`（门）、`class`（纲）、`order`（目）、`family`（科）、`genus`（属）、`species`（种） |
| `letter` | string | 否 | 可选的首字母筛选（如 `"A"`） |

---

### 5. `get_nomenclature_info`（获取命名法规信息）

阅读 LPSN 的命名法规信息页面。无需参数。

返回关于原核生物命名法规（ICNP）如何运作的结构化文本。

---

### 6. `get_classification_info`（获取分类信息）

阅读 LPSN 的导航与分类信息页面。无需参数。

返回关于原核生物如何组织以及如何在 LPSN 上浏览分类单元的结构化文本。

---

### 7. `get_text_page`（获取文本页面）

阅读 LPSN 上的任意信息文本页面。

**参数：**

| 参数名 | 类型 | 是否必填 | 说明 |
|--------|------|----------|------|
| `path` | string | 是 | 页面路径，如 `"text/nomenclature"`、`"text/navigation"`、`"text/etymology"` |

---

## 架构说明

```
lpsn-mcp/
├── package.json          – NPM 包定义与脚本
├── tsconfig.json         – TypeScript 编译器配置
├── src/
│   ├── index.ts          – MCP 服务器入口与工具定义
│   └── lpsn-fetcher.ts   – LPSN 网站数据抓取器与 HTML 解析器
├── dist/                 – 编译输出（由 `npm run build` 生成）
├── README.md             – 英文文档
└── README.zh-CN.md       – 中文文档（本文件）
```

### `lpsn-fetcher.ts`（数据抓取模块）

该模块负责与 LPSN 网站的所有 HTTP 通信。它使用原生 `fetch` API 下载 HTML 页面，并使用 `cheerio` 进行解析。主要导出函数包括：

- `searchLpsn(query, exact)` —— 搜索分类单元
- `getTaxonDetail(nameOrUrl)` —— 获取完整详情
- `getClassification(nameOrUrl)` —— 获取分类谱系
- `browseByRank(rank, letter)` —— 按等级浏览
- `getTextPage(path)` —— 阅读文本页面
- `getNomenclatureInfo()` —— 阅读命名法规页
- `getClassificationInfo()` —— 阅读分类信息页

### `index.ts`（MCP 服务器模块）

该模块使用 `@modelcontextprotocol/sdk` 实现 MCP 服务器。它注册了全部 7 个工具，使用 `zod` 进行输入验证，调用相应的抓取器函数，并将结果格式化为人类可读的文本返回给大语言模型。

---

## 开发指南

### 项目结构

本项目使用 **TypeScript**（严格模式）编写，目标为 **ES2022**。采用 ES 模块（`"type": "module"`）。

### 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run build` | 编译 TypeScript 到 `dist/` 目录 |
| `npm run start` | 运行编译后的服务器 |
| `npm run dev` | 使用 `tsx` 直接运行（无需编译） |

### 添加新工具

1. 在 `lpsn-fetcher.ts` 中添加新的导出函数。
2. 在 `index.ts` 中定义 Zod schema 和格式化函数。
3. 在 `ListToolsRequestSchema` 处理器的 `tools` 数组中添加工具定义。
4. 在 `CallToolRequestSchema` 处理器的 `switch` 语句中添加对应的 `case`。

### 类型检查

```bash
npx tsc --noEmit
```

---

## 限制与免责声明

1. **非官方项目**：这是一个**非官方的、社区驱动的 MCP 服务器**。本项目与莱布尼茨研究所 DSMZ 或 LPSN 数据库无任何官方关联，也未获得其认可或支持。
2. **网页抓取，非官方 API**：本服务器通过解析 LPSN 公共网站的 HTML 来获取数据。如果 LPSN 更改页面布局，部分解析可能会失效。代码中设计了多重后备选择器以提高鲁棒性。
3. **请求频率**：LPSN 是公共资源，请合理使用本工具，避免在短时间内发送过多请求。
4. **无担保**：数据按"原样"从 LPSN 提供。关键分类学信息请务必直接在 [LPSN 网站](https://lpsn.dsmz.de/) 上核实。
5. **网络依赖**：本服务器需要活跃的互联网连接才能访问 `https://lpsn.dsmz.de/`。

---

## 开源许可证

MIT
