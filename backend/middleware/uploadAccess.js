const path = require('path');

// Only these upload subdirectories hold public branding assets (user logos and
// white-label logos, the latter shown on the public /enterprise/:subdomain portal).
// Everything else under uploads/ — claim/report photos and generated exports —
// contains sensitive claim data and must never be served over the static route.
const PUBLIC_UPLOAD_DIRS = new Set(['logos', 'whitelabel']);

/**
 * Decide whether a request for a file under the uploads root may be served
 * publicly. Returns the resolved absolute path when allowed, or null to deny.
 *
 * Denies: malformed encodings, paths that escape the uploads root, and any path
 * that (after resolving `..`) does not live under a public branding subdir.
 * Checking the RESOLVED path defeats traversal tricks such as
 * `/<uid>/logos/../reports/<id>/photo.jpg`, which would otherwise smuggle a
 * sensitive file past a naive substring check.
 *
 * @param {string} uploadDir absolute path to the uploads root
 * @param {string} reqPath   mount-relative request path (e.g. from req.path)
 * @returns {string|null}
 */
function resolvePublicUpload(uploadDir, reqPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(reqPath);
  } catch {
    return null;
  }
  const resolved = path.resolve(
    uploadDir,
    '.' + (decoded.startsWith('/') ? decoded : `/${decoded}`)
  );
  if (resolved !== uploadDir && !resolved.startsWith(uploadDir + path.sep)) {
    return null;
  }
  const segments = path.relative(uploadDir, resolved).split(path.sep);
  if (!segments.some((s) => PUBLIC_UPLOAD_DIRS.has(s))) {
    return null;
  }
  return resolved;
}

module.exports = { resolvePublicUpload, PUBLIC_UPLOAD_DIRS };
