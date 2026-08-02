// One-time, idempotent backfill for T-6.16: links existing reports that only have a
// free-typed claimNumber to a real CRM claim record, by matching (userId, claimNumber)
// exactly. Never touches claimNumber and never deletes anything -- only adds claimId
// where a confident, unambiguous match is found. Safe to rerun: reports that already
// have claimId are skipped, so this can run again after more reports/claims are added
// without re-processing or double-linking anything.
//
// Not auto-run. A developer/the client runs this manually when ready:
//   cd backend && node scripts/backfill-claim-links.js           (writes)
//   cd backend && node scripts/backfill-claim-links.js --dry-run (preview only)
const { getFirestore } = require('../config/firebase');

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
  const db = getFirestore();

  const [reportsSnap, claimsSnap] = await Promise.all([
    db.collection('reports').get(),
    db.collection('crmClaims').get(),
  ]);

  // Index claims by (userId, claimNumber) for lookup. If more than one claim
  // somehow shares the same pair, mark it ambiguous rather than guessing --
  // T-6.20 already enforces uniqueness going forward, so this should only ever
  // catch pre-existing data from before that check landed.
  const claimIndex = new Map();
  claimsSnap.docs.forEach((doc) => {
    const c = doc.data();
    if (!c.userId || !c.claimNumber) return;
    const key = `${c.userId}::${c.claimNumber}`;
    claimIndex.set(key, claimIndex.has(key) ? 'AMBIGUOUS' : doc.id);
  });

  let linked = 0;
  let alreadyLinked = 0;
  let noMatch = 0;
  let ambiguous = 0;

  for (const doc of reportsSnap.docs) {
    const report = doc.data();
    if (report.claimId) { alreadyLinked++; continue; }
    if (!report.userId || !report.claimNumber) { noMatch++; continue; }

    const match = claimIndex.get(`${report.userId}::${report.claimNumber}`);
    if (!match) { noMatch++; continue; }
    if (match === 'AMBIGUOUS') { ambiguous++; continue; }

    linked++;
    if (!DRY_RUN) await doc.ref.update({ claimId: match });
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Backfill complete.`);
  console.log(`  Linked:         ${linked}`);
  console.log(`  Already linked: ${alreadyLinked}`);
  console.log(`  No match:       ${noMatch}`);
  console.log(`  Ambiguous:      ${ambiguous} (multiple claims share the same claim number for that user -- skipped, needs manual review)`);
  process.exit(0);
})().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
