const PizZip = require('pizzip');
const sharp = require('sharp');
const { tokenizeInline, parseBlockToken, collectReferencedPhotoIds } = require('./richContent');

// Phase 9: OOXML inline-image embedding for `![[photo:ID|caption]]`/photo-grid
// tokens. 1in = 914400 EMU; at 96 DPI, 1px = 9525 EMU.
const EMU_PER_PX = 9525;
const MAX_SINGLE_WIDTH_PX = 400; // ~4.2in, fits comfortably inside the page margins below
const MAX_GRID_COL_WIDTH_PX = 260;

const extFromMime = (mime) => {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return { ext: 'png', contentType: 'image/png' };
  if (m.includes('gif')) return { ext: 'gif', contentType: 'image/gif' };
  if (m.includes('webp')) return { ext: 'webp', contentType: 'image/webp' };
  return { ext: 'jpeg', contentType: 'image/jpeg' };
};

// Resolves every photoId referenced in `content` against `photoMap` (built by
// the export route from the report's own owned photos -- never a client URL)
// into a ready-to-embed asset: a unique relationship id, a real width/height
// read via `sharp` (already a backend dependency), and the raw bytes to write
// as a media part. A photo that fails to resolve/read is simply omitted here
// -- the XML builder below renders a "photo unavailable" placeholder instead.
const resolveImageAssets = async (content, photoMap) => {
  const ids = collectReferencedPhotoIds(content);
  const assets = {};
  let counter = 0;
  for (const id of ids) {
    const entry = photoMap?.[id];
    if (!entry?.buffer) continue;
    let widthPx = 320;
    let heightPx = 220;
    try {
      const meta = await sharp(entry.buffer).metadata();
      if (meta.width && meta.height) {
        widthPx = meta.width;
        heightPx = meta.height;
      }
    } catch (err) {
      // Corrupt/unsupported image bytes -- never let one bad photo crash (or
      // silently corrupt) the export. Skip embedding it so the XML builder's
      // existing "[Photo unavailable]" placeholder renders instead of raw
      // undecodable bytes inside the .docx.
      console.warn(
        `[DOCX Export] photo ${id} failed to decode (${err?.constructor?.name || 'Error'}) -- using placeholder`
      );
      continue;
    }
    counter += 1;
    const { ext, contentType } = extFromMime(entry.mimeType);
    assets[id] = {
      rId: `rIdImg${counter}`,
      fileName: `image${counter}.${ext}`,
      contentType,
      buffer: entry.buffer,
      widthPx,
      heightPx,
    };
  }
  return assets;
};

const scaledEmu = (asset, maxWidthPx) => {
  const scale = Math.min(1, maxWidthPx / asset.widthPx);
  return {
    cx: Math.round(asset.widthPx * scale) * EMU_PER_PX,
    cy: Math.round(asset.heightPx * scale) * EMU_PER_PX,
  };
};

let drawingIdSeq = 1;
const buildDrawingXml = (asset, maxWidthPx) => {
  const { cx, cy } = scaledEmu(asset, maxWidthPx);
  const id = drawingIdSeq++;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Picture ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${asset.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
};

const buildPhotoParagraphXml = (
  imageAssets,
  photoId,
  caption,
  maxWidthPx = MAX_SINGLE_WIDTH_PX
) => {
  const asset = imageAssets[photoId];
  const body = asset
    ? buildDrawingXml(asset, maxWidthPx)
    : `<w:r><w:rPr><w:i/><w:color w:val="94A3B8"/></w:rPr><w:t>[Photo unavailable]</w:t></w:r>`;
  const captionXml = caption
    ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="16"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">${escapeXml(caption)}</w:t></w:r></w:p>`
    : '';
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${body}</w:p>${captionXml}`;
};

const buildPhotoGridXml = (imageAssets, items) => {
  if (!items.length) return '';
  const cols = Math.max(1, items.length);
  const colWidth = Math.floor(8640 / Math.min(cols, 4));
  // Wrap into rows of up to 4 columns so a large grid stays readable.
  const rows = [];
  for (let i = 0; i < items.length; i += 4) rows.push(items.slice(i, i + 4));
  const rowsXml = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map((it) => {
            const asset = imageAssets[it.photoId];
            const cellBody = asset
              ? buildDrawingXml(asset, MAX_GRID_COL_WIDTH_PX)
              : `<w:r><w:rPr><w:i/><w:color w:val="94A3B8"/><w:sz w:val="16"/></w:rPr><w:t>[Unavailable]</w:t></w:r>`;
            const captionXml = it.caption
              ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="14"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">${escapeXml(it.caption)}</w:t></w:r></w:p>`
              : '';
            return `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${cellBody}</w:p>${captionXml}</w:tc>`;
          })
          .join('')}</w:tr>`
    )
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr>${rowsXml}</w:tbl><w:p><w:r><w:t></w:t></w:r></w:p>`;
};

