const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { PDFDocument } = require('pdf-lib');
const reportsRouter = require('../routes/reports');
const { generateDOCX } = require('../utils/documentGenerator');
const { generatePDF } = require('../utils/properPdfGenerator');

// Incident fix (repeated PDF/DOCX/HTML export failures): these tests exercise
// the new failure-isolation (a single corrupt/unsupported photo must not
// crash the whole export) and the duplicate-export concurrency guard added to
// POST /:id/export. There's no HTTP-level test harness in this codebase
// (every export/report test calls exported functions directly against real
// Firestore-shaped plain objects -- see exports.test.js / rich-export.test.js),
// so the same pattern is followed here: call the generators directly, and
// exercise the lock primitives via `router._test` (see reports.js's `_test`
// export).

const onePxJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64'
);

// Deliberately not a decodable image of any kind -- simulates a corrupt
// upload or a truncated/failed Storage download that still produced *some*
// bytes. Both sharp (DOCX path) and PDFKit's image parser (PDF path) must
// reject this synchronously.
const corruptImageBuffer = Buffer.from('this is not an image, just plain bytes', 'utf8');

const baseReport = {
  claimNumber: 'CLM-INCIDENT-1',
  insuredName: 'Jane Doe',
  propertyAddress: '1 Test Way',
  lossDate: '2026-08-01',
  lossType: 'Water',
  status: 'draft',
  content: `# INSURANCE INSPECTION REPORT

![[photo:good|Good photo]]
![[photo:bad|Corrupt photo]]

## SECTION 1: REPORT INFO
- Report Type: Initial
`,
};

const mixedPhotoMap = {
  good: { buffer: onePxJpeg, mimeType: 'image/jpeg' },
  bad: { buffer: corruptImageBuffer, mimeType: 'image/jpeg' },
};

const mixedAppendixPhotos = [
  { buffer: onePxJpeg, mimeType: 'image/jpeg', caption: 'Good appendix photo', location: 'Kitchen', observation: 'Visible staining on the ceiling.' },
  { buffer: corruptImageBuffer, mimeType: 'image/jpeg', caption: 'Corrupt appendix photo', location: 'Bathroom', observation: null },
  { buffer: onePxJpeg, mimeType: 'image/jpeg', caption: 'Another good photo', location: 'Hallway', observation: null },
];

test('DOCX: a corrupt/undecodable inline photo does not crash the export -- the good photo still embeds, the bad one shows a placeholder', async () => {
  const buf = await generateDOCX(baseReport, { photoMap: mixedPhotoMap });
  const zip = new PizZip(buf);
  const documentXml = zip.file('word/document.xml').asText();

  // Good photo embedded as a real drawing; corrupt one degrades to text,
  // never raw undecodable bytes written into the .docx.
  const drawingCount = (documentXml.match(/<w:drawing>/g) || []).length;
  assert.equal(drawingCount, 1, 'only the good photo produced a <w:drawing> element');
  assert.match(documentXml, /Photo unavailable/, 'the corrupt photo renders the existing placeholder');

  // Only one media part was registered (for the good photo) -- the corrupt
  // buffer must never reach word/media/*.
  const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
  assert.equal(media.length, 1);
});

test('DOCX: a corrupt/undecodable appendix photo does not crash the export -- surrounding good photos still embed with a placeholder in between', async () => {
  const buf = await generateDOCX(
    { ...baseReport, content: '## SECTION 1: X\nNo inline photos here.' },
    { appendixPhotos: mixedAppendixPhotos, photoLayout: 1, includePhotoCaptions: true }
  );
  const zip = new PizZip(buf);
  const documentXml = zip.file('word/document.xml').asText();

  const drawingCount = (documentXml.match(/<w:drawing>/g) || []).length;
  assert.equal(drawingCount, 2, 'the two good appendix photos embed; the corrupt one does not');
  assert.match(documentXml, /Photo unavailable/, 'the corrupt appendix photo renders a placeholder, not broken bytes');
  assert.match(documentXml, /Good appendix photo/);
  assert.match(documentXml, /Another good photo/);

  const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
  assert.equal(media.length, 2, 'only the two decodable photos were written as media parts');
});

test('PDF: a corrupt/undecodable photo (inline or appendix) does not crash generation -- output is still a valid, readable multi-page PDF', async () => {
  const buf = await generatePDF(baseReport, {
    photoMap: mixedPhotoMap,
    appendixPhotos: mixedAppendixPhotos,
  });
  const pdf = await PDFDocument.load(buf);
  assert.ok(pdf.getPageCount() >= 4, 'generation completed and produced a real multi-page document');
});

test('export concurrency guard: a second export for the same report+format is rejected while the first is in flight', () => {
  const { acquireExportLock, releaseExportLock, activeExports } = reportsRouter._test;
  const key = 'report-abc:pdf';
  activeExports.delete(key); // isolate from any leftover state

  assert.equal(acquireExportLock(key), true, 'first acquire succeeds');
  assert.equal(acquireExportLock(key), false, 'a concurrent duplicate is rejected, not silently allowed through');

  releaseExportLock(key);
  assert.equal(acquireExportLock(key), true, 'released lock can be re-acquired immediately -- a retry is never blocked');
  releaseExportLock(key);
});

test('export concurrency guard: different formats for the same report do not block each other', () => {
  const { acquireExportLock, releaseExportLock, activeExports } = reportsRouter._test;
  activeExports.delete('report-xyz:pdf');
  activeExports.delete('report-xyz:docx');

  assert.equal(acquireExportLock('report-xyz:pdf'), true);
  assert.equal(acquireExportLock('report-xyz:docx'), true, 'a different format key is an independent lock');

  releaseExportLock('report-xyz:pdf');
  releaseExportLock('report-xyz:docx');
});

test('export concurrency guard: a stale lock (older than the TTL) is treated as abandoned and can be re-acquired', () => {
  const { acquireExportLock, activeExports } = reportsRouter._test;
  const key = 'report-stale:pdf';
  // Simulate a lock left behind by a request that crashed before its
  // `finally` could release it -- this must never permanently block retries.
  activeExports.set(key, Date.now() - 10 * 60 * 1000); // 10 minutes old
  assert.equal(acquireExportLock(key), true, 'a lock past its TTL is stale and does not block a new export');
  activeExports.delete(key);
});
