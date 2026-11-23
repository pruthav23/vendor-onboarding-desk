// Runs every demo scenario through the engine and checks the verdicts. No dependencies: `node tests/run.js`.
const Engine = require('../src/engine.js'), Data = require('../src/data.js');
const now = new Date();
const ctx = () => ({ vendorMaster: Data.vendorMaster(), sanctions: Data.sanctions });
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const scenarios = Data.scenarios(now);
for (const sc of scenarios) {
  const r = Engine.runAll(sc.submission, ctx(), { now, caseId: 'C-T' });
  check(`${sc.key} ${sc.label} -> ${sc.expect}`, r.decision.status === sc.expect, `(got ${r.decision.status}/${r.decision.sub}, risk ${r.decision.risk})`);
}
// Resubmission: the corrected German vendor must be approved with no failures.
const s3 = scenarios.find((s) => s.key === 'S3');
const fixed = Engine.runAll(s3.corrected, ctx(), { now, caseId: 'C-T' });
check('S3 corrected resubmission -> approved, no failures', fixed.decision.status === 'approved' && fixed.findings.every((f) => f.status !== 'fail'));
// Message hygiene: a rejection must not reveal its reason to the vendor.
const s6 = Engine.runAll(scenarios.find((s) => s.key === 'S6').submission, ctx(), { now, caseId: 'C-T' });
check('S6 vendor email does not mention the watchlist', !/watchlist|sanction/i.test(s6.comms.vendor.body));
// Bank change: notice goes to the email already on file, not the submitted one.
const s4 = Engine.runAll(scenarios.find((s) => s.key === 'S4').submission, ctx(), { now, caseId: 'C-T' });
check('S4 notice goes to the address on file', s4.comms.vendor.to.startsWith('accounts@northwindlogistics.in'));

// Robustness: malformed input must never throw.
const garbage = [{}, { company: null, tax: 5, bank: 'x', documents: 'nope' }, { company: { country: 'ZZ' } }, { company: { country: 'IR', legalName: 'X' }, tax: {}, bank: {}, documents: [] }];
for (const [i, g] of garbage.entries()) { let ok = true; try { Engine.runAll(g, ctx(), { now, caseId: 'C-T' }); } catch (e) { ok = false; } check(`malformed input #${i + 1} does not throw`, ok); }

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
