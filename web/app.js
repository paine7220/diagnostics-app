
const APP_VERSION = (window.ATD_DESKTOP && window.ATD_DESKTOP.version) || (typeof DiagEngine !== 'undefined' && DiagEngine.APP_VERSION) || '1.2.0';

const state = {
  dtcDb: [],
  audioBlob: null,
  audioSummary: null,
  currentStream: null,
  imageSummary: null,
  lastAnalysis: null,
  lastAnalysisText: ''
};

const symptoms = [
  'No crank','Cranks no start','Hard start','Stalling','Rough idle','Misfire','Low power','Poor fuel economy','Overheating','Tick','Knock','Squeal','Hiss','Whine','Grind','Smoke','Fuel smell','Oil leak','Coolant loss','Electrical weirdness','Transmission slip','ABS / brake issue','Charging problem','Battery light','No heat','Won’t shift','Gauge acting weird'
];

function byId(id){ return document.getElementById(id); }
function text(el, value){ const node = byId(el); if(node) node.textContent = value; }
function html(el, value){ const node = byId(el); if(node) node.innerHTML = value; }
function value(id){ const node = byId(id); return node ? String(node.value || '').trim() : ''; }
function checkedSymptoms(){ return symptoms.filter((name, i) => byId(`sym_${i}`) && byId(`sym_${i}`).checked); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

function fillYears(){
  const sel = byId('year');
  sel.innerHTML = '<option value="">Select</option>';
  const top = new Date().getFullYear() + 1;
  for(let y = top; y >= 1980; y--){
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    sel.appendChild(opt);
  }
}

function renderSymptoms(){
  const box = byId('symptoms');
  box.innerHTML = '';
  symptoms.forEach((name, i) => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" id="sym_${i}"> <span>${esc(name)}</span>`;
    box.appendChild(label);
  });
}

function loadStats(){
  const stats = DiagEngine.computeStats(state.dtcDb);
  html('dbStats', `
    <div class="stat"><strong>${stats.total.toLocaleString()}</strong><div class="small">Bundled DTCs</div></div>
    <div class="stat"><strong>${stats.byFamily.Powertrain || 0}</strong><div class="small">Powertrain</div></div>
    <div class="stat"><strong>${stats.byFamily.Body || 0}</strong><div class="small">Body</div></div>
    <div class="stat"><strong>${stats.byFamily.Chassis || 0}</strong><div class="small">Chassis</div></div>
    <div class="stat"><strong>${stats.byFamily.Network || 0}</strong><div class="small">Network</div></div>
    <div class="stat"><strong>v${esc(APP_VERSION)}</strong><div class="small">Offline build</div></div>
  `);
}

async function loadDb(){
  state.dtcDb = window.DTC_DB_DATA || [];
}

function vehicleData(){
  return {
    year: value('year'), make: value('make'), model: value('model'), engine: value('engine'), mileage: value('mileage'),
    trans: value('trans'), fuel: value('fuel'), nickname: value('nickname')
  };
}

function parseCodes(){
  return Array.from(new Set(value('codes').toUpperCase().replace(/,/g,'\n').split(/\s+/).map(x => x.trim()).filter(Boolean)));
}

