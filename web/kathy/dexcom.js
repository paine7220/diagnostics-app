(function (root) {
  'use strict';

  const TREND_ARROWS = {
    None: '',
    DoubleUp: '⇈',
    SingleUp: '↑',
    FortyFiveUp: '↗',
    Flat: '→',
    FortyFiveDown: '↘',
    SingleDown: '↓',
    DoubleDown: '⇊',
    '1': '⇈',
    '2': '↑',
    '3': '↗',
    '4': '→',
    '5': '↘',
    '6': '↓',
    '7': '⇊'
  };

  function trendArrow(trend) {
    if (trend == null) return '';
    return TREND_ARROWS[String(trend)] || TREND_ARROWS[trend] || '';
  }

  function normalizeNightscoutEntry(entry) {
    if (!entry) return null;
    const mgdl = Number(entry.sgv != null ? entry.sgv : entry.glucose);
    if (!Number.isFinite(mgdl)) return null;
    const at = entry.dateString || (entry.date ? new Date(entry.date).toISOString() : new Date().toISOString());
    return {
      mgdl,
      mmol: Math.round((mgdl / 18.0182) * 10) / 10,
      trend: trendArrow(entry.direction || entry.trend),
      at,
      source: 'nightscout'
    };
  }

  async function fetchNightscoutLatest(baseUrl, apiSecret) {
    const root = String(baseUrl || '').replace(/\/+$/, '');
    if (!root) throw new Error('Nightscout URL required');
    const url = root + '/api/v1/entries/sgv.json?count=1';
    const headers = { Accept: 'application/json' };
    if (apiSecret) {
      headers['API-SECRET'] = apiSecret.length === 40 ? apiSecret : await sha1Hex(apiSecret);
    }
    const res = await fetch(url, { headers, mode: 'cors' });
    if (!res.ok) throw new Error('Nightscout error (' + res.status + ')');
    const rows = await res.json();
    const reading = normalizeNightscoutEntry(Array.isArray(rows) ? rows[0] : null);
    if (!reading) throw new Error('No Nightscout glucose entries');
    return reading;
  }

  async function fetchDexcomShareLatest(proxyUrl, accountName, password, region) {
    const endpoint = String(proxyUrl || '').replace(/\/+$/, '') + '/dexcom/latest';
    if (!accountName || !password) throw new Error('Dexcom Share username and password required');
    if (!proxyUrl) throw new Error('Alert worker URL required to reach Dexcom Share');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ accountName, password, region: region || 'us' }),
      mode: 'cors'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error((data && data.error) || ('Dexcom proxy error (' + res.status + ')'));
    }
    const reading = data.reading || {};
    return {
      mgdl: Number(reading.mgdl),
      mmol: reading.mmol,
      trend: trendArrow(reading.trend || reading.rawTrend),
      at: reading.at || new Date().toISOString(),
      source: 'dexcom_share'
    };
  }

  async function sha1Hex(text) {
    if (root.crypto && root.crypto.subtle) {
      const buf = await root.crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback: send raw secret; some Nightscout setups accept it
    return text;
  }

  async function fetchLatest(config) {
    const mode = (config && config.mode) || 'off';
    if (mode === 'nightscout') {
      return fetchNightscoutLatest(config.nightscoutUrl, config.nightscoutSecret);
    }
    if (mode === 'dexcom_share') {
      return fetchDexcomShareLatest(
        config.proxyUrl || config.webhookBase,
        config.accountName,
        config.password,
        config.region
      );
    }
    throw new Error('CGM mode is off');
  }

  root.KathyDexcom = {
    trendArrow,
    normalizeNightscoutEntry,
    fetchNightscoutLatest,
    fetchDexcomShareLatest,
    fetchLatest
  };
})(typeof window !== 'undefined' ? window : globalThis);
