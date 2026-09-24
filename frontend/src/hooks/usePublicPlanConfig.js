import { useSyncExternalStore, useEffect } from 'react';
import { paymentAPI } from '../services/api';
import { createPublicPlanConfigStore } from '../utils/publicPlanConfigStore';

// Phase 48 correction. Every page that displays plan/pack data (Pricing.jsx,
// FAQs.jsx, ...) shares this ONE module-level store instance, so mounting
// the hook in several places never fires more than one in-flight fetch
// (see publicPlanConfigStore.js's own header comment for why).
const store = createPublicPlanConfigStore({ fetchFn: () => paymentAPI.getPublicPlanConfig() });

export default function usePublicPlanConfig() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => { store.ensureLoaded(); }, []);
  return { ...snapshot, reload: store.reload };
}
