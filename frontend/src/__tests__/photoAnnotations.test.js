import { describe, it, expect } from 'vitest';
import {
  generateShapeId, distanceInImagePixels, formatMeasurementLabel, formatCapturedAt,
} from '../utils/photoAnnotations.js';

describe('generateShapeId', () => {
  it('produces unique, non-empty string ids', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateShapeId()));
    expect(ids.size).toBe(20);
    ids.forEach((id) => expect(typeof id).toBe('string'));
  });
});

describe('distanceInImagePixels', () => {
  it('computes real pixel distance from normalized (0..1) points', () => {
    // A horizontal line from x=0 to x=1 on a 1000px-wide image is 1000px.
    const px = distanceInImagePixels({ x: 0, y: 0 }, { x: 1, y: 0 }, 1000, 800);
    expect(px).toBeCloseTo(1000, 5);
  });

  it('uses width and height independently (not a square assumption)', () => {
    // A diagonal from (0,0) to (1,1) on a 300x400 image is a 3-4-5 triangle.
    const px = distanceInImagePixels({ x: 0, y: 0 }, { x: 1, y: 1 }, 300, 400);
    expect(px).toBeCloseTo(500, 5);
  });

  it('returns 0 for two identical points', () => {
    expect(distanceInImagePixels({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 1000, 1000)).toBe(0);
  });
});

describe('formatMeasurementLabel', () => {
  it('labels the distance explicitly as image pixels, never a physical unit', () => {
    const label = formatMeasurementLabel({ x: 0, y: 0 }, { x: 1, y: 0 }, 1000, 800);
    expect(label).toMatch(/px/);
    expect(label).toMatch(/image pixels/);
    expect(label).not.toMatch(/inch|cm|ft|meter/i);
  });

  it('returns an empty string when the image dimensions are unknown', () => {
    expect(formatMeasurementLabel({ x: 0, y: 0 }, { x: 1, y: 1 }, null, null)).toBe('');
    expect(formatMeasurementLabel({ x: 0, y: 0 }, { x: 1, y: 1 }, 0, 0)).toBe('');
  });
});

describe('formatCapturedAt', () => {
  it('labels an EXIF-sourced timestamp as coming from the photo itself', () => {
    const result = formatCapturedAt({ value: '2026-08-01T12:00:00.000Z', source: 'exif' });
    expect(result.caption).toMatch(/photo/i);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('clearly identifies an upload-time fallback as not a real capture time', () => {
    const result = formatCapturedAt({ value: '2026-08-01T12:00:00.000Z', source: 'upload' });
    expect(result.caption).toMatch(/upload time/i);
    expect(result.caption).toMatch(/no reliable capture time/i);
  });

  it('returns null when there is no capturedAt value at all', () => {
    expect(formatCapturedAt(null)).toBeNull();
    expect(formatCapturedAt(undefined)).toBeNull();
    expect(formatCapturedAt({})).toBeNull();
  });

  it('returns null for an unparseable date value rather than throwing', () => {
    expect(formatCapturedAt({ value: 'not-a-date', source: 'upload' })).toBeNull();
  });
});
