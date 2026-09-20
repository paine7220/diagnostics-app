/**
 * Kathy’s Health family alert worker.
 * Deploy separately from the diagnostics app:
 *   cd kathy-health/alert-worker && npx wrangler deploy
 *
 * Set secrets (optional but recommended for real SMS):
 *   npx wrangler secret put TWILIO_ACCOUNT_SID
 *   npx wrangler secret put TWILIO_AUTH_TOKEN
 *   npx wrangler secret put TWILIO_FROM_NUMBER
 *
 * Without Twilio, the worker still accepts alerts and returns who would be texted
 * (useful with IFTTT/Zapier in front, or for testing).
 */
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
        twilioConfigured: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER)
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/alert') {
      return json({ ok: false, error: 'POST /alert with JSON body' }, 404);
    }

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
};

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
