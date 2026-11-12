// Export-time content passes, applied to an in-memory copy of `report.content`
// right before PDF/DOCX/HTML generation (the stored content is never changed).
//
// 1. applyReviewedWording -- deterministic document builders (invoice,
//    repair estimate, coverage letter, mold supplement, AI narrative footers)
//    bake DRAFT/PENDING-REVIEW banners into the content when it is generated.
//    Once a licensed reviewer has approved the report, those banners
//    contradict the FINALIZED cover (QA FAI-001). Only the *status* wording is
//    swapped; the standing legal disclaimers (AI never decides a dollar
//    amount / coverage / not a certified assessment) are kept verbatim.
//    Un-reviewed content is returned unchanged -- the draft wording stays.
//
// 2. normalizeExportMarkdown -- maps Markdown the export renderers don't
//    draw onto syntax they do (QA FAI-005: a leading `>` and literal
//    underscores in the Mold Supplement PDF):
//      `> text`          -> `*text*`  (blockquote notice -> italic paragraph)
//      `__text__`        -> `**text**`
//      `_text_`          -> `*text*`  only with word-boundary flanking, so
//                           snake_case identifiers and `______` signature
//                           lines are left alone.

const REVIEWED_REPLACEMENTS = [
  // Invoice
  [
    /\*\*SAMPLE VALUES SHOWN ARE ADJUSTER\/CONTRACTOR-ENTERED — DRAFT, PENDING REVIEW\*\*/g,
    '**VALUES SHOWN ARE ADJUSTER/CONTRACTOR-ENTERED — REVIEWED & APPROVED**',
  ],
  [
    /This is a Super Intelligence-assisted DRAFT invoice\. (.*?) This is not a request for payment until reviewed and approved\. Not a final document until reviewed and approved by a licensed adjuster\./g,
    'This Super Intelligence-assisted invoice has been reviewed and approved through FlacronAI\'s approval step. $1',
  ],
  // Repair estimate
  [/\*\*DRAFT — PRELIMINARY PRICING, PENDING ADJUSTER CONFIRMATION\*\*/g, '**PRICING REVIEWED & APPROVED BY THE REVIEWING ADJUSTER**'],
  [/TOTAL ESTIMATE \(Draft\)/g, 'TOTAL ESTIMATE'],
  [/^## DEPRECIATION SCHEDULE \(DRAFT\)$/gm, '## DEPRECIATION SCHEDULE'],
  [
    /This is a Super Intelligence-assisted DRAFT repair estimate\. (.*?) Not a final report until reviewed and approved by a licensed adjuster\./g,
    'This Super Intelligence-assisted repair estimate has been reviewed and approved through FlacronAI\'s approval step. $1',
  ],
  [
    /The quantities, rates, and percentages entered into this draft should be confirmed by a licensed estimator or adjuster before use in a final settlement\./g,
    'The quantities, rates, and percentages in this estimate were entered and reviewed by the preparing adjuster/estimator.',
  ],
  // Coverage determination letter
  [/\*\*DRAFT — ADJUSTER-ENTERED, PENDING FINAL APPROVAL\*\*/g, '**ADJUSTER-ENTERED — REVIEWED & APPROVED**'],
  // Mold supplement banner (the "not a certified mold assessment" disclaimer is kept)
  [
    /^> DRAFT — PENDING ADJUSTER & ASSESSOR REVIEW\. Prepared with the FLACRON ENGINE for review and approval by a licensed insurance adjuster\./gm,
    '> REVIEWED & APPROVED BY THE REVIEWING ADJUSTER. Prepared with the FLACRON ENGINE.',
  ],
  // Narrative scope-of-work headings (Commercial / Flood / Theft)
  [/^(## SECTION \d+[A-Z]?: SCOPE OF WORK) — DRAFT FOR REVIEW$/gm, '$1'],
  // Generation footer shared by every AI narrative template
  [
    /^\*Automated draft prepared by FlacronAI for licensed-adjuster review \| ([^*]+)\*$/gm,
    '*Prepared with FlacronAI ($1); reviewed and approved by the reviewing adjuster.*',
  ],
];

const applyReviewedWording = (content, reviewed) => {
  if (!reviewed || !content) return content || '';
  return REVIEWED_REPLACEMENTS.reduce((text, [re, replacement]) => text.replace(re, replacement), String(content));
};

// Lines the renderers treat as structure (tables, photo tokens) are left as-is.
const isStructuralLine = (line) => /^\s*\|/.test(line) || /^\s*!\[\[photo:/.test(line) || /^\s*\[\[/.test(line);

const normalizeInlineUnderscores = (line) =>
  line
    .replace(/(^|[\s(\[])__(?=\S)([^_\n]+?)(?<=\S)__(?=$|[\s.,;:!?)\]])/g, '$1**$2**')
    .replace(/(^|[\s(\[])_(?=\S)([^_\n]+?)(?<=\S)_(?=$|[\s.,;:!?)\]])/g, '$1*$2*');

const normalizeExportMarkdown = (content) =>
  String(content || '')
    .split('\n')
    .map((line) => {
      if (isStructuralLine(line)) return line;
      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        const inner = normalizeInlineUnderscores(quote[1].trim());
        if (!inner) return '';
        // Already fully emphasised (e.g. "*...*") -- don't double-wrap.
        return /^\*.*\*$/.test(inner) ? inner : `*${inner}*`;
      }
      return normalizeInlineUnderscores(line);
    })
    .join('\n');

const prepareExportContent = (content, { reviewed }) => normalizeExportMarkdown(applyReviewedWording(content, reviewed));

module.exports = { applyReviewedWording, normalizeExportMarkdown, prepareExportContent };

// QA POT-03: `versionApproved` counts version-history entries (every edit and
// approval), while Invoice / Repair Estimate / Coverage Letter documents also
// carry their own document revision ("Rev. 2"). Label both so the two
// independent counters can't be read as contradicting each other.
const approvedVersionLabel = (report = {}) => {
  const hasRevision = report.revision !== undefined && report.revision !== null && report.documentType;
  const entry = report.versionApproved ? `history entry #${report.versionApproved}` : '';
  if (hasRevision) return [`Rev. ${report.revision}`, entry && `(${entry})`].filter(Boolean).join(' ');
  return entry ? `Version ${report.versionApproved} (${entry})` : '';
};

module.exports.approvedVersionLabel = approvedVersionLabel;
