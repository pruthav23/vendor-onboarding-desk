/* ---------------------------------------------------------------
   Vendor onboarding rule engine  (pure JS, no dependencies)
   Deterministic by design: every decision is a rule with evidence,
   so the result can be audited and explained line by line.
---------------------------------------------------------------- */
const Engine = (() => {
  const RULESET_VERSION = '2026.11-r1';
  const BUYER = 'Halden Group';
  const DAY = 86400000;

  /* ============================ utils ============================ */
  const s = (v) => (v === undefined || v === null ? '' : String(v)).trim();
  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const parseDate = (v) => { const d = new Date(v); return isNaN(d) ? null : d; };
  const daysBetween = (a, b) => Math.floor((a - b) / DAY);
  const fmtDate = (d) => d.toISOString().slice(0, 10);
  const maskAcct = (a) => { const t = s(a).replace(/\s+/g, ''); return t.length > 4 ? '••••' + t.slice(-4) : t; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  const COUNTRY_NAMES = { IN: 'India', US: 'United States', GB: 'United Kingdom', DE: 'Germany', KP: 'North Korea', IR: 'Iran', SY: 'Syria', CU: 'Cuba', AE: 'United Arab Emirates', SG: 'Singapore' };
  const cname = (c) => COUNTRY_NAMES[c] || c || 'unknown country';

  /* ====================== name normalisation ===================== */
  const SUFFIX_MAP = { pvt: 'private', ltd: 'limited', co: 'company', corp: 'corporation', inc: 'incorporated' };
  const LEGAL = new Set(['private', 'limited', 'company', 'corporation', 'incorporated', 'llc', 'gmbh', 'ag', 'plc', 'llp', 'lp', 'kg', 'ug', 'sa', 'srl', 'bv', 'nv', 'fze', 'fzco', 'the']);

  function fold(str) {
    return s(str).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\./g, '').replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const tokens = (str) => fold(str).split(' ').filter(Boolean).map((t) => SUFFIX_MAP[t] || t);
  const coreTokens = (str) => tokens(str).filter((t) => !LEGAL.has(t) && t !== 'and');
  const legalForm = (str) => tokens(str).filter((t) => LEGAL.has(t) && t !== 'the').sort().join(' ');

  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  const ratio = (a, b) => { const m = Math.max(a.length, b.length); return m ? 1 - lev(a, b) / m : 1; };

  function nameSimilarity(a, b) {
    const ca = coreTokens(a), cb = coreTokens(b);
    if (!ca.length || !cb.length) return 0;
    const r1 = ratio(ca.join(' '), cb.join(' '));
    const r2 = ratio([...ca].sort().join(' '), [...cb].sort().join(' '));
    const A = new Set(ca), B = new Set(cb);
    const inter = [...A].filter((x) => B.has(x)).length;
    const jac = inter / new Set([...A, ...B]).size;
    const contained = inter === Math.min(A.size, B.size) && A.size !== B.size ? 0.8 : 0;
    return Math.max(r1, r2, jac, contained);
  }
  const NAME_MATCH = 0.9, NAME_PARTIAL = 0.7;
  const tier = (x) => (x >= NAME_MATCH ? 'match' : x >= NAME_PARTIAL ? 'partial' : 'mismatch');
  const pct = (x) => Math.round(x * 100) + '%';

  /* ========================= validators ========================== */
  const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function gstinCheckChar(first14) {
    let sum = 0;
    for (let i = 0; i < 14; i++) { const p = GST_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2); sum += Math.floor(p / 36) + (p % 36); }
    return GST_CHARS[(36 - (sum % 36)) % 36];
  }
  const PAN_RE = /^[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]$/;
  const GSTIN_RE = /^(\d{2})([A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z])([1-9A-Z])Z([0-9A-Z])$/;

  function ukVatCheck(d7) { let t = 0; for (let i = 0; i < 7; i++) t += +d7[i] * (8 - i); return String((97 - (t % 97)) % 97).padStart(2, '0'); }
  function deVatCheck(d8) {
    let product = 10;
    for (let i = 0; i < 8; i++) { let sum = (+d8[i] + product) % 10; if (sum === 0) sum = 10; product = (2 * sum) % 11; }
    const c = 11 - product; return String(c === 10 ? 0 : c);
  }
  function abaCheckDigit(d8) { const w = [3, 7, 1, 3, 7, 1, 3, 7]; let t = 0; for (let i = 0; i < 8; i++) t += +d8[i] * w[i]; return String((10 - (t % 10)) % 10); }
  const abaValid = (r) => /^\d{9}$/.test(r) && abaCheckDigit(r.slice(0, 8)) === r[8];

  const toNum = (str) => str.replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  function mod97(numStr) { let r = 0; for (const ch of numStr) r = (r * 10 + +ch) % 97; return r; }
  function ibanCheckDigits(cc, bban) { return String(98 - mod97(toNum(bban + cc + '00'))).padStart(2, '0'); }
  const IBAN_LEN = { DE: 22, GB: 22 };
  function validateIban(raw) {
    const v = s(raw).replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return { ok: false, reason: 'IBAN is malformed (expected 2 letters, 2 check digits, then the account part)', value: v };
    const cc = v.slice(0, 2);
    if (IBAN_LEN[cc] && v.length !== IBAN_LEN[cc]) return { ok: false, reason: `an ${cc} IBAN must be ${IBAN_LEN[cc]} characters, this one has ${v.length}`, value: v, country: cc };
    if (mod97(toNum(v.slice(4) + v.slice(0, 4))) !== 1) return { ok: false, reason: 'IBAN check digits do not validate (likely a typo)', value: v, country: cc };
    return { ok: true, value: v, country: cc };
  }

  const EIN_PREFIXES = new Set([1,2,3,4,5,6,10,11,12,13,14,15,16,20,21,22,23,24,25,26,27,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,71,72,73,74,75,76,77,80,81,82,83,84,85,86,87,88,90,91,92,93,94,95,98,99]);

  const TAX = {
    IN: { label: 'GSTIN', example: '27AABCM1234C1Z5', validate(v) {
      const x = s(v).toUpperCase().replace(/\s+/g, '');
      const m = GSTIN_RE.exec(x);
      if (!m) return { ok: false, reason: `"${x}" is not a valid GSTIN shape (15 characters: 2-digit state code, 10-character PAN, entity number, "Z", check character)` };
      const st = +m[1]; if (!((st >= 1 && st <= 38) || st === 97 || st === 99)) return { ok: false, reason: `state code ${m[1]} is not a valid Indian state or UT code` };
      if (gstinCheckChar(x.slice(0, 14)) !== x[14]) return { ok: false, reason: 'GSTIN check character does not validate (likely a typo)' };
      return { ok: true, value: x, pan: m[2] };
    } },
    US: { label: 'EIN', example: '47-1234567', validate(v) {
      const x = s(v).replace(/\s+/g, '');
      if (!/^\d{2}-?\d{7}$/.test(x)) return { ok: false, reason: `"${x}" is not an EIN (format NN-NNNNNNN)` };
      if (!EIN_PREFIXES.has(+x.slice(0, 2))) return { ok: false, reason: `EIN prefix ${x.slice(0, 2)} is not issued by the IRS` };
      return { ok: true, value: x.replace('-', '') };
    } },
    GB: { label: 'UK VAT number', example: 'GB123456789', validate(v) {
      const x = s(v).toUpperCase().replace(/\s+/g, '');
      if (!/^GB\d{9}$/.test(x)) return { ok: false, reason: `"${x}" is not a UK VAT number (GB followed by 9 digits)` };
      const d = x.slice(2), t = [...d.slice(0, 7)].reduce((a, c, i) => a + +c * (8 - i), 0), chk = +d.slice(7);
      if ((t + chk) % 97 !== 0 && (t + chk + 55) % 97 !== 0) return { ok: false, reason: 'UK VAT check digits do not validate (likely a typo)' };
      return { ok: true, value: x };
    } },
    DE: { label: 'USt-IdNr (VAT ID)', example: 'DE123456788', validate(v) {
      const x = s(v).toUpperCase().replace(/\s+/g, '');
      if (!/^DE\d{9}$/.test(x)) return { ok: false, reason: `"${x}" is not a German USt-IdNr (DE followed by 9 digits)` };
      if (deVatCheck(x.slice(2, 10)) !== x[10]) return { ok: false, reason: 'USt-IdNr check digit does not validate (likely a typo)' };
      return { ok: true, value: x };
    } },
  };
  // Which country a tax ID *looks like* it belongs to (used for "wrong country" diagnosis)
  function detectTaxCountry(v) {
    const x = s(v).toUpperCase().replace(/\s+/g, '');
    if (/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(x)) return 'IN';
    if (/^\d{2}-?\d{7}$/.test(x)) return 'US';
    if (/^GB\d{9}$/.test(x)) return 'GB';
    if (/^DE\d{9}$/.test(x)) return 'DE';
    return null;
  }

  /* ===================== country rule sets ======================= */
  const BASE_FIELDS = [
    ['company.legalName', 'Legal company name'], ['company.country', 'Country of registration'],
    ['company.address.line', 'Registered address'], ['company.address.city', 'City'], ['company.address.postal', 'Postal code'],
    ['company.contactName', 'Contact name'], ['company.contactEmail', 'Contact email'], ['company.contactPhone', 'Contact phone'],
    ['tax.idValue', 'Tax ID'], ['bank.accountHolderName', 'Bank account holder name'], ['bank.bankName', 'Bank name'],
  ];
  const COUNTRY_FIELDS = {
    IN: [['tax.pan', 'PAN'], ['bank.accountNumber', 'Bank account number'], ['bank.ifsc', 'IFSC code']],
    US: [['bank.routingNumber', 'ABA routing number'], ['bank.accountNumber', 'Bank account number']],
    GB: [['bank.iban', 'IBAN']],
    DE: [['bank.iban', 'IBAN']],
  };
  const DOC_LABELS = {
    certificate_of_incorporation: 'Certificate of incorporation', gst_certificate: 'GST registration certificate', pan_card: 'PAN card',
    cancelled_cheque: 'Cancelled cheque', w9: 'IRS Form W-9', w8ben: 'IRS Form W-8BEN', bank_letter: 'Bank confirmation letter',
    vat_certificate: 'VAT registration confirmation', trade_register_extract: 'Trade register extract (Handelsregisterauszug)',
  };
  const REQUIRED_DOCS = {
    IN: ['certificate_of_incorporation', 'gst_certificate', 'pan_card', 'cancelled_cheque'],
    US: ['w9', 'bank_letter'],
    GB: ['certificate_of_incorporation', 'vat_certificate', 'bank_letter'],
    DE: ['trade_register_extract', 'vat_certificate', 'bank_letter'],
  };
  const DOC_ORIGIN = { gst_certificate: 'India', pan_card: 'India', cancelled_cheque: 'India', w9: 'the United States', w8ben: 'non-US vendors', trade_register_extract: 'Germany', vat_certificate: 'the UK or EU', certificate_of_incorporation: 'any country', bank_letter: 'any country' };
  const BANK_DOCS = new Set(['bank_letter', 'cancelled_cheque']);
  const TAX_DOCS = new Set(['gst_certificate', 'vat_certificate', 'w9', 'pan_card']);
  const ID_DOCS = new Set(['certificate_of_incorporation', 'trade_register_extract', 'gst_certificate', 'vat_certificate', 'w9', 'pan_card']);
  const BANK_LETTER_MAX_AGE_DAYS = 90;
  const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'proton.me', 'protonmail.com', 'icloud.com', 'aol.com', 'rediffmail.com']);
  const PHONE_PREFIX = { IN: '+91', US: '+1', GB: '+44', DE: '+49' };
  const SANCTIONED_COUNTRIES = ['KP', 'IR', 'SY', 'CU'];

  /* ============================ rules ============================ */
  // Catalogue used by the "Process map" page. onFail: reject | pending-vendor | pending-internal | note
  const RULES = [
    { id: 'I1', stage: 'intake', title: 'Submission is well-formed', onFail: 'pending-vendor', what: 'Company, tax and bank blocks are present and are objects.' },
    { id: 'I2', stage: 'intake', title: 'Country ruleset available', onFail: 'pending-internal', what: 'IN, US, GB and DE have full rulesets. Any other country is routed to a human for tax-ID verification.' },
    { id: 'I3', stage: 'intake', title: 'Names normalised', onFail: 'note', what: 'Case, accents, punctuation and legal suffixes (Pvt Ltd / Private Limited, LLC, GmbH) are normalised before any name comparison.' },
    { id: 'C1', stage: 'completeness', title: 'Required fields present', onFail: 'pending-vendor', what: 'Country-specific list of required fields. Lists every missing field at once so the vendor is only asked once.' },
    { id: 'C2', stage: 'completeness', title: 'Required documents attached', onFail: 'pending-vendor', what: 'Country-specific document set. If a wrong-country document was attached in its place, the request says so.' },
    { id: 'F1', stage: 'format', title: 'Tax ID valid for the country', onFail: 'pending-vendor', what: 'Format and checksum (GSTIN, EIN, UK VAT, USt-IdNr). Detects IDs that belong to a different country.' },
    { id: 'F2', stage: 'format', title: 'Bank details valid', onFail: 'pending-vendor', what: 'IBAN mod-97, IFSC shape, ABA routing checksum, account number length.' },
    { id: 'F3', stage: 'format', title: 'Contact details plausible', onFail: 'pending-vendor', what: 'Email format. Free-mail domains and phone prefix mismatches are noted, not blocked.' },
    { id: 'X1', stage: 'crossref', title: 'Legal name matches bank account holder', onFail: 'pending-internal', what: 'Fuzzy match on normalised names, also tried against the trade name. Match 90%+, partial 70-90%, mismatch below 70%. A mismatch is a payment-diversion signal and is escalated.' },
    { id: 'X2', stage: 'crossref', title: 'Country consistent across the submission', onFail: 'pending-vendor', what: 'Registered country vs address country vs bank country vs country the tax ID belongs to.' },
    { id: 'X3', stage: 'crossref', title: 'PAN embedded in GSTIN matches PAN provided', onFail: 'pending-vendor', what: 'India only. The 10-character PAN inside a GSTIN must equal the PAN field. Also checks the PAN entity type is a company.' },
    { id: 'X4', stage: 'crossref', title: 'Documents issued to this vendor', onFail: 'pending-vendor', what: 'Name on each identity/tax document must match the legal name.' },
    { id: 'X5', stage: 'crossref', title: 'Tax ID on documents matches submission', onFail: 'pending-vendor', what: 'Tax ID printed on the certificate must equal the one on the form.' },
    { id: 'X6', stage: 'crossref', title: 'Bank document matches bank details', onFail: 'pending-vendor', what: 'Account holder and account number on the bank letter or cancelled cheque must equal the form.' },
    { id: 'X7', stage: 'crossref', title: 'Documents are current', onFail: 'pending-vendor', what: 'Not expired. Bank letters must be issued in the last 90 days.' },
    { id: 'R1', stage: 'risk', title: 'Sanctions and jurisdiction screening', onFail: 'reject', what: 'Company, trade and bank-holder names against the watchlist; company and bank countries against restricted jurisdictions.' },
    { id: 'R2', stage: 'risk', title: 'Not already in the vendor master', onFail: 'reject', what: 'Same tax ID and same name is a duplicate. Same tax ID with a new bank account is routed to R4.' },
    { id: 'R3', stage: 'risk', title: 'Bank account not owned by another vendor', onFail: 'reject', what: 'The same account already belongs to a different vendor in the master. Classic payment-diversion pattern.' },
    { id: 'R4', stage: 'risk', title: 'Bank change request on existing vendor', onFail: 'pending-internal', what: 'Known vendor, new bank details. Held until verified by a call to the phone number already on file, never the one in the submission.' },
  ];

  /* ========================= rule helpers ======================== */
  // Plain wording for the same rule when it fails or only adds a note.
  const FAIL_TITLE = { I1: 'Submission is incomplete', I2: 'Country not supported', C1: 'Required fields missing', C2: 'Required documents missing', F1: 'Tax ID is invalid', F2: 'Bank details are invalid', F3: 'Contact email is invalid', X1: 'Bank account holder does not match', X2: 'Countries do not agree', X3: 'PAN does not match the GSTIN', X4: 'Document is in a different name', X5: 'Tax ID differs from the document', X6: 'Bank document does not match', X7: 'Documents expired or too old', R1: 'Watchlist or restricted country', R2: 'Vendor already exists', R3: 'Account belongs to another vendor', R4: 'Bank change on an existing vendor' };
  const NOTE_TITLE = { C2: 'Extra document attached', F3: 'Contact detail noted', X1: 'Bank holder name differs slightly', X3: 'PAN detail noted' };
  const R = (id, status, severity, message, extra = {}) => {
    const meta = RULES.find((r) => r.id === id) || {};
    const title = status === 'fail' ? FAIL_TITLE[id] || meta.title : status === 'warn' ? NOTE_TITLE[id] || meta.title : meta.title;
    return { id, stage: meta.stage, title, status, severity, message, ...extra };
  };
  const pass = (id, message, extra) => R(id, 'pass', null, message, extra);
  const note = (id, message, extra) => R(id, 'warn', 'minor', message, extra);
  const skip = (id, message) => R(id, 'skip', null, message);
  const failV = (id, message, ask, extra) => R(id, 'fail', 'major', message, { owner: 'vendor', ask, ...extra });
  const failI = (id, message, ask, extra) => R(id, 'fail', 'major', message, { owner: 'internal', escalate: true, ask, ...extra });
  const blocker = (id, message, extra) => R(id, 'fail', 'blocker', message, { owner: 'internal', escalate: true, ...extra });

  /* ============================= stages ========================== */
  const STAGES = [
    { id: 'intake', name: 'Intake and normalisation', blurb: 'Read the submission, pick the country ruleset, normalise names' },
    { id: 'completeness', name: 'Completeness', blurb: 'Required fields and documents for this country' },
    { id: 'format', name: 'Format validation', blurb: 'Tax ID, bank and contact details are well-formed' },
    { id: 'crossref', name: 'Cross-reference', blurb: 'Fields and documents agree with each other' },
    { id: 'risk', name: 'Risk and registry checks', blurb: 'Sanctions, duplicates, bank reuse, bank changes' },
    { id: 'decision', name: 'Decision', blurb: 'Combine findings into approved, pending or rejected' },
    { id: 'communicate', name: 'Communicate', blurb: 'Draft the vendor message and the internal note' },
  ];

  /* -------- stage 1: intake -------- */
  function stageIntake(st) {
    const sub = st.sub, out = [];
    const bad = ['company', 'tax', 'bank'].filter((k) => !sub[k] || typeof sub[k] !== 'object');
    if (bad.length) {
      out.push(failV('I1', `Missing section${bad.length > 1 ? 's' : ''}: ${bad.join(', ')}`, `Resubmit the form with the ${bad.join(', ')} section${bad.length > 1 ? 's' : ''} completed.`));
      sub.company = sub.company || {}; sub.tax = sub.tax || {}; sub.bank = sub.bank || {}; sub.documents = sub.documents || [];
    } else out.push(pass('I1', 'Company, tax and bank sections present'));
    sub.documents = Array.isArray(sub.documents) ? sub.documents : [];

    st.country = s(get(sub, 'company.country')).toUpperCase();
    st.rules_country = REQUIRED_DOCS[st.country] ? st.country : null;
    if (st.rules_country) out.push(pass('I2', `Applying the ${cname(st.country)} ruleset (${TAX[st.country].label}, ${REQUIRED_DOCS[st.country].length} required documents)`));
    else out.push(failI('I2', `No automated ruleset for "${st.country || 'no country'}". Generic checks only; tax ID needs manual verification`, null, { internalNote: 'Unsupported jurisdiction: verify tax ID against the local registry manually.' }));

    const legal = s(get(sub, 'company.legalName')), trade = s(get(sub, 'company.tradeName')), holder = s(get(sub, 'bank.accountHolderName'));
    st.names = { legal, trade, holder, core: coreTokens(legal).join(' '), legalForm: legalForm(legal) };
    out.push(R('I3', 'info', null, legal ? `Legal name normalised to "${st.names.core}"${st.names.legalForm ? ` (legal form: ${st.names.legalForm})` : ''}${holder ? `; bank holder to "${coreTokens(holder).join(' ')}"` : ''}` : 'No legal name to normalise'));
    return out;
  }

  /* -------- stage 2: completeness -------- */
  function stageCompleteness(st) {
    const sub = st.sub, out = [];
    const fields = [...BASE_FIELDS, ...(COUNTRY_FIELDS[st.country] || [['bank.iban', 'IBAN or bank account number']])];
    let missing = fields.filter(([p]) => !s(get(sub, p)));
    if (!COUNTRY_FIELDS[st.country]) missing = missing.filter(([p]) => !(p === 'bank.iban' && (s(get(sub, 'bank.accountNumber')))));
    st.missingFields = missing.map(([p]) => p);
    if (missing.length) {
      const labels = missing.map(([, l]) => l);
      out.push(failV('C1', `${plural(missing.length, 'required field')} missing: ${labels.join(', ')}`, `Please provide: ${labels.join(', ')}.`, { evidence: labels }));
    } else out.push(pass('C1', `All ${fields.length} required fields present`));

    const req = REQUIRED_DOCS[st.country];
    if (!req) { out.push(skip('C2', 'No document list for this country; manual review')); return out; }
    const have = new Set(sub.documents.map((d) => s(d.type)));
    const lacking = req.filter((t) => !have.has(t));
    if (lacking.length) {
      const extras = sub.documents.filter((d) => !req.includes(s(d.type)));
      const SUBSTITUTES = { vat_certificate: ['gst_certificate'], w9: ['w8ben'], bank_letter: ['cancelled_cheque'], trade_register_extract: ['certificate_of_incorporation'], gst_certificate: ['vat_certificate'], certificate_of_incorporation: ['trade_register_extract'] };
      const asks = lacking.map((t) => {
        const wrong = extras.find((d) => (SUBSTITUTES[t] || []).includes(s(d.type)));
        const o = wrong && DOC_ORIGIN[s(wrong.type)];
        return `${DOC_LABELS[t] || t}${wrong ? ` (the ${DOC_LABELS[s(wrong.type)]} you attached ${o && o !== 'any country' ? `is a document for ${o} and ` : ''}is not accepted in its place)` : ''}`;
      });
      out.push(failV('C2', `${plural(lacking.length, 'required document')} missing: ${lacking.map((t) => DOC_LABELS[t] || t).join(', ')}`, `Please attach: ${asks.join('; ')}.`, { evidence: lacking }));
    } else out.push(pass('C2', `All ${req.length} required documents attached`));
    const stray = sub.documents.filter((d) => !req.includes(s(d.type)));
    if (stray.length && !lacking.length) out.push(note('C2', `Unrequired document attached: ${stray.map((d) => DOC_LABELS[s(d.type)] || d.type).join(', ')}. Ignored.`));
    return out;
  }

  /* -------- stage 3: format -------- */
  function resolveBank(st) {
    const b = st.sub.bank || {}, out = { country: null, ok: null, reason: '', acct: '' };
    const cc = st.country;
    if (cc === 'IN') {
      const acct = s(b.accountNumber).replace(/\s+/g, ''), ifsc = s(b.ifsc).toUpperCase();
      out.acct = acct; out.country = ifsc || acct ? 'IN' : null;
      if (!acct && !ifsc) { out.ok = null; return out; }
      const problems = [];
      if (!/^\d{9,18}$/.test(acct)) problems.push(`account number "${acct}" must be 9 to 18 digits`);
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) problems.push(`IFSC "${ifsc}" must be 4 letters, a zero, then 6 characters`);
      out.ok = !problems.length; out.reason = problems.join('; ');
    } else if (cc === 'US') {
      const r = s(b.routingNumber).replace(/\s+/g, ''), acct = s(b.accountNumber).replace(/\s+/g, '');
      out.acct = acct; out.country = 'US';
      if (!r && !acct) { out.ok = null; return out; }
      const problems = [];
      if (!abaValid(r)) problems.push(`routing number "${r}" fails the ABA checksum`);
      if (!/^\d{4,17}$/.test(acct)) problems.push(`account number "${acct}" must be 4 to 17 digits`);
      out.ok = !problems.length; out.reason = problems.join('; ');
    } else {
      const raw = s(b.iban) || '';
      if (raw) {
        const v = validateIban(raw); out.acct = v.value; out.country = v.country || null; out.ok = v.ok; out.reason = v.ok ? '' : v.reason;
        if (v.ok && st.rules_country && v.country !== cc && b.country === undefined) out.country = v.country;
      } else if (s(b.accountNumber)) { out.acct = s(b.accountNumber).replace(/\s+/g, ''); out.ok = true; out.country = s(b.country).toUpperCase() || null; }
      else out.ok = null;
    }
    if (!out.country && s(b.country)) out.country = s(b.country).toUpperCase();
    return out;
  }

  function stageFormat(st) {
    const sub = st.sub, out = [];
    // F1 tax ID
    const tv = s(get(sub, 'tax.idValue'));
    if (!tv) out.push(skip('F1', 'No tax ID to validate (flagged in completeness)'));
    else if (!st.rules_country) out.push(skip('F1', 'No validator for this country'));
    else {
      const v = TAX[st.country].validate(tv);
      const looks = detectTaxCountry(tv);
      st.tax = v;
      if (v.ok) out.push(pass('F1', `${TAX[st.country].label} ${v.value} is valid for ${cname(st.country)}`, { evidence: v.pan ? [`Embedded PAN ${v.pan}`] : undefined }));
      else if (looks && looks !== st.country) out.push(failV('F1', `Tax ID ${tv} has the shape of a ${cname(looks)} ${TAX[looks].label}, but the vendor is registered in ${cname(st.country)}`, `The tax ID you gave (${tv}) looks like a ${cname(looks)} ${TAX[looks].label}. For a company registered in ${cname(st.country)} please provide the ${TAX[st.country].label} (example format: ${TAX[st.country].example}).`, { flag: `Tax ID ${tv} looks like a ${cname(looks)} ID, not a ${cname(st.country)} one` }));
      else {
        const docId = sub.documents.map((d) => s(d.taxId)).find((t) => t && TAX_DOCS_ID_OK(st.country, t));
        const hint = docId ? ` Your attached registration document shows ${docId}. Is that the correct number?` : ' Please check it against your registration certificate.';
        st.f1DocHint = !!docId;
        out.push(failV('F1', `${TAX[st.country].label} invalid: ${v.reason}${docId ? `. A valid ${TAX[st.country].label} (${docId}) appears on an attached document` : ''}`, `The ${TAX[st.country].label} you provided (${tv}) is not valid: ${v.reason}.${hint}`, { flag: `Tax ID ${tv} is not valid${docId ? ` (your document shows ${docId})` : ''}` }));
      }
    }
    // F2 bank
    const bank = resolveBank(st); st.bank = bank;
    if (bank.ok === null) out.push(skip('F2', 'No bank account details to validate (flagged in completeness)'));
    else if (bank.ok) out.push(pass('F2', `Bank details are well-formed (account ${maskAcct(bank.acct)}${bank.country ? ', bank in ' + cname(bank.country) : ''})`));
    else out.push(failV('F2', `Bank details invalid: ${bank.reason}`, `Your bank details could not be validated: ${bank.reason}. Please re-enter them exactly as shown on your bank letter.`, { flag: `Bank details are not valid: ${bank.reason.split('; ')[0]}` }));
    // F3 contact
    const email = s(get(sub, 'company.contactEmail')).toLowerCase(), site = s(get(sub, 'company.website')).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const phone = s(get(sub, 'company.contactPhone')).replace(/[\s()-]/g, '');
    if (!email) out.push(skip('F3', 'No contact email'));
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) out.push(failV('F3', `Contact email "${email}" is not a valid address`, 'Please provide a valid contact email address.', { flag: `Email "${email}" is not valid` }));
    else {
      const dom = email.split('@')[1], notes = [];
      if (FREE_MAIL.has(dom)) notes.push(`contact uses a free email domain (${dom}); acceptable but noted`);
      else if (site && !(dom === site || dom.endsWith('.' + site) || site.endsWith('.' + dom))) notes.push(`email domain ${dom} differs from website ${site}`);
      const pre = PHONE_PREFIX[st.country];
      if (pre && phone && !phone.startsWith(pre)) notes.push(`phone ${phone} does not start with ${pre} for ${cname(st.country)}`);
      if (notes.length) out.push(note('F3', notes.join('; ')));
      else out.push(pass('F3', `Contact email domain ${dom} is consistent with the website`));
    }
    return out;
  }

  /* -------- stage 4: cross-reference -------- */
  function stageCrossRef(st) {
    const sub = st.sub, out = [], { legal, trade, holder } = st.names;
    // X1 legal vs bank holder
    if (!holder || !legal) out.push(skip('X1', 'Need both legal name and bank holder name'));
    else {
      const sLegal = nameSimilarity(legal, holder), sTrade = trade ? nameSimilarity(trade, holder) : 0;
      const best = Math.max(sLegal, sTrade), via = sTrade > sLegal ? 'trade name' : 'legal name';
      st.holderMatch = { legal: sLegal, trade: sTrade, best, via };
      const t = tier(best);
      const ev = [`Legal name: "${legal}"`, trade ? `Trade name: "${trade}"` : null, `Bank account holder: "${holder}"`, `Similarity ${pct(best)} (via ${via})`].filter(Boolean);
      if (t === 'match') {
        const forms = legalForm(legal) && legalForm(holder) && legalForm(legal) !== legalForm(holder) && via === 'legal name';
        if (via === 'trade name') out.push(note('X1', `Bank account holder matches the declared trade name "${trade}" (${pct(best)}), not the legal name. Accepted, noted for audit.`, { evidence: ev }));
        else if (forms) out.push(note('X1', `Names match (${pct(best)}) but legal form differs: "${legalForm(legal)}" vs "${legalForm(holder)}"`, { evidence: ev }));
        else out.push(pass('X1', `Bank account holder matches legal name (${pct(best)} after normalisation)`, { evidence: ev }));
      } else if (t === 'partial') out.push(failV('X1', `Bank account holder only partly matches the legal name (${pct(best)})`, 'The account holder name on your bank details differs from your registered company name. Please send a bank confirmation letter on bank letterhead showing the exact account holder name.', { evidence: ev, flag: `Account holder "${holder}" only partly matches "${legal}"` }));
      else out.push(failI('X1', `Bank account holder "${holder}" does not match the vendor (${pct(best)}). Possible payment diversion to a third party`, 'The account holder name on your bank details differs from your registered company name. Please send a bank confirmation letter on bank letterhead and, if the account belongs to another entity, a written explanation of the relationship.', { evidence: ev, flag: `Account holder is "${holder}", not "${legal}"`, internalNote: 'Account is held by a different party. Do not release payment until Compliance has confirmed the relationship by phone on a known number.' }));
    }
    // X2 country consistency
    const cs = [['registered country', st.country], ['address country', s(get(sub, 'company.address.country')).toUpperCase()], ['bank country', st.bank && st.bank.country]].filter(([, v]) => v);
    const taxLooks = detectTaxCountry(get(sub, 'tax.idValue'));
    if (taxLooks) cs.push(['tax ID format', taxLooks]);
    const distinct = [...new Set(cs.map(([, v]) => v))];
    if (cs.length < 2) out.push(skip('X2', 'Not enough country signals to compare'));
    else if (distinct.length === 1) out.push(pass('X2', `All country signals agree (${cname(distinct[0])})`, { evidence: cs.map(([k, v]) => `${k}: ${v}`) }));
    else {
      const odd = cs.filter(([, v]) => v !== st.country).map(([k, v]) => `${k} (${cname(v)})`);
      out.push(failV('X2', `Country signals disagree: registered in ${cname(st.country)} but ${odd.join(', ')}`, `Your submission mixes countries: registered in ${cname(st.country)} but ${odd.join(', ')}. Please confirm the registered country and, where the bank account is in another country, explain why payments should go there.`, { evidence: cs.map(([k, v]) => `${k}: ${v}`) }));
    }
    // X3 PAN <-> GSTIN (India)
    if (st.country !== 'IN') out.push(skip('X3', 'Applies to India only'));
    else {
      const pan = s(get(sub, 'tax.pan')).toUpperCase(), emb = st.tax && st.tax.pan;
      if (!pan || !emb) out.push(skip('X3', 'Need a valid GSTIN and a PAN to compare'));
      else if (pan !== emb) out.push(failV('X3', `PAN ${pan} does not match the PAN embedded in the GSTIN (${emb})`, `The PAN you gave (${pan}) is different from the PAN inside your GSTIN (${emb}). Please confirm which is correct and send the matching registration documents.`));
      else {
        const first = (legal.match(/[A-Za-z]/) || [''])[0].toUpperCase();
        if (pan[3] !== 'C') out.push(note('X3', `PAN matches GSTIN, but entity type "${pan[3]}" is not a company ("C")`));
        else if (first && pan[4] !== first) out.push(note('X3', `PAN matches GSTIN. 5th PAN character "${pan[4]}" is not the first letter of the legal name ("${first}"); common after a rename, noted`));
        else out.push(pass('X3', `PAN ${pan} matches the one embedded in the GSTIN and is a company PAN`));
      }
    }
    // document checks
    const docs = sub.documents, req = REQUIRED_DOCS[st.country];
    const issues = { owner: [], taxid: [], bank: [], stale: [] };
    const submittedTax = s(get(sub, 'tax.idValue')).toUpperCase().replace(/[\s-]/g, '');
    const acctNow = st.bank ? st.bank.acct : '';
    for (const d of docs) {
      const type = s(d.type), label = DOC_LABELS[type] || type;
      if (req && !req.includes(type)) continue;
      if (ID_DOCS.has(type) && s(d.issuedTo)) {
        const sim = Math.max(nameSimilarity(legal, d.issuedTo), trade ? nameSimilarity(trade, d.issuedTo) : 0);
        if (sim < NAME_MATCH) issues.owner.push({ label, issuedTo: d.issuedTo, sim });
      }
      if (TAX_DOCS.has(type) && s(d.taxId)) {
        const dt = s(d.taxId).toUpperCase().replace(/[\s-]/g, '');
        const cmp = type === 'pan_card' ? s(get(sub, 'tax.pan')).toUpperCase() : submittedTax;
        if (cmp && dt !== cmp) issues.taxid.push({ label, onDoc: s(d.taxId), submitted: type === 'pan_card' ? s(get(sub, 'tax.pan')) : s(get(sub, 'tax.idValue')) });
      }
      if (BANK_DOCS.has(type)) {
        if (s(d.issuedTo) && holder) { const sim = nameSimilarity(holder, d.issuedTo); if (sim < NAME_MATCH) issues.bank.push(`${label} is in the name "${d.issuedTo}", bank holder on the form is "${holder}"`); }
        if (s(d.accountNumber) && acctNow) { const a = s(d.accountNumber).replace(/\s+/g, '').toUpperCase(); if (a !== acctNow.toUpperCase()) issues.bank.push(`${label} shows account ${maskAcct(a)}, form says ${maskAcct(acctNow)}`); }
        const issued = parseDate(d.issueDate);
        if (issued && daysBetween(st.now, issued) > BANK_LETTER_MAX_AGE_DAYS) issues.stale.push(`${label} is ${daysBetween(st.now, issued)} days old (limit ${BANK_LETTER_MAX_AGE_DAYS})`);
      }
      const exp = parseDate(d.expiryDate);
      if (exp && exp < st.now) issues.stale.push(`${label} expired on ${fmtDate(exp)}`);
    }
    out.push(issues.owner.length ? failV('X4', `${issues.owner.map((i) => `${i.label} is issued to "${i.issuedTo}"`).join('; ')}, not "${legal}"`, `The following document(s) do not show your registered company name: ${issues.owner.map((i) => `${i.label} (shows "${i.issuedTo}")`).join('; ')}. Please send the correct document(s).`, { evidence: issues.owner.map((i) => `${i.label}: "${i.issuedTo}" vs "${legal}" (${pct(i.sim)})`) }) : pass('X4', 'Name on identity and tax documents matches the legal name'));
    const taxMsg = issues.taxid.map((i) => `${i.label} shows ${i.onDoc}, form says ${i.submitted}`).join('; ');
    // When F1 already asked the vendor about the tax ID (and quoted the document), do not ask twice.
    out.push(issues.taxid.length ? failV('X5', taxMsg, st.f1DocHint ? null : `The tax ID on your documents differs from the one on the form: ${taxMsg}. Please confirm the correct number.`) : pass('X5', 'Tax ID on documents matches the form'));
    out.push(issues.bank.length ? failV('X6', issues.bank.join('; '), `Your bank document does not match the bank details on the form: ${issues.bank.join('; ')}. Please send an up-to-date bank letter that matches.`) : pass('X6', 'Bank document matches the bank details'));
    out.push(issues.stale.length ? failV('X7', issues.stale.join('; '), `Please replace outdated document(s): ${issues.stale.join('; ')}.`) : pass('X7', 'No expired or stale documents'));
    return out;
  }

  /* -------- stage 5: risk -------- */
  function stageRisk(st) {
    const sub = st.sub, out = [], ctx = st.ctx, { legal, trade, holder } = st.names;
    // R1 sanctions
    const hits = [];
    for (const [label, name] of [['legal name', legal], ['trade name', trade], ['bank account holder', holder]]) {
      if (!name) continue;
      for (const n of ctx.sanctions.names) { const sim = nameSimilarity(name, n); if (sim >= 0.88) hits.push({ label, name, list: n, sim }); }
    }
    const jur = [['registered country', st.country], ['bank country', st.bank && st.bank.country]].filter(([, c]) => c && ctx.sanctions.countries.includes(c));
    if (hits.length || jur.length) {
      const m = [...hits.map((h) => `${h.label} "${h.name}" matches watchlist entry "${h.list}" (${pct(h.sim)})`), ...jur.map(([k, c]) => `${k} ${cname(c)} is a restricted jurisdiction`)];
      out.push(blocker('R1', m.join('; '), { evidence: m, internalNote: 'Watchlist hit. Do not contact the vendor about the reason. Escalate to Compliance (sanctions desk) for review within 24 hours.' }));
    } else out.push(pass('R1', `No watchlist match across ${ctx.sanctions.names.length} entries; ${cname(st.country)} is not a restricted jurisdiction`));
    // R2 duplicates by tax id / name
    const taxNow = s(get(sub, 'tax.idValue')).toUpperCase().replace(/[\s-]/g, '');
    const acctNow = (st.bank ? st.bank.acct : '').toUpperCase();
    const byTax = taxNow ? ctx.vendorMaster.find((v) => v.taxId.toUpperCase().replace(/[\s-]/g, '') === taxNow) : null;
    const byName = !byTax && legal ? ctx.vendorMaster.find((v) => nameSimilarity(v.legalName, legal) >= NAME_MATCH && v.country === st.country) : null;
    const sameAcct = byTax && acctNow && v_acct(byTax) === acctNow;
    st.matchedVendor = byTax || null;
    if (byTax && (sameAcct || !acctNow)) out.push(blocker('R2', `Tax ID ${taxNow} is already registered as ${byTax.id} (${byTax.legalName}) with the same bank account. Duplicate submission`, { evidence: [`Existing: ${byTax.id}, onboarded ${byTax.onboarded}`], internalNote: `Duplicate of ${byTax.id}. Close this case and point the requester to the existing vendor record.` }));
    else if (byTax) out.push(R('R2', 'info', null, `Tax ID matches existing vendor ${byTax.id} (${byTax.legalName}). Treated as an update to a known vendor, see R4`));
    else if (byName) out.push(failI('R2', `A vendor with a near-identical name already exists: ${byName.id} (${byName.legalName}) but with a different tax ID`, 'We found an existing supplier with a very similar name. Please confirm whether you are a separate legal entity and send your registration certificate.', { evidence: [`Existing ${byName.id} tax ID ${byName.taxId}`, `Submitted tax ID ${taxNow}`], internalNote: 'Possible vendor impersonation or duplicate under a new tax ID.' }));
    else out.push(pass('R2', `No existing vendor with this tax ID or name (checked ${ctx.vendorMaster.length} vendors)`));
    // R3 bank reuse
    const reuse = acctNow ? ctx.vendorMaster.find((v) => v_acct(v) === acctNow && v.id !== (byTax && byTax.id)) : null;
    if (reuse) out.push(blocker('R3', `Bank account ${maskAcct(acctNow)} already belongs to a different vendor: ${reuse.id} (${reuse.legalName}, tax ID ${reuse.taxId})`, { flag: `Account ${maskAcct(acctNow)} already belongs to ${reuse.id} (${reuse.legalName})`, evidence: [`This submission: ${legal}, tax ID ${taxNow || 'n/a'}`, `Existing owner: ${reuse.legalName}, ${reuse.taxId}`], internalNote: `Account reuse across unrelated vendors. Alert Fraud Risk and ${reuse.id}'s relationship owner; consider this a possible attempt to redirect payments.` }));
    else if (!acctNow) out.push(skip('R3', 'No bank account to check'));
    else out.push(pass('R3', `Account ${maskAcct(acctNow)} is not used by any other vendor`));
    // R4 bank change
    if (byTax && acctNow && !sameAcct) {
      const emailDom = s(get(sub, 'company.contactEmail')).split('@')[1] || '';
      const masterDom = s(byTax.contactEmail).split('@')[1] || '';
      const sig = [`Existing account ${maskAcct(v_acct(byTax))} replaced by ${maskAcct(acctNow)}`];
      if (emailDom && masterDom && emailDom.toLowerCase() !== masterDom.toLowerCase()) sig.push(`Contact email domain changed from ${masterDom} to ${emailDom}`);
      if (s(get(sub, 'company.contactPhone')).replace(/[\s()-]/g, '') !== s(byTax.contactPhone).replace(/[\s()-]/g, '')) sig.push('Contact phone differs from the number on file');
      st.bankChange = { vendor: byTax, signals: sig };
      out.push(failI('R4', `${byTax.id} (${byTax.legalName}) is asking to change bank details. ${sig.length > 1 ? 'Additional red flags: ' + sig.slice(1).join('; ') : ''}`.trim(), 'To protect your account we confirm bank detail changes by phone. A member of our team will call the number we already hold for you. No action is needed from you until then.', { flag: `${byTax.id} (${byTax.legalName}) wants to change its bank account${sig.length > 1 ? ' and contact details' : ''}`, evidence: sig, internalNote: `Call ${byTax.contactName} on the number on file (${byTax.contactPhone}), not the one in this submission. Ask them to confirm the new account. Keep the old account active until confirmed.` }));
    } else out.push(skip('R4', byTax ? 'Same bank account as on file' : 'Not an existing vendor'));
    return out;
  }
  function v_acct(v) { return s(v.bankAccount).replace(/\s+/g, '').toUpperCase(); }
  function TAX_DOCS_ID_OK(country, id) { return !!TAX[country] && TAX[country].validate(id).ok; }

  /* -------- stage 6: decision -------- */
  function stageDecision(st) {
    const all = st.findings, fails = all.filter((r) => r.status === 'fail'), warns = all.filter((r) => r.status === 'warn');
    const blockers = fails.filter((r) => r.severity === 'blocker'), majors = fails.filter((r) => r.severity === 'major');
    let status, sub, headline, next;
    const SHORT = { R1: 'name or country is on a watchlist', R2: 'vendor already exists', R3: 'bank account already belongs to another vendor' };
    if (blockers.length) {
      status = 'rejected'; sub = 'compliance';
      headline = `Blocked: ${blockers.map((b) => SHORT[b.id] || b.title.toLowerCase()).join('; ')}.`;
      next = 'Escalated to Compliance. No payment setup. Vendor receives a neutral closure notice.';
    } else if (majors.length) {
      status = 'pending';
      const esc = majors.filter((m) => m.escalate), fix = majors.filter((m) => !m.escalate);
      const internal = esc.length > 0;
      sub = internal ? 'internal_review' : 'awaiting_vendor';
      headline = internal ? 'A person needs to review this before any payment.' : `Waiting on the vendor: ${plural(majors.length, 'thing')} to fix.`;
      next = internal ? 'Held for Compliance review. Vendor receives a holding notice (plus any simple fixes).' : 'Vendor request sent. Case reopens automatically on reply and is re-checked from the start.';
    } else {
      status = 'approved'; sub = warns.length ? 'with_notes' : 'clean';
      headline = warns.length ? `Approved, with ${plural(warns.length, 'small note')}.` : 'Everything checks out.';
      next = 'Vendor created in the master and the welcome message is ready.';
    }
    let risk = 0;
    // Risk reflects fraud/compliance exposure, not paperwork effort: vendor-fixable gaps score low.
    for (const r of fails) risk += r.severity === 'blocker' ? 70 : r.escalate ? 45 : 4;
    risk += warns.length * 2;
    risk = Math.min(100, risk);
    const checks = all.filter((r) => r.status !== 'info');
    st.decision = { status, sub, headline, next, risk, counts: { checks: checks.length, pass: checks.filter((r) => r.status === 'pass').length, warn: warns.length, fail: fails.length, skip: checks.filter((r) => r.status === 'skip').length }, blockers: blockers.map((r) => r.id), majors: majors.map((r) => r.id) };
    return [R('decision', status === 'approved' ? 'pass' : status === 'pending' ? 'warn' : 'fail', null, headline)];
  }

  /* -------- stage 7: communicate -------- */
  const addDays = (d, n) => new Date(d.getTime() + n * DAY);
  const wk = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  function stageCommunicate(st) {
    const d = st.decision, sub = st.sub, c = sub.company || {}, name = s(c.contactName) || 'there';
    // Bank-change notices go to the contact already on file, so address that person.
    const first = (st.bankChange ? s(st.bankChange.vendor.contactName) || name : name).split(' ')[0];
    const sign = `\nKind regards,\nVendor Onboarding\n${BUYER} Procurement`;
    const fails = st.findings.filter((r) => r.status === 'fail');
    const asks = [...new Set(fails.filter((r) => r.ask).map((r) => r.ask))];
    let vendor = null, internal = null, to = s(c.contactEmail);
    if (st.bankChange) to = s(st.bankChange.vendor.contactEmail) + '  (address on file, not the one in the submission)';
    const ref = st.caseId;

    if (d.status === 'approved') {
      const vid = 'V-' + (Math.max(1000, ...st.ctx.vendorMaster.map((v) => +v.id.replace(/\D/g, '') || 0)) + 1);
      st.vendorId = vid;
      vendor = { to, subject: `Welcome to ${BUYER}: you are approved (${vid})`, body: `Hi ${first},\n\nGood news: your supplier onboarding with ${BUYER} is approved. Your vendor ID is ${vid}.\n\nWhat happens next:\n  1. Quote ${vid} on every invoice and purchase order.\n  2. Payments follow your standard terms to the account ending ${maskAcct(st.bank.acct).slice(-4)}.\n  3. Send any future bank detail changes to this address. We will always confirm them by phone.\n${sign}` };
      internal = { to: 'Procurement Ops', priority: 'Low', subject: `${vid} created: ${s(c.legalName)}`, body: `Vendor approved automatically.\n${d.counts.pass} of ${d.counts.checks} checks passed${d.counts.warn ? `, ${d.counts.warn} note(s) logged:\n` + st.findings.filter((r) => r.status === 'warn').map((r) => `  - [${r.id}] ${r.message}`).join('\n') : '.'}\nNo action required.` };
    } else if (d.status === 'pending' && d.sub === 'awaiting_vendor') {
      vendor = { to, subject: `Action needed on your onboarding (ref ${ref})`, body: `Hi ${first},\n\nThanks for applying to become a supplier to ${BUYER}. We have reviewed your submission and need ${asks.length === 1 ? 'one thing' : plural(asks.length, 'thing')} before we can approve it:\n\n${asks.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}\n\nPlease reply to this email with the corrections by ${wk(addDays(st.now, 14))}. Quote ${ref} and we will re-check everything straight away.\n${sign}` };
      internal = { to: 'Procurement Ops', priority: 'Normal', subject: `${ref} waiting on vendor`, body: `Auto-requested ${plural(asks.length, 'item')} from ${s(c.legalName)}. Reminder scheduled for ${wk(addDays(st.now, 7))}. Case closes if no reply by ${wk(addDays(st.now, 14))}.\n${fails.map((r) => `  - [${r.id}] ${r.message}`).join('\n')}` };
    } else if (d.status === 'pending') {
      const simple = fails.filter((r) => !r.escalate && r.ask).map((r) => r.ask);
      const holding = st.bankChange ? st.findings.find((r) => r.id === 'R4').ask : null;
      const bankAsk = fails.find((r) => r.id === 'X1' && r.escalate);
      vendor = { to, subject: st.bankChange ? `We will call you to confirm your bank change (ref ${ref})` : `Your onboarding is under review (ref ${ref})`, body: `Hi ${first},\n\n${st.bankChange ? `We received a request to change the bank details for your ${BUYER} supplier account.` : `Thanks for your submission to ${BUYER}. It is with our review team and we may come back to you with a question.`}\n${holding ? '\n' + holding + '\n' : ''}${bankAsk ? '\nOne item is needed now:\n  1. ' + bankAsk.ask + '\n' : ''}${simple.length ? '\nIn the meantime please also send:\n' + simple.map((a, i) => `  ${i + 1}. ${a}`).join('\n') + '\n' : ''}${sign}` };
      const esc = fails.filter((r) => r.escalate);
      internal = { to: st.bankChange ? 'Fraud Risk / AP Controls' : 'Compliance', priority: 'High', subject: `${ref} needs review: ${s(c.legalName)}`, body: `${d.headline}\n\nWhy:\n${esc.map((r) => `  - [${r.id}] ${r.message}${r.internalNote ? '\n      Action: ' + r.internalNote : ''}`).join('\n')}${fails.filter((r) => !r.escalate).length ? '\n\nAlso failing (vendor can fix):\n' + fails.filter((r) => !r.escalate).map((r) => `  - [${r.id}] ${r.message}`).join('\n') : ''}\n\nRisk score ${d.risk}/100. Do not release any payment to this vendor until cleared.` };
    } else {
      vendor = { to, subject: `Your supplier application (ref ${ref})`, body: `Hi ${first},\n\nThank you for your interest in becoming a supplier to ${BUYER}. After review, we are unable to proceed with your application at this time and are not able to share further detail.\n${sign}` };
      internal = { to: 'Compliance', priority: 'Urgent', subject: `${ref} REJECTED: ${s(c.legalName) || 'unknown vendor'}`, body: `${d.headline}\n\n${fails.filter((r) => r.severity === 'blocker').map((r) => `  - [${r.id}] ${r.message}${r.internalNote ? '\n      Action: ' + r.internalNote : ''}`).join('\n')}\n\nThe vendor was sent a neutral closure notice that does not state the reason. Risk score ${d.risk}/100.` };
    }
    st.comms = { vendor, internal };
    return [R('communicate', 'pass', null, `Drafted ${vendor ? 'vendor message' : 'no vendor message'} and internal note for ${internal.to} (${internal.priority} priority)`)];
  }

  const STAGE_FNS = { intake: stageIntake, completeness: stageCompleteness, format: stageFormat, crossref: stageCrossRef, risk: stageRisk, decision: stageDecision, communicate: stageCommunicate };

  /* ============================ runner =========================== */
  function createRun(submission, ctx, opts = {}) {
    const sub = JSON.parse(JSON.stringify(submission || {}));
    const st = { sub, ctx, now: opts.now || new Date(), caseId: opts.caseId || 'C-0000', findings: [], stages: [], audit: [], idx: 0 };
    const t0 = Date.now();
    const log = (stage, event) => st.audit.push({ t: Date.now() - t0, stage, event });
    log('system', `Case ${st.caseId} opened, ruleset ${RULESET_VERSION}`);
    return {
      state: st,
      done: () => st.idx >= STAGES.length,
      next() {
        if (st.idx >= STAGES.length) return null;
        const meta = STAGES[st.idx++];
        const checks = STAGE_FNS[meta.id](st);
        if (!['decision', 'communicate'].includes(meta.id)) st.findings.push(...checks);
        const res = { ...meta, checks, ms: Date.now() - t0 };
        st.stages.push(res);
        for (const c of checks) log(meta.id, `${c.id} ${c.status.toUpperCase()}: ${c.message}`);
        if (meta.id === 'decision') log('decision', `Status ${st.decision.status.toUpperCase()} (risk ${st.decision.risk}/100)`);
        return res;
      },
      result() {
        return { caseId: st.caseId, submission: sub, stages: st.stages, findings: st.findings, decision: st.decision, comms: st.comms, audit: st.audit, vendorId: st.vendorId || null, bankAcct: st.bank ? st.bank.acct : '', taxValue: st.tax && st.tax.value ? st.tax.value : s(get(sub, 'tax.idValue')), matchedVendorId: st.matchedVendor ? st.matchedVendor.id : null, rulesetVersion: RULESET_VERSION, processedAt: st.now.toISOString() };
      },
    };
  }
  function runAll(submission, ctx, opts) { const r = createRun(submission, ctx, opts); while (!r.done()) r.next(); return r.result(); }

  /* ======================== generator helpers ==================== */
  const util = { gstinCheckChar, ukVatCheck, deVatCheck, abaCheckDigit, ibanCheckDigits, validateIban, nameSimilarity, fold, coreTokens };

  return { RULESET_VERSION, BUYER, STAGES, RULES, DOC_LABELS, REQUIRED_DOCS, TAX, createRun, runAll, util, cname, maskAcct };
})();
if (typeof module !== 'undefined') module.exports = Engine;
