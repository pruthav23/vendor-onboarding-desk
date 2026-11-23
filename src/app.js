/* ---------------------------------------------------------------
   UI for the vendor onboarding process, on one page:
   steps strip, intake form + live run/result, case history, how it works.
---------------------------------------------------------------- */
(function () {
  'use strict';

  /* ============================ helpers ============================ */
  const $ = (sel, root = document) => root.querySelector(sel);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v; // only ever called with static strings from this file
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  const ICONS = {
    pass: '<svg class="ic ok" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M5.2 8.2l2 2 3.6-4"/></svg>',
    fail: '<svg class="ic bad" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/></svg>',
    warn: '<svg class="ic warn" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2l6 10.6H2z"/><path d="M8 6.6v2.8M8 11.2v.1"/></svg>',
    skip: '<svg class="ic skip" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M5.4 8h5.2"/></svg>',
    info: '<svg class="ic info" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.4v3.4M8 5.2v.1"/></svg>',
  };
  const icon = (k) => h('span', { html: ICONS[k] || ICONS.info, style: 'display:inline-flex' });

  // First sentence of a message, kept short enough to scan.
  function brief(msg) {
    let t = String(msg || '');
    const m = /\.\s+[A-Z]/.exec(t.slice(40));
    if (m) t = t.slice(0, 40 + m.index + 1);
    return t.length > 120 ? t.slice(0, 117).trimEnd() + '…' : t;
  }

  // Turn a failed or noted check into short tagged items such as MISSING: Trade register extract.
  const FLAG_KIND = { I1: 'MISSING', I2: 'REVIEW', C1: 'MISSING', C2: 'MISSING', F1: 'INVALID', F2: 'INVALID', F3: 'INVALID', X1: 'MISMATCH', X2: 'MISMATCH', X3: 'MISMATCH', X4: 'WRONG NAME', X5: 'MISMATCH', X6: 'MISMATCH', X7: 'OUTDATED', R1: 'BLOCKED', R2: 'BLOCKED', R3: 'BLOCKED', R4: 'REVIEW' };
  function flagsOf(f) {
    if (f.status === 'warn') return [{ kind: 'NOTE', text: brief(f.message) }];
    const kind = FLAG_KIND[f.id] || 'ISSUE';
    if (f.flag) return [{ kind, text: f.flag }];
    if (f.id === 'C1') return (f.evidence || []).map((t) => ({ kind, text: t }));
    if (f.id === 'C2') return (f.evidence || []).map((t) => ({ kind, text: Engine.DOC_LABELS[t] || t }));
    if (['X4', 'X5', 'X6', 'X7'].includes(f.id)) return String(f.message).split('; ').map((t) => ({ kind, text: t }));
    return [{ kind, text: brief(f.message) }];
  }
  const flagRow = (fl, tone) => h('div', { class: 'flag ' + tone }, h('span', { class: 'kindpill' }, fl.kind), h('span', { class: 'flag-text' }, fl.text));

  /* ============================ state ============================== */
  const mem = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable: keep in memory */ } },
  };
  const KEYS = { cases: 'vod.cases.v4', master: 'vod.master.v4', settings: 'vod.settings.v4', counter: 'vod.counter.v4' };
  const SCN = Data.scenarios(new Date());
  const state = {
    cases: store.get(KEYS.cases, null),
    master: store.get(KEYS.master, null),
    settings: Object.assign({ speed: reduced ? 'fast' : 'normal', addApproved: false }, store.get(KEYS.settings, {})),
    counter: store.get(KEYS.counter, 0),
    scenarioKey: 'custom', editorText: '', modified: false, parent: null,
    running: false, runToken: 0, filter: 'all', drawerCase: null,
  };
  const persist = () => { store.set(KEYS.cases, state.cases.slice(-300)); store.set(KEYS.master, state.master); store.set(KEYS.settings, state.settings); store.set(KEYS.counter, state.counter); };
  const SPEEDS = { fast: { stage: 90, check: 0 }, normal: { stage: 380, check: 200 }, slow: { stage: 800, check: 420 } };
  const ctx = () => ({ vendorMaster: state.master, sanctions: Data.sanctions });
  const nextCaseId = () => 'C-' + String(++state.counter).padStart(4, '0');
  const findCase = (id) => state.cases.find((c) => c.caseId === id);

  function caseRecord(result, meta) {
    return { caseId: result.caseId, scenarioKey: meta.scenarioKey || null, receivedAt: meta.receivedAt || new Date().toISOString(), seed: !!meta.seed, parent: meta.parent || null, attempt: meta.attempt || 1, result };
  }
  function seed() {
    state.cases = []; state.master = Data.vendorMaster(); state.counter = 0;
    const plan = [['S0', 6], ['S1', 5], ['S3', 4], ['S4', 3], ['S5', 2], ['S6', 1]];
    const now = Date.now();
    for (const [key, daysAgo] of plan) {
      const sc = SCN.find((x) => x.key === key), when = new Date(now - daysAgo * 86400000 - Math.random() * 3600000);
      const r = Engine.runAll(sc.submission, ctx(), { caseId: nextCaseId(), now: when });
      state.cases.push(caseRecord(r, { scenarioKey: key, receivedAt: when.toISOString(), seed: true }));
      if (key === 'S3') {
        const when2 = new Date(now - 3 * 86400000);
        const r2 = Engine.runAll(sc.corrected, ctx(), { caseId: nextCaseId(), now: when2 });
        state.cases.push(caseRecord(r2, { scenarioKey: key, receivedAt: when2.toISOString(), seed: true, parent: r.caseId, attempt: 2 }));
      }
    }
    persist();
  }
  if (!state.cases || !state.master) seed();

  /* ============================ formatting ========================= */
  function fmtWhen(iso) {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 1440) return Math.round(m / 60) + ' h ago';
    return Math.round(m / 1440) + ' d ago';
  }
  const statusOf = (c) => c.result.decision.status;
  const statusLabel = (d) => d.status === 'approved' ? 'Approved' : d.status === 'rejected' ? 'Rejected' : d.sub === 'internal_review' ? 'Needs review' : 'Waiting on vendor';
  const statusTone = (d) => (d.status === 'approved' ? 'ok' : d.status === 'pending' ? 'warn' : 'bad');
  const riskBand = (n) => (n < 20 ? 'Low' : n < 40 ? 'Medium' : 'High');
  const statusPill = (d) => h('span', { class: 'pill ' + statusTone(d) }, statusLabel(d));
  const vendorName = (c) => (c.result.submission.company && c.result.submission.company.legalName) || 'Unnamed vendor';
  const copyText = async (text, btn) => {
    const label = btn.textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; } catch (e) { btn.textContent = 'Copy blocked here'; }
    setTimeout(() => { btn.textContent = label; }, 1600);
  };

  /* ============================ PAGE =============================== */
  const root = $('#app');
  const refs = {};

  function buildPage() {
    root.textContent = '';
    root.append(
      h('div', { class: 'workspace' }, buildFormPanel(), buildRunPanel()),
      buildCasesPanel());
    buildStages(); renderSpeed(); renderCases();
  }

  /* ----- form panel ----- */
  function buildFormPanel() {
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'sr', id: 'file-in', onchange: (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try { const v = JSON.parse(rd.result); if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('it is not a JSON object'); setEditor(v, { key: 'custom' }); }
        catch (err) { refs.note.textContent = 'That file is not a valid submission: ' + err.message; refs.note.className = 'hint err'; }
      };
      rd.readAsText(f); e.target.value = '';
    } });

    refs.note = h('div', { class: 'hint' });
    refs.formWrap = h('div', {});
    refs.editor = h('textarea', { class: 'editor', id: 'json-editor', spellcheck: 'false', 'aria-label': 'Submission JSON' });
    refs.editorStatus = h('div', { class: 'editor-status' });
    refs.editor.addEventListener('input', () => { state.editorText = refs.editor.value; state.modified = true; renderNote(); checkEditor(); });
    refs.advanced = h('details', { class: 'fold plain' }, h('summary', {}, 'Advanced: edit as JSON'),
      h('div', { class: 'fold-body' }, refs.editor, refs.editorStatus));
    refs.formScroll = h('div', { class: 'panel-body', id: 'form-scroll' }, refs.formWrap, refs.advanced);
    refs.parentBanner = h('div', { class: 'banner-info', hidden: true });
    refs.runBtn = h('button', { class: 'btn primary wide', type: 'button', id: 'run-btn', onclick: startRun }, 'Run checks');

    return h('section', { class: 'panel form-panel', 'aria-label': 'New vendor submission' },
      h('div', { class: 'panel-h' }, h('h2', {}, 'New vendor submission')),
      h('div', { class: 'toolbar' },
        h('label', { class: 'btn sm', for: 'file-in', tabindex: '0', role: 'button', onkeydown: (e) => { if (e.key === 'Enter') fileInput.click(); } }, 'Import JSON'), fileInput,
        h('button', { class: 'btn sm', type: 'button', onclick: () => setEditor(blankSubmission(), { key: 'custom', parent: null, resetScroll: true }) }, 'Clear form')),
      refs.note, refs.formScroll,
      h('div', { class: 'panel-f' }, refs.parentBanner, refs.runBtn));
  }

  const COUNTRIES = [['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom'], ['DE', 'Germany'], ['SG', 'Singapore (no ruleset yet)']];
  const ID_TYPE = { IN: 'GSTIN', US: 'EIN', GB: 'VAT', DE: 'USt-IdNr' };
  const TAX_TYPES = ['gst_certificate', 'vat_certificate', 'w9', 'pan_card'], BANK_TYPES = ['bank_letter', 'cancelled_cheque'];
  const blankSubmission = () => ({ company: { legalName: '', tradeName: '', country: 'IN', registrationNumber: '', address: { line: '', city: '', postal: '', country: 'IN' }, website: '', contactName: '', contactEmail: '', contactPhone: '' }, tax: { idType: 'GSTIN', idValue: '', pan: '' }, bank: { accountHolderName: '', bankName: '', accountNumber: '', ifsc: '' }, documents: [] });
  const getp = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  function setp(o, path, v) { const ks = path.split('.'); let cur = o; for (const k of ks.slice(0, -1)) { if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; } cur[ks[ks.length - 1]] = v; }
  let formObj = null;

  function parseEditor() { try { const v = JSON.parse(state.editorText); if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('The submission must be a JSON object.'); return { ok: true, value: v }; } catch (e) { return { ok: false, error: e.message }; } }
  function checkEditor() {
    const p = parseEditor();
    refs.editorStatus.textContent = '';
    refs.editorStatus.append(p.ok ? h('span', { class: 'muted' }, 'Valid JSON') : h('span', { style: 'color:var(--bad)' }, 'Invalid JSON: ' + p.error));
    refs.runBtn.disabled = state.running || !p.ok;
  }
  function renderNote() {
    const sc = SCN.find((x) => x.key === state.scenarioKey);
    refs.note.className = 'hint';
    refs.note.textContent = sc ? 'Fill in the vendor’s details. Anything left empty is flagged.' : 'Fill in the vendor’s details. Anything left empty is flagged.';
  }
  function syncFromForm() {
    state.editorText = JSON.stringify(formObj, null, 2); state.modified = true;
    refs.editor.value = state.editorText; renderNote(); checkEditor();
  }
  function setEditor(obj, opts = {}) {
    state.editorText = JSON.stringify(obj, null, 2);
    state.modified = !!opts.modified;
    if (opts.key !== undefined) state.scenarioKey = opts.key;
    if ('parent' in opts) state.parent = opts.parent;
    refs.editor.value = state.editorText;
    renderForm(); renderNote(); checkEditor(); renderParentBanner();
    if (opts.resetScroll !== false) refs.formScroll.scrollTop = 0;
  }
  function loadScenario(key) {
    if (state.running) return;
    const sc = SCN.find((x) => x.key === key);
    setEditor(JSON.parse(JSON.stringify(sc.submission)), { key, parent: null });
  }
  function renderParentBanner() {
    refs.parentBanner.textContent = '';
    refs.parentBanner.hidden = !state.parent;
    if (state.parent) refs.parentBanner.append(icon('info'), h('span', {}, `Resubmitting ${state.parent}`));
  }

  function fld(label, path, opts = {}) {
    const input = h('input', { type: opts.type || 'text', value: String(getp(formObj, path) ?? ''), 'aria-label': label, autocomplete: 'off', spellcheck: 'false', placeholder: opts.placeholder || '' });
    input.addEventListener('input', () => { setp(formObj, path, input.value); syncFromForm(); });
    return h('label', { class: 'fld' + (opts.wide ? ' wide' : '') }, h('span', {}, label), input);
  }

  function renderForm() {
    const wrap = refs.formWrap; wrap.textContent = '';
    const p = parseEditor();
    if (!p.ok) { wrap.append(h('p', { style: 'color:var(--bad)' }, 'The data is not valid JSON, so the form cannot show it. Fix it under "Advanced", or press Clear.')); return; }
    formObj = p.value;
    for (const k of ['company', 'tax', 'bank']) if (!formObj[k] || typeof formObj[k] !== 'object') formObj[k] = {};
    if (!formObj.company.address || typeof formObj.company.address !== 'object') formObj.company.address = {};
    if (!Array.isArray(formObj.documents)) formObj.documents = [];
    const cc = String(formObj.company.country || '').toUpperCase();

    const country = h('select', { 'aria-label': 'Country of registration' }, COUNTRIES.map(([c, n]) => h('option', { value: c }, n)));
    if (!COUNTRIES.some(([c]) => c === cc)) country.append(h('option', { value: cc }, cc || 'Choose…'));
    country.value = cc || 'IN';
    country.addEventListener('change', () => { formObj.company.country = country.value; formObj.company.address.country = country.value; if (ID_TYPE[country.value]) formObj.tax.idType = ID_TYPE[country.value]; syncFromForm(); renderForm(); });

    wrap.append(h('h4', { class: 'fh' }, 'Company'),
      h('div', { class: 'form-grid' },
        fld('Legal name', 'company.legalName', { wide: true, placeholder: 'e.g. Meridian Components Pvt. Ltd.' }), fld('Trade name (optional)', 'company.tradeName', { wide: true }),
        h('label', { class: 'fld' }, h('span', {}, 'Country'), country), fld('Website', 'company.website', { placeholder: 'example.com' }),
        fld('Address', 'company.address.line', { wide: true }), fld('City', 'company.address.city'), fld('Postal code', 'company.address.postal'),
        fld('Contact name', 'company.contactName'), fld('Contact phone', 'company.contactPhone', { placeholder: '+91 98765 43210' }), fld('Contact email', 'company.contactEmail', { wide: true, placeholder: 'accounts@example.com' })),
      h('h4', { class: 'fh' }, 'Tax'),
      h('div', { class: 'form-grid' }, fld((ID_TYPE[cc] || 'Tax') + ' number', 'tax.idValue', { wide: cc !== 'IN', placeholder: Engine.TAX[cc] ? Engine.TAX[cc].example : '' }), cc === 'IN' ? fld('PAN', 'tax.pan', { placeholder: 'AABCM4821K' }) : null),
      h('h4', { class: 'fh' }, 'Bank'),
      h('div', { class: 'form-grid' }, fld('Account holder name', 'bank.accountHolderName', { wide: true }), fld('Bank name', 'bank.bankName', { wide: true }),
        cc === 'GB' || cc === 'DE' ? fld('IBAN', 'bank.iban', { wide: true })
          : [fld('Account number', 'bank.accountNumber'), cc === 'IN' ? fld('IFSC', 'bank.ifsc') : cc === 'US' ? fld('Routing number', 'bank.routingNumber') : null]));

    const today = Date.now();
    const iso = (d) => new Date(d).toISOString().slice(0, 10);
    const addRequired = () => {
      const f = formObj, have = new Set(f.documents.map((d) => d.type)), holder = f.bank.accountHolderName || f.company.legalName, acct = f.bank.iban || f.bank.accountNumber || '';
      for (const t of Engine.REQUIRED_DOCS[cc] || []) {
        if (have.has(t)) continue;
        const d = { type: t, filename: t + '.pdf', issuedTo: BANK_TYPES.includes(t) ? holder : f.company.legalName, issueDate: iso(today - 10 * 86400000) };
        if (TAX_TYPES.includes(t)) d.taxId = t === 'pan_card' ? f.tax.pan || '' : f.tax.idValue || '';
        if (BANK_TYPES.includes(t)) d.accountNumber = acct;
        f.documents.push(d);
      }
      syncFromForm(); renderForm();
    };
    const typeSel = h('select', { class: 'select', 'aria-label': 'Document type to add' }, h('option', { value: '' }, 'Add a document…'), Object.entries(Engine.DOC_LABELS).map(([k, l]) => h('option', { value: k }, l)));
    typeSel.addEventListener('change', () => { if (!typeSel.value) return; formObj.documents.push({ type: typeSel.value, filename: typeSel.value + '.pdf', issuedTo: formObj.company.legalName || '', issueDate: iso(today - 10 * 86400000) }); syncFromForm(); renderForm(); });
    wrap.append(h('h4', { class: 'fh' }, `Documents (${formObj.documents.length})`),
      h('div', { class: 'form-tools' }, Engine.REQUIRED_DOCS[cc] ? h('button', { class: 'btn sm', type: 'button', onclick: addRequired }, 'Add the required documents') : null, typeSel),
      ...formObj.documents.map((d, i) => {
        const dp = (key) => { const inp = h('input', { type: key.includes('Date') ? 'date' : 'text', value: String(d[key] ?? ''), 'aria-label': key }); inp.addEventListener('input', () => { d[key] = inp.value; syncFromForm(); }); return inp; };
        const lab = (t, key) => h('label', { class: 'fld' }, h('span', {}, t), dp(key));
        return h('div', { class: 'docrow' }, h('div', { class: 'docrow-h' }, h('b', {}, Engine.DOC_LABELS[d.type] || d.type), h('button', { class: 'linkbtn', type: 'button', onclick: () => { formObj.documents.splice(i, 1); syncFromForm(); renderForm(); } }, 'Remove')),
          h('div', { class: 'form-grid' }, lab('Name on document', 'issuedTo'), lab('Issue date', 'issueDate'),
            TAX_TYPES.includes(d.type) ? lab('Tax ID on document', 'taxId') : null, BANK_TYPES.includes(d.type) ? lab('Account on document', 'accountNumber') : null));
      }));
  }

  /* ----- run panel ----- */
  function buildRunPanel() {
    refs.runMeta = h('span', { class: 'muted' }, '');
    refs.speed = h('div', { class: 'seg', role: 'group', 'aria-label': 'Run speed' });
    refs.result = h('div', { class: 'result', hidden: true, 'aria-live': 'polite' });
    refs.stageWrap = h('div', { class: 'stages' });
    refs.runBody = h('div', { class: 'panel-body' }, refs.result, refs.stageWrap);
    return h('section', { class: 'panel run-panel', 'aria-label': 'Live run' },
      h('div', { class: 'panel-h' }, h('h2', {}, 'Live run'), h('div', { class: 'actions', style: 'align-items:center' }, refs.runMeta, refs.speed)),
      refs.runBody);
  }
  function renderSpeed() {
    refs.speed.textContent = '';
    for (const k of ['fast', 'normal', 'slow']) refs.speed.append(h('button', { type: 'button', 'aria-pressed': String(state.settings.speed === k), onclick: () => { state.settings.speed = k; persist(); renderSpeed(); } }, k[0].toUpperCase() + k.slice(1)));
  }
  function buildStages() {
    refs.stageWrap.textContent = '';
    refs.stages = {};
    Engine.STAGES.forEach((st, i) => {
      const checks = h('div', { class: 'stage-checks' });
      const count = h('span', { class: 'stage-count' }, '');
      const dot = h('span', { class: 'stage-dot' }, String(i + 1));
      const head = h('div', { class: 'stage-head', role: 'button', tabindex: '0', 'aria-expanded': 'false' }, dot, h('strong', { class: 'stage-name' }, st.name), count);
      const el = h('section', { class: 'stage', 'data-state': 'idle' }, head, checks);
      const toggle = () => { el.classList.toggle('open'); head.setAttribute('aria-expanded', el.classList.contains('open')); };
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      refs.stages[st.id] = { el, checks, count, dot, head, idx: i + 1 };
      refs.stageWrap.append(el);
    });
  }
  function resetStages() {
    for (const s of Object.values(refs.stages)) { s.el.dataset.state = 'idle'; s.el.classList.remove('open'); s.checks.textContent = ''; s.count.textContent = ''; s.dot.textContent = String(s.idx); s.head.setAttribute('aria-expanded', 'false'); }
  }
  function stageState(checks) {
    if (checks.some((c) => c.status === 'fail' && c.severity === 'blocker')) return 'block';
    if (checks.some((c) => c.status === 'fail')) return 'action';
    if (checks.some((c) => c.status === 'warn')) return 'note';
    return 'ok';
  }
  function checkRow(c) {
    const quiet = c.id === 'decision' || c.id === 'communicate' || c.id === 'I3';
    const text = c.id === 'decision' ? c.message : c.id === 'communicate' ? 'Vendor email and team note drafted' : c.id === 'I3' ? 'Names normalised' : c.title;
    const flags = !quiet && (c.status === 'fail' || c.status === 'warn') ? flagsOf(c) : [];
    const tone = c.status === 'warn' ? 'note' : c.severity === 'blocker' ? 'block' : c.escalate ? 'review' : 'fix';
    return h('div', { class: 'ck ' + c.status }, icon(c.status === 'info' ? 'pass' : c.status), h('div', {}, h('div', { class: 'ck-t' }, text), flags.length ? h('div', { class: 'flags' }, flags.map((f) => flagRow(f, tone))) : null));
  }

  async function startRun() {
    if (state.running) return;
    const p = parseEditor(); if (!p.ok) return;
    const token = ++state.runToken;
    state.running = true; refs.runBtn.disabled = true; refs.runBtn.textContent = 'Running…';
    refs.result.hidden = true; resetStages(); refs.runBody.scrollTop = 0;
    const caseId = nextCaseId();
    const run = Engine.createRun(p.value, ctx(), { caseId, now: new Date() });
    const sp = SPEEDS[state.settings.speed];
    refs.runMeta.textContent = caseId;
    while (!run.done()) {
      if (token !== state.runToken) return;
      const meta = Engine.STAGES[run.state.idx], s = refs.stages[meta.id];
      s.el.dataset.state = 'running'; s.el.classList.add('open'); s.head.setAttribute('aria-expanded', 'true');
      s.count.textContent = 'running…';
      await sleep(sp.stage);
      const res = run.next();
      for (const c of res.checks) { s.checks.append(checkRow(c)); if (sp.check) await sleep(sp.check); }
      const real = res.checks.filter((c) => c.status !== 'info' && c.id !== 'decision' && c.id !== 'communicate');
      const nFail = real.filter((c) => c.status === 'fail').length, nWarn = real.filter((c) => c.status === 'warn').length;
      s.count.textContent = nFail ? plural(nFail, 'issue') : nWarn ? plural(nWarn, 'note') : real.length ? 'clear' : 'done';
      s.el.dataset.state = meta.id === 'decision' || meta.id === 'communicate' ? 'ok' : stageState(res.checks);
      const st = s.el.dataset.state;
      s.dot.textContent = st === 'ok' || st === 'note' ? '✓' : st === 'action' ? '!' : st === 'block' ? '×' : String(s.idx);
      if ((st === 'ok' || st === 'note') && meta.id !== 'decision') { s.el.classList.remove('open'); s.head.setAttribute('aria-expanded', 'false'); }
    }
    if (token !== state.runToken) return;
    const result = run.result();
    const parent = state.parent ? findCase(state.parent) : null;
    const rec = caseRecord(result, { scenarioKey: state.scenarioKey, parent: parent ? parent.caseId : null, attempt: parent ? parent.attempt + 1 : 1 });
    state.cases.push(rec);
    if (result.decision.status === 'approved' && state.settings.addApproved) {
      const c = result.submission.company;
      state.master.push({ id: result.vendorId, legalName: c.legalName, country: c.country, taxId: result.taxValue, bankAccount: result.bankAcct, contactName: c.contactName, contactEmail: c.contactEmail, contactPhone: c.contactPhone, onboarded: new Date().toISOString().slice(0, 10) });
    }
    persist();
    state.running = false; refs.runBtn.textContent = 'Run checks'; checkEditor();
    state.parent = null; renderParentBanner();
    refs.result.textContent = '';
    refs.result.append(...resultNodes(rec));
    refs.result.hidden = false;
    refs.runBody.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    renderCases();
  }

  /* ----- result rendering (shared with the case drawer) ----- */
  const fold = (title, ...body) => h('details', { class: 'fold' }, h('summary', {}, title), h('div', { class: 'fold-body' }, body));

  function resultNodes(rec) {
    const r = rec.result, d = r.decision, tone = statusTone(d);
    const nodes = [];
    const sub = d.status === 'pending' ? statusLabel(d) : d.status === 'approved' && d.sub === 'with_notes' ? 'With notes' : '';
    nodes.push(h('div', { class: 'verdict ' + tone },
      h('div', {}, sub ? h('div', { class: 'sub' }, sub) : null, h('div', { class: 'big' }, d.status[0].toUpperCase() + d.status.slice(1)), h('p', { class: 'headline' }, d.headline)),
      h('div', { class: 'meta' }, h('span', { class: 'mono' }, rec.caseId + (rec.attempt > 1 ? ' · attempt ' + rec.attempt : '')), h('span', {}, 'Risk ' + d.risk + ' · ' + riskBand(d.risk)), r.vendorId ? h('span', { class: 'mono' }, r.vendorId) : null)));

    const diff = attemptDiff(rec);
    if (diff) nodes.push(diff);

    const fails = r.findings.filter((x) => x.status === 'fail');
    const groups = [
      ['block', 'Why it was rejected', fails.filter((x) => x.severity === 'blocker')],
      ['review', 'Needs a person to check', fails.filter((x) => x.severity !== 'blocker' && x.escalate)],
      ['fix', 'Needed from the vendor', fails.filter((x) => x.severity !== 'blocker' && !x.escalate)],
      ['note', 'Notes', r.findings.filter((x) => x.status === 'warn')],
    ].filter(([, , list]) => list.length);
    if (groups.length) {
      nodes.push(h('div', { class: 'alerts' }, groups.map(([gt, title, list]) =>
        h('section', { class: 'alert ' + gt }, h('h3', { class: 'alert-h' }, title), h('div', { class: 'flags' }, list.flatMap((x) => flagsOf(x)).map((f) => flagRow(f, gt)))))));
    }
    if (d.status === 'pending') {
      const btns = [h('button', { class: 'btn primary', type: 'button', onclick: () => resubmit(rec, false) }, 'Fix and resubmit')];
      nodes.push(h('div', { class: 'sect' }, h('div', { class: 'actions' }, btns)));
    }

    const cm = r.comms || {};
    const mail = (m) => m ? h('div', { class: 'mail' },
      h('div', { class: 'mail-h' }, h('div', {}, h('span', { class: 'k' }, 'To'), m.to), h('div', {}, h('span', { class: 'k' }, 'Subject'), m.subject)),
      h('pre', {}, m.body),
      h('div', { class: 'mail-f' }, h('span', {}, 'Draft only, nothing is sent'), h('button', { class: 'btn sm', type: 'button', onclick: (e) => copyText(`To: ${m.to}\nSubject: ${m.subject}\n\n${m.body}`, e.currentTarget) }, 'Copy'))) : null;
    const nChecks = r.findings.filter((x) => x.status !== 'info').length;
    nodes.push(h('div', {},
      fold('Email to the vendor', mail(cm.vendor)),
      fold('Note for our team', mail(cm.internal)),
      fold(`All ${nChecks} checks`, h('div', { class: 'plist' }, r.findings.filter((x) => x.status !== 'info').map((x) => h('div', { class: 'ck ' + x.status }, icon(x.status), h('div', {}, h('div', { class: 'ck-t' }, x.title), h('div', { class: 'ck-d' }, brief(x.message))))))),
      fold('Audit trail', h('table', { class: 'audit' }, h('tbody', {}, r.audit.map((a) => h('tr', {}, h('td', {}, '+' + a.t + 'ms'), h('td', {}, a.stage), h('td', {}, a.event))))),
        h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn sm', type: 'button', onclick: (e) => copyText(JSON.stringify(rec, null, 2), e.currentTarget) }, 'Copy case as JSON')))));
    return nodes.filter(Boolean);
  }

  function attemptDiff(rec) {
    if (!rec.parent) return null;
    const prev = findCase(rec.parent); if (!prev) return null;
    const was = Object.fromEntries(prev.result.findings.map((f) => [f.id, f.status]));
    const fixed = rec.result.findings.filter((f) => was[f.id] === 'fail' && f.status !== 'fail').length;
    return h('div', { class: 'diff' }, `Fixed ${plural(fixed, 'issue')} from ${prev.caseId}.`);
  }

  function resubmit(rec, useCorrected) {
    closeDrawer();
    const sc = SCN.find((x) => x.key === rec.scenarioKey);
    const sub = useCorrected && sc && sc.corrected ? sc.corrected : rec.result.submission;
    setEditor(JSON.parse(JSON.stringify(sub)), { key: rec.scenarioKey || 'custom', parent: rec.caseId, modified: !useCorrected });
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    if (useCorrected) startRun();
  }

  /* ----- cases ----- */
  function buildCasesPanel() {
    refs.counts = h('div', { class: 'counts' });
    refs.filters = h('div', { class: 'filters' });
    refs.casesBody = h('div', {});
    return h('section', { class: 'panel', 'aria-label': 'Cases' },
      h('div', { class: 'panel-h cases-h' }, h('h2', {}, 'Cases'), refs.counts, refs.filters),
      refs.casesBody);
  }
  function renderCases() {
    const cs = state.cases, total = cs.length;
    const n = (st) => cs.filter((c) => statusOf(c) === st).length;
    refs.counts.textContent = '';
    refs.counts.append(h('span', { class: 'pill neutral' }, `${total} total`), h('span', { class: 'pill ok' }, `${n('approved')} approved`), h('span', { class: 'pill warn' }, `${n('pending')} pending`), h('span', { class: 'pill bad' }, `${n('rejected')} rejected`));
    refs.filters.textContent = '';
    for (const [k, l] of [['all', 'All'], ['approved', 'Approved'], ['pending', 'Pending'], ['rejected', 'Rejected']]) refs.filters.append(h('button', { type: 'button', 'aria-pressed': String(state.filter === k), onclick: () => { state.filter = k; renderCases(); } }, l));
    const shown = cs.filter((c) => state.filter === 'all' || statusOf(c) === state.filter).slice().reverse();
    refs.casesBody.textContent = '';
    refs.casesBody.append(shown.length ? h('div', { class: 'twrap' }, h('table', { class: 'cases' },
      h('thead', {}, h('tr', {}, ['Case', 'Vendor', 'Status', 'Main reason', 'When'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, shown.map((c) => {
        const d = c.result.decision, first = c.result.findings.find((f) => f.status === 'fail') || c.result.findings.find((f) => f.status === 'warn');
        const open = () => openDrawer(c.caseId);
        return h('tr', { tabindex: '0', onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
          h('td', {}, h('span', { class: 'chip' }, c.caseId), c.attempt > 1 ? h('span', { class: 'tag' }, 'attempt ' + c.attempt) : null, null),
          h('td', {}, vendorName(c)), h('td', {}, statusPill(d)),
          h('td', { class: 'cell-main' }, d.status === 'approved' ? (d.sub === 'with_notes' ? 'Passed, with notes' : 'All checks passed') : first ? first.title : 'All checks passed'),
          h('td', { class: 'muted' }, fmtWhen(c.receivedAt)));
      })))) : h('div', { class: 'empty' }, 'No cases yet.'));
  }

  /* ----- drawer ----- */
  const drawerRoot = $('#drawer-root');
  function openDrawer(id) {
    const rec = findCase(id); if (!rec) return;
    state.drawerCase = id;
    drawerRoot.textContent = '';
    const closeBtn = h('button', { class: 'btn sm', type: 'button', onclick: closeDrawer }, 'Close');
    drawerRoot.append(h('div', { class: 'scrim', onclick: closeDrawer }), h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Case ' + id },
      h('div', { class: 'drawer-h' }, h('b', {}, vendorName(rec)), closeBtn),
      h('div', { class: 'drawer-b' }, h('div', { class: 'result' }, ...resultNodes(rec)))));
    closeBtn.focus();
  }
  function closeDrawer() { state.drawerCase = null; drawerRoot.textContent = ''; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.drawerCase) closeDrawer(); });

  /* ----- how it works ----- */
  function buildHow() {
    const label = { reject: 'Reject', 'pending-vendor': 'Ask the vendor', 'pending-internal': 'Send to a person', note: 'Note only' };
    return h('details', { class: 'panel how' }, h('summary', {}, 'How it works'),
      h('div', { class: 'how-body' },
        h('div', { class: 'flow' }, Engine.STAGES.map((s, i) => h('div', { class: 'st' }, h('span', { class: 'no' }, i + 1), h('b', { style: 'font-weight:500' }, s.name)))),
        h('div', { class: 'decision-rows' },
          h('div', {}, h('span', { class: 'pill bad' }, 'Rejected'), h('span', {}, 'A hard rule fails: watchlist, duplicate vendor, or a bank account owned by another vendor.')),
          h('div', {}, h('span', { class: 'pill warn' }, 'Pending'), h('span', {}, 'Something is wrong. The vendor can fix it, or a person must review it.')),
          h('div', {}, h('span', { class: 'pill ok' }, 'Approved'), h('span', {}, 'No failures. Small notes are logged.'))),
        h('div', { class: 'cols2' },
          h('div', {}, h('h3', { style: 'margin-bottom:8px;font-size:14px' }, `Rules (${Engine.RULES.length})`),
            h('table', { class: 'mini' }, h('tbody', {}, Engine.RULES.map((r) => h('tr', {}, h('td', {}, r.title), h('td', { style: 'text-align:right' }, h('span', { class: 'onfail ' + r.onFail }, label[r.onFail]))))))),
          h('div', { class: 'prose' }, h('h3', { style: 'margin-bottom:8px;font-size:14px' }, 'Assumptions'), h('ul', {},
            h('li', {}, 'Rules decide, not a model, so every verdict can be audited.'),
            h('li', {}, 'Documents arrive as already-extracted fields.'),
            h('li', {}, 'Full rules for India, US, UK and Germany. Other countries go to a person.'),
            h('li', {}, 'Vendor master and watchlist are fictional demo data.'),
            h('li', {}, 'Nothing is emailed. Data stays in this browser.'))))));
  }

  /* ============================ shell ============================== */
  const resetBtn = $('#reset-btn'); let resetTimer = null;
  resetBtn.addEventListener('click', () => {
    if (!resetBtn.dataset.armed) { resetBtn.dataset.armed = '1'; resetBtn.textContent = 'Click again to confirm'; resetTimer = setTimeout(() => { delete resetBtn.dataset.armed; resetBtn.textContent = 'Reset demo'; }, 3500); return; }
    clearTimeout(resetTimer); delete resetBtn.dataset.armed; resetBtn.textContent = 'Reset demo';
    state.runToken++; state.running = false; state.parent = null;
    seed(); closeDrawer(); buildPage(); setEditor(blankSubmission(), { key: 'custom', parent: null });
  });

  buildPage();
  setEditor(blankSubmission(), { key: 'custom', parent: null });

  window.__vod = { state, startRun, loadScenario, setEditor, openDrawer };
})();
