const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const PDFDocument = require('pdfkit');

// PDF/DOCX photo + logo layout regression for the sharp 0.35.4 upgrade and
// the export-time image gate. Benign generated fixtures only; disallowed
// bytes (TIFF, AVIF relabelled as HEIC) must render the existing
// placeholder, never be decoded or embedded.
const { sharp } = require('../utils/safeImage');
const { generateDOCX } = require('../utils/documentGenerator');
const { generatePDF } = require('../utils/properPdfGenerator');

const EMU_PER_PX = 9525;
const MAX_SINGLE_WIDTH_PX = 400;

const report = (content) => ({
  claimNumber: 'CLM-LAYOUT-1',
  insuredName: 'Jane Doe',
  propertyAddress: '1 Main St',
  lossDate: '2026-01-01',
  lossType: 'Water',
  reportType: 'Initial',
  status: 'finalized',
  content,
});

let fx;
test.before(async () => {
  const img = (w, h, bg) => sharp({ create: { width: w, height: h, channels: 3, background: bg } });
  const avif = await img(16, 16, '#123456').avif().toBuffer();
  const relabelled = Buffer.from(avif);
  relabelled.write('heic', 8, 'latin1');
  fx = {
    wide: await img(800, 400, '#336699').png().toBuffer(),
    tall: await img(300, 600, '#993366').jpeg().toBuffer(),
    tiff: await img(64, 64, '#000000').tiff().toBuffer(),
    fakeHeic: relabelled,
    logo: await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer(),
  };
});

const docxParts = (buffer) => {
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml').asText();
  const media = Object.keys(zip.files).filter((n) => n.startsWith('word/media/'));
  const extents = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  return { xml, media, extents };
};

test('DOCX: allowed photos embed at their real aspect ratio within the column width; disallowed bytes render the placeholder', async () => {
  const buffer = await generateDOCX(
    report(
      '## Photos\n\n![[photo:wide|Wide]]\n\n![[photo:tall|Tall]]\n\n![[photo:tiff|Tiff]]\n\n![[photo:fakeheic|Fake HEIC]]'
    ),
    {
      photoMap: {
        wide: { buffer: fx.wide, mimeType: 'image/png' },
        tall: { buffer: fx.tall, mimeType: 'image/jpeg' },
        tiff: { buffer: fx.tiff, mimeType: 'image/jpeg' },
        fakeheic: { buffer: fx.fakeHeic, mimeType: 'image/heic' },
      },
    }
  );
  const { xml, media, extents } = docxParts(buffer);
  assert.equal(media.length, 2, 'only the two allowed photos are embedded');
  assert.equal((xml.match(/\[Photo unavailable\]/g) || []).length, 2);
  const [wide, tall] = extents;
  assert.equal(
    wide[0],
    MAX_SINGLE_WIDTH_PX * EMU_PER_PX,
    'wide photo is capped at the column width'
  );
  assert.equal(wide[0] / wide[1], 2, 'wide photo keeps 2:1');
  assert.equal(tall[0], 300 * EMU_PER_PX, 'narrow photo is not enlarged');
  assert.equal(tall[1] / tall[0], 2, 'tall photo keeps 1:2');
});

test('DOCX appendix: disallowed appendix bytes render the placeholder; allowed ones embed', async () => {
  const buffer = await generateDOCX(report('## Report\n\nBody.'), {
    appendixPhotos: [
      { buffer: fx.wide, mimeType: 'image/png', caption: 'ok' },
      { buffer: fx.tiff, mimeType: 'image/jpeg', caption: 'tiff' },
      { buffer: fx.fakeHeic, mimeType: 'image/heic', caption: 'fake' },
    ],
  });
  const { xml, media } = docxParts(buffer);
  assert.equal(media.length, 1);
  assert.ok((xml.match(/Photo unavailable/g) || []).length >= 2);
});

test('PDF: cover/header logo and appendix photos are placed with `fit` boxes inside the page; layouts 1/2/4 all render', async () => {
  const calls = [];
  const original = PDFDocument.prototype.image;
  PDFDocument.prototype.image = function spy(src, x, y, opts) {
    calls.push({
      x,
      y,
      opts: opts || {},
      pageWidth: this.page.width,
      pageHeight: this.page.height,
    });
    return original.call(this, src, x, y, opts);
  };
  try {
    for (const photoLayout of [1, 2, 4]) {
      calls.length = 0;
      const pdf = await generatePDF(report('## Report\n\nBody.'), {
        logoBuffer: fx.logo,
        includeCompanyBranding: true,
        photoLayout,
        appendixPhotos: [
          { buffer: fx.wide, mimeType: 'image/png', caption: 'Wide' },
          { buffer: fx.tall, mimeType: 'image/jpeg', caption: 'Tall' },
        ],
      });
      assert.equal(
        pdf.subarray(0, 5).toString('latin1'),
        '%PDF-',
        `layout ${photoLayout} produced a PDF`
      );
      assert.ok(
        calls.length >= 3,
        `layout ${photoLayout}: logo + 2 photos drawn (got ${calls.length})`
      );
      for (const c of calls) {
        assert.ok(Array.isArray(c.opts.fit), 'every image is bounded by a fit box');
        assert.ok(
          c.opts.width === undefined && c.opts.height === undefined,
          'fit is never combined with width/height'
        );
        const [fw, fh] = c.opts.fit;
        assert.ok(fw > 0 && fh > 0);
        assert.ok(
          c.x >= 0 && c.x + fw <= c.pageWidth + 0.5,
          `x-extent inside page (layout ${photoLayout})`
        );
        assert.ok(
          c.y >= 0 && c.y + fh <= c.pageHeight + 0.5,
          `y-extent inside page (layout ${photoLayout})`
        );
      }
    }
  } finally {
    PDFDocument.prototype.image = original;
  }
});
