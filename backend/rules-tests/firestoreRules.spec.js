// Firestore security-rules tests against the LOCAL Firestore emulator (never a
// real project: the project id is a `demo-` id, which the emulator refuses to
// connect anywhere). Run with `npm run test:rules` (needs Java + firebase-tools).
// Not part of `npm test`, which has no emulator.
//
// These test the rules FILE in this repo. They say nothing about the rules
// currently deployed to the live project until `firebase deploy --only
// firestore:rules` is run.
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
// Reads use the *FromServer variants: plain getDoc/getDocs fall back to the local cache when the
// client can't reach the emulator (e.g. under host memory pressure), and a cached empty result
// made assertFails report "succeeded" -- the 2026-10-07 flake, reproduced with disableNetwork().
const { doc, getDocFromServer, setDoc, updateDoc, deleteDoc, collection, getDocsFromServer } = require('firebase/firestore');

const PROJECT_ID = 'demo-flacronai-rules';
let env;

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      // RULES_FILE lets the suite be pointed at another rules file (e.g. the deployed one, to audit it).
      rules: fs.readFileSync(process.env.RULES_FILE || path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8085,
    },
  });
});

test.after(async () => {
  if (env) await env.cleanup();
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { email: 'alice@example.com', displayName: 'Alice', tier: 'starter' });
    await setDoc(doc(db, 'users/bob'), { email: 'bob@example.com', tier: 'agency', stripeTier: 'agency' });
    for (const [c, id] of [
      ['storeSubscriptions', 's1'],
      ['processedStoreNotifications', 'apple_n1'],
      ['processedWebhooks', 'evt_1'],
      ['pushDevices', 'd1'],
      ['pushOutbox', 'n1'],
      ['pushBindingRevocations', 'r1'],
      ['pushDiagnostics', 'credentials'],
      ['notifications', 'n1'],
      ['auditLogs', 'a1'],
      ['planConfig', 'active'],
      ['deletedAccounts', 'gone'],
    ]) {
      await setDoc(doc(db, `${c}/${id}`), { ownerUid: 'alice', uid: 'alice', userId: 'alice' });
    }
  });
});

const alice = () => env.authenticatedContext('alice', { email: 'alice@example.com' }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const ENTITLEMENT_PATCHES = {
  tier: 'enterprise',
  stripeTier: 'enterprise',
  adminTier: 'enterprise',
  legacyTier: 'enterprise',
  storeEntitlement: { tier: 'enterprise', state: 'active', expiresAt: '2099-01-01T00:00:00Z' },
  storeSubscriptionIds: ['s1'],
  billingAccountToken: '11111111-1111-4111-8111-111111111111',
  stripeCustomerId: 'cus_x',
  stripeSubscriptionId: 'sub_x',
  subscriptionStatus: 'active',
  teamOwnerId: 'bob',
  teamMembershipStatus: 'active',
  adminUpdated: true,
  mfaEnabled: false,
  tokenVersion: 99,
  // Account-deletion lease (server-only): a client clearing it could reopen billing mid-deletion.
  accountDeletionLock: null,
};

test('a user cannot modify their own tier or any entitlement/billing/team/security field', async () => {
  for (const [field, value] of Object.entries(ENTITLEMENT_PATCHES)) {
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { [field]: value }));
  }
  // Mixing an allowed field with a forbidden one is still refused.
  await assertFails(updateDoc(doc(alice(), 'users/alice'), { displayName: 'A', tier: 'agency' }));
  // Replacing the whole doc can't smuggle fields in either.
  await assertFails(setDoc(doc(alice(), 'users/alice'), { email: 'alice@example.com', tier: 'enterprise' }));
});

test('ordinary profile updates are still allowed', async () => {
  await assertSucceeds(
    updateDoc(doc(alice(), 'users/alice'), {
      displayName: 'Alice B',
      firstName: 'Alice',
      lastName: 'B',
      phone: '555-0100',
      company: 'Acme',
      address: '1 Main St',
      photoURL: 'https://example.com/a.png',
      updatedAt: '2026-10-05T00:00:00Z',
    })
  );
  await assertSucceeds(getDocFromServer(doc(alice(), 'users/alice')));
});

test('self-creating a user doc: only profile fields and a starter tier', async () => {
  const newUser = () => env.authenticatedContext('carol', { email: 'carol@example.com' }).firestore();
  await assertFails(setDoc(doc(newUser(), 'users/carol'), { email: 'carol@example.com', tier: 'agency' }));
  await assertFails(setDoc(doc(newUser(), 'users/carol'), { email: 'carol@example.com', adminTier: 'agency' }));
  await assertSucceeds(setDoc(doc(newUser(), 'users/carol'), { email: 'carol@example.com', displayName: 'Carol', tier: 'starter' }));
});

test('cross-account: no read, write or delete of another user doc', async () => {
  await assertFails(getDocFromServer(doc(alice(), 'users/bob')));
  await assertFails(updateDoc(doc(alice(), 'users/bob'), { displayName: 'x' }));
  await assertFails(setDoc(doc(alice(), 'users/dave'), { email: 'dave@example.com' }));
  await assertFails(deleteDoc(doc(alice(), 'users/alice')));
  await assertFails(getDocFromServer(doc(anon(), 'users/alice')));
});

test('billing, device, outbox and notification-delivery collections are closed to clients', async () => {
  const closed = [
    'storeSubscriptions/s1',
    'processedStoreNotifications/apple_n1',
    'processedWebhooks/evt_1',
    'pushDevices/d1',
    'pushOutbox/n1',
    'pushBindingRevocations/r1',
    'pushDiagnostics/credentials',
    'notifications/n1',
    'deletedAccounts/gone',
  ];
  for (const p of closed) {
    // Even the doc's own "owner" can't read or write it through a client SDK.
    await assertFails(getDocFromServer(doc(alice(), p)));
    await assertFails(setDoc(doc(alice(), p), { ownerUid: 'alice', state: 'active' }));
    await assertFails(getDocFromServer(doc(anon(), p)));
  }
  await assertFails(getDocsFromServer(collection(alice(), 'storeSubscriptions')));
  await assertFails(setDoc(doc(alice(), 'storeSubscriptions/new'), { ownerUid: 'alice', tier: 'enterprise', state: 'active' }));
});
