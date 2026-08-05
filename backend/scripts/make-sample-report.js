// One-off generator for frontend/public/sample-report.pdf (T-1.6)
// Mirrors the structure of backend/utils/properPdfGenerator.js (9 sections, TOC,
// signature page) but with cautious draft language and a human review block
// instead of the auto-certification. All data is fictional.
const PDFDocument = require('pdfkit');
const fs = require('fs');

const OUT = require('path').join(__dirname, '../../frontend/public/sample-report.pdf');
const ORANGE = '#FD4403';
const NAVY = '#002A64';
const INK = '#0f172a';
const BODY = '#374151';
const MUTED = '#6b7280';

const doc = new PDFDocument({ size: 'LETTER', margins: { top: 56, bottom: 56, left: 56, right: 56 } });
doc.pipe(fs.createWriteStream(OUT));
const W = doc.page.width, M = 56, CW = W - M * 2;

const stamp = () => {
  // header band + SAMPLE watermark on every page
  doc.save();
  doc.rect(0, 0, W, 30).fill(NAVY);
  doc.fontSize(8).fillColor('white').font('Helvetica-Bold')
    .text('FLACRONAI — SAMPLE INSPECTION REPORT (FICTIONAL DATA, FOR DEMONSTRATION ONLY)', M, 11, { width: CW, align: 'center' });
  doc.rotate(-45, { origin: [W / 2, 400] })
    .fontSize(90).fillColor('#f3f4f6').font('Helvetica-Bold').opacity(0.5)
    .text('SAMPLE', W / 2 - 190, 360, { width: 380, align: 'center' });
  doc.opacity(1).rotate(45, { origin: [W / 2, 400] });
  doc.restore();
  doc.y = 56;
};

const h1 = (t) => {
  doc.fontSize(15).fillColor(INK).font('Helvetica-Bold').text(t, M, doc.y);
  doc.rect(M, doc.y + 4, CW, 2).fill(ORANGE);
  doc.y += 18; doc.x = M;
};
const p = (t, opts = {}) => {
  doc.fontSize(9.5).fillColor(BODY).font('Helvetica').text(t, M, doc.y, { width: CW, lineGap: 2.5, ...opts });
  doc.y += 8; doc.x = M;
};
const kv = (rows) => {
  rows.forEach(([k, v]) => {
    const y = doc.y;
    doc.fontSize(9.5).fillColor(MUTED).font('Helvetica-Bold').text(k, M, y, { width: 170 });
    doc.fontSize(9.5).fillColor(BODY).font('Helvetica').text(v, M + 175, y, { width: CW - 175 });
    doc.y = Math.max(doc.y, y + 14); doc.x = M;
  });
  doc.y += 6;
};
const newPage = () => { doc.addPage(); stamp(); };

// ── Title page ────────────────────────────────────────────────────────────
stamp();
doc.y = 150;
doc.fontSize(26).fillColor(NAVY).font('Helvetica-Bold').text('Property Inspection Report', M, doc.y, { width: CW, align: 'center' });
doc.y += 10;
doc.fontSize(13).fillColor(ORANGE).font('Helvetica-Bold').text('DRAFT — PENDING ADJUSTER REVIEW', M, doc.y, { width: CW, align: 'center' });
doc.y += 30;
kv([
  ['Claim Number', 'CLM-2024-WH-118 (sample)'],
  ['Insured', 'Patricia Johnson (fictional)'],
  ['Property Address', '4127 Meadowbrook Lane, Austin, TX 78745 (fictional)'],
  ['Date of Loss', 'March 22, 2024'],
  ['Loss Type', 'Wind / Hail'],
  ['Report Type', 'Initial Inspection — AI-assisted draft'],
  ['Prepared With', 'FlacronAI drafting assistant'],
  ['Status', 'Draft for review — not final until approved by a licensed adjuster'],
]);
doc.y += 16;
doc.fontSize(8.5).fillColor(MUTED).font('Helvetica-Oblique')
  .text('This sample document demonstrates the structure and language of a FlacronAI draft report. All names, addresses, observations, and figures are fictional. AI-drafted observations describe visible conditions only; they are not professional determinations of cause, coverage, or cost.', M, doc.y, { width: CW, lineGap: 2 });

// ── Sections ──────────────────────────────────────────────────────────────
newPage();
h1('Section 2: Insured Information');
kv([
  ['Named Insured', 'Patricia Johnson'],
  ['Contact', '(512) 555-0147 · p.johnson@example.com'],
  ['Mailing Address', 'Same as risk address'],
  ['Policy Number', 'HO-558214-TX (sample)'],
]);

h1('Section 3: Property Description');
p('Two-story colonial-style residence, reported as built in 2005, approximately 3,100 sq ft. Stucco exterior over wood-frame construction; composition shingle roof reported by the insured to be original (~19 years old). Attached three-car garage and covered rear patio. Property details are as reported at intake and should be verified against inspection notes and public records.');

