(function (root) {
  'use strict';

  function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function parseDose(line) {
    const m = line.match(/(\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|units?|iu)\b.*)$/i);
    if (m) return clean(m[1]);
    const m2 = line.match(/\b(\d+\s*(?:tablet|tab|capsule|cap|puff|drop)s?)\b/i);
    return m2 ? clean(m2[1]) : '';
  }

  function parseSchedule(line) {
    const lower = line.toLowerCase();
    const times = [];
    if (/once\s+(a|per)\s+day|daily|every\s+day|q\.?\s*d\.?/i.test(lower)) times.push('08:00');
    if (/twice|two\s+times|b\.?\s*i\.?\s*d\.?/i.test(lower)) { times.push('08:00', '20:00'); }
    if (/three\s+times|t\.?\s*i\.?\s*d\.?/i.test(lower)) { times.push('08:00', '14:00', '20:00'); }
    if (/morning/.test(lower) && !times.includes('08:00')) times.push('08:00');
    if (/noon|midday/.test(lower) && !times.includes('12:00')) times.push('12:00');
    if (/evening|night|bedtime/.test(lower) && !times.includes('20:00')) times.push('20:00');
    const clock = line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g);
    if (clock) clock.forEach((t) => { if (!times.includes(t)) times.push(t); });
    return times.length ? [...new Set(times)] : ['08:00'];
  }

  function looksLikeMed(line) {
    return /medication|medicine|rx|take|tablet|capsule|mg\b|mcg\b|prescri/i.test(line) ||
      /^[-*•]\s*[A-Z][a-z].{0,40}\d/.test(line);
  }

  function looksLikeAppt(line) {
    return /appointment|appt|visit|follow[- ]?up|doctor|clinic|dr\.|dentist|specialist/i.test(line);
  }

  function looksLikeContact(line) {
    return /(?:phone|call|contact|dr\.|doctor|nurse|pharmacy).{0,40}\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/i.test(line) ||
      /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(line) && /dr\.|doctor|pharmacy|clinic/i.test(line);
  }

  function parseDateHint(line) {
    const iso = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) return iso[1];
    const us = line.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
    if (us) {
      const mm = us[1].padStart(2, '0');
      const dd = us[2].padStart(2, '0');
      return us[3] + '-' + mm + '-' + dd;
    }
    const named = line.match(/\b((January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2})\b/i);
    if (named) {
      const d = new Date(named[1]);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return '';
  }

  function medNameFromLine(line) {
    let s = line.replace(/^[-*•\d.)\s]+/, '');
    s = s.replace(/^(medication|medicine|rx|drug)\s*[:\-]\s*/i, '');
    s = s.split(/[–—|:]/)[0];
    s = s.replace(/\b\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|units?|iu)\b.*/i, '');
    s = s.replace(/\b(once|twice|three|daily|every|morning|evening|night|take|with food).*/i, '');
    return clean(s).slice(0, 80);
  }

  function importNotes(text) {
    const lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
    const meds = [];
    const appointments = [];
    const contacts = [];
    const questions = [];
    const leftovers = [];

    let mode = '';
    for (const line of lines) {
      const heading = line.replace(/[:#]/g, '').trim().toLowerCase();
      if (/^(medications?|meds|prescriptions?|current medications?)$/.test(heading)) { mode = 'meds'; continue; }
      if (/^(appointments?|visits?|schedule|upcoming)$/.test(heading)) { mode = 'appts'; continue; }
      if (/^(contacts?|care team|doctors?|providers?|pharmacy)$/.test(heading)) { mode = 'contacts'; continue; }
      if (/^(questions?|ask (the )?doctor|visit prep)$/.test(heading)) { mode = 'questions'; continue; }
      if (/^(symptoms?|vitals?|conditions?|notes?)$/.test(heading)) { mode = 'other'; continue; }

      const heuristicOk = !mode || mode === 'other';

      if (mode === 'appts' || (heuristicOk && looksLikeAppt(line))) {
        appointments.push({
          id: uid('appt'),
          title: clean(line.replace(/^[-*•\d.)\s]+/, '')).slice(0, 120),
          when: parseDateHint(line),
          time: (line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/) || [])[0] || '',
          location: '',
          notes: line,
          createdAt: new Date().toISOString()
        });
        continue;
      }

      if (mode === 'contacts' || (heuristicOk && looksLikeContact(line))) {
        const phone = (line.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/) || [''])[0];
        contacts.push({
          id: uid('ct'),
          name: clean(line.replace(phone, '').replace(/^[-*•\d.)\s]+/, '').replace(/phone|call|contact/ig, '')).slice(0, 80) || 'Care contact',
          role: /pharmacy/i.test(line) ? 'Pharmacy' : (/nurse/i.test(line) ? 'Nurse' : 'Provider'),
          phone: phone,
          notes: line,
          createdAt: new Date().toISOString()
        });
        continue;
      }

      if (mode === 'questions' || (heuristicOk && (/\?$/.test(line) || /^ask\b/i.test(line)))) {
        questions.push({
          id: uid('q'),
          text: clean(line.replace(/^[-*•\d.)\s]+/, '')),
          done: false,
          createdAt: new Date().toISOString()
        });
        continue;
      }

      if (mode === 'meds' || (heuristicOk && looksLikeMed(line))) {
        const name = medNameFromLine(line);
        if (name && name.length > 1) {
          meds.push({
            id: uid('med'),
            name,
            dose: parseDose(line),
            times: parseSchedule(line),
            notes: line,
            active: true,
            createdAt: new Date().toISOString()
          });
          continue;
        }
      }

      leftovers.push(line);
    }

    return { meds, appointments, contacts, questions, leftovers, lineCount: lines.length };
  }

  root.KathyNotesImport = { importNotes, uid, clean };
})(typeof window !== 'undefined' ? window : globalThis);
