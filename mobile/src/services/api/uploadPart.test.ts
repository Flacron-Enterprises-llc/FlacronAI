// Regression for the Phase 10 device finding: photo uploads failed on Android + iOS with
// "Unable to reach the server" because Expo SDK 57's global fetch (expo/fetch) cannot encode
// React Native `{ uri, name, type }` FormData parts. Runs Expo's REAL multipart encoder.
import { convertFormDataAsync } from 'expo/src/winter/fetch/convertFormData';

import { toUploadPart } from './reports';

// jest.mock calls are hoisted above the imports by babel-jest.
const mockBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const mockFileCtor = jest.fn();
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(uri: string) {
      mockFileCtor(uri);
    }
    async bytes() {
      return mockBytes;
    }
  },
}));
jest.mock('./client', () => ({ apiRequest: jest.fn(), apiRequestBinary: jest.fn() }));

const FILE = { uri: 'file:///cache/ImagePicker/abc.jpeg', name: 'roof 1.jpg', type: 'image/jpeg' };

function entriesForm(parts: [string, unknown][]) {
  // Minimal FormData shape the encoder consumes (`entries()`), independent of the jest polyfill.
  return { entries: () => parts } as unknown as FormData;
}

describe('multipart upload part (expo/fetch)', () => {
  it('our part encodes with the original filename, MIME type and file bytes', async () => {
    const { body, boundary } = await convertFormDataAsync(
      entriesForm([
        ['draftId', 'd1'],
        ['image', toUploadPart(FILE)],
      ])
    );
    const text = Array.from(body, (b) => String.fromCharCode(b)).join('');
    expect(text).toContain('content-disposition: form-data; name="image"; filename="roof%201.jpg"');
    expect(text).toContain('content-type: image/jpeg');
    const hex = (a: Uint8Array) => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex(body)).toContain(hex(mockBytes));
    expect(text.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
    expect(mockFileCtor).toHaveBeenCalledWith(FILE.uri);
  });

  it('the old React Native { uri } part is rejected by the encoder (the root cause)', async () => {
    await expect(convertFormDataAsync(entriesForm([['image', FILE]]))).rejects.toThrow('Unsupported FormDataPart implementation');
  });
});
