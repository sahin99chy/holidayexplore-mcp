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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version, MCP-Protocol-Version, Mcp-Method, Mcp-Name',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400'
};

/**
 * Strict, verified canonical URLs dictionary matching holidayexplore.com live routing.
 * Every single URL listed below is verified 200 OK on https://holidayexplore.com.
 * ZERO guessed or string-interpolated URL slugs.
 */
const VERIFIED_URLS = {
  portal: 'https://holidayexplore.com/',
  hub2027: 'https://holidayexplore.com/2027-holidays/',
  api_docs: 'https://holidayexplore.com/api-docs/',
  openapi: 'https://holidayexplore.com/api/v1/openapi.json',
  llms_txt: 'https://holidayexplore.com/llms.txt',

  // All 18 Interactive Tools & Matrices
  tools: {
    working_days: 'https://holidayexplore.com/working-days/',
    holiday_overlap: 'https://holidayexplore.com/holiday-overlap/',
    pto_maximizer: 'https://holidayexplore.com/pto-maximizer/',
    today_status: 'https://holidayexplore.com/today/',
    tomorrow_status: 'https://holidayexplore.com/tomorrow/',
    what_stays_open: 'https://holidayexplore.com/what-stays-open/',
    countdown: 'https://holidayexplore.com/countdown/',
    transit_status: 'https://holidayexplore.com/transit-status/',
    pick_my_escape: 'https://holidayexplore.com/pick-my-escape/',
    travel: 'https://holidayexplore.com/travel/',
    payment_rails: 'https://holidayexplore.com/payment-rails/',
    stock_market_holidays: 'https://holidayexplore.com/stock-market-holidays/',
    settlement_simulator: 'https://holidayexplore.com/settlement-simulator/',
    payroll_calendar: 'https://holidayexplore.com/payroll-calendar/',
    wallboard: 'https://holidayexplore.com/wallboard/',
    calendar_feeds: 'https://holidayexplore.com/calendar-feeds/',
    central_bank_globe: 'https://holidayexplore.com/follow-my-money/',
    bridge_days: 'https://holidayexplore.com/bridge-days/'
  },

  // All 48 Sovereign Country Canonical Calendars (Verified 200 OK)
  countries: {
    US: 'https://holidayexplore.com/us/',
    GB: 'https://holidayexplore.com/uk/',
    UK: 'https://holidayexplore.com/uk/',
    CA: 'https://holidayexplore.com/ca/',
    IN: 'https://holidayexplore.com/in/',
    AU: 'https://holidayexplore.com/au/',
    DE: 'https://holidayexplore.com/de/',
    FR: 'https://holidayexplore.com/fr/',
    JP: 'https://holidayexplore.com/jp/',
    AE: 'https://holidayexplore.com/ae/',
    SA: 'https://holidayexplore.com/sa/',
    KE: 'https://holidayexplore.com/ke/',
    SG: 'https://holidayexplore.com/sg/',
    ZA: 'https://holidayexplore.com/za/',
    NZ: 'https://holidayexplore.com/nz/',
    IE: 'https://holidayexplore.com/ie/',
    NL: 'https://holidayexplore.com/nl/',
    CH: 'https://holidayexplore.com/ch/',
    SE: 'https://holidayexplore.com/se/',
    ES: 'https://holidayexplore.com/es/',
    IT: 'https://holidayexplore.com/it/',
    BR: 'https://holidayexplore.com/br/',
    MX: 'https://holidayexplore.com/mx/',
    TH: 'https://holidayexplore.com/th/',
    PH: 'https://holidayexplore.com/ph/',
    NG: 'https://holidayexplore.com/ng/',
    MY: 'https://holidayexplore.com/my/',
    ID: 'https://holidayexplore.com/id/',
    KR: 'https://holidayexplore.com/kr/',
    PK: 'https://holidayexplore.com/pk/',
    BD: 'https://holidayexplore.com/bd/',
    EG: 'https://holidayexplore.com/eg/',
    PL: 'https://holidayexplore.com/pl/',
    CN: 'https://holidayexplore.com/cn/',
    MA: 'https://holidayexplore.com/ma/',
    IQ: 'https://holidayexplore.com/iq/',
    GH: 'https://holidayexplore.com/gh/',
    RU: 'https://holidayexplore.com/ru/',
    CZ: 'https://holidayexplore.com/cz/',
    AR: 'https://holidayexplore.com/ar/',
    VN: 'https://holidayexplore.com/vn/',
    HK: 'https://holidayexplore.com/hk/',
    EC: 'https://holidayexplore.com/ec/',
    NO: 'https://holidayexplore.com/norway/',
    DK: 'https://holidayexplore.com/denmark/',
    AT: 'https://holidayexplore.com/austria/',
    FI: 'https://holidayexplore.com/finland/',
    BE: 'https://holidayexplore.com/belgium/',
    PT: 'https://holidayexplore.com/portugal/'
  }
};

