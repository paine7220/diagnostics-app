(function (root) {
  'use strict';

  function parseSugarNumber(value) {
    const s = String(value || '').trim();
    const m = s.match(/(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : NaN;
  }

  function isLowSugar(value, threshold) {
    const n = parseSugarNumber(value);
    if (Number.isNaN(n)) return false;
    return n <= Number(threshold || 70);
  }

  function buildAlertMessage(profileName, sugarValue, unit) {
    const who = profileName || 'Kathy';
    const sugar = sugarValue ? (sugarValue + (unit ? ' ' + unit : '')) : 'unknown';
    return who + ' may have low blood sugar (' + sugar + ') and has not confirmed they are OK. Please check on them now.';
  }

  function smsUrl(phone, body) {
    const digits = String(phone || '').replace(/[^\d+]/g, '');
    if (!digits) return '';
    return 'sms:' + digits + '?body=' + encodeURIComponent(body);
  }

  function telUrl(phone) {
    const digits = String(phone || '').replace(/[^\d+]/g, '');
    return digits ? 'tel:' + digits : '';
  }

  function alertPayload(fields) {
    return {
      type: fields.type || 'kathy_low_sugar_no_response',
      reason: fields.reason || null,
      profileName: fields.profileName || null,
      sugarValue: fields.sugarValue || null,
      unit: fields.unit || null,
      message: fields.message || '',
      at: new Date().toISOString(),
      family: fields.family || []
    };
  }

  /**
   * Hands-free alert: works even if Kathy cannot tap the screen.
   * Prefer sendBeacon, then keepalive fetch.
   */
  async function postWebhook(url, payload) {
    if (!url) return { ok: false, skipped: true, mode: 'none' };
    const body = JSON.stringify(payload);
    try {
      if (typeof root.navigator !== 'undefined' && typeof root.navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        const queued = root.navigator.sendBeacon(url, blob);
        if (queued) return { ok: true, mode: 'beacon' };
      }
    } catch (e) { /* fall through */ }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        mode: 'cors'
      });
      return { ok: res.ok, status: res.status, mode: 'fetch' };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err), mode: 'fetch' };
    }
  }

  async function notifyLocal(title, body) {
    try {
      if (!('Notification' in root)) return false;
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if (Notification.permission !== 'granted') return false;
      new Notification(title, { body, requireInteraction: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  root.KathyAlerts = {
    parseSugarNumber,
    isLowSugar,
    buildAlertMessage,
    smsUrl,
    telUrl,
    alertPayload,
    postWebhook,
    notifyLocal
  };
})(typeof window !== 'undefined' ? window : globalThis);
