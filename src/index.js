/**
 * HolidayExplore Remote MCP Server (Streamable HTTP)
 * Cloudflare Worker implementation wrapping HolidayExplore Public REST API v1.
 * Specification: Model Context Protocol (v2024-11-05) Streamable HTTP Transport
 * Endpoint: https://mcp.holidayexplore.com/mcp
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

const API_BASE = 'https://holidayexplore.com/api/v1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Access-Control-Max-Age': '86400'
};

const SLUGS_MAP = {
  GB: 'uk',
  NO: 'norway',
  DK: 'denmark',
  AT: 'austria',
  FI: 'finland',
  BE: 'belgium',
  PT: 'portugal'
};

function getCountrySlug(code) {
  const upper = (code || '').trim().toUpperCase();
  return SLUGS_MAP[upper] || upper.toLowerCase();
}

function normalizeCountryCode(code) {
  if (!code) return 'US';
  const clean = code.trim().toUpperCase();
  if (clean === 'UK') return 'GB';
  return clean;
}

/**
 * Fetch helper with Cloudflare Edge caching (caches.default).
 */
async function fetchWithCache(urlStr, ttlSeconds = 86400) {
  const cacheKey = new Request(urlStr, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  let cachedResponse = null;
  try {
    if (typeof caches !== 'undefined' && caches.default) {
      cachedResponse = await caches.default.match(cacheKey);
    }
  } catch (_) {}

  if (cachedResponse) {
    try {
      return await cachedResponse.json();
    } catch (_) {}
  }

  const upstreamRes = await fetch(urlStr, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'HolidayExplore-MCP-Server/1.0 (+https://mcp.holidayexplore.com)'
    }
  });

  if (!upstreamRes.ok) {
    let errMsg = 'Upstream API error ' + upstreamRes.status;
    try {
      const errJson = await upstreamRes.json();
      if (errJson && errJson.error) {
        errMsg = errJson.error;
      }
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await upstreamRes.json();

  try {
    if (typeof caches !== 'undefined' && caches.default) {
      const responseToCache = new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=' + ttlSeconds + ', s-maxage=' + ttlSeconds
        }
      });
      await caches.default.put(cacheKey, responseToCache);
    }
  } catch (_) {}

  return data;
}

/**
 * Construct and configure the McpServer instance with registered tools.
 */
