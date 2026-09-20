(function (root) {
  'use strict';

  const TASKS = {
    explain: {
      label: 'Explain this bill / EOB',
      system: 'You help a patient understand medical bills and insurance EOBs in plain English. Be careful, cite line items when possible, and say what is uncertain. You are not a lawyer or billing professional. Suggest practical next steps.'
    },
    appeal: {
      label: 'Draft an appeal letter',
      system: 'You draft a polite, specific insurance appeal letter for a patient. Use only facts from the provided bill/notes. Include placeholders in [BRACKETS] for missing info. Not legal advice.'
    },
    call_script: {
      label: 'Script to call insurance',
      system: 'You write a short phone script for calling an insurer or hospital billing office. Include questions to ask, numbers/codes to confirm, and notes to write down. Plain language.'
    },
    find_errors: {
      label: 'Look for common billing issues',
      system: 'You review the pasted bill/EOB for common problems: duplicate charges, incorrect patient info, missing insurance payments, denied codes, balance billing risks, and unclear adjustments. List issues as bullets with why they matter and what to ask.'
    }
  };

  function localAssist(task, documentText, patientName) {
    const text = String(documentText || '');
    const name = patientName || 'the patient';
    const amounts = text.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})/g) || [];
    const codes = text.match(/\b[A-Z]\d{2}(?:\.\d{1,2})?\b|\bCPT\s*\d{4,5}\b|\b\d{5}\b/gi) || [];
    const denial = /den(y|ied|ial)|not covered|patient responsibility|co-?pay|deductible|out[- ]of[- ]network|prior auth|authorization/i.test(text);
    const lines = [];

    if (task === 'explain') {
      lines.push('Plain-language review (local helper — enable AI for a fuller read):');
      lines.push('- Patient: ' + name);
      if (amounts.length) lines.push('- Amounts spotted: ' + amounts.slice(0, 8).join(', '));
      if (codes.length) lines.push('- Codes/IDs spotted: ' + [...new Set(codes)].slice(0, 8).join(', '));
      lines.push(denial
        ? '- This text looks like it may include a denial, patient-responsibility, or coverage limit. Compare each line to the EOB.'
        : '- Check that insurance payment, adjustments, and patient balance add up.');
      lines.push('- Next: ask billing for an itemized bill and the claim number.');
    } else if (task === 'appeal') {
      lines.push('Draft appeal (fill in brackets):');
      lines.push('');
      lines.push('To: [Insurance appeals department]');
      lines.push('Re: Appeal for ' + name + ' — Claim #[CLAIM] — DOS [DATE]');
      lines.push('');
      lines.push('I am appealing the decision on the claim above. Based on the enclosed bill/EOB, I believe the charge or denial should be reconsidered because [REASON].');
      lines.push('');
      lines.push('Please review and send a written response. I can provide supporting records from the provider if needed.');
      lines.push('');
      lines.push('Sincerely,');
      lines.push(name);
      lines.push('[Phone] [Address]');
    } else if (task === 'call_script') {
      lines.push('Call script:');
      lines.push('1. “Hi, I’m calling about a bill for ' + name + '. Can I get the claim number and date of service on file?”');
      lines.push('2. “Was this processed in-network? What were the allowed amount, insurance payment, and patient responsibility?”');
      lines.push('3. “Is any amount denied? What is the denial code and how do we appeal?”');
      lines.push('4. “Please mail/email an itemized statement and EOB.”');
      lines.push('5. Write down: rep name, reference #, callback #, time.');
    } else {
      lines.push('Common issues checklist:');
      lines.push('- Duplicate dates of service or repeated CPT/HCPCS lines');
      lines.push('- Balance due before insurance final payment posts');
      lines.push('- Out-of-network billed as in-network (or the reverse)');
      lines.push('- Missing prior authorization notes');
      lines.push('- Patient demographics / member ID typos');
      lines.push('- Facility fee + professional fee both charged without explanation');
      if (denial) lines.push('- Denial/patient-responsibility language detected in the paste — request the exact CARC/RARC codes.');
    }

    if (text.trim()) {
      lines.push('');
      lines.push('Source notes length: ' + text.trim().length + ' characters pasted.');
    }
    lines.push('');
    lines.push('Not legal or billing advice. For AI-written help, set the alert worker with an OPENAI_API_KEY (or paste a key in Settings).');
    return lines.join('\n');
  }

  function buildMessages(task, documentText, patientName, extraQuestion) {
    const spec = TASKS[task] || TASKS.explain;
    const user = [
      'Patient name: ' + (patientName || 'Kathy'),
      extraQuestion ? ('Extra question: ' + extraQuestion) : '',
      'Document / bill / EOB text:',
      documentText || '(none pasted)'
    ].filter(Boolean).join('\n\n');
    return {
      task,
      label: spec.label,
      system: spec.system,
      user
    };
  }

  async function askWorker(proxyBase, payload) {
    const url = String(proxyBase || '').replace(/\/+$/, '') + '/billing/assist';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      mode: 'cors'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error((data && data.error) || ('Billing AI error (' + res.status + ')'));
    }
    return data;
  }

  root.KathyBilling = { TASKS, localAssist, buildMessages, askWorker };
})(typeof window !== 'undefined' ? window : globalThis);
