// Test-only helper: extracts the literal text drawn on each physical page of
// a generated PDF, directly from its raw bytes -- deliberately independent of
// properPdfGenerator.js's own internal page bookkeeping, so tests that use
// this can verify the TOC page-numbering fix against real, parsed PDF output
// rather than trusting the generator's self-reported page numbers. Uses
// pdf-lib (already an existing project dependency) only for low-level
// object/stream access; it has no built-in text-extraction API itself.
const { PDFDocument, PDFName, PDFArray, PDFRawStream } = require('pdf-lib');
const zlib = require('zlib');

function decodeStreamBytes(streamObj) {
  const dict = streamObj.dict;
  let bytes = streamObj.contents;
  const filter = dict.get(PDFName.of('Filter'));
  const filters = [];
  if (filter) {
    if (filter instanceof PDFArray) {
      for (let i = 0; i < filter.size(); i++) filters.push(filter.get(i));
    } else {
      filters.push(filter);
    }
  }
  for (const f of filters) {
    const name = String(f);
    if (name === '/FlateDecode') {
      bytes = zlib.inflateSync(Buffer.from(bytes));
    } else {
      throw new Error(`Unsupported content-stream filter in test fixture: ${name}`);
    }
  }
  return bytes;
}

const STRING_RE = /\(((?:\\.|[^()\\])*)\)|<([0-9A-Fa-f\s]*)>/g;
const decodeOneString = (m) => {
  if (m[1] !== undefined) return m[1].replace(/\\([()\\])/g, '$1').replace(/\\n/g, '\n');
  return Buffer.from(m[2].replace(/\s+/g, ''), 'hex').toString('latin1');
};

// PDFKit's standard-14 fonts (Helvetica/Helvetica-Bold/etc.) use
// WinAnsiEncoding, where printable ASCII bytes equal their character codes --
// so string operands can be read directly as Latin1/ASCII text once decoded.
// Every show-text operation PDFKit emits (even a single word) is a `TJ` array
// of several string fragments interleaved with kerning-adjustment numbers --
// real word-spaces are already embedded *inside* those fragments' own bytes,
// so fragments WITHIN one `TJ`/`Tj` statement are concatenated with no added
// separator, and exactly one separating space is added BETWEEN statements.
function extractTextFromContentStream(streamText) {
  let out = '';
  const statementRe = /\[((?:\\.|[^[\]])*)\]\s*TJ|(\((?:\\.|[^()\\])*\)|<[0-9A-Fa-f\s]*>)\s*Tj/g;
  let m;
  while ((m = statementRe.exec(streamText))) {
    let statementText = '';
    if (m[1] !== undefined) {
      let im;
      STRING_RE.lastIndex = 0;
      while ((im = STRING_RE.exec(m[1]))) statementText += decodeOneString(im);
    } else if (m[2] !== undefined) {
      STRING_RE.lastIndex = 0;
      const im = STRING_RE.exec(m[2]);
      if (im) statementText = decodeOneString(im);
    }
    out += statementText + ' ';
  }
  return out;
}

// Returns an array of strings, one per physical page (index 0 = page 1),
// each the concatenated literal text drawn on that page, whitespace-normalized.
async function extractPerPageText(pdfBytes) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const pages = pdfDoc.getPages();
  const context = pdfDoc.context;
  const results = [];
  for (const page of pages) {
    const contentsRef = page.node.get(PDFName.of('Contents'));
    const resolved = context.lookup(contentsRef);
    const streamRefs =
      resolved instanceof PDFArray
        ? Array.from({ length: resolved.size() }, (_, i) => resolved.get(i))
        : [contentsRef];
    let pageText = '';
    for (const ref of streamRefs) {
      const streamObj = context.lookup(ref);
      if (!(streamObj instanceof PDFRawStream)) continue;
      const decoded = decodeStreamBytes(streamObj).toString('latin1');
      pageText += extractTextFromContentStream(decoded);
    }
    results.push(pageText.replace(/\s+/g, ' ').trim());
  }
  return results;
}

// Finds the first physical page (1-indexed) whose text contains `needle`
// (case-insensitive, whitespace-normalized), searching from `fromPage`
// (1-indexed, inclusive) onward -- ground truth for "what page does this
// heading actually start on", independent of any TOC the PDF itself claims.
function findFirstPageContaining(pagesText, needle, fromPage = 1) {
  const target = needle.toUpperCase().replace(/\s+/g, ' ');
  for (let i = fromPage - 1; i < pagesText.length; i++) {
    if (pagesText[i].toUpperCase().replace(/\s+/g, ' ').includes(target)) return i + 1;
  }
  return null;
}

module.exports = { extractPerPageText, findFirstPageContaining };
