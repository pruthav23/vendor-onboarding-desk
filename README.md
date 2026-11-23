# Vendor Onboarding Desk

A working process that takes a vendor's onboarding submission, checks it, and decides **approved**, **pending** or **rejected**, with the reasons. It runs live (seven stages you can watch), keeps a dashboard of every case, and drafts the message to the vendor and a note for the internal team.

**Live demo:** https://pruthav23.github.io/vendor-onboarding-desk/

## Try it

1. Open the demo (or `index.html` locally, no server needed).
2. On **Process**, pick an example, or switch to **Form** to fill in a vendor yourself, or upload a JSON file. Press **Run**.
3. Open **case history** for every case, and **How it works** for the rules.

Good first runs: *Clean submission*, then *Missing and wrong documents* followed by **Simulate the vendor's corrected reply**.

## What it does

```
submission -> intake -> completeness -> format -> cross-reference -> risk checks -> decision -> vendor email + team note
```

| Outcome | When |
|---|---|
| Rejected | A hard rule fails: watchlist, duplicate vendor, or a bank account owned by another vendor. The vendor gets a neutral notice with no reason. |
| Pending | Something is wrong. Either the vendor can fix it (one combined request is sent) or a person must review it. |
| Approved | No failures. Small observations are logged as notes. |

### Rules (19)

| ID | Check | If it fails |
|---|---|---|
| I1 | Submission is well-formed | Ask the vendor |
| I2 | Country ruleset available | Send to a person |
| I3 | Names normalised | Note only |
| C1 | Required fields present | Ask the vendor |
| C2 | Required documents attached | Ask the vendor |
| F1 | Tax ID valid for the country | Ask the vendor |
| F2 | Bank details valid | Ask the vendor |
| F3 | Contact details plausible | Ask the vendor |
| X1 | Legal name matches bank account holder | Send to a person |
| X2 | Country consistent across the submission | Ask the vendor |
| X3 | PAN embedded in GSTIN matches PAN provided | Ask the vendor |
| X4 | Documents issued to this vendor | Ask the vendor |
| X5 | Tax ID on documents matches submission | Ask the vendor |
| X6 | Bank document matches bank details | Ask the vendor |
| X7 | Documents are current | Ask the vendor |
| R1 | Sanctions and jurisdiction screening | Reject |
| R2 | Not already in the vendor master | Reject |
| R3 | Bank account not owned by another vendor | Reject |
| R4 | Bank change request on existing vendor | Send to a person |

### Example submissions

| Example | Expected | Shows |
|---|---|---|
| Clean submission | approved | Everything checks out. |
| Approved with notes | approved | Fine, with two small notes. |
| Bank in another company’s name | pending | Account holder is a different company. |
| Missing and wrong documents | pending | Typo, missing and outdated documents. |
| Existing vendor changes bank | pending | Known vendor submits a new bank account. |
| Account owned by another vendor | rejected | Bank account is already used by a vendor. |
| Watchlist hit | rejected | Company name is on a sanctions list. |

## Design choices

- **Rules decide, not a model.** Every verdict traces to a rule and its evidence, so it can be audited. A model belongs upstream (reading PDFs into fields) and in polishing wording.
- **The vendor is asked once per round.** All fixable problems go in one message, and overlapping asks are merged.
- **Fraud-shaped issues go to a person.** A bank account in another company's name, or a bank change on a known vendor, are held for review. For a bank change the callback goes to the phone number on file, never the one in the new submission.
- **Rejections never tell the vendor why.**
- **Risk score measures fraud and compliance exposure, not paperwork effort.** A blocker adds 70, an issue needing review 45, a vendor-fixable gap 4, a note 2.

## Assumptions and limits

- Documents arrive as already-extracted fields (type, name, tax ID, account, dates). In production an OCR or LLM step would produce them.
- Full rules for India (GSTIN, PAN, IFSC), the US (EIN, ABA routing), the UK (VAT, IBAN) and Germany (USt-IdNr, IBAN). Other countries are routed to a person.
- Names match at 90% or more, partially at 70 to 90%. Bank letters must be under 90 days old. Vendors have 14 days to reply.
- The vendor master (4 vendors) and sanctions list (3 names, 4 countries) are fictional demo data, as are all companies, tax IDs and IBANs.
- Nothing is emailed, and everything runs in the browser. Cases are kept in that browser's local storage.

## Project layout

```
index.html        built single-file app (this is what is served)
src/engine.js     rule engine, pure JavaScript, no dependencies
src/data.js       demo vendor master, watchlist and example submissions
src/app.js        UI: process, form, live run, dashboard
src/template.html page shell and styles
build.js          bundles src/ into index.html
tests/run.js      checks every example's verdict and handles malformed input
```

## Develop

```
npm run build   # regenerate index.html from src/
npm test        # run the checks (Node 18+, no dependencies)
```

## Next steps

Inbound email and PDF intake with reply threading; an AI extraction step for uploaded documents; live registry checks (GST portal, VIES, IRS TIN matching, a real sanctions feed); a reviewer queue for held cases; per-customer policy settings.