// Phase 11 (Export Options Modal & PDF Layout Completion): resolves each
// "Photo Documentation" appendix photo (already-downloaded buffer + real
// review/analysis metadata from the export route) into an embeddable OOXML
// image asset -- same shape as `resolveImageAssets`, but keyed by array
// position rather than an inline `![[photo:ID]]` token, since appendix photos
// aren't referenced from `report.content`. A distinct `rIdAppendix*` prefix
// keeps these relationship ids from colliding with the inline photoMap assets.
const resolveAppendixAssets = async (appendixPhotos) => {
  const resolved = [];
  let counter = 0;
  for (const [index, item] of (appendixPhotos || []).entries()) {
    let widthPx = 320;
    let heightPx = 220;
    let decodable = true;
    try {
      const meta = await sharp(item.buffer).metadata();
      if (meta.width && meta.height) {
        widthPx = meta.width;
        heightPx = meta.height;
      }
    } catch (err) {
      // Corrupt/unsupported image bytes -- isolate to this one photo (a
      // null `asset` renders buildAppendixXml's existing "[Photo
      // unavailable]" placeholder) instead of embedding undecodable bytes
      // into the .docx with no indication anything went wrong.
      decodable = false;
      console.warn(
        `[DOCX Export] appendix photo #${index + 1} failed to decode (${err?.constructor?.name || 'Error'}) -- using placeholder`
      );
    }
    if (!decodable) {
      resolved.push({ ...item, asset: null });
      continue;
    }
    counter += 1;
    const { ext, contentType } = extFromMime(item.mimeType);
    resolved.push({
      ...item,
      asset: {
        rId: `rIdAppendix${counter}`,
        fileName: `appendix${counter}.${ext}`,
        contentType,
        buffer: item.buffer,
        widthPx,
        heightPx,
      },
    });
  }
  return resolved;
};

// Builds the "PHOTO DOCUMENTATION" appendix as a borderless table, `cols`
// (1/2/4) photos per row, each cell showing the photo number, image, caption
// (toggleable), area/location, and the reviewer-approved observation.
const buildAppendixXml = (resolvedItems, cols, includeCaptions) => {
  if (!resolvedItems.length) return '';
  const maxWidthPx = cols === 1 ? 380 : cols === 2 ? 260 : 150;
  const colWidth = Math.floor(8640 / cols);
  const rows = [];
  for (let i = 0; i < resolvedItems.length; i += cols) rows.push(resolvedItems.slice(i, i + cols));
  const rowsXml = rows
    .map(
      (row, ri) =>
        `<w:tr>${row
          .map((it, ci) => {
            const idx = ri * cols + ci + 1;
            const body = it.asset
              ? buildDrawingXml(it.asset, maxWidthPx)
              : `<w:r><w:rPr><w:i/><w:color w:val="94A3B8"/></w:rPr><w:t>[Photo unavailable]</w:t></w:r>`;
            const numberP = `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/><w:color w:val="002A64"/></w:rPr><w:t xml:space="preserve">Photo ${idx}</w:t></w:r></w:p>`;
            const captionP =
              includeCaptions && it.caption
                ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">${escapeXml(it.caption)}</w:t></w:r></w:p>`
                : '';
            const locationP = it.location
              ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="14"/><w:color w:val="64748B"/></w:rPr><w:t xml:space="preserve">Area: ${escapeXml(it.location)}</w:t></w:r></w:p>`
              : '';
            const obsP = `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>${it.observation ? '' : '<w:i/><w:color w:val="94A3B8"/>'}<w:sz w:val="14"/></w:rPr><w:t xml:space="preserve">${escapeXml(it.observation || 'No reviewed observation available.')}</w:t></w:r></w:p>`;
            return `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/></w:tcPr>${numberP}<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${body}</w:p>${captionP}${locationP}${obsP}</w:tc>`;
          })
          .join('')}</w:tr>`
    )
    .join('');
  return `<w:p><w:pPr><w:pageBreakBefore/><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>PHOTO DOCUMENTATION</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="E2E8F0"/><w:left w:val="single" w:sz="4" w:color="E2E8F0"/><w:bottom w:val="single" w:sz="4" w:color="E2E8F0"/><w:right w:val="single" w:sz="4" w:color="E2E8F0"/><w:insideH w:val="single" w:sz="4" w:color="E2E8F0"/><w:insideV w:val="single" w:sz="4" w:color="E2E8F0"/></w:tblBorders></w:tblPr>${rowsXml}</w:tbl>`;
};

