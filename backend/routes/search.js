// Phase 20 (Notifications Center & Global Search) -- the CMD/CTRL+K global
// search endpoint. Deliberately reuses Phase 19's exact report-access scope
// (own reports + reports specifically assigned to this uid via
// `assignedUserUids`) rather than any organization-wide report query -- this
// phase's own instructions repeat Phase 19's "never expose the entire
// organization's report pool" requirement, and that's just as true for search
// as it was for sharing.
//
// No full-text search infrastructure exists (Firestore has none natively) --
// per PHASES.md's own documented risk note, this starts simple: a bounded,
// permission-scoped read (never the whole collection, never another user's
// data) followed by an in-memory case-insensitive substring match over that
// already-authorized window. This is NOT the same thing as "client-side
// filtering" (which would mean returning everything to the browser and
// filtering there) -- the scoping and matching both happen here, server-side,
// and only the matches are ever sent back.
const express = require('express');
const router = express.Router();
const { getFirestore } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');
const { resolveOrganizationId, hasCapability } = require('../utils/orgRoles');

// Bounded scan window per data source -- generous enough for any real
// single-user/org dataset under this project's tier limits, never an
// unbounded "get everything" read.
const MAX_REPORTS_SCANNED = 300;
const MAX_TEAM_SCANNED = 300;
const MAX_RESULTS_PER_GROUP = 8;
const MIN_QUERY_LENGTH = 2;

const norm = (v) => String(v || '').toLowerCase();
const includesQuery = (haystackParts, q) => haystackParts.some((h) => norm(h).includes(q));

router.get('/', authenticateToken, async (req, res) => {
  try {
    const q = norm(req.query.q).trim();
    if (q.length < MIN_QUERY_LENGTH) {
      return res.json({ success: true, query: q, reports: [], photos: [], team: [] });
    }

    const db = getFirestore();
    const uid = req.user.uid;
    const orgId = resolveOrganizationId(req.user);
    // Team-roster visibility mirrors GET /api/teams/members exactly -- a
    // restricted role (adjuster/inspector/reviewer without this capability)
    // must not be able to discover teammates through search either.
    const canSeeTeam = hasCapability(req.user, 'canManageTeam') || hasCapability(req.user, 'canViewAllProfiles');

    const [ownSnap, assignedSnap, teamSnap] = await Promise.all([
      db.collection('reports').where('userId', '==', uid).limit(MAX_REPORTS_SCANNED).get(),
      db.collection('reports').where('assignedUserUids', 'array-contains', uid).limit(MAX_REPORTS_SCANNED).get(),
      canSeeTeam
        ? db.collection('enterpriseTeams').where('ownerId', '==', orgId).limit(MAX_TEAM_SCANNED).get()
        : Promise.resolve({ docs: [] }),
    ]);

    // A report could in theory appear in both snapshots (owner also granted
    // themself a grant, never happens in practice) -- de-dup by id either way.
    const reportDocsById = new Map();
    ownSnap.docs.forEach((d) => reportDocsById.set(d.id, d));
    assignedSnap.docs.forEach((d) => {
      if (!reportDocsById.has(d.id)) reportDocsById.set(d.id, d);
    });

    const reportMatches = [];
    const photoMatches = [];
    for (const d of reportDocsById.values()) {
      const r = d.data();
      if (r.status === 'archived') continue;
      if (reportMatches.length < MAX_RESULTS_PER_GROUP && includesQuery([r.claimNumber, r.insuredName, r.propertyAddress, r.lossType], q)) {
        reportMatches.push({
          id: d.id,
          claimNumber: r.claimNumber || null,
          insuredName: r.insuredName || null,
          propertyAddress: r.propertyAddress || null,
          status: r.status || null,
          link: `/reports/${d.id}/preview`,
        });
      }
      if (photoMatches.length < MAX_RESULTS_PER_GROUP) {
        for (const p of r.photos || []) {
          if (includesQuery([p.fileName, p.analysis?.category, p.analysis?.location], q)) {
            photoMatches.push({
              reportId: d.id,
              photoId: p.id || null,
              fileName: p.fileName || null,
              claimNumber: r.claimNumber || null,
              link: `/reports/${d.id}/preview`,
            });
            if (photoMatches.length >= MAX_RESULTS_PER_GROUP) break;
          }
        }
      }
    }

    // Matched on email/role only -- enterpriseTeams docs don't carry a
    // member's display name (neither does the existing GET /teams/members
    // response, which shows email as the primary identity for the same
    // reason: joining each member's own users/{uid} doc for a name would cost
    // one extra read per member per search keystroke, unbounded by org size).
    const teamMatches = [];
    for (const d of teamSnap.docs) {
      if (teamMatches.length >= MAX_RESULTS_PER_GROUP) break;
      const m = d.data();
      if (includesQuery([m.email, m.ownerName, m.role], q)) {
        teamMatches.push({
          id: d.id,
          email: m.email || null,
          role: m.role || null,
          status: m.status || null,
          link: `/team/members/${d.id}`,
        });
      }
    }

    return res.json({
      success: true,
      query: q,
      reports: reportMatches,
      photos: photoMatches,
      team: teamMatches,
    });
  } catch (err) {
    console.error('Search error:', err.message);
    return res.status(500).json({ success: false, error: 'Search failed', code: 'SEARCH_ERROR' });
  }
});

module.exports = router;
