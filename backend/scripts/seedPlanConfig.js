// One-time, idempotent seed for `planConfig/active` (Phase 44 correction,
// task 6). Validates before writing (via setPlanConfig -> validatePlanConfig)
// and is safe to rerun any number of times: it always writes the SAME
// validated payload, preserving `createdAt` and only bumping `updatedAt` --
// never partially or randomly mutates the document.
//
// Default action seeds the accepted steady-state mapping (Starter 25 /
// Professional 100 / Agency 250 / Enterprise unlimited). The old flat-100
// behavior is a SEPARATE, explicitly-opt-in profile -- passing --legacy-rollback
// is the only way this script ever writes it, matching planConfig.js's own
// "never automatic" rule for LEGACY_ROLLBACK_CONFIG.
//
// No credentials are embedded here -- like every other script in this folder,
// it reuses `../config/firebase`'s existing Firebase Admin initialization
// (env-var-driven, already configured for this environment).
//
// NOT run by this change. A developer/the client runs it manually when ready:
//   cd backend && node scripts/seedPlanConfig.js                  (writes the accepted mapping)
//   cd backend && node scripts/seedPlanConfig.js --dry-run         (validates + prints, no write)
//   cd backend && node scripts/seedPlanConfig.js --legacy-rollback (explicit flat-100 rollback)
const { getFirestore } = require('../config/firebase');
const { RECOMMENDED_DEFAULT_CONFIG, LEGACY_ROLLBACK_CONFIG, validatePlanConfig, setPlanConfig } = require('../config/planConfig');

const DRY_RUN = process.argv.includes('--dry-run');
const LEGACY_ROLLBACK = process.argv.includes('--legacy-rollback');

async function run() {
  const target = LEGACY_ROLLBACK ? LEGACY_ROLLBACK_CONFIG : RECOMMENDED_DEFAULT_CONFIG;
  const label = LEGACY_ROLLBACK ? 'LEGACY_ROLLBACK_CONFIG (flat 100 -- incident-response only)' : 'RECOMMENDED_DEFAULT_CONFIG (accepted 25/100/250/unlimited mapping)';

  const { valid, errors } = validatePlanConfig(target);
  if (!valid) {
    // Should be unreachable (both constants are covered by planConfig.test.js),
    // but never write an invalid payload regardless.
    console.error(`Refusing to seed: ${label} failed validation:`, errors);
    process.exitCode = 1;
    return;
  }

  console.log(`Seed target: ${label}`);
  console.log(JSON.stringify(target, null, 2));

  if (DRY_RUN) {
    console.log('--dry-run: validated, not written.');
    return;
  }

  const db = getFirestore();
  const doc = await setPlanConfig(db, target, { updatedBy: 'scripts/seedPlanConfig.js' });
  console.log(`Wrote planConfig/active (createdAt=${doc.createdAt}, updatedAt=${doc.updatedAt}).`);
}

if (require.main === module) {
  run().catch((err) => {
    console.error('seedPlanConfig failed:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { run };
