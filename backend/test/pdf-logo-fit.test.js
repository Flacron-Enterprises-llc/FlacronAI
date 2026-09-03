const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const { generatePDF } = require('../utils/properPdfGenerator');

// Regression coverage for Issue 9 (cover-page logo overlapping the company
// name / report title). Root cause: pdfkit's `image()` treats `width` and
// `height` as mutually exclusive with `fit` -- if either is passed alongside
// `fit`, `fit` is silently ignored and the image is scaled by that single
// dimension only, with no cap on the other. A logo whose aspect ratio isn't
// a wide landscape (a square mark, or a stacked mark+wordmark+company-name
// lockup like the one in the bug report) then renders far taller than the
// ~50pt budget the cover page reserves for it, running straight into the
// text below.
//
// This spies on PDFDocument.prototype.image to capture the exact options
// properPdfGenerator.js passes for the logo, so it fails again if a
// conflicting width/height is ever reintroduced -- independent of pdfkit's
// internal behavior, which is exercised by the smoke test at the bottom.

const minimalReport = {
  claimNumber: 'CLM-1',
  insuredName: 'Jane Doe',
  propertyAddress: '1 Main St',
  lossDate: '2026-01-01',
  lossType: 'Water',
  reportType: 'Initial',
  status: 'draft',
  content: '## Report Info\n\nSample content.',
};

test('cover and header logo are sized with `fit` alone, never combined with a conflicting width/height', async () => {
  // A square (1:1) logo is the worst case: scaling it to the 100pt-wide
  // cover box by width alone (pdfkit's buggy fallback) would render it 100pt
  // tall -- double the ~50pt the layout actually reserves.
  const squareLogo = await sharp({
    create: { width: 200, height: 200, channels: 4, background: { r: 253, g: 68, b: 3, alpha: 1 } },
  })
    .png()
    .toBuffer();

  const calls = [];
  const originalImage = PDFDocument.prototype.image;
  PDFDocument.prototype.image = function patchedImage(src, x, y, opts) {
    if (src === squareLogo) calls.push(opts);
    return originalImage.call(this, src, x, y, opts);
  };

  let pdfBuffer;
  try {
    pdfBuffer = await generatePDF(minimalReport, {
      companyName: 'Example Firm',
      logoBuffer: squareLogo,
      includeCompanyBranding: true,
    });
  } finally {
    PDFDocument.prototype.image = originalImage;
  }

  assert.ok(pdfBuffer.length > 0);
  // The logo is drawn twice: once on the cover, once in the running header
  // of every content page.
  assert.ok(calls.length >= 2, `expected the logo to be drawn at least twice, got ${calls.length}`);
  for (const opts of calls) {
    assert.ok(opts.fit, 'logo must be sized via `fit` so both dimensions stay bounded and its aspect ratio is preserved');
    assert.equal(opts.width, undefined, '`width` must not be combined with `fit` -- pdfkit silently drops `fit` when width is also set');
    assert.equal(opts.height, undefined, '`height` must not be combined with `fit` -- pdfkit silently drops `fit` when height is also set');
  }
});

test('a report with no uploaded logo still generates a clean cover page (default FlacronAI branding)', async () => {
  const pdfBuffer = await generatePDF(minimalReport, { companyName: 'Example Firm' });
  assert.ok(pdfBuffer.length > 0);
});