function fluidData(){
  const data = {
    type: value('fluidType'), level: value('fluidLevel'), color: value('fluidColor'), smell: value('fluidSmell'), capacity: value('fluidCapacity'), notes: value('fluidNotes')
  };
  const lines = [];
  if(!data.type){ text('fluidOut', 'Fluid guidance will show here.'); return data; }
  lines.push(`${data.type} review`);
  if(/Below|dry/i.test(data.level)) lines.push('- Danger: verify level before further operation. Add only in small measured amounts.');
  if(/add mark/i.test(data.level)) lines.push('- Slightly low: add carefully and re-check, do not dump a full container in blindly.');
  if(/Above full/i.test(data.level)) lines.push('- Overfill warning: too much fluid can cause damage.');
  if(/Milky/i.test(data.color)) lines.push('- Milky appearance can point to water or coolant contamination.');
  if(/Metallic/i.test(data.color)) lines.push('- Metallic glitter points to wear material.');
  if(/Burnt/i.test(data.smell)) lines.push('- Burnt smell points to overheating or friction damage.');
  if(/Fuel/i.test(data.smell)) lines.push('- Fuel smell can point to fuel dilution or rich running.');
  if(/Sweet coolant/i.test(data.smell)) lines.push('- Sweet coolant smell can point to a leak or cross-contamination.');
  if(data.capacity) lines.push(`- Capacity entered: ${data.capacity}`);
  if(data.notes) lines.push(`- Notes: ${data.notes}`);
  if(lines.length === 1) lines.push('- Level, color, and smell look unremarkable from the entries given. Recheck with the vehicle cold or at the specified operating temperature.');
  text('fluidOut', lines.join('\n'));
  return data;
}

function requireLegalAcceptance(){
  if(!byId('acceptLegal').checked){
    alert('Check the legal acknowledgement box before running diagnosis.');
    return false;
  }
  return true;
}

