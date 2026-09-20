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

  async function postWebhook(url, payload) {
    if (!url) return { ok: false, skipped: true };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, status: res.status };
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
    postWebhook,
    notifyLocal
  };
})(typeof window !== 'undefined' ? window : globalThis);