h1('Section 4: Scope of Loss — Reported Cause (Unverified)');
p('The insured reports that a hailstorm on March 22, 2024 produced hail and strong wind gusts at the risk location. Weather data attached to the claim file (NOAA storm report, sample) appears consistent with the reported event. The observations in this draft describe visible conditions documented in inspection photos. This draft does not determine the cause of loss; cause, if disputed, should be established by the reviewing adjuster and, where appropriate, qualified specialists.');

newPage();
h1('Section 5: Damage Assessment — Visible Conditions');
p('Roof (all slopes): Photos show widespread granule displacement and circular impact marks across all documented slopes. The pattern appears consistent with hail impact. A full count was not performed in this draft; a shingle-level test square count by the inspecting adjuster is recommended before scope is finalized.');
p('Gutters & downspouts: Denting visible on photographed sections of all four elevations; two downspout sections appear separated at seams.');
p('Front elevation stucco: Surface cracking visible in multiple photographed locations. The images may show impact-related cracking; differentiation from pre-existing settlement cracking should be confirmed on site.');
p('HVAC condenser: Fin deformation visible on the photographed coil face. Operational impact cannot be assessed from photos; an HVAC technician evaluation is recommended.');
p('Skylights: Two of three photographed skylight units show visible cracking of the outer pane.');
p('Garage door: Denting visible across the photographed panels.');

h1('Section 6: Scope of Work — Draft for Review');
p('The following draft scope items correspond to the visible conditions above and are subject to adjuster revision: roof covering replacement (pending test-square confirmation); gutter and downspout replacement; stucco repair and repaint of affected areas; HVAC condenser evaluation and repair or replacement per technician findings; replacement of two skylight units; garage door panel replacement. Local permit and code requirements should be confirmed by the reviewing adjuster.');

newPage();
h1('Section 7: Estimated Loss Summary — Preliminary Draft');
p('The figures below are preliminary draft placeholders produced to structure the estimate. They are not a settlement recommendation and must be replaced or confirmed by the reviewing adjuster using current local pricing.');
const rows = [
  ['Category', 'Draft Basis', 'Preliminary Range'],
  ['Roofing', '4,200 sq ft composition, incl. underlayment', '$14,000 – $19,500'],
  ['Gutters / Downspouts', 'Full replacement, 4 elevations', '$1,600 – $2,400'],
  ['Stucco Repair & Paint', 'Front elevation affected areas', '$2,000 – $3,500'],
  ['HVAC', 'Per technician evaluation', 'TBD'],
  ['Skylights', '2 units, like kind & quality', '$1,400 – $2,200'],
  ['Garage Door', '3 panels', '$900 – $1,500'],
];
let ty = doc.y + 4;
rows.forEach((r, i) => {
  const bg = i === 0 ? NAVY : (i % 2 ? '#f8f8f8' : 'white');
  doc.rect(M, ty, CW, 20).fill(bg);
  doc.fontSize(8.5).fillColor(i === 0 ? 'white' : BODY).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica');
  doc.text(r[0], M + 8, ty + 6, { width: 130, lineBreak: false });
  doc.text(r[1], M + 145, ty + 6, { width: 220, lineBreak: false });
  doc.text(r[2], M + 372, ty + 6, { width: CW - 380, lineBreak: false });
  ty += 20;
});
doc.y = ty + 12; doc.x = M;
p('Coverage analysis is intentionally not included: whether this loss is covered is a determination made by the carrier under the policy, not by this report or by FlacronAI.');

h1('Section 8: Supporting Documentation');
p('In a live report this section lists the uploaded damage photos (up to 100 per report) with AI-generated captions describing visible conditions, plus any attached weather reports or invoices. Each photo caption is editable by the reviewing adjuster before the report is finalized.');

newPage();
h1('Section 9: Conclusion & Adjuster Notes');
p('This draft organizes the documented visible conditions, a proposed scope of work, and preliminary estimate placeholders for adjuster review. Items flagged above — test-square confirmation, HVAC technician evaluation, stucco crack differentiation, and local pricing — require professional confirmation before this report is finalized.');
doc.y += 10;

h1('Review & Approval');
p('FlacronAI drafts are not final reports. Every AI-drafted observation in this document is subject to review, editing, and approval by a licensed adjuster before the report is issued.');
doc.y += 24;
[['Reviewed & approved by (licensed adjuster)', M], ['Date', M + 320]].forEach(([label, x]) => {
  doc.rect(x, doc.y, x === M ? 280 : 140, 1).fill('#9ca3af');
  doc.fontSize(8).fillColor(MUTED).font('Helvetica').text(label, x, doc.y + 5);
});
doc.y += 44; doc.x = M;
doc.fontSize(8.5).fillColor(MUTED).font('Helvetica-Oblique')
  .text('Sample document. Fictional data throughout. Generated to demonstrate FlacronAI report structure and drafting language.', M, doc.y, { width: CW });

doc.end();
console.log('written:', OUT);
