(function (root) {
  'use strict';

  function nsHeaders(apiSecret) {
    const headers = { Accept: 'application/json' };
    return Promise.resolve().then(async () => {
      if (!apiSecret) return headers;
      headers['API-SECRET'] = apiSecret.length === 40 ? apiSecret : await sha1Hex(apiSecret);
      return headers;
    });
  }

  async function sha1Hex(text) {
    if (root.crypto && root.crypto.subtle) {
      const buf = await root.crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return text;
  }

  function pickIob(status) {
    if (!status) return null;
    const candidates = [
      status.openaps && status.openaps.iob && status.openaps.iob.iob,
      status.loop && status.loop.iob && (status.loop.iob.iob != null ? status.loop.iob.iob : status.loop.iob),
      status.pump && status.pump.iob && status.pump.iob.iob,
      status.iob && (status.iob.iob != null ? status.iob.iob : status.iob)
    ];
    for (const v of candidates) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function normalizeDeviceStatus(row) {
    if (!row) return null;
    const pump = row.pump || {};
    const status = pump.status || {};
    const battery = pump.battery || {};
    return {
      at: row.created_at || row.mills && new Date(row.mills).toISOString() || new Date().toISOString(),
      device: row.device || '',
      iob: pickIob(row),
      reservoir: pump.reservoir != null ? Number(pump.reservoir) : null,
      batteryPercent: battery.percent != null ? Number(battery.percent) : (row.uploaderBattery != null ? Number(row.uploaderBattery) : null),
      suspended: Boolean(status.suspended),
      bolusing: Boolean(status.bolusing),
      source: 'nightscout'
    };
  }

  function normalizeTreatment(row) {
    if (!row) return null;
    const insulin = Number(row.insulin);
    const carbs = Number(row.carbs);
    return {
      id: row._id || row.identifier || null,
      at: row.created_at || row.timestamp || new Date().toISOString(),
      eventType: row.eventType || 'Treatment',
      insulin: Number.isFinite(insulin) ? insulin : null,
      carbs: Number.isFinite(carbs) ? carbs : null,
      notes: row.notes || row.reason || '',
      source: 'nightscout'
    };
  }

  async function fetchNightscoutPump(baseUrl, apiSecret) {
    const root = String(baseUrl || '').replace(/\/+$/, '');
    if (!root) throw new Error('Nightscout URL required for pump data');
    const headers = await nsHeaders(apiSecret);
    const [statusRes, treatRes] = await Promise.all([
      fetch(root + '/api/v1/devicestatus.json?count=3', { headers, mode: 'cors' }),
      fetch(root + '/api/v1/treatments.json?count=25', { headers, mode: 'cors' })
    ]);
    if (!statusRes.ok && !treatRes.ok) {
      throw new Error('Nightscout pump fetch failed');
    }
    const statuses = statusRes.ok ? await statusRes.json() : [];
    const treatments = treatRes.ok ? await treatRes.json() : [];
    const statusList = Array.isArray(statuses) ? statuses.map(normalizeDeviceStatus).filter(Boolean) : [];
    const treatmentList = Array.isArray(treatments) ? treatments.map(normalizeTreatment).filter(Boolean) : [];
    const latestStatus = statusList[0] || null;
    const lastBolus = treatmentList.find((t) => t.insulin && t.insulin > 0) || null;
    return {
      status: latestStatus,
      treatments: treatmentList.slice(0, 12),
      lastBolus,
      fetchedAt: new Date().toISOString()
    };
  }

  root.KathyPump = {
    pickIob,
    normalizeDeviceStatus,
    normalizeTreatment,
    fetchNightscoutPump
  };
})(typeof window !== 'undefined' ? window : globalThis);