/**
 * Returns exact verified canonical URL for a given country code and year.
 * Never interpolates unverified slugs.
 */
function getVerifiedCountryUrl(countryCode, targetYear) {
  const code = (countryCode || '').trim().toUpperCase();
  const canonical = VERIFIED_URLS.countries[code] || VERIFIED_URLS.portal;
  return {
    canonical_country_url: canonical,
    master_hub_2027_url: targetYear === '2027' ? VERIFIED_URLS.hub2027 : undefined
  };
}

/**
 * Returns exact verified interactive tool URL matching the query intent.
 */
function getRelevantToolUrl(queryType) {
  switch (queryType) {
    case 'working_days':
      return VERIFIED_URLS.tools.working_days;
    case 'status_today':
      return VERIFIED_URLS.tools.today_status;
    case 'status_tomorrow':
      return VERIFIED_URLS.tools.tomorrow_status;
    case 'status_general':
      return VERIFIED_URLS.tools.wallboard;
    case 'payment_rails':
      return VERIFIED_URLS.tools.payment_rails;
    case 'settlement':
      return VERIFIED_URLS.tools.settlement_simulator;
    case 'overlap':
      return VERIFIED_URLS.tools.holiday_overlap;
    case 'pto':
      return VERIFIED_URLS.tools.pto_maximizer;
    case 'stock_market':
      return VERIFIED_URLS.tools.stock_market_holidays;
    case 'calendar_feeds':
      return VERIFIED_URLS.tools.calendar_feeds;
    case 'transit_status':
      return VERIFIED_URLS.tools.transit_status;
    default:
      return VERIFIED_URLS.tools.wallboard;
  }
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
    version: '1.0.2'
  });

  const READ_ONLY_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true
  };

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
    READ_ONLY_ANNOTATIONS,
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

      const countryUrls = getVerifiedCountryUrl(code, targetYear);
      const enhanced = {
        ...data,
        country_calendar_url: countryUrls.canonical_country_url,
        master_hub_2027_url: countryUrls.master_hub_2027_url,
        relevant_tool_url: getRelevantToolUrl('status_general'),
        documentation: VERIFIED_URLS.api_docs,
        portal_url: VERIFIED_URLS.portal,
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
    READ_ONLY_ANNOTATIONS,
    async ({ country, date }) => {
      const code = normalizeCountryCode(country);
      const params = new URLSearchParams({ country: code });

      let isToday = false;
      let queryType = 'status_today';
      if (!date || date === 'today') {
        isToday = true;
        queryType = 'status_today';
      } else if (date === 'tomorrow') {
        queryType = 'status_tomorrow';
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + 1);
        params.set('date', d.toISOString().split('T')[0]);
      } else {
        queryType = 'status_general';
        params.set('date', date);
      }

      const upstreamUrl = `${API_BASE}/status?${params.toString()}`;
      const ttl = isToday ? 300 : 86400;
      const data = await fetchWithCache(upstreamUrl, ttl);

      const countryUrls = getVerifiedCountryUrl(code);
      const enhanced = {
        ...data,
        country_calendar_url: countryUrls.canonical_country_url,
        relevant_tool_url: getRelevantToolUrl(queryType),
        operations_wallboard_url: VERIFIED_URLS.tools.wallboard,
        documentation: VERIFIED_URLS.api_docs,
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
    READ_ONLY_ANNOTATIONS,
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

      const countryUrls = getVerifiedCountryUrl(code);
      const enhanced = {
        ...data,
        country_calendar_url: countryUrls.canonical_country_url,
        relevant_tool_url: getRelevantToolUrl('working_days'),
        documentation: VERIFIED_URLS.api_docs,
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
    READ_ONLY_ANNOTATIONS,
    async ({ country, region, rail }) => {
      const params = new URLSearchParams();
      if (country) params.set('search', country);
      if (region) params.set('region', region);
      if (rail) params.set('rail', rail);

      const upstreamUrl = `${API_BASE}/countries?${params.toString()}`;
      const data = await fetchWithCache(upstreamUrl, 86400);

      const enhanced = {
        ...data,
        relevant_tool_url: getRelevantToolUrl('payment_rails'),
        wire_settlement_simulator_url: VERIFIED_URLS.tools.settlement_simulator,
        stock_market_holidays_url: VERIFIED_URLS.tools.stock_market_holidays,
        documentation: VERIFIED_URLS.api_docs,
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
      margin-bottom: 1.5rem;
    }
    .card h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 0.75rem;
    }
    .tool-list {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
      margin-top: 1rem;
    }
    @media (min-width: 640px) {
      .tool-list { grid-template-columns: 1fr 1fr; }
    }
    .tool-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1rem;
    }
    .tool-name {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 700;
      color: var(--primary);
      font-size: 0.95rem;
      margin-bottom: 0.35rem;
    }
    .tool-desc {
      font-size: 0.85rem;
      color: var(--muted);
    }
    pre {
      background: var(--code-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1rem;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85rem;
      color: #e5e7eb;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: rgba(255, 255, 255, 0.08);
      padding: 0.15rem 0.35rem;
      border-radius: 4px;
      font-size: 0.85em;
    }
    a {
      color: var(--primary);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .footer-links {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      font-size: 0.9rem;
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--card-border);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="badge">Official Remote MCP Server &bull; Streamable HTTP</div>
      <h1>HolidayExplore MCP Server</h1>
      <p class="lead">Programmatic workplace chronometry, statutory public holidays, central bank RTGS settlement cutoffs, and working day computations across 48 sovereign nations (2026-2027).</p>
    </header>

    <div class="card">
      <h2>Remote Connection Endpoint</h2>
      <p style="margin-bottom: 0.75rem; color: var(--muted);">Connect your AI client (Claude, Cursor, ChatGPT, Windsurf, or MCP Inspector) directly using Streamable HTTP:</p>
      <pre><code>https://mcp.holidayexplore.com/mcp</code></pre>
      <p style="margin-top: 0.75rem; font-size: 0.85rem; color: var(--muted);">Auth: <strong>None required (Public Read-Only)</strong> &bull; Protocol: <strong>Model Context Protocol v2024-11-05</strong> &bull; Transport: <strong>Streamable HTTP</strong></p>
    </div>

    <div class="card">
      <h2>Registered MCP Tools</h2>
      <div class="tool-list">
        <div class="tool-item">
          <div class="tool-name">get_country_holidays</div>
          <div class="tool-desc">Fetches statutory public holidays, bank holidays, and stock market closures for any of our 48 supported nations (2026-2027).</div>
        </div>
        <div class="tool-item">
          <div class="tool-name">check_date_status</div>
          <div class="tool-desc">Checks whether a specific calendar date (or today/tomorrow) is an open business day, bank holiday, or market closure.</div>
        </div>
        <div class="tool-item">
          <div class="tool-name">calculate_working_days</div>
          <div class="tool-desc">Computes net business working days, weekend rest days, statutory holidays, and billable hours between two dates.</div>
        </div>
        <div class="tool-item">
          <div class="tool-name">check_payment_rails_and_markets</div>
          <div class="tool-desc">Queries central bank RTGS wire clearing cutoffs, ACH roll rules, and 24/7 instant rails across 48 financial centers.</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Claude Desktop / Cursor Configuration</h2>
      <p style="margin-bottom: 0.75rem; color: var(--muted);">Add this snippet to your <code>claude_desktop_config.json</code> or Cursor MCP settings:</p>
      <pre>{
  "mcpServers": {
    "holidayexplore": {
      "url": "https://mcp.holidayexplore.com/mcp"
    }
  }
}</pre>
    </div>

    <div class="footer-links">
      <a href="https://holidayexplore.com/" target="_blank">HolidayExplore Portal</a>
      <a href="https://holidayexplore.com/2027-holidays/" target="_blank">2027 Global Calendar Hub</a>
      <a href="https://holidayexplore.com/working-days/" target="_blank">Working Days Calculator</a>
      <a href="https://holidayexplore.com/payment-rails/" target="_blank">Payment Rails Matrix</a>
      <a href="https://holidayexplore.com/api-docs/" target="_blank">REST API v1 Documentation</a>
      <a href="https://holidayexplore.com/llms.txt" target="_blank">llms.txt</a>
      <a href="https://github.com/sahin99chy/holidayexplore-mcp" target="_blank">GitHub Repository</a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Cloudflare Worker Export: fetch handler.
 */
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

    // Handle HEAD requests gracefully for health checkers / curl -I
    if (request.method === 'HEAD') {
      if (
        path === '/' ||
        path === '' ||
        path === '/mcp' ||
        path === '/.well-known/mcp.json' ||
        path === '/.well-known/glama.json' ||
        path === '/mcp/.well-known/glama.json' ||
        path === '/.well-known/mcptry-verify.txt' ||
        path === '/mcp/.well-known/mcptry-verify.txt'
      ) {
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Type': path === '/' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
            ...CORS_HEADERS
          }
        });
      }
    }

    // Root landing page: GET /
    if (path === '/' || path === '') {
      const accept = request.headers.get('Accept') || '';
      if (accept.includes('application/json') && !accept.includes('text/html')) {
        return new Response(
          JSON.stringify(
            {
              name: 'com.holidayexplore/mcp',
              version: '1.0.2',
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
                documentation: VERIFIED_URLS.api_docs,
                openapi: VERIFIED_URLS.openapi,
                llms: VERIFIED_URLS.llms_txt,
                home: VERIFIED_URLS.portal,
                hub2027: VERIFIED_URLS.hub2027
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
            "version": "1.0.2",
            "icons": [
              {
                "src": "https://holidayexplore.com/logo-mark.png",
                "mimeType": "image/png",
                "sizes": [
                  "any"
                ]
              }
            ],
            "websiteUrl": "https://holidayexplore.com",
            "repository": {
              "url": "https://github.com/sahin99chy/holidayexplore-mcp",
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

    // Glama MCP Connector Ownership Claim: GET /.well-known/glama.json and GET /mcp/.well-known/glama.json
    if (path === '/.well-known/glama.json' || path === '/mcp/.well-known/glama.json') {
      return new Response(
        JSON.stringify(
          {
            "$schema": "https://glama.ai/mcp/schemas/connector.json",
            "claim": "glama_claim_EI_JxGBcSxwBe756w-qRnoTF6Uv2TPze"
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

    // mcptry Server Ownership Claim: GET /.well-known/mcptry-verify.txt and GET /mcp/.well-known/mcptry-verify.txt
    if (path === '/.well-known/mcptry-verify.txt' || path === '/mcp/.well-known/mcptry-verify.txt') {
      return new Response('mcptry-verify=-KQjmVFgyMOWTYjLHft70_5psiDzsZQU\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          ...CORS_HEADERS
        }
      });
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
                version: '1.0.2',
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

      try {
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
      } catch (err) {
        return new Response(
          JSON.stringify(
            {
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: err.message || 'Internal MCP server error'
              },
              id: null
            },
            null,
            2
          ),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              ...CORS_HEADERS
            }
          }
        );
      }
    }

    // 404 fallback for any other route
    return new Response(
      JSON.stringify(
        {
          error: 'Not Found',
          message: `Endpoint '${path}' does not exist on mcp.holidayexplore.com. Use '/mcp' for Model Context Protocol or '/' for server info.`,
          mcp_endpoint: 'https://mcp.holidayexplore.com/mcp',
          documentation: VERIFIED_URLS.api_docs
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
