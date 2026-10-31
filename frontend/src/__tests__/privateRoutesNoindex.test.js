import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Signed-in pages must never be indexable: robots.txt disallows them, and ProtectedRoute sets
// `noindex, nofollow` while mounted so an SPA navigation can't carry a public page's `index, follow`.
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const app = read('../App.jsx');
const robots = read('../../public/robots.txt');
const protectedRoute = read('../components/ProtectedRoute.jsx');

// Every <Route path="..."> whose element is wrapped in <ProtectedRoute>.
const privatePaths = [...app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{\s*<ProtectedRoute/g)].map((m) => m[1]);

describe('private routes are not indexable', () => {
  it('finds the protected routes in App.jsx', () => {
    expect(privatePaths).toEqual(expect.arrayContaining(['/dashboard', '/settings', '/reports/:id/preview']));
  });

  it('robots.txt disallows every protected route (robots rules are plain path-prefix matches)', () => {
    const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
    for (const path of privatePaths) {
      const url = path.replace(/:[^/]+/g, 'x'); // a concrete URL for parameterised routes
      expect(disallowed.some((d) => url.startsWith(d)), `${path} is not disallowed in robots.txt`).toBe(true);
    }
  });

  it('ProtectedRoute marks the page noindex, nofollow on every route change', () => {
    expect(protectedRoute).toMatch(/'noindex, nofollow'/);
    expect(protectedRoute).toMatch(/\[location\.pathname\]/);
  });
});
