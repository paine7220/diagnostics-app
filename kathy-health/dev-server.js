#!/usr/bin/env node
'use strict';

/**
 * Local HTTPS-tunnel-friendly server for Kathy’s Health phone testing.
 * Serves the web app and proxies Dexcom Share / alert / billing routes
 * on the same origin (avoids Cloudflare preview bot challenges).
 *
 *   node kathy-health/dev-server.js
 *   cloudflared tunnel --url http://127.0.0.1:8787
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const WEB = path.join(__dirname, 'web');
const SHARE_APP_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db';
const SHARE_AGENT = 'Dexcom Share/3.0.2.11 CFNetwork Dashboard/711.2.23 Darwin/14.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, status, body, type) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function shareBase(region) {
  return region === 'ous'
    ? 'https://shareous1.dexcom.com/ShareWebServices/Services'
    : 'https://share2.dexcom.com/ShareWebServices/Services';
}

async function fetchDexcomShareLatest(accountName, password, region) {
  const base = shareBase(region);
  const loginRes = await fetch(base + '/General/LoginPublisherAccountByName', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': SHARE_AGENT
    },
    body: JSON.stringify({
      accountName,
      password,
      applicationId: SHARE_APP_ID
    })
  });
  const sessionRaw = await loginRes.text();
  if (!loginRes.ok) throw new Error('Dexcom Share login failed (' + loginRes.status + ')');
  let sessionId = sessionRaw;
  if (sessionRaw && sessionRaw.trim()) {
    try { sessionId = JSON.parse(sessionRaw); } catch (e) { /* keep string */ }
  }
  sessionId = String(sessionId || '').replace(/^"|"$/g, '');
  if (!sessionId || /AccountPassword|Invalid|null/i.test(sessionId)) {
    throw new Error('Dexcom Share login rejected — check username, password, region, and that Share is enabled in the Dexcom app');
  }
  const glucoseUrl = base + '/Publisher/ReadPublisherLatestGlucoseValues?sessionId=' +
    encodeURIComponent(sessionId) + '&minutes=1440&maxCount=3';
  const gRes = await fetch(glucoseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': SHARE_AGENT
    },
    body: JSON.stringify({})
  });
  const gText = await gRes.text();
  if (!gRes.ok) throw new Error('Dexcom Share glucose fetch failed (' + gRes.status + ')');
  let rows = [];
  try { rows = gText ? JSON.parse(gText) : []; } catch (e) {
    throw new Error('Dexcom Share returned unreadable glucose data');
  }
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('No Dexcom readings — open the Dexcom app, enable Share, and wait for a value');
  }
  const row = rows[0];
  const mgdl = Number(row.Value != null ? row.Value : row.value);
  const trend = row.Trend || row.trend || null;
  const wt = String(row.WT || row.DT || row.ST || '');
  const match = wt.match(/Date\((\d+)/);
  const at = match ? new Date(Number(match[1])).toISOString() : new Date().toISOString();
  if (!Number.isFinite(mgdl)) throw new Error('Invalid glucose value from Dexcom Share');
  return {
    mgdl,
    mmol: Math.round((mgdl / 18.0182) * 10) / 10,
    trend: String(trend || ''),
    at,
    rawTrend: trend,
    recentCount: rows.length
  };
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.normalize(path.join(WEB, rel));
  if (!filePath.startsWith(WEB)) return send(res, 403, { ok: false, error: 'forbidden' });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return send(res, 404, { ok: false, error: 'not found' });
  }
  const ext = path.extname(filePath).toLowerCase();
  send(res, 200, fs.readFileSync(filePath), MIME[ext] || 'application/octet-stream');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'OPTIONS') return send(res, 204, '');

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, {
        ok: true,
        service: 'kathy-health-dev-server',
        dexcomShareProxy: true,
        alert: true,
        billingAi: Boolean(process.env.OPENAI_API_KEY)
      });
    }

    if (req.method === 'POST' && (url.pathname === '/dexcom/latest' || url.pathname === '/api/dexcom/latest')) {
      const body = await readBody(req);
      const accountName = String(body.accountName || body.username || '').trim();
      const password = String(body.password || '');
      const region = String(body.region || 'us').toLowerCase() === 'ous' ? 'ous' : 'us';
      if (!accountName || !password) return send(res, 400, { ok: false, error: 'accountName and password required' });
      try {
        const reading = await fetchDexcomShareLatest(accountName, password, region);
        return send(res, 200, { ok: true, source: 'dexcom_share', region, reading });
      } catch (err) {
        return send(res, 502, { ok: false, error: String(err && err.message || err) });
      }
    }

    if (req.method === 'POST' && (url.pathname === '/alert' || url.pathname === '/api/alert')) {
      const body = await readBody(req);
      console.log('[alert]', new Date().toISOString(), body.message || '', 'family=', (body.family || []).length);
      return send(res, 200, {
        ok: true,
        type: body.type || 'kathy_low_sugar_no_response',
        reason: body.reason || null,
        note: 'Dev server accepted alert (configure Twilio worker for real SMS)'
      });
    }

    if (req.method === 'POST' && (url.pathname === '/billing/assist' || url.pathname === '/api/billing/assist')) {
      const body = await readBody(req);
      const apiKey = process.env.OPENAI_API_KEY || String(body.apiKey || '').trim();
      if (!apiKey) {
        return send(res, 400, { ok: false, error: 'No OPENAI_API_KEY — use Local helper on Bills, or set the env var' });
      }
      const ores = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            { role: 'system', content: String(body.system || '').slice(0, 4000) },
            { role: 'user', content: String(body.user || '').slice(0, 12000) }
          ]
        })
      });
      const data = await ores.json().catch(() => ({}));
      if (!ores.ok) {
        return send(res, 502, { ok: false, error: (data.error && data.error.message) || ('OpenAI HTTP ' + ores.status) });
      }
      const answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      return send(res, 200, { ok: true, answer: answer || '', model: process.env.OPENAI_MODEL || 'gpt-4o-mini' });
    }

    if (req.method === 'GET') return serveStatic(req, res, url.pathname);
    return send(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { ok: false, error: String(err && err.message || err) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Kathy Health phone-test server on http://127.0.0.1:' + PORT);
  console.log('Dexcom proxy: POST /dexcom/latest');
});