// Builds the `<w:r>` runs for one line of text, splitting on inline
// bold/italic/underline (Phase 9) instead of stripping them as before.
// `baseProps` (e.g. size/color) is applied to every run alongside its marks.
const buildRunsXml = (text, baseProps = '') => {
  const runs = tokenizeInline(text);
  if (!runs.length) return '<w:r><w:t xml:space="preserve"></w:t></w:r>';
  return runs
    .map((run) => {
      const props = [baseProps];
      if (run.bold) props.push('<w:b/>');
      if (run.italic) props.push('<w:i/>');
      if (run.underline) props.push('<w:u w:val="single"/>');
      const rPr = props.some(Boolean) ? `<w:rPr>${props.join('')}</w:rPr>` : '';
      return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
    })
    .join('');
};

const PARAGRAPH_RUN_PROPS = '<w:sz w:val="20"/><w:color w:val="374151"/>';

// Generate DOCX from report data. Returns a Buffer (no disk I/O).
const generateDOCX = async (report, options = {}) => {
  const {
    // Phase 31 (Liability Investigation Report): cover title only -- defaults
    // to today's generic text when unset, so every other document type is
    // unaffected.
    reportTitle = 'INSURANCE INSPECTION REPORT',
    companyName = 'FlacronAI',
    hideFlacronBranding = false,
    watermark = false,
    watermarkText = 'DRAFT - PENDING ADJUSTER REVIEW',
    // Phase 9: photoId -> { buffer, mimeType } for embedded photo tokens.
    photoMap = {},
    // Phase 11 (Export Options Modal & PDF Layout Completion)
    includeCoverPage = true,
    includePhotoCaptions = true,
    includePageNumbers = true,
    includeCompanyBranding = true,
    photoLayout = 2,
    appendixPhotos = [],
    confidentialityStatement = 'CONFIDENTIAL — For authorized recipients only. Contains privileged claim information.',
  } = options;

  // Build a DOCX from scratch using XML template
  const brandName = hideFlacronBranding ? companyName : 'FlacronAI';
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const sections = parseReportSections(report.content || '');
  const imageAssets = await resolveImageAssets(report.content || '', photoMap);
  const appendixResolved = await resolveAppendixAssets(appendixPhotos);
  const appendixXml = buildAppendixXml(appendixResolved, photoLayout, includePhotoCaptions);

  // Build XML content for each section — with real table support
  const sectionXml = sections
    .map((sec) => {
      const lines = sec.content.split('\n');
      const xmlParts = [];
      let tableRows = [];

      const flushDocxTable = () => {
        if (tableRows.length === 0) return;
        const cols = tableRows[0].length;

        // Fixed widths for 3-col tables: Category 25% / Description 50% / Cost 25% of 8640 dxa
        let colWidths;
        if (cols === 3) {
          colWidths = [2160, 4320, 2160];
        } else {
          const w = Math.floor(8640 / Math.max(cols, 1));
          colWidths = Array(cols).fill(w);
          colWidths[cols - 1] = 8640 - w * (cols - 1);
        }

        let tblXml = `<w:tbl>
        <w:tblPr>
          <w:tblW w:w="8640" w:type="dxa"/>
          <w:tblLayout w:type="fixed"/>
          <w:tblBorders>
            <w:top w:val="single" w:sz="4" w:color="E2E8F0"/>
            <w:left w:val="single" w:sz="4" w:color="E2E8F0"/>
            <w:bottom w:val="single" w:sz="4" w:color="E2E8F0"/>
            <w:right w:val="single" w:sz="4" w:color="E2E8F0"/>
            <w:insideH w:val="single" w:sz="4" w:color="E2E8F0"/>
            <w:insideV w:val="single" w:sz="4" w:color="E2E8F0"/>
          </w:tblBorders>
        </w:tblPr>`;
        tableRows.forEach((row, ri) => {
          const isHeader = ri === 0;
          const isTotal =
            row[0] && row[0].replace(/\*/g, '').trim().toUpperCase().startsWith('TOTAL');
          const fillColor = isHeader
            ? '002A64'
            : isTotal
              ? 'FFF7ED'
              : ri % 2 === 0
                ? 'F8FAFC'
                : 'FFFFFF';
          tblXml += `<w:tr>
          <w:trPr>
            <w:cantSplit/>
            ${isHeader ? '<w:tblHeader/>' : ''}
          </w:trPr>`;
          row.forEach((cell, ci) => {
            const cellText = cell.trim().replace(/\*\*(.*?)\*\*/g, '$1');
            tblXml += `<w:tc>
            <w:tcPr>
              <w:tcW w:w="${colWidths[ci]}" w:type="dxa"/>
              <w:shd w:val="clear" w:color="auto" w:fill="${fillColor}"/>
            </w:tcPr>
            <w:p>
              <w:r>
                <w:rPr>
                  ${isHeader || isTotal ? '<w:b/>' : ''}
                  <w:color w:val="${isHeader ? 'FFFFFF' : '1E293B'}"/>
                  <w:sz w:val="18"/>
                </w:rPr>
                <w:t xml:space="preserve">${escapeXml(cellText)}</w:t>
              </w:r>
            </w:p>
          </w:tc>`;
          });
          tblXml += `</w:tr>`;
        });
        tblXml += `</w:tbl><w:p><w:r><w:t></w:t></w:r></w:p>`;
        xmlParts.push(tblXml);
        tableRows = [];
      };

      let numberedCounter = 0;
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const token = parseBlockToken(line);

        if (token?.type === 'grid-open') {
          flushDocxTable();
          numberedCounter = 0;
          const items = [];
          li += 1;
          while (li < lines.length) {
            const inner = parseBlockToken(lines[li]);
            if (inner?.type === 'grid-close') break;
            if (inner?.type === 'grid-item')
              items.push({ photoId: inner.photoId, caption: inner.caption });
            li += 1;
          }
          xmlParts.push(buildPhotoGridXml(imageAssets, items));
          continue;
        }
        if (token?.type === 'pagebreak') {
          flushDocxTable();
          numberedCounter = 0;
          xmlParts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
          continue;
        }
        if (token?.type === 'photo') {
          flushDocxTable();
          numberedCounter = 0;
          xmlParts.push(buildPhotoParagraphXml(imageAssets, token.photoId, token.caption));
          continue;
        }
        if (token?.type === 'numbered') {
          flushDocxTable();
          numberedCounter += 1;
          xmlParts.push(
            `<w:p><w:pPr><w:ind w:left="360"/></w:pPr>${buildRunsXml(`${numberedCounter}. ${token.text}`, PARAGRAPH_RUN_PROPS)}</w:p>`
          );
          continue;
        }

        if (line.startsWith('### ')) {
          flushDocxTable();
          numberedCounter = 0;
          xmlParts.push(
            `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${escapeXml(line.replace('### ', ''))}</w:t></w:r></w:p>`
          );
        } else if (line.startsWith('|')) {
          const cells = line.split('|').filter((c) => c.trim() && !c.trim().match(/^[-:]+$/));
          if (cells.length > 0) tableRows.push(cells);
        } else if (line.trim() === '---') {
          flushDocxTable();
          numberedCounter = 0;
          xmlParts.push(
            '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="E2E8F0"/></w:pBdr></w:pPr></w:p>'
          );
        } else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          flushDocxTable();
          numberedCounter = 0;
          const text = line.trim().slice(2);
          // Report Info / Claim Info & Insured Info: bold label + plain value,
          // no bullet dot — matches the PDF's field-list treatment for these
          // sections specifically (client's reference sample style).
          const isFieldListSection = /report info|claim info|insured info/i.test(sec.title || '');
          const kv = isFieldListSection ? text.match(/^([^:]{2,60}):\s*(.*)$/) : null;
          if (kv) {
            const [, label, value] = kv;
            xmlParts.push(
              `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(label)}: </w:t></w:r>${buildRunsXml(value)}</w:p>`
            );
          } else {
            xmlParts.push(
              `<w:p><w:pPr><w:ind w:left="360"/></w:pPr><w:r><w:t xml:space="preserve">• </w:t></w:r>${buildRunsXml(text)}</w:p>`
            );
          }
        } else if (line.trim() === '') {
          flushDocxTable();
          numberedCounter = 0;
          xmlParts.push('<w:p><w:r><w:t></w:t></w:r></w:p>');
        } else {
          if (tableRows.length) flushDocxTable();
          numberedCounter = 0;
          if (line.trim()) {
            xmlParts.push(`<w:p>${buildRunsXml(line, PARAGRAPH_RUN_PROPS)}</w:p>`);
          }
        }
      }
      flushDocxTable();

      // A `null` title marks the pre-first-`##`-heading preamble (see
      // parseReportSections below) -- render its content with no synthetic
      // heading, matching how the PDF/HTML generators already treat it.
      const headingXml = sec.title
        ? `<w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>${escapeXml(sec.title)}</w:t></w:r>
    </w:p>`
        : '';

      return `
    ${headingXml}
    ${xmlParts.join('\n')}`;
    })
    .join('\n');

  // E-signature (T-2.12): statement of electronic sign-off, if the adjuster signed.
  const sig = report.signature;
  const signedByLine = sig?.name
    ? `<w:p><w:r><w:rPr><w:i/><w:color w:val="0F172A"/></w:rPr><w:t xml:space="preserve">Electronically signed by ${escapeXml(sig.name)}${sig.title ? `, ${escapeXml(sig.title)}` : ''}${sig.confirmedAt ? ` on ${new Date(sig.confirmedAt).toLocaleString()}` : ''}.</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>License: </w:t></w:r><w:r><w:t>${escapeXml(sig.licenseState)} ${escapeXml(sig.licenseNumber)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Company / Firm: </w:t></w:r><w:r><w:t>${escapeXml(sig.company)}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Report version approved: </w:t></w:r><w:r><w:t>${escapeXml(report.versionApproved || '')}</w:t></w:r></w:p>`
    : '';

  // Phase 11: the "cover" (title + Prepared-by line + details table) is
  // togglable as a unit -- when off, the document opens straight into the
  // report content (which still restates claim/report metadata in its own
  // "Report Info" section), matching the PDF's includeCoverPage behavior.
  const coverXml = includeCoverPage
    ? `<!-- Cover Header -->
    <w:p>
      <w:pPr><w:pStyle w:val="Title"/><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>${escapeXml(reportTitle)}</w:t></w:r>
    </w:p>
    ${watermark ? `<w:p><w:pPr><w:jc w:val="center"/><w:shd w:val="clear" w:fill="FEE2E2"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="991B1B"/><w:sz w:val="36"/></w:rPr><w:t>${escapeXml(watermarkText)}</w:t></w:r></w:p>` : ''}
    ${
      includeCompanyBranding
        ? `<w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="F97316"/></w:rPr><w:t>Prepared by ${escapeXml(brandName)}</w:t></w:r>
    </w:p>`
        : ''
    }
    <w:p><w:r><w:t></w:t></w:r></w:p>

    <!-- Report Details Table -->
    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:jc w:val="center"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:color="E2E8F0"/>
          <w:left w:val="single" w:sz="4" w:color="E2E8F0"/>
          <w:bottom w:val="single" w:sz="4" w:color="E2E8F0"/>
          <w:right w:val="single" w:sz="4" w:color="E2E8F0"/>
          <w:insideH w:val="single" w:sz="4" w:color="E2E8F0"/>
          <w:insideV w:val="single" w:sz="4" w:color="E2E8F0"/>
        </w:tblBorders>
      </w:tblPr>
      ${[
        ['Report Type', report.reportType || 'Initial'],
        ['Claim Number', report.claimNumber || ''],
        ['Insured Name', report.insuredName || ''],
        ['Insured Email', report.insuredEmail || ''],
        ['Property Address', report.propertyAddress || ''],
        ['Date of Loss', report.lossDate || ''],
        ['Loss Type', report.lossType || ''],
        ['Report Date', reportDate],
        ['Prepared With', hideFlacronBranding ? companyName : 'FlacronAI (FLACRON ENGINE)'],
        [
          'Status',
          {
            draft: 'Draft — pending adjuster review',
            finalized: 'Finalized — approved by licensed adjuster',
          }[report.status] || 'Draft — pending adjuster review',
        ],
      ]
        .map(
          ([k, v]) => `
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(k)}</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr>
          <w:p><w:r><w:t>${escapeXml(v)}</w:t></w:r></w:p>
        </w:tc>
      </w:tr>`
        )
        .join('')}
    </w:tbl>

    <w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`
    : '';

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
  <w:body>
    ${coverXml}
    <!-- Report Content -->
    ${watermark ? `<w:p><w:pPr><w:jc w:val="center"/><w:shd w:val="clear" w:fill="FEE2E2"/><w:spacing w:after="160"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="991B1B"/><w:sz w:val="28"/></w:rPr><w:t>${escapeXml(watermarkText)}</w:t></w:r></w:p>` : ''}
    ${sectionXml}
    ${appendixXml}

    <!-- Signature Block -->
    <w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Reviewing Adjuster Sign-Off</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t xml:space="preserve">This report was prepared with the FLACRON ENGINE and is provided as a draft for professional review. It does not constitute a final determination of cause, coverage, liability, or loss value. The reviewing adjuster's signature below indicates that they have reviewed, corrected as needed, and approved its contents.</w:t></w:r></w:p>
    ${signedByLine}
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">                                                    </w:t></w:r><w:r><w:t xml:space="preserve">  Signature</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">                                                    </w:t></w:r><w:r><w:t xml:space="preserve">  Date</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">                                                    </w:t></w:r><w:r><w:t xml:space="preserve">  Adjuster Name (Print)</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">                                                    </w:t></w:r><w:r><w:t xml:space="preserve">  License Number</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">                                                    </w:t></w:r><w:r><w:t xml:space="preserve">  License State</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">                                                    </w:t></w:r><w:r><w:t xml:space="preserve">  Company / Firm Name</w:t></w:r></w:p>

    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId2"/>
      <w:footerReference w:type="default" r:id="rId3"/>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1800" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const zip = new PizZip();

  // Phase 9: register a Content-Types Default + a document.xml.rels
  // Relationship + a word/media/* part for every embedded photo. Phase 11
  // adds the appendix's own resolved image assets to the same registration
  // pass -- they're a separate list from the inline photoMap assets above
  // (rIdAppendix* vs rIdImg*) but need identical Content-Types/rels/media wiring.
  // `.asset` is null for an appendix photo that failed to decode (rendered
  // as a placeholder instead) -- filter those out before Content-Types/rels/
  // media registration, which assumes every entry is a real embeddable asset.
  const imageAssetList = [
    ...Object.values(imageAssets),
    ...appendixResolved.map((a) => a.asset).filter(Boolean),
  ];
  const imageExts = [...new Set(imageAssetList.map((a) => a.fileName.split('.').pop()))];
  const imageContentTypeDefaults = imageExts
    .map(
      (ext) =>
        `<Default Extension="${ext}" ContentType="${imageAssetList.find((a) => a.fileName.endsWith(`.${ext}`)).contentType}"/>`
    )
    .join('\n  ');
  const imageRelationships = imageAssetList
    .map(
      (a) =>
        `<Relationship Id="${a.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${a.fileName}"/>`
    )
    .join('\n  ');

  // Minimal DOCX structure
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${imageContentTypeDefaults}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  ${imageRelationships}
</Relationships>`
  );

  imageAssetList.forEach((asset) => zip.file(`word/media/${asset.fileName}`, asset.buffer));

  zip.file('word/document.xml', docXml);
  zip.file('word/styles.xml', getDefaultStyles());
  zip.file(
    'word/header1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:rPr><w:b/><w:color w:val="${watermark ? '991B1B' : '64748B'}"/></w:rPr><w:t>${watermark ? escapeXml(watermarkText) : `Claim ${escapeXml(report.claimNumber || '')}`}</w:t></w:r>
  </w:p>
</w:hdr>`
  );
  // Phase 11: the footer's brand attribution stays visible regardless of
  // includeCompanyBranding -- consistent with the PDF generator, where that
  // option only toggles the cover mark and header-bar logo/text, not this
  // small generation-attribution line (paired with the always-on
  // confidentiality statement below it). includePageNumbers still toggles
  // the "- Page N" field independently.
  const footerBrandXml = `<w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(brandName)}</w:t></w:r>`;
  const footerPageXml = includePageNumbers
    ? `<w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve"> - Page </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>`
    : '';
  zip.file(
    'word/footer1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
    ${footerBrandXml}${footerPageXml}
  </w:p>
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:rPr><w:color w:val="94A3B8"/><w:sz w:val="14"/></w:rPr><w:t xml:space="preserve">Claim ${escapeXml(report.claimNumber || '')} — ${escapeXml(confidentialityStatement)}</w:t></w:r>
  </w:p>
</w:ftr>`
  );

  const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  return buf;
};

// Phase 9: any content before the first `## ` heading (an H1 title line, or
// content the rich editor's "preamble"/"Introduction" pseudo-section holds --
// see frontend/src/utils/reportSections.js, which the editor uses and always
// re-serializes with no `##` prefix) used to be silently dropped here, since
// `current` stays null until the first heading is seen. That was a low-stakes
// gap before Phase 9 (typically just the report's H1 title line), but the
// rich editor's AI functions/Regenerate Section can now put real content --
// photos, tables, findings -- into whatever happens to be the first section,
// so a dropped preamble became a real DOCX-only data-loss bug (PDF/HTML never
// had this gap; they walk `content` directly, not pre-split into sections).
// A `null`-titled section carries that preamble through with no synthetic
// heading rendered for it (see the `headingXml` guard above).
const parseReportSections = (content) => {
  const sections = [];
  const lines = content.split('\n');
  let current = null;
  const preamble = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { title: line.replace('## ', ''), content: '' };
    } else if (current) {
      current.content += line + '\n';
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);
  if (preamble.join('\n').trim()) sections.unshift({ title: null, content: preamble.join('\n') });
  return sections.length > 0 ? sections : [{ title: 'Report Content', content }];
};

const escapeXml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const getDefaultStyles = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:rPr>
      <w:b/>
      <w:sz w:val="44"/>
      <w:color w:val="002A64"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr>
      <w:spacing w:before="240" w:after="120"/>
      <w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="FD4403"/></w:pBdr>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="26"/>
      <w:color w:val="002A64"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="26"/>
      <w:color w:val="1E293B"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:sz w:val="22"/>
      <w:color w:val="374151"/>
    </w:rPr>
  </w:style>
  <w:style w:type="table" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
  </w:style>
</w:styles>`;

module.exports = { generateDOCX };