function createMcpServer() {
  const server = new McpServer({
    name: 'com.holidayexplore/mcp',
    version: '1.0.0'
  });

  // Tool 1: get_country_holidays
  server.tool(
    'get_country_holidays',
    'Fetches statutory public holidays, bank holidays, and stock market closures for a given 2-letter ISO country code across 48 sovereign countries (2026-2027).',
    {
      country: z.string().describe('ISO 3166-1 alpha-2 country code (e.g. US, GB, DE, IN, JP, AU, CA).'),
      year: z.enum(['2026', '2027']).optional().describe('Calendar year (2026 or 2027). Defaults to 2026.'),
      month: z.number().int().min(1).max(12).optional().describe('Optional month number (1-12) to filter holidays.'),
      type: z.enum(['bank', 'statutory', 'public', 'all']).optional().describe('Holiday classification filter. Defaults to all.')
    },
    async ({ country, year, month, type }) => {
      const code = normalizeCountryCode(country);
      const targetYear = year || '2026';
      const params = new URLSearchParams({
        country: code,
        year: targetYear
      });
      if (month !== undefined) params.set('month', String(month));
      if (type && type !== 'all') params.set('type', type);

      const upstreamUrl = `${API_BASE}/holidays?${params.toString()}`;
      const data = await fetchWithCache(upstreamUrl, 86400);

      const slug = getCountrySlug(code);
      const enhanced = {
        ...data,
        source_url: `https://holidayexplore.com/${slug}/`,
        calendar_year_url: `https://holidayexplore.com/${slug}-${targetYear}/`,
        portal_url: 'https://holidayexplore.com/',
        documentation: 'https://holidayexplore.com/api-docs/',
        attribution: 'HolidayExplore Statutory Chronometry API (CC BY 4.0). Full statutory calendars and central bank cutoffs at https://holidayexplore.com/'
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(enhanced, null, 2)
          }
        ]
      };
    }
  );

  // Tool 2: check_date_status
  server.tool(
    'check_date_status',
    'Checks whether a specific calendar date (or today/tomorrow) is a public holiday, central bank RTGS wire settlement closure, or stock exchange closure in a sovereign country.',
    {
      country: z.string().describe('ISO 3166-1 alpha-2 country code (e.g. US, GB, DE, IN, JP, SG).'),
      date: z.string().optional().describe('Target calendar date in YYYY-MM-DD format, or relative keywords "today" or "tomorrow". Defaults to "today".')
    },
    async ({ country, date }) => {
      const code = normalizeCountryCode(country);
      const params = new URLSearchParams({ country: code });

      let isToday = false;
      if (!date || date === 'today') {
        isToday = true;
      } else if (date === 'tomorrow') {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + 1);
        params.set('date', d.toISOString().split('T')[0]);
      } else {
        params.set('date', date);
      }

      const upstreamUrl = `${API_BASE}/status?${params.toString()}`;
      // Shorter edge cache TTL (300s) for live date queries, 86400s for fixed dates
      const ttl = isToday ? 300 : 86400;
      const data = await fetchWithCache(upstreamUrl, ttl);

      const slug = getCountrySlug(code);
      const enhanced = {
        ...data,
        source_url: `https://holidayexplore.com/${slug}/`,
        tool_url: 'https://holidayexplore.com/status/',
        documentation: 'https://holidayexplore.com/api-docs/',
        attribution: 'HolidayExplore Real-Time Banking & Market Status (CC BY 4.0). Full status tracker at https://holidayexplore.com/'
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(enhanced, null, 2)
          }
        ]
      };
    }
  );

  // Tool 3: calculate_working_days
  server.tool(
    'calculate_working_days',
    'Calculates net business working days, weekend rest days, statutory public holidays, and total billable work hours between two dates for a sovereign country (accounting for 5-day or 6-day weekend rules).',
    {
      country: z.string().describe('ISO 3166-1 alpha-2 country code (e.g. US, GB, CA, IN, AU, DE).'),
      start_date: z.string().describe('Range start date in YYYY-MM-DD format.'),
      end_date: z.string().describe('Range end date in YYYY-MM-DD format.'),
      hours_per_day: z.number().positive().max(24).optional().describe('Standard working hours per day. Defaults to 8.0.')
    },
    async ({ country, start_date, end_date, hours_per_day }) => {
      const code = normalizeCountryCode(country);
      const standardHours = hours_per_day || 8.0;
      const params = new URLSearchParams({
        country: code,
        start: start_date,
        end: end_date,
        hours_per_day: String(standardHours)
      });

      const upstreamUrl = `${API_BASE}/working-days?${params.toString()}`;
      const data = await fetchWithCache(upstreamUrl, 86400);

      const slug = getCountrySlug(code);
      const enhanced = {
        ...data,
        source_url: 'https://holidayexplore.com/working-days/',
        country_calendar_url: `https://holidayexplore.com/${slug}/`,
        documentation: 'https://holidayexplore.com/api-docs/',
        attribution: 'HolidayExplore Working Days Calculator (CC BY 4.0). Full interactive tool at https://holidayexplore.com/working-days/'
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(enhanced, null, 2)
          }
        ]
      };
    }
  );

  // Tool 4: check_payment_rails_and_markets
  server.tool(
    'check_payment_rails_and_markets',
    'Checks central bank RTGS wire settlement cutoff status, automated clearing house (ACH) payroll roll rules, and 24/7 instant payment rails across 48 sovereign financial centers.',
    {
      country: z.string().optional().describe('Optional ISO country code or country name keyword (e.g. US, Germany, Brazil).'),
      region: z.string().optional().describe('Optional geographic region filter (e.g. Europe, Americas, Asia-Pacific, Middle East, Africa).'),
      rail: z.string().optional().describe('Optional payment rail filter (e.g. SEPA, Fedwire, ACH, RTP, PIX, CHAPS, BACS, TARGET2).')
    },
    async ({ country, region, rail }) => {
      const params = new URLSearchParams();
      if (country) params.set('search', country);
      if (region) params.set('region', region);
      if (rail) params.set('rail', rail);

      const upstreamUrl = `${API_BASE}/countries?${params.toString()}`;
      const data = await fetchWithCache(upstreamUrl, 86400);

      const enhanced = {
        ...data,
        source_url: 'https://holidayexplore.com/payment-rails/',
        documentation: 'https://holidayexplore.com/api-docs/',
        attribution: 'HolidayExplore Global Payment Rails Matrix (CC BY 4.0). Full interactive matrix at https://holidayexplore.com/payment-rails/'
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(enhanced, null, 2)
          }
        ]
      };
    }
  );

  return server;
}

/**
 * Informational HTML Landing Page for GET /
 */
function renderLandingHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HolidayExplore Remote MCP Server (Streamable HTTP)</title>
  <meta name="description" content="Official Streamable HTTP Model Context Protocol (MCP) server for global statutory holidays, central bank RTGS cutoffs, and working day chronometry across 48 sovereign economies.">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --card-border: #1f2937;
      --primary: #38bdf8;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --code-bg: #030712;
      --accent: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2.5rem 1.25rem;
    }
    .container {
      max-width: 880px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 2.5rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 1.75rem;
    }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.3rem 0.65rem;
      border-radius: 9999px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.3);
      margin-bottom: 0.75rem;
    }
    h1 {
      font-size: 2rem;
      font-weight: 800;
      color: #fff;
      margin-bottom: 0.5rem;
    }
    p.lead {
      font-size: 1.1rem;
      color: var(--muted);
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.75rem;
    }
    h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 0.75rem;
    }
    p { margin-bottom: 1rem; color: #d1d5db; }
    pre {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1rem;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.88rem;
      color: #38bdf8;
      margin-bottom: 1rem;
    }
    .tool-list {
      display: grid;
      gap: 1rem;
      margin-top: 1rem;
    }
    .tool-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1rem;
    }
    .tool-title {
      font-weight: 700;
      color: var(--primary);
      font-family: ui-monospace, monospace;
      font-size: 0.95rem;
      margin-bottom: 0.25rem;
    }
    .tool-desc {
      font-size: 0.9rem;
      color: var(--muted);
      margin-bottom: 0;
    }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 1rem;
    }
    a.btn {
      display: inline-block;
      text-decoration: none;
      background: rgba(56, 189, 248, 0.1);
      color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.25);
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.88rem;
      font-weight: 600;
      transition: all 0.15s ease;
    }
    a.btn:hover {
      background: rgba(56, 189, 248, 0.2);
      border-color: var(--primary);
    }
    footer {
      margin-top: 3rem;
      font-size: 0.85rem;
      color: var(--muted);
      text-align: center;
      border-top: 1px solid var(--card-border);
      padding-top: 1.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <span class="badge">Model Context Protocol (v2024-11-05)</span>
      <h1>HolidayExplore Remote MCP Server</h1>
      <p class="lead">Stateless Streamable HTTP endpoint for Claude, Cursor, ChatGPT, and AI agents. Exposes statutory holiday schedules, central bank RTGS settlement cutoffs, and working day chronometry across 48 sovereign economies.</p>
    </header>

    <div class="card">
      <h2>Remote Connection Endpoint</h2>
      <p>Connect your AI tool or MCP client directly to this streamable HTTP URL (zero authentication required):</p>
      <pre>https://mcp.holidayexplore.com/mcp</pre>
    </div>

    <div class="card">
      <h2>Client Configuration Examples</h2>
      <p><strong>Claude Desktop</strong> (<code>claude_desktop_config.json</code>):</p>
      <pre>{
  "mcpServers": {
    "holidayexplore": {
      "url": "https://mcp.holidayexplore.com/mcp"
    }
  }
}</pre>
      <p><strong>Cursor</strong> (Settings &rarr; Features &rarr; MCP &rarr; Add Server):</p>
      <pre>Name: holidayexplore
Type: streamable-http
URL: https://mcp.holidayexplore.com/mcp</pre>
    </div>

    <div class="card">
      <h2>Registered Read-Only Tools</h2>
      <div class="tool-list">
        <div class="tool-item">
          <div class="tool-title">get_country_holidays</div>
          <div class="tool-desc">Fetches statutory public holidays, commercial bank holidays, and stock market closures by 2-letter ISO country code (2026-2027).</div>
        </div>
        <div class="tool-item">
          <div class="tool-title">check_date_status</div>
          <div class="tool-desc">Evaluates whether a target calendar date (or today/tomorrow) is a holiday, central bank RTGS closure, or stock exchange closure in a sovereign country.</div>
        </div>
        <div class="tool-item">
          <div class="tool-title">calculate_working_days</div>
          <div class="tool-desc">Calculates net business days, weekend rest days, statutory public holidays, and total billable work hours between two dates.</div>
        </div>
        <div class="tool-item">
          <div class="tool-title">check_payment_rails_and_markets</div>
          <div class="tool-desc">Checks central bank RTGS wholesale wire cutoffs (Fedwire, CHAPS, TARGET2, Lynx, etc.), ACH settlement rules, and 24/7 instant payment rails.</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Resources & Documentation</h2>
      <div class="links">
        <a class="btn" href="https://holidayexplore.com/">HolidayExplore Portal</a>
        <a class="btn" href="https://holidayexplore.com/api-docs/">Public REST API v1 Docs</a>
        <a class="btn" href="https://holidayexplore.com/llms.txt">AI Index (/llms.txt)</a>
        <a class="btn" href="https://holidayexplore.com/llms-full.txt">Full LLM Reference (/llms-full.txt)</a>
        <a class="btn" href="https://holidayexplore.com/api/v1/openapi.json">OpenAPI 3.0.3 Spec</a>
      </div>
    </div>

    <footer>
      HolidayExplore Workplace Chronometry Desk &middot; Open Data Commons / CC BY 4.0 &middot; Built on Cloudflare Workers
    </footer>
  </div>
</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // Handle OPTIONS CORS pre-flight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // Root landing page: GET /
    if (path === '/' || path === '') {
      const accept = request.headers.get('Accept') || '';
      if (accept.includes('application/json') && !accept.includes('text/html')) {
        return new Response(
          JSON.stringify(
            {
              name: 'com.holidayexplore/mcp',
              version: '1.0.0',
              description: 'Stateless Streamable HTTP Remote MCP Server for HolidayExplore Public REST API v1.',
              protocolVersion: '2024-11-05',
              transport: 'streamable-http',
              endpoint: 'https://mcp.holidayexplore.com/mcp',
              tools: [
                'get_country_holidays',
                'check_date_status',
                'calculate_working_days',
                'check_payment_rails_and_markets'
              ],
              links: {
                documentation: 'https://holidayexplore.com/api-docs/',
                openapi: 'https://holidayexplore.com/api/v1/openapi.json',
                llms: 'https://holidayexplore.com/llms.txt',
                home: 'https://holidayexplore.com/'
              }
            },
            null,
            2
          ),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'public, max-age=3600',
              ...CORS_HEADERS
            }
          }
        );
      }

      return new Response(renderLandingHtml(), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          ...CORS_HEADERS
        }
      });
    }

    // MCP Server Card: GET /.well-known/mcp.json
    if (path === '/.well-known/mcp.json') {
      return new Response(
        JSON.stringify(
          {
            "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
            "name": "com.holidayexplore/mcp",
            "title": "HolidayExplore Global Banking & Chronometry MCP Server",
            "description": "Global statutory holidays, RTGS payment cutoffs, and working days across 48 countries (2026-2027).",
            "version": "1.0.1",
            "websiteUrl": "https://holidayexplore.com",
            "repository": {
              "url": "https://github.com/sahin99chy/holidayexplore",
              "source": "github"
            },
            "remotes": [
              {
                "type": "streamable-http",
                "url": "https://mcp.holidayexplore.com/mcp"
              }
            ]
          },
          null,
          2
        ),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            ...CORS_HEADERS
          }
        }
      );
    }

    // MCP Streamable HTTP endpoint: /mcp
    if (path === '/mcp') {
      // DELETE request closes stateless session
      if (request.method === 'DELETE') {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS
        });
      }

      // Friendly GET health check if client asks for application/json without text/event-stream
      if (request.method === 'GET') {
        const accept = request.headers.get('Accept') || '';
        if (!accept.includes('text/event-stream')) {
          return new Response(
            JSON.stringify(
              {
                status: 'operational',
                name: 'com.holidayexplore/mcp',
                version: '1.0.0',
                protocolVersion: '2024-11-05',
                transport: 'streamable-http',
                endpoint: 'https://mcp.holidayexplore.com/mcp',
                notice: 'Connect via MCP Streamable HTTP using POST or GET with Accept: text/event-stream.'
              },
              null,
              2
            ),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                ...CORS_HEADERS
              }
            }
          );
        }
      }

      // Normalize Accept header so that standard curl / clients without strict dual-accept won't 406
      let reqToHandle = request;
      const accept = request.headers.get('Accept') || '';
      if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
        const newHeaders = new Headers(request.headers);
        newHeaders.set('Accept', 'application/json, text/event-stream');
        reqToHandle = new Request(request, { headers: newHeaders });
      }

      // Instantiate fresh server & transport per request (stateless mode requirement)
      const server = createMcpServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });

      await server.connect(transport);
      const res = await transport.handleRequest(reqToHandle);

      // Append CORS headers to the response
      const responseHeaders = new Headers(res.headers);
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        responseHeaders.set(key, value);
      }

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders
      });
    }

    // 404 fallback for any other route
    return new Response(
      JSON.stringify(
        {
          error: 'Not Found',
          message: `Endpoint '${path}' does not exist on mcp.holidayexplore.com. Use '/mcp' for Model Context Protocol or '/' for server info.`,
          mcp_endpoint: 'https://mcp.holidayexplore.com/mcp',
          documentation: 'https://holidayexplore.com/api-docs/'
        },
        null,
        2
      ),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...CORS_HEADERS
        }
      }
    );
  }
};
