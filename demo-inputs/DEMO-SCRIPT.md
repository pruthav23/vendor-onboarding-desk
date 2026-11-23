# PS-2 demo script (5 minutes)

How to show it: one browser window, the live link, zoom 100%, Speed on **Normal** so the stages are watchable. Click **Reset demo** first. Have the six JSON files in one folder. For each vendor: **Import JSON**, then **Run checks**. Don't read the screen aloud, say what it means.

The files: 1 clean vendor, 2 missing and wrong documents, 3 corrected reply to file 2, 4 bank in another company's name, 5 existing vendor changes bank, 6 account owned by another vendor.

## 0:00 Opening (20s) – no import yet
Show the page. "This is the onboarding desk a finance team would use. A vendor's details come in on the left, seven checks run live on the right, and every decision lands in the case list below. The rules decide, not an AI, so every outcome can be explained and audited. I'll show one clean case and four things that go wrong."

## 0:20 Real input (30s)
Type into the empty form for a few seconds: legal name, country, a tax ID. Press **Run checks** with most of it blank. "Anything missing is flagged, nothing slips through." Point at the red MISSING card and the single email drafted to the vendor. Then **Clear form**.

## 0:50 Happy path (45s) – file 1
Import, run. Narrate the stages as they tick: "intake, completeness, format checks like the GST checksum, then cross-reference: the bank account holder says 'PRIVATE LIMITED', the registration says 'Pvt. Ltd.' and it still matches. Risk checks against the vendor master and the watchlist." Verdict: Approved, risk low. Open **Email to the vendor** for two seconds.

## 1:35 Edge case A: vendor can fix it (60s) – files 2 then 3
Import 2, run. "Documents are missing or wrong. Instead of four emails over four days, the vendor gets one email listing everything." Point at the tagged cards (MISSING / INVALID / MISMATCH / OUTDATED) and open the vendor email. Click **Fix and resubmit**, Import 3, run. "The vendor replies with corrected documents. It links to the first case: Fixed 4 issues. Approved."

## 2:35 Edge case B: looks fine, isn't (60s) – file 4
Import 4, run. "Every format is valid, the tax ID is real, the documents are complete. But the bank account belongs to a different company. This is the classic payment-fraud shape, so it doesn't go back to the vendor: it goes to a person, and the vendor is told nothing about why." Open **Note for our team**.

## 3:35 Edge case C: bank change on an existing vendor (40s) – file 5
Import 5, run. "An existing vendor asks to change their bank details. The confirmation goes to the email and phone we already have on file, not the ones in the request, because that's what a fraudster would control."

## 4:15 Hard stop (25s) – file 6
Import 6, run. "Rejected: this account is already registered to another vendor. A hard rule, no negotiation."

## 4:40 Close (20s)
Scroll to **Cases**, click a row to show the full record. "Every case has its checks, the emails and an audit trail. Next I'd add inbound email and PDF intake, with AI only extracting fields from documents, and live GST, VIES and sanctions lookups. The decisions stay rule-based."

## If asked
- Where is AI? Deliberately not in the decision. It belongs in document extraction (PDF to fields) and in drafting wording, with a person approving anything fraud-related.
- Is the data real? No. Vendor master and watchlist are fictional demo data; nothing is emailed; data stays in the browser.
- Which countries? India, US, UK, Germany have full rules. Others go to a person.

## Before you record
- Open the live URL in a private window and run file 1 once to confirm it loads for someone else, then press Reset demo.
- The documents in the files are dated around 23 Nov 2026. Bank letters count as outdated after 90 days, so if you demo after about 20 Feb 2027, tell me and I'll regenerate the files.
- Record at 1080p with your voice only. If a run is slow, switch to Fast.
