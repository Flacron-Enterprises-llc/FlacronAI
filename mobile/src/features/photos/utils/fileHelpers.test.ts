import { assetToRNFile, fileNameFromUri, mimeTypeFromUri } from './fileHelpers';

describe('mimeTypeFromUri', () => {
  it('infers common image mime types from the extension', () => {
    expect(mimeTypeFromUri('file:///a/b.png')).toBe('image/png');
    expect(mimeTypeFromUri('file:///a/b.JPG')).toBe('image/jpeg');
    expect(mimeTypeFromUri('file:///a/b.heic')).toBe('image/heic');
  });

  it('falls back to jpeg for an unrecognized or missing extension', () => {
    expect(mimeTypeFromUri('file:///a/b')).toBe('image/jpeg');
    expect(mimeTypeFromUri('content://media/external/images/1234')).toBe('image/jpeg');
  });
});

describe('fileNameFromUri', () => {
  it('extracts the last path segment when it looks like a filename', () => {
    expect(fileNameFromUri('file:///a/b/photo.jpg', 'fallback.jpg')).toBe('photo.jpg');
  });

  it('uses the fallback when the URI has no dotted filename segment', () => {
    expect(fileNameFromUri('content://media/external/images/1234', 'fallback.jpg')).toBe('fallback.jpg');
  });
});

describe('assetToRNFile', () => {
  it('prefers the picker-provided fileName and mimeType', () => {
    const file = assetToRNFile({ uri: 'file:///cache/img1.jpg', fileName: 'IMG_0001.HEIC', mimeType: 'image/heic' });
    expect(file).toEqual({ uri: 'file:///cache/img1.jpg', name: 'IMG_0001.HEIC', type: 'image/heic' });
  });

  it('synthesizes a unique name when neither a fileName nor an extension-bearing URI is available', () => {
    // A content:// asset URI with no filename segment at all — the one case fileNameFromUri
    // can't derive a name from the URI itself, so assetToRNFile must fall back to a
    // synthesized one (unlike a typical camera-capture file:// path, which already has its
    // own unique OS-assigned filename in the URI).
    const uri = 'content://media/external/images/9999';
    const first = assetToRNFile({ uri });
    const second = assetToRNFile({ uri });
    expect(first.name).not.toBe(second.name); // two captures never collide on a synthesized name
    expect(first.type).toBe('image/jpeg');
  });
});
