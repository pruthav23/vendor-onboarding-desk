/* ---------------------------------------------------------------
   Demo data: vendor master, watchlist, and the test scenarios.
   All companies and people are fictional. Tax IDs and IBANs are
   checksum-valid on purpose, so failures are always intentional.
---------------------------------------------------------------- */
const Data = (() => {
  const iso = (d) => d.toISOString().slice(0, 10);
  const ago = (now, n) => iso(new Date(now.getTime() - n * 86400000));
  const ahead = (now, n) => iso(new Date(now.getTime() + n * 86400000));

  const sanctions = {
    names: ['Volga Shipping Holdings', 'Al Noor Petrochemical Trading', 'Baltic Crown Logistics'],
    countries: ['KP', 'IR', 'SY', 'CU'],
  };

  const vendorMaster = () => [
    { id: 'V-1001', legalName: 'Northwind Logistics Pvt Ltd', country: 'IN', taxId: '29AAECN3317F1ZL', bankAccount: '60481293015', contactName: 'Priya Menon', contactEmail: 'accounts@northwindlogistics.in', contactPhone: '+91 80 4012 3300', onboarded: '2024-03-18' },
    { id: 'V-1002', legalName: 'Bluepeak Consulting LLC', country: 'US', taxId: '36-4417289', bankAccount: '4402918836', contactName: 'Carla Whitfield', contactEmail: 'ap@bluepeakconsulting.com', contactPhone: '+1 646 555 0119', onboarded: '2023-09-02' },
    { id: 'V-1003', legalName: 'Hartmann Maschinenbau GmbH', country: 'DE', taxId: 'DE812345673', bankAccount: 'DE89370400440532013000', contactName: 'Stefan Hartmann', contactEmail: 'buchhaltung@hartmann-maschinenbau.de', contactPhone: '+49 89 5550 1180', onboarded: '2022-11-30' },
    { id: 'V-1004', legalName: 'Kestrel Office Supplies Ltd', country: 'GB', taxId: 'GB123456782', bankAccount: 'GB29NWBK60161331926819', contactName: 'Helen Foster', contactEmail: 'accounts@kestreloffice.co.uk', contactPhone: '+44 20 7946 0321', onboarded: '2025-01-14' },
  ];

  function scenarios(now = new Date()) {
    /* ---- S0 happy path: India, clean ---- */
    const s0 = {
      company: { legalName: 'Meridian Components Pvt. Ltd.', tradeName: '', country: 'IN', registrationNumber: 'U29299MH2016PTC284175', address: { line: 'Plot 14, MIDC Industrial Area, Chakan', city: 'Pune', postal: '410501', country: 'IN' }, website: 'meridiancomponents.in', contactName: 'Anita Deshmukh', contactEmail: 'accounts@meridiancomponents.in', contactPhone: '+91 98765 43210' },
      tax: { idType: 'GSTIN', idValue: '27AABCM4821K1ZF', pan: 'AABCM4821K' },
      bank: { accountHolderName: 'MERIDIAN COMPONENTS PRIVATE LIMITED', bankName: 'HDFC Bank', accountNumber: '50200041873562', ifsc: 'HDFC0001234' },
      documents: [
        { type: 'certificate_of_incorporation', filename: 'coi_meridian.pdf', issuedTo: 'Meridian Components Private Limited', issueDate: '2016-08-12' },
        { type: 'gst_certificate', filename: 'gst_reg.pdf', issuedTo: 'MERIDIAN COMPONENTS PRIVATE LIMITED', taxId: '27AABCM4821K1ZF', issueDate: '2019-04-03' },
        { type: 'pan_card', filename: 'pan.pdf', issuedTo: 'MERIDIAN COMPONENTS PRIVATE LIMITED', taxId: 'AABCM4821K', issueDate: '2016-09-01' },
        { type: 'cancelled_cheque', filename: 'cheque.jpg', issuedTo: 'MERIDIAN COMPONENTS PRIVATE LIMITED', accountNumber: '50200041873562', issueDate: ago(now, 20) },
      ],
    };

    /* ---- S1 approved with notes: US, bank in trade name, free-mail contact ---- */
    const s1 = {
      company: { legalName: 'Brightwave Analytics Inc.', tradeName: 'Brightwave Studio', country: 'US', registrationNumber: 'DE-6120934', address: { line: '2210 Mission Street, Suite 4', city: 'San Francisco', postal: '94110', country: 'US' }, website: 'brightwave.io', contactName: 'Maya Lindqvist', contactEmail: 'maya.brightwave@gmail.com', contactPhone: '+1 415 555 0142' },
      tax: { idType: 'EIN', idValue: '47-2918364' },
      bank: { accountHolderName: 'Brightwave Studio', bankName: 'Mercury', routingNumber: '071000136', accountNumber: '8802153377' },
      documents: [
        { type: 'w9', filename: 'w9_brightwave.pdf', issuedTo: 'Brightwave Analytics Inc.', taxId: '47-2918364', issueDate: ago(now, 40) },
        { type: 'bank_letter', filename: 'mercury_letter.pdf', issuedTo: 'Brightwave Studio', accountNumber: '8802153377', issueDate: ago(now, 30) },
      ],
    };

    /* ---- S2 edge: bank account held by a different company ---- */
    const s2 = {
      company: { legalName: 'Orion Freight Solutions LLC', tradeName: '', country: 'US', registrationNumber: 'IL-0897114', address: { line: '400 W Erie Street, Floor 6', city: 'Chicago', postal: '60654', country: 'US' }, website: 'orionfreight.com', contactName: 'Daniel Ruiz', contactEmail: 'daniel@orionfreight.com', contactPhone: '+1 312 555 0187' },
      tax: { idType: 'EIN', idValue: '84-3920157' },
      bank: { accountHolderName: 'Delta Marine Holdings Ltd', bankName: 'First Midwest Bank', routingNumber: '061000010', accountNumber: '6670142298' },
      documents: [
        { type: 'w9', filename: 'w9_orion.pdf', issuedTo: 'Orion Freight Solutions LLC', taxId: '84-3920157', issueDate: ago(now, 12) },
        { type: 'bank_letter', filename: 'bank_letter.pdf', issuedTo: 'Delta Marine Holdings Ltd', accountNumber: '6670142298', issueDate: ago(now, 12) },
      ],
    };

    /* ---- S3 edge: incomplete + wrong documents, typo in tax ID (then corrected) ---- */
    const s3 = {
      company: { legalName: 'Kellner Präzisionstechnik GmbH', tradeName: '', country: 'DE', registrationNumber: 'HRB 748291', address: { line: 'Industriestraße 22', city: 'Stuttgart', postal: '70565', country: 'DE' }, website: 'kellner-praezision.de', contactName: 'Jonas Becker', contactEmail: 'j.becker@kellner-praezision.de', contactPhone: '+49 711 5550 2301' },
      tax: { idType: 'USt-IdNr', idValue: 'DE298475318' },
      bank: { accountHolderName: 'Kellner Praezisionstechnik GmbH', bankName: 'Commerzbank', iban: 'DE44500105175407324931' },
      documents: [
        { type: 'vat_certificate', filename: 'ustid_bestaetigung.pdf', issuedTo: 'Kellner Präzisionstechnik GmbH', taxId: 'DE298475317', issueDate: '2021-03-04' },
        { type: 'certificate_of_incorporation', filename: 'incorporation.pdf', issuedTo: 'Kellner Präzisionstechnik GmbH', issueDate: '2014-06-18' },
        { type: 'bank_letter', filename: 'commerzbank_letter.pdf', issuedTo: 'Kellner Praezisionstechnik GmbH', accountNumber: 'DE44500105175407324931', issueDate: ago(now, 140) },
      ],
    };
    const s3fix = JSON.parse(JSON.stringify(s3));
    s3fix.tax.idValue = 'DE298475317';
    s3fix.documents = [
      s3fix.documents[0],
      { type: 'trade_register_extract', filename: 'hr_auszug.pdf', issuedTo: 'Kellner Präzisionstechnik GmbH', issueDate: ago(now, 14) },
      { type: 'bank_letter', filename: 'commerzbank_letter_new.pdf', issuedTo: 'Kellner Praezisionstechnik GmbH', accountNumber: 'DE44500105175407324931', issueDate: ago(now, 4) },
    ];

    /* ---- S4 edge: existing vendor changes bank details ---- */
    const s4 = {
      company: { legalName: 'Northwind Logistics Pvt Ltd', tradeName: '', country: 'IN', registrationNumber: 'U63090KA2011PTC059912', address: { line: '88 Whitefield Main Road', city: 'Bengaluru', postal: '560066', country: 'IN' }, website: 'northwindlogistics.in', contactName: 'Rohit Nair', contactEmail: 'rohit.nair@northwind-logistics.co', contactPhone: '+91 90000 11122' },
      tax: { idType: 'GSTIN', idValue: '29AAECN3317F1ZL', pan: 'AAECN3317F' },
      bank: { accountHolderName: 'Northwind Logistics Private Limited', bankName: 'Axis Bank', accountNumber: '917020058812344', ifsc: 'UTIB0000456' },
      documents: [
        { type: 'certificate_of_incorporation', filename: 'coi.pdf', issuedTo: 'Northwind Logistics Private Limited', issueDate: '2011-02-21' },
        { type: 'gst_certificate', filename: 'gst.pdf', issuedTo: 'NORTHWIND LOGISTICS PRIVATE LIMITED', taxId: '29AAECN3317F1ZL', issueDate: '2018-07-02' },
        { type: 'pan_card', filename: 'pan.pdf', issuedTo: 'NORTHWIND LOGISTICS PRIVATE LIMITED', taxId: 'AAECN3317F', issueDate: '2011-03-10' },
        { type: 'cancelled_cheque', filename: 'new_cheque.jpg', issuedTo: 'NORTHWIND LOGISTICS PRIVATE LIMITED', accountNumber: '917020058812344', issueDate: ago(now, 9) },
      ],
    };

    /* ---- S5 edge: account already belongs to another vendor ---- */
    const s5 = {
      company: { legalName: 'Cobalt Ridge Services LLC', tradeName: '', country: 'US', registrationNumber: 'TX-1930228', address: { line: '1500 Commerce Drive', city: 'Austin', postal: '78744', country: 'US' }, website: 'cobaltridgeservices.com', contactName: 'Tom Reyes', contactEmail: 'tom@cobaltridgeservices.com', contactPhone: '+1 512 555 0163' },
      tax: { idType: 'EIN', idValue: '82-5530916' },
      bank: { accountHolderName: 'Cobalt Ridge Services LLC', bankName: 'Chase', routingNumber: '071000136', accountNumber: '4402918836' },
      documents: [
        { type: 'w9', filename: 'w9.pdf', issuedTo: 'Cobalt Ridge Services LLC', taxId: '82-5530916', issueDate: ago(now, 6) },
        { type: 'bank_letter', filename: 'chase_letter.pdf', issuedTo: 'Cobalt Ridge Services LLC', accountNumber: '4402918836', issueDate: ago(now, 6) },
      ],
    };

    /* ---- S6 bonus: watchlist hit, everything else clean ---- */
    const s6 = {
      company: { legalName: 'Volga Shipping Holdings Limited', tradeName: '', country: 'GB', registrationNumber: '09871234', address: { line: '14 Harbour Quay', city: 'Southampton', postal: 'SO14 3QT', country: 'GB' }, website: 'volgashipping.co.uk', contactName: 'Alex Morrow', contactEmail: 'alex.morrow@volgashipping.co.uk', contactPhone: '+44 23 8055 0144' },
      tax: { idType: 'VAT', idValue: 'GB987654353' },
      bank: { accountHolderName: 'Volga Shipping Holdings Limited', bankName: 'Barclays', iban: 'GB56BARC20000040122534' },
      documents: [
        { type: 'certificate_of_incorporation', filename: 'coi.pdf', issuedTo: 'Volga Shipping Holdings Limited', issueDate: '2015-05-20' },
        { type: 'vat_certificate', filename: 'vat.pdf', issuedTo: 'Volga Shipping Holdings Limited', taxId: 'GB987654353', issueDate: '2016-01-11' },
        { type: 'bank_letter', filename: 'barclays_letter.pdf', issuedTo: 'Volga Shipping Holdings Limited', accountNumber: 'GB56BARC20000040122534', issueDate: ago(now, 18) },
      ],
    };

    return [
      { key: 'S0', kind: 'happy', label: 'Clean submission', short: 'Everything checks out.', blurb: 'Indian company, every field and document consistent. Bank holder is written differently (PRIVATE LIMITED vs Pvt. Ltd.) and should still match.', expect: 'approved', submission: s0 },
      { key: 'S1', kind: 'happy', label: 'Approved with notes', short: 'Fine, with two small notes.', blurb: 'US company whose bank account is in its declared trade name, with a free-mail contact. Approved, but both facts are logged.', expect: 'approved', submission: s1 },
      { key: 'S2', kind: 'edge', label: 'Bank in another company\u2019s name', short: 'Account holder is a different company.', blurb: 'Everything is valid except the account holder, a different company. Looks fine on the surface, a payment-diversion pattern underneath.', expect: 'pending', submission: s2 },
      { key: 'S3', kind: 'edge', label: 'Missing and wrong documents', short: 'Typo, missing and outdated documents.', blurb: 'German vendor with a mistyped VAT ID, a missing trade register extract, and a 140-day-old bank letter. One clear request goes back to the vendor, then a corrected resubmission.', expect: 'pending', submission: s3, corrected: s3fix },
      { key: 'S4', kind: 'edge', label: 'Existing vendor changes bank', short: 'Known vendor submits a new bank account.', blurb: 'A known vendor (V-1001) submits a new bank account from a new email domain and phone. Held for a callback to the number on file.', expect: 'pending', submission: s4 },
      { key: 'S5', kind: 'edge', label: 'Account owned by another vendor', short: 'Bank account is already used by a vendor.', blurb: 'A new US vendor lists the exact account that V-1002 already owns. Names and documents look consistent, only the registry check catches it.', expect: 'rejected', submission: s5 },
      { key: 'S6', kind: 'bonus', label: 'Watchlist hit', short: 'Company name is on a sanctions list.', blurb: 'UK company that is otherwise perfect but matches a sanctions watchlist entry. The vendor gets a neutral closure notice with no reason.', expect: 'rejected', submission: s6 },
    ];
  }

  return { sanctions, vendorMaster, scenarios };
})();
if (typeof module !== 'undefined') module.exports = Data;
