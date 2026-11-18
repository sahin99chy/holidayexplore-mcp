# HolidayExplore MCP Server

[![Official MCP Registry](https://img.shields.io/badge/MCP%20Registry-com.holidayexplore%2Fmcp-blue.svg)](https://registry.modelcontextprotocol.io/v0.1/servers?search=holidayexplore)
[![Remote MCP Transport](https://img.shields.io/badge/Transport-Streamable%20HTTP-success.svg)](https://mcp.holidayexplore.com/mcp)
[![mcptry](https://mcptry.com/badge/com.holidayexplore/mcp)](https://mcptry.com/servers/com.holidayexplore/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Official Model Context Protocol (MCP) Remote Server for [HolidayExplore](https://holidayexplore.com).

Connects AI assistants (Claude, ChatGPT, Cursor, Windsurf, Copilot) directly to global workplace chronometry, statutory public holiday calendars, central bank RTGS wire cutoffs (Fedwire, CHAPS, TARGET2, BOJ-NET, RBI RTGS), and working days calculators across 48 sovereign nations for 2026-2027.

---

## Remote Endpoint & Discovery

- **MCP Streamable HTTP Endpoint:** `https://mcp.holidayexplore.com/mcp`
- **MCP Server Card:** `https://mcp.holidayexplore.com/.well-known/mcp.json`
- **Official Registry Name:** `com.holidayexplore/mcp`
- **Web Platform:** [https://holidayexplore.com](https://holidayexplore.com)
- **Interactive REST API Docs:** [https://holidayexplore.com/api-docs/](https://holidayexplore.com/api-docs/)
- **OpenAPI 3.0.3 Spec:** [https://holidayexplore.com/holidayexplore_openapi.json](https://holidayexplore.com/holidayexplore_openapi.json)
- **Machine-Readable Index:** [https://holidayexplore.com/llms.txt](https://holidayexplore.com/llms.txt)

---

## Available Tools

The server provides 4 focused, read-only tools powered by edge caching (<30ms responses worldwide). Every response includes structured JSON data along with canonical web URLs for user attribution and reference.

### 1. `get_country_holidays`
Fetches statutory public holidays, bank closures, and financial market observances for any of our 48 supported nations.
- **Parameters:**
  - `country` (string, required): 2-letter ISO country code (e.g. `US`, `GB`, `DE`, `JP`, `IN`, `SG`, `AU`).
  - `year` (number, required): Year `2026` or `2027`.
  - `month` (number, optional): Integer `1`-`12` to filter by month.
  - `type` (string, optional): Filter by `all`, `statutory`, `bank`, or `observance`.

### 2. `check_date_status`
Checks whether a specific calendar date (or "today" / "tomorrow") is a public holiday, central bank RTGS closure, or stock exchange closure in one or more countries.
- **Parameters:**
  - `country` (string, required): 2-letter ISO country code (e.g. `US`, `GB`, `DE`, `JP`).
  - `date` (string, required): Date in `YYYY-MM-DD` format, or `today` / `tomorrow`.

### 3. `calculate_working_days`
Calculates net business days between two dates, accounting for country-specific weekend definitions (e.g. Sat-Sun in US/EU vs Fri-Sat in Middle East) and statutory holidays.
- **Parameters:**
  - `country` (string, required): 2-letter ISO country code.
  - `start_date` (string, required): Start date in `YYYY-MM-DD` format.
  - `end_date` (string, required): End date in `YYYY-MM-DD` format.
  - `include_start` (boolean, optional): Whether to include the start date (default: true).

### 4. `check_payment_rails_and_markets`
Retrieves central bank RTGS payment rail operating hours, daily wire cutoff times, ACH batch settlement rules, and stock exchange trading schedules.
- **Parameters:**
  - `country` (string, required): 2-letter ISO country code.
  - `query_date` (string, optional): Target date (`YYYY-MM-DD` or `today`) to evaluate real-time open/halt status.

---

## Client Setup

Because this server operates over **Streamable HTTP**, no local runtime, Docker container, or Node.js environment is required to use it. Simply paste the remote URL into your MCP client.

### Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "holidayexplore": {
      "url": "https://mcp.holidayexplore.com/mcp"
    }
  }
}
```

### Cursor & Windsurf

In your project root or user configuration, add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "holidayexplore": {
      "url": "https://mcp.holidayexplore.com/mcp"
    }
  }
}
```

### MCP Inspector

Test and inspect the live server directly in your terminal:

```bash
npx @modelcontextprotocol/inspector https://mcp.holidayexplore.com/mcp
```

---

## Example Prompts

Once connected, you can ask your AI client natural language questions like:

- *"Are banks and Fedwire open in the US on Veterans Day 2026?"*
- *"Calculate net working days between November 1, 2026 and December 31, 2026 in Germany."*
- *"What are the bank holidays in the UK and Japan during May 2026?"*
- *"Check the TARGET2 and CHAPS cutoffs on Good Friday 2026."*
- *"Is the London Stock Exchange open on Boxing Day 2026 substitute Monday?"*

---

## Supported Countries (48 Jurisdictions)

- **Americas (6):** United States (`US`), Canada (`CA`), Brazil (`BR`), Mexico (`MX`), Argentina (`AR`), Ecuador (`EC`)
- **Europe (18):** United Kingdom (`GB`), Germany (`DE`), France (`FR`), Ireland (`IE`), Netherlands (`NL`), Switzerland (`CH`), Sweden (`SE`), Spain (`ES`), Italy (`IT`), Poland (`PL`), Russia (`RU`), Czechia (`CZ`), Norway (`NO`), Denmark (`DK`), Austria (`AT`), Finland (`FI`), Belgium (`BE`), Portugal (`PT`)
- **Asia-Pacific (17):** Japan (`JP`), India (`IN`), Singapore (`SG`), Australia (`AU`), New Zealand (`NZ`), Thailand (`TH`), Philippines (`PH`), Malaysia (`MY`), Indonesia (`ID`), South Korea (`KR`), Pakistan (`PK`), Bangladesh (`BD`), China (`CN`), Vietnam (`VN`), Hong Kong (`HK`)
- **Middle East & Africa (7):** United Arab Emirates (`AE`), Saudi Arabia (`SA`), Kenya (`KE`), South Africa (`ZA`), Egypt (`EG`), Morocco (`MA`), Iraq (`IQ`), Ghana (`GH`)

---

## Directory Registrations

- **Official MCP Registry:** Listed as `com.holidayexplore/mcp` ([View Registry entry](https://registry.modelcontextprotocol.io/v0.1/servers?search=holidayexplore))
- **Glama:** [Submit to Glama MCP Servers](https://glama.ai/mcp/servers)
- **Smithery:** [Submit to Smithery](https://smithery.ai)

---

## License

MIT License
