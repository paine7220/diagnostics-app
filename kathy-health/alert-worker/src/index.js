/**
 * Kathy’s Health family alert + Dexcom Share proxy worker.
 *
 *   cd kathy-health/alert-worker && npx wrangler deploy
 *
 * Twilio secrets (optional, for SMS):
 *   npx wrangler secret put TWILIO_ACCOUNT_SID
 *   npx wrangler secret put TWILIO_AUTH_TOKEN
 *   npx wrangler secret put TWILIO_FROM_NUMBER
 *
 * Routes:
 *   GET  /                 health
 *   POST /alert            family alert (Twilio SMS when configured)
 *   POST /dexcom/latest    Dexcom Share latest glucose (proxies Share API)
 */
const SHARE_APP_ID = 'd89443d2-327c-4a6f-89e5-496bbb0317db';
const SHARE_AGENT = 'Dexcom Share/3.0.2.11 CFNetwork Dashboard/711.2.23 Darwin/14.0.0';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return json({
        ok: true,
        service: 'kathy-health-alerts',
        twilioConfigured: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER),
        dexcomShareProxy: true
      });
    }

    if (request.method === 'POST' && url.pathname === '/dexcom/latest') {
      return handleDexcomLatest(request);
    }

    if (request.method === 'POST' && url.pathname === '/alert') {
      return handleAlert(request, env);
    }

    return json({ ok: false, error: 'Use POST /alert or POST /dexcom/latest' }, 404);
  }
};

async function handleAlert(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const message = String(body.message || '').slice(0, 480);
  const family = Array.isArray(body.family) ? body.family : [];
  if (!message) return json({ ok: false, error: 'message required' }, 400);

  const results = [];
  for (const person of family) {
    const phone = normalizePhone(person && person.phone);
    if (!phone) {
      results.push({ name: person && person.name, ok: false, error: 'missing phone' });
      continue;
    }
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) {
      try {
        const sent = await sendTwilioSms(env, phone, message);
        results.push({ name: person.name, phone, ok: sent.ok, sid: sent.sid, error: sent.error });
      } catch (err) {
        results.push({ name: person.name, phone, ok: false, error: String(err && err.message || err) });
      }
    } else {
      results.push({
        name: person.name,
        phone,
        ok: true,
        queued: true,
        note: 'Twilio secrets not set — alert accepted but SMS not sent'
      });
    }
  }

  return json({
    ok: results.some((r) => r.ok),
    type: body.type || 'kathy_low_sugar_no_response',
    reason: body.reason || null,
    profileName: body.profileName || null,
    sugarValue: body.sugarValue || null,
    results
  });
}

async function handleDexcomLatest(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const accountName = String(body.accountName || body.username || '').trim();
  const password = String(body.password || '');
  const region = String(body.region || 'us').toLowerCase() === 'ous' ? 'ous' : 'us';
  if (!accountName || !password) {
    return json({ ok: false, error: 'accountName and password required' }, 400);
  }

  try {
    const reading = await fetchDexcomShareLatest(accountName, password, region);
    return json({ ok: true, source: 'dexcom_share', region, reading });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) }, 502);
  }
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
  if (!loginRes.ok) {
    throw new Error('Dexcom Share login failed (' + loginRes.status + ')');
  }
  let sessionId = sessionRaw;
  try {
    sessionId = JSON.parse(sessionRaw);
  } catch (e) { /* plain string session */ }
  sessionId = String(sessionId || '').replace(/^"|"$/g, '');
  if (!sessionId || /AccountPassword|Invalid|null/i.test(sessionId)) {
    throw new Error('Dexcom Share login rejected — check username, password, and region');
  }

  const glucoseUrl = base + '/Publisher/ReadPublisherLatestGlucoseValues?sessionId=' +
    encodeURIComponent(sessionId) + '&minutes=1440&maxCount=1';
  const gRes = await fetch(glucoseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': SHARE_AGENT
    },
    body: JSON.stringify({})
  });
  if (!gRes.ok) {
    throw new Error('Dexcom Share glucose fetch failed (' + gRes.status + ')');
  }
  const rows = await gRes.json();
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('No Dexcom Share readings yet — enable Share and add a follower');
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
    rawTrend: trend
  };
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: cors() });
}

function normalizePhone(phone) {
  const raw = String(phone || '').replace(/[^\d+]/g, '');
  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  if (raw.length === 10) return '+1' + raw;
  if (raw.length === 11 && raw.startsWith('1')) return '+' + raw;
  return raw;
}

async function sendTwilioSms(env, to, body) {
  const endpoint = 'https://api.twilio.com/2010-04-01/Accounts/' + env.TWILIO_ACCOUNT_SID + '/Messages.json';
  const auth = btoa(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN);
  const form = new URLSearchParams();
  form.set('To', to);
  form.set('From', env.TWILIO_FROM_NUMBER);
  form.set('Body', body);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.message || ('Twilio HTTP ' + res.status) };
  }
  return { ok: true, sid: data.sid };
}
