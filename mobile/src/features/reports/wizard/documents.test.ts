import { MAX_DOCUMENT_BYTES, documentError, documentMimeType, type WizardDocument } from './documents';

const doc = (name: string, size = 100): WizardDocument => ({ localId: name, uri: `file:///${name}`, name, mimeType: 'application/pdf', size });

describe('supporting documents (backend generateUpload allowlist)', () => {
  it('accepts PDF/DOC/DOCX/TXT and infers the type from the extension when the picker is vague', () => {
    expect(documentMimeType('a.pdf', 'application/octet-stream')).toBe('application/pdf');
    expect(documentMimeType('a.DOCX', null)).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(documentMimeType('a.txt', 'text/plain')).toBe('text/plain');
    expect(documentMimeType('a.png', 'image/png')).toBeNull();
  });

  it('rejects unsupported types, oversize files, duplicates and an 11th file', () => {
    expect(documentError({ name: 'x.zip', mimeType: 'application/zip', size: 1 }, [])).toMatch(/isn't a PDF/);
    expect(documentError({ name: 'big.pdf', size: MAX_DOCUMENT_BYTES + 1 }, [])).toMatch(/10 MB/);
    expect(documentError({ name: 'a.pdf', size: 100 }, [doc('a.pdf')])).toMatch(/already attached/);
    const ten = Array.from({ length: 10 }, (_, i) => doc(`${i}.pdf`));
    expect(documentError({ name: 'new.pdf', size: 1 }, ten)).toMatch(/up to 10/);
    expect(documentError({ name: 'ok.pdf', size: 1 }, [])).toBeNull();
  });
});