function showEl(id){
  const node = byId(id);
  if(node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderLookupCards(items){
  if(!items.length){ html('codeResults','<div class="code-card">No matching codes.</div>'); showEl('codeResults'); return; }
  html('codeResults', items.map(item => {
    const guidance = item.detailed ? `
      <div class="small mt-8"><strong>${esc(item.detailed.title || 'Guidance')}</strong></div>
      <div class="small mt-8"><strong>First checks:</strong> ${esc((item.detailed.firstChecks || []).join(' | '))}</div>
      <div class="small mt-6"><strong>Likely parts:</strong> ${esc((item.detailed.likelyParts || []).join(' | '))}</div>
    ` : '';
    return `
      <div class="code-card">
        <div><span class="badge">${esc(item.code)}</span><span class="badge">${esc(item.family)}</span><span class="badge">${esc(item.subsystem)}</span></div>
        <div><strong>${esc(item.description)}</strong></div>
        ${guidance}
      </div>
    `;
  }).join(''));
  showEl('lookupCard');
}

function quickLookup(){
  const codes = parseCodes();
  if(!codes.length){ html('codeResults','<div class="code-card">Enter at least one code.</div>'); return; }
  const results = DiagEngine.lookupCodes(state.dtcDb, codes);
  renderLookupCards(results || []);
}

function searchLocalDb(){
  const q = value('dbQuery');
  if(!q){ html('codeResults','<div class="code-card">Enter a code or keyword.</div>'); showEl('codeResults'); return; }
  const results = DiagEngine.searchDtc(state.dtcDb, q);
  renderLookupCards(results);
}

function saveCase(){
  const payload = currentCase();
  localStorage.setItem('atd_case_latest', JSON.stringify(payload));
  alert('Case saved locally on this device.');
}

function loadCase(){
  const raw = localStorage.getItem('atd_case_latest');
  if(!raw){ alert('No saved case found.'); return; }
  const saved = JSON.parse(raw);
  Object.entries(saved.vehicle || {}).forEach(([k,v]) => { if(byId(k)) byId(k).value = v || ''; });
  byId('codes').value = (saved.dtcs || []).join('\n');
  byId('notes').value = saved.notes || '';
  Object.entries(saved.fluid || {}).forEach(([k,v]) => {
    const map = { type:'fluidType', level:'fluidLevel', color:'fluidColor', smell:'fluidSmell', capacity:'fluidCapacity', notes:'fluidNotes' };
    if(map[k] && byId(map[k])) byId(map[k]).value = v || '';
  });
  symptoms.forEach((name, i) => { byId(`sym_${i}`).checked = (saved.symptoms || []).includes(name); });
  fluidData();
  if(saved.lastAnalysis){
    state.lastAnalysis = saved.lastAnalysis;
    state.lastAnalysisText = saved.lastAnalysisText || '';
    renderAnalysis(saved.lastAnalysis);
  }
  alert('Saved case loaded.');
}

function clearCase(){
  if(!confirm('Clear the on-screen form and delete the locally saved case?')) return;
  localStorage.removeItem('atd_case_latest');
  ['make','model','engine','mileage','nickname','codes','notes','dbQuery','fluidCapacity','fluidNotes'].forEach(id => { if(byId(id)) byId(id).value = ''; });
  ['year','trans','fuel','fluidType','fluidLevel','fluidColor','fluidSmell'].forEach(id => { if(byId(id)) byId(id).value = ''; });
  symptoms.forEach((_, i) => { if(byId(`sym_${i}`)) byId(`sym_${i}`).checked = false; });
  state.lastAnalysis = null;
  state.lastAnalysisText = '';
  state.audioSummary = null;
  state.imageSummary = null;
  html('codeResults', '');
  text('fluidOut', 'Fluid guidance will show here.');
  text('audioSummary', 'No audio analyzed yet.');
  text('imageSummary', 'No frame/image analyzed yet.');
  html('results', 'Nothing yet. Type a code above, then tap Quick Lookup.');
  alert('Saved case cleared.');
}

function currentCase(){
  return {
    savedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    vehicle: vehicleData(),
    dtcs: parseCodes(),
    symptoms: checkedSymptoms(),
    notes: value('notes'),
    fluid: {
      type: value('fluidType'), level: value('fluidLevel'), color: value('fluidColor'), smell: value('fluidSmell'), capacity: value('fluidCapacity'), notes: value('fluidNotes')
    },
    mediaSummary: { audio: state.audioSummary, image: state.imageSummary, video: state.imageSummary },
    lastAnalysis: state.lastAnalysis,
    lastAnalysisText: state.lastAnalysisText
  };
}

function analysisToText(analysis){
  const lines = [];
  lines.push(`Auto/Truck Diagnostics for Dummies v${APP_VERSION}`);
  lines.push(`Generated: ${analysis.generatedAt || new Date().toISOString()}`);
  const v = analysis.vehicle || vehicleData();
  lines.push(`Vehicle: ${[v.year, v.make, v.model, v.engine, v.nickname].filter(Boolean).join(' ') || '(not entered)'}`);
  lines.push(`Primary finding: ${analysis.summary.primaryFinding}`);
  lines.push(`Confidence: ${analysis.summary.confidence}%`);
  lines.push(`Reason: ${analysis.summary.shortReason}`);
  lines.push('');
  lines.push('Top ranked causes');
  (analysis.rankedHypotheses || []).forEach((item, i) => {
    lines.push(`${i+1}. ${item.title} — ${item.confidence}%`);
    lines.push(`   Evidence: ${(item.reasons || []).join(' | ')}`);
  });
  lines.push('');
  lines.push('First checks');
  (analysis.firstChecks || []).forEach((x, i) => lines.push(`${i+1}. ${x}`));
  lines.push('');
  lines.push('Likely parts / paths');
  (analysis.likelyParts || []).forEach((x, i) => lines.push(`${i+1}. ${x}`));
  if((analysis.warnings || []).length){
    lines.push('');
    lines.push('Warnings');
    analysis.warnings.forEach((x, i) => lines.push(`${i+1}. ${x}`));
  }
  if((analysis.codeCards || []).length){
    lines.push('');
    lines.push('Code cards');
    analysis.codeCards.forEach(card => {
      lines.push(`- ${card.code}: ${card.description}`);
      if(card.guidance){
        lines.push(`  ${card.guidance.title || 'Guidance'}`);
        lines.push(`  First checks: ${card.guidance.firstChecks.join(' | ')}`);
        if(card.guidance.likelyParts) lines.push(`  Likely parts: ${card.guidance.likelyParts.join(' | ')}`);
      }
    });
  }
  lines.push('');
  lines.push('Disclaimers');
  (analysis.disclaimers || []).forEach((x, i) => lines.push(`${i+1}. ${x}`));
  return lines.join('\n');
}

function exportReport(){
  const payload = currentCase();
  const reportText = payload.lastAnalysisText || 'No diagnosis has been run yet. Vehicle, codes, symptoms, and fluid notes are included below.';
  const body = `${reportText}\n\n--- Case JSON ---\n${JSON.stringify(payload, null, 2)}\n`;
  const blob = new Blob([body], { type:'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `atd-report-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function fileToArrayBuffer(file){ return await file.arrayBuffer(); }

async function analyzeAudioBuffer(buffer){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    let sum = 0, zc = 0;
    for(let i=0;i<channel.length;i++){
      const s = channel[i];
      sum += s*s;
      if(i>0 && ((channel[i-1] <= 0 && s > 0) || (channel[i-1] >= 0 && s < 0))) zc++;
    }
    const rms = Math.sqrt(sum / channel.length);
    const zeroCrossRate = zc / (channel.length / sampleRate);
    let cue = 'undetermined';
    if(rms < 0.01) cue = 'very quiet / weak signal';
    else if(zeroCrossRate > 6500) cue = 'possible squeal / high-frequency noise';
    else if(zeroCrossRate < 1100 && rms > 0.03) cue = 'possible knock / thump';
    else if(zeroCrossRate >= 1100 && zeroCrossRate <= 2600) cue = 'possible tick / rhythmic mechanical noise';
    else cue = 'broad mechanical noise';
    const summary = {
      durationSec: Number(audioBuffer.duration.toFixed(2)),
      rms: Number(rms.toFixed(4)),
      zeroCrossRate: Number(zeroCrossRate.toFixed(1)),
      cue
    };
    state.audioSummary = summary;
    text('audioSummary', `Audio summary: ${summary.durationSec}s | RMS ${summary.rms} | ZCR ${summary.zeroCrossRate} | cue: ${summary.cue}`);
  }catch(err){
    text('audioSummary', 'Audio loaded, but browser decoding failed for deeper analysis.');
    state.audioSummary = { cue:'audio loaded but deeper decode unavailable' };
  }
}

async function handleAudioFile(file){
  byId('audioPreview').src = URL.createObjectURL(file);
  const buffer = await fileToArrayBuffer(file);
  state.audioBlob = file;
  await analyzeAudioBuffer(buffer);
}

function imageMetricsFromCanvas(canvas){
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let white = 0, blue = 0, dark = 0, hot = 0, total = width * height;
  for(let i=0;i<data.length;i+=4){
    const r = data[i], g = data[i+1], b = data[i+2];
    const avg = (r+g+b)/3;
    if(avg > 205 && Math.abs(r-g) < 22 && Math.abs(g-b) < 22) white++;
    if(b > r+10 && b > g+10 && avg > 80 && avg < 210) blue++;
    if(avg < 55) dark++;
    if(r > 180 && g > 90 && b < 120) hot++;
  }
  const ratio = x => Number((x / total).toFixed(4));
  let smokeHint = 'no strong smoke color cue';
  if(ratio(white) > 0.18) smokeHint = 'possible white smoke / steam cue';
  if(ratio(blue) > 0.16) smokeHint = 'possible blue smoke / oil-burning cue';
  if(ratio(dark) > 0.34) smokeHint = 'possible black smoke / dark exhaust cue';
  const summary = { whiteRatio: ratio(white), blueRatio: ratio(blue), darkRatio: ratio(dark), hotRatio: ratio(hot), smokeHint };
  state.imageSummary = summary;
  text('imageSummary', `Image summary: white ${summary.whiteRatio} | blue ${summary.blueRatio} | dark ${summary.darkRatio} | cue: ${summary.smokeHint}`);
  return summary;
}

async function drawImageFileToCanvas(file){
  const img = new Image();
  img.onload = () => {
    const canvas = byId('frameCanvas');
    const maxW = 640;
    const scale = Math.min(1, maxW / img.width);
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    byId('photoPreview').src = img.src;
    byId('photoPreview').hidden = false;
    imageMetricsFromCanvas(canvas);
  };
  img.src = URL.createObjectURL(file);
}

async function startCamera(){
  try{
    state.currentStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
    const video = byId('videoPreview');
    video.srcObject = state.currentStream;
    await video.play();
  }catch(err){
    alert('Camera not available or permission denied.');
  }
}

function stopCamera(){
  if(state.currentStream){ state.currentStream.getTracks().forEach(t => t.stop()); state.currentStream = null; }
  const video = byId('videoPreview');
  video.pause();
  video.srcObject = null;
}

function captureFrame(){
  const video = byId('videoPreview');
  if(!(video.videoWidth > 0)) { alert('Start camera or load a video first.'); return; }
  const canvas = byId('frameCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  byId('frameImage').src = canvas.toDataURL('image/jpeg', 0.9);
  byId('frameImage').hidden = false;
  imageMetricsFromCanvas(canvas);
}

let mediaRecorder = null;
let mediaChunks = [];
async function toggleAudioRecord(){
  const btn = byId('btnAudioRecord');
  if(mediaRecorder && mediaRecorder.state === 'recording'){
    mediaRecorder.stop();
    btn.textContent = 'Start Audio Recording';
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    mediaChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => mediaChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(mediaChunks, { type:'audio/webm' });
      const file = new File([blob], 'audio.webm', { type:'audio/webm' });
      await handleAudioFile(file);
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    btn.textContent = 'Stop Audio Recording';
    text('audioSummary', 'Recording...');
  }catch(err){
    alert('Microphone not available or permission denied.');
  }
}

async function runDiagnosis(){
  if(!requireLegalAcceptance()) return;
  fluidData();
  const payload = {
    vehicle: vehicleData(),
    dtcs: parseCodes(),
    symptoms: checkedSymptoms(),
    notes: value('notes'),
    fluid: {
      type: value('fluidType'), level: value('fluidLevel'), color: value('fluidColor'), smell: value('fluidSmell'), capacity: value('fluidCapacity'), notes: value('fluidNotes')
    },
    mediaSummary: {
      audio: state.audioSummary,
      image: state.imageSummary,
      video: state.imageSummary
    }
  };
  const analysis = DiagEngine.buildAnalysis(payload, state.dtcDb);
  state.lastAnalysis = analysis;
  renderAnalysis(analysis);
}

function renderAnalysis(analysis){
  state.lastAnalysisText = analysisToText(analysis);
  const v = analysis.vehicle || {};
  const vehicleLine = [v.year, v.make, v.model, v.engine, v.nickname].filter(Boolean).join(' ') || 'Vehicle details not entered';
  const hypos = (analysis.rankedHypotheses || []).map((item, i) => `
    <div class="hypo">
      <div><strong>${i+1}. ${esc(item.title)}</strong> <span class="badge">${esc(item.confidence)}%</span></div>
      <div class="small mt-6">Evidence: ${esc((item.reasons || []).join(' | '))}</div>
    </div>
  `).join('') || '<div class="small">Not enough hard evidence yet. Add codes, symptoms, fluid notes, or media cues.</div>';
  const list = (items) => (items || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li>None listed.</li>';
  const cards = (analysis.codeCards || []).map(card => `
    <div class="code-card">
      <div><span class="badge">${esc(card.code)}</span><span class="badge">${esc(card.family || '')}</span></div>
      <div><strong>${esc(card.description)}</strong></div>
      ${card.guidance ? `<div class="small mt-8"><strong>${esc(card.guidance.title || 'Guidance')}</strong><br>First checks: ${esc((card.guidance.firstChecks || []).join(' | '))}</div>` : ''}
    </div>
  `).join('');
  html('results', `
    <div class="result-block">
      <h3>Primary finding</h3>
      <div><strong>${esc(analysis.summary.primaryFinding)}</strong> <span class="badge">${esc(analysis.summary.confidence)}%</span></div>
      <div class="small mt-6">${esc(analysis.summary.shortReason)}</div>
      <div class="small mt-6">${esc(vehicleLine)}</div>
    </div>
    <div class="result-block"><h3>Top ranked causes</h3>${hypos}</div>
    <div class="result-block"><h3>First checks</h3><ol class="checks">${list(analysis.firstChecks)}</ol></div>
    <div class="result-block"><h3>Likely parts / paths</h3><ol class="checks">${list(analysis.likelyParts)}</ol></div>
    ${(analysis.warnings || []).length ? `<div class="result-block"><h3>Warnings</h3><ol class="checks warn-list">${list(analysis.warnings)}</ol></div>` : ''}
    ${cards ? `<div class="result-block"><h3>Code cards</h3><div class="cards">${cards}</div></div>` : ''}
    <div class="result-block"><h3>Disclaimers</h3><ol class="checks">${list(analysis.disclaimers)}</ol></div>
  `);
  showEl('resultsCard');
}

function bindEvents(){
  byId('btnLookup').onclick = quickLookup;
  byId('btnLookupTop').onclick = quickLookup;
  byId('btnSearchDtc').onclick = searchLocalDb;
  byId('btnClearCodes').onclick = () => { byId('codes').value = ''; html('codeResults',''); };
  byId('btnRunDiagnosis').onclick = runDiagnosis;
  byId('btnRunDiagnosisTop').onclick = runDiagnosis;
  byId('btnSaveCase').onclick = saveCase;
  byId('btnSaveCaseTop').onclick = saveCase;
  byId('btnLoadCase').onclick = loadCase;
  byId('btnClearCase').onclick = clearCase;
  byId('btnExport').onclick = exportReport;
  byId('btnExportTop').onclick = exportReport;
  byId('btnAudioUpload').onclick = () => byId('audioFile').click();
  byId('audioFile').onchange = async (e) => { const file = e.target.files[0]; if(file) await handleAudioFile(file); };
  byId('btnPhotoUpload').onclick = () => byId('photoFile').click();
  byId('photoFile').onchange = async (e) => { const file = e.target.files[0]; if(file) await drawImageFileToCanvas(file); };
  byId('btnVideoUpload').onclick = () => byId('videoFile').click();
  byId('videoFile').onchange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    stopCamera();
    const video = byId('videoPreview');
    video.srcObject = null;
    video.src = URL.createObjectURL(file);
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration || 0);
    };
    video.onseeked = () => captureFrame();
  };
  byId('btnStartCamera').onclick = startCamera;
  byId('btnStopCamera').onclick = stopCamera;
  byId('btnCaptureFrame').onclick = captureFrame;
  byId('btnAudioRecord').onclick = toggleAudioRecord;
  ['fluidType','fluidLevel','fluidColor','fluidSmell','fluidCapacity','fluidNotes'].forEach(id => {
    const el = byId(id);
    if(el) el.addEventListener('input', fluidData);
    if(el) el.addEventListener('change', fluidData);
  });
  byId('dbQuery').addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); searchLocalDb(); } });
}

async function init(){
  fillYears();
  renderSymptoms();
  bindEvents();
  text('appVersion', 'v' + APP_VERSION);
  text('footerVersion', 'v' + APP_VERSION);
  await loadDb();
  if(typeof DiagEngine === 'undefined'){
    html('results', 'Diagnostics engine failed to load. Confirm diagnosticsEngine.js is next to index.html.');
    return;
  }
  if(!state.dtcDb.length){
    html('dbStats', '<div class="stat"><strong>0</strong><div class="small">DTC database missing — data/dtc-db.js did not load</div></div>');
    html('results', 'The bundled DTC database did not load. Confirm data/dtc-db.js defines window.DTC_DB_DATA.');
    return;
  }
  loadStats();
  document.querySelectorAll('details.extra').forEach((el) => {
    el.open = window.innerWidth >= 800;
  });
}

init();
