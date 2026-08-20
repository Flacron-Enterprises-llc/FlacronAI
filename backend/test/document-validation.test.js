const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sniffDocumentType, isValidDocumentBuffer } = require('../utils/documentValidation');

test('sniffDocumentType detects a real PDF by magic bytes', () => {
  const buf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(20)]);
  assert.equal(sniffDocumentType(buf), 'pdf');
});

test('sniffDocumentType detects a DOCX (ZIP/OOXML) by magic bytes', () => {
  const buf = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);
  assert.equal(sniffDocumentType(buf), 'docx');
});

test('sniffDocumentType detects a legacy DOC (OLE) by magic bytes', () => {
  const buf = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(20)]);
  assert.equal(sniffDocumentType(buf), 'doc');
});

test('sniffDocumentType accepts plain text only with a .txt name and no NUL bytes', () => {
  const buf = Buffer.from('Adjuster notes: roof damage observed on the north slope.');
  assert.equal(sniffDocumentType(buf, 'notes.txt'), 'txt');
  assert.equal(sniffDocumentType(buf, 'notes.pdf'), null);
});

test('sniffDocumentType rejects a binary file disguised as .txt', () => {
  const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0x05]);
  assert.equal(sniffDocumentType(buf, 'malware.txt'), null);
});

test('sniffDocumentType returns null for unrecognized bytes', () => {
  assert.equal(sniffDocumentType(Buffer.from('not a document')), null);
  assert.equal(sniffDocumentType(null), null);
  assert.equal(sniffDocumentType(Buffer.alloc(2)), null);
});

test('isValidDocumentBuffer requires the extension to match the sniffed type', () => {
  const pdfBuf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(20)]);
  assert.equal(isValidDocumentBuffer(pdfBuf, 'report.pdf'), true);
  // Real PDF bytes renamed to .docx should be rejected -- extension must match
  // the actual detected container/signature, not just what the client claims.
  assert.equal(isValidDocumentBuffer(pdfBuf, 'report.docx'), false);
});

test('isValidDocumentBuffer rejects a spoofed extension on unrecognized bytes', () => {
  const buf = Buffer.from('just some random bytes here');
  assert.equal(isValidDocumentBuffer(buf, 'estimate.pdf'), false);
});
