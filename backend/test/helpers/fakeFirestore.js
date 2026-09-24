// Test-only in-memory Firestore double supporting nested subcollections,
// transactions (tx.get/tx.set/tx.update with real optimistic-concurrency
// retry-on-stale-read, mirroring photo-draft-staging.test.js's own
// FakeFirestore), and a minimal orderBy().limit().get() query -- enough
// surface for backend/utils/canonicalEstimateStore.js without pulling in a
// real Firestore emulator.
class FakeFirestore {
  // `strictTransactionOrder` (default false, opt-in only -- every existing
  // `new FakeFirestore()` call across every other phase's tests is
  // unaffected): when true, mirrors real Firestore's actual transaction rule
  // ("all reads must happen before any writes") by throwing the identical
  // error message the real SDK throws if `tx.get()` is called after
  // `tx.set()/update()` within the same attempt. Added after Phase 45's live
  // Stripe validation found `applyRefund`/`applyDisputeCreated`/
  // `applyDisputeClosed` violating this real constraint in a way the
  // (previously order-blind) fake never caught -- see
  // photo-addon-purchases-store.test.js's "transaction read/write ordering"
  // tests.
  constructor({ strictTransactionOrder = false } = {}) {
    this.store = new Map(); // path -> { version, data }
    this._autoId = 0;
    this.strictTransactionOrder = strictTransactionOrder;
  }

  collection(name) {
    return this._collection(name);
  }

  _collection(basePath) {
    const fs = this;
    return {
      doc: (id) => fs._doc(`${basePath}/${id || `auto${fs._autoId++}`}`),
      get: async () => fs._directChildrenSnapshot(basePath),
      orderBy: (field, dir = 'asc') => fs._query(basePath).orderBy(field, dir),
      limit: (n) => fs._query(basePath).limit(n),
      // Phase 48: auto-id create, matching real Firestore's collection().add()
      // (used by services/auditLogService.js). Equivalent to
      // .doc().set(data) but returns the created doc reference, like the
      // real SDK does.
      add: async (data) => {
        const ref = fs._doc(`${basePath}/auto${fs._autoId++}`);
        await ref.set(data);
        return ref;
      },
    };
  }

  _query(basePath) {
    const fs = this;
    const state = { orderByField: null, dir: 'asc', limitN: null };
    const api = {
      orderBy(field, dir = 'asc') {
        state.orderByField = field;
        state.dir = dir;
        return api;
      },
      limit(n) {
        state.limitN = n;
        return api;
      },
      async get() {
        const snap = await fs._directChildrenSnapshot(basePath);
        let docs = snap.docs;
        if (state.orderByField) {
          docs = [...docs].sort((a, b) => {
            const av = a.data()[state.orderByField];
            const bv = b.data()[state.orderByField];
            const cmp = av > bv ? 1 : av < bv ? -1 : 0;
            return state.dir === 'desc' ? -cmp : cmp;
          });
        }
        if (state.limitN) docs = docs.slice(0, state.limitN);
        return { docs, empty: docs.length === 0 };
      },
    };
    return api;
  }

  async _directChildrenSnapshot(basePath) {
    const prefix = `${basePath}/`;
    const docs = [];
    for (const [path, entry] of this.store.entries()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest.includes('/')) continue; // only direct children, not grandchildren
      docs.push({ id: rest, data: () => entry.data });
    }
    return { docs, empty: docs.length === 0 };
  }

  _doc(path) {
    const fs = this;
    return {
      __path: path,
      id: path.split('/').pop(),
      collection: (name) => fs._collection(`${path}/${name}`),
      get: async () => {
        const entry = fs.store.get(path);
        return { exists: !!entry, data: () => entry?.data, id: path.split('/').pop() };
      },
      set: async (data) => {
        const prev = fs.store.get(path);
        fs.store.set(path, { version: prev ? prev.version + 1 : 1, data });
      },
      update: async (patch) => {
        const prev = fs.store.get(path);
        if (!prev) throw new Error(`FakeFirestore: cannot update non-existent doc ${path}`);
        fs.store.set(path, { version: prev.version + 1, data: { ...prev.data, ...patch } });
      },
    };
  }

  async runTransaction(fn, options = {}) {
    const maxAttempts = options.maxAttempts ?? 50;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const readVersions = new Map();
      const pendingWrites = [];
      const tx = {
        get: async (ref) => {
          if (this.strictTransactionOrder && pendingWrites.length > 0) {
            // Identical message to the real @google-cloud/firestore SDK, so a
            // test failure here reads the same as the live bug this guards.
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          const entry = this.store.get(ref.__path);
          readVersions.set(ref.__path, entry ? entry.version : 0);
          return { exists: !!entry, data: () => entry?.data, id: ref.id };
        },
        set: (ref, data) => {
          pendingWrites.push({ path: ref.__path, type: 'set', data });
        },
        update: (ref, patch) => {
          pendingWrites.push({ path: ref.__path, type: 'update', data: patch });
        },
      };
      // A thrown validation/business error propagates immediately, no retry.
      const result = await fn(tx);
      const stale = [...readVersions.entries()].some(([path, v]) => {
        const current = this.store.get(path);
        return (current ? current.version : 0) !== v;
      });
      if (stale) continue;
      for (const w of pendingWrites) {
        const prev = this.store.get(w.path);
        if (w.type === 'update') {
          if (!prev) throw new Error(`FakeFirestore: cannot update non-existent doc ${w.path}`);
          this.store.set(w.path, { version: prev.version + 1, data: { ...prev.data, ...w.data } });
        } else {
          this.store.set(w.path, { version: prev ? prev.version + 1 : 1, data: w.data });
        }
      }
      return result;
    }
    throw new Error('transaction retry limit exceeded');
  }
}

module.exports = { FakeFirestore };
