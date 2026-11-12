// IBM Cloud catalog (Partner Center "Agent" listing) support for FlacronAI.
//
// Lifecycle, same model as the published Flacron AR AI Agent:
//   1. A customer adds the agent from the IBM Cloud catalog. IBM's Resource
//      Controller calls our Open Service Broker (routes/ibmBroker.js), which
//      records the instance in `ibmInstances/{instanceId}` and answers with a
//      signed dashboard_url.
//   2. The customer opens that link, signs in to FlacronAI, and the instance
//      is linked to their user (routes/ibm.js -> linkInstanceToUser). They
//      then create an API key in Settings and import our OpenAPI tools
//      (routes/orchestrate.js) into watsonx Orchestrate.
//   3. On the paid "starter" plan IBM bills the customer: every PACK_SIZE
//      successful report generations we report one pack to IBM's Usage
//      Metering API, and FlacronAI's own monthly report quota no longer
//      applies to that user. The free plan keeps the user's normal tier.
//   4. Deprovision unlinks the user and stops metering. No data is deleted.
const crypto = require('crypto');

const IAM_TOKEN_URL = 'https://iam.cloud.ibm.com/identity/token';
const METERING_BASE_URL = 'https://billing.cloud.ibm.com';

const config = () => ({
  brokerUsername: process.env.IBM_BROKER_USERNAME || '',
  brokerPassword: process.env.IBM_BROKER_PASSWORD || '',
  linkSecret: process.env.IBM_LINK_SECRET || '',
  serviceId: process.env.IBM_SERVICE_ID || '',
  freePlanId: process.env.IBM_FREE_PLAN_ID || '',
  starterPlanId: process.env.IBM_STARTER_PLAN_ID || '',
  catalogId: process.env.IBM_GLOBAL_CATALOG_ID || '',
  measureId: process.env.IBM_METERING_MEASURE_ID || '',
  meteringApiKey: process.env.IBM_METERING_API_KEY || '',
  packSize: Math.max(1, parseInt(process.env.IBM_PACK_SIZE || '5', 10) || 5),
  webUrl: (process.env.FRONTEND_URL || 'https://flacronai.com').replace(/\/+$/, ''),
  apiUrl: (process.env.PUBLIC_API_URL || process.env.API_URL || 'https://api.flacronai.com').replace(/\/+$/, ''),
});

const isBrokerConfigured = () => {
  const c = config();
  return Boolean(c.brokerUsername && c.brokerPassword && c.linkSecret && c.serviceId && (c.freePlanId || c.starterPlanId));
};

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

const signInstance = (instanceId) =>
  crypto.createHmac('sha256', config().linkSecret).update(`ibm-instance:${instanceId}`).digest('base64url');

const verifyInstanceSignature = (instanceId, sig) => {
  if (!config().linkSecret || !instanceId || !sig) return false;
  return safeEqual(signInstance(instanceId), sig);
};

const dashboardUrlFor = (instanceId) => {
  const c = config();
  const q = new URLSearchParams({ instance: instanceId, sig: signInstance(instanceId) });
  return `${c.webUrl}/ibm/connect?${q.toString()}`;
};

/** 'starter' for the paid plan, 'free' for the free plan, null for an unknown plan id. */
const planKind = (planId) => {
  const c = config();
  if (planId && planId === c.starterPlanId) return 'starter';
  if (planId && planId === c.freePlanId) return 'free';
  return null;
};

/** True when IBM (not FlacronAI's own tier quota) pays for this user's report generations. */
const isIbmMeteredUser = (userData) =>
  Boolean(userData && userData.ibmInstanceId && userData.ibmStatus === 'active' && userData.ibmPlanKind === 'starter');

/** A pack is reported when a generation starts a new pack: generations 1, PACK+1, 2*PACK+1, ... */
const startsNewPack = (generationsBefore, packSize = config().packSize) => generationsBefore % packSize === 0;

let cachedToken = null;
const getIamToken = async (fetchImpl) => {
  const apiKey = config().meteringApiKey;
  if (!apiKey) throw new Error('IBM_METERING_API_KEY is not configured');
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetchImpl(IAM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'urn:ibm:params:oauth:grant-type:apikey', apikey: apiKey }),
  });
  if (!res.ok) throw new Error(`IBM IAM token exchange failed (${res.status})`);
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.value;
};

/**
 * Reports `quantity` packs for an instance. Never throws: a metering failure
 * must not break the customer's report; it is logged for reconciliation.
 */
const reportPacks = async (instanceId, planId, quantity = 1, fetchImpl = globalThis.fetch) => {
  const c = config();
  if (!c.catalogId || !c.measureId) {
    console.error('[ibmMetering] IBM_GLOBAL_CATALOG_ID or IBM_METERING_MEASURE_ID not configured; usage not reported', { instanceId });
    return false;
  }
  try {
    const token = await getIamToken(fetchImpl);
    const now = Date.now();
    const res = await fetchImpl(`${METERING_BASE_URL}/v4/metering/resources/${encodeURIComponent(c.catalogId)}/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        resourceUsage: [{
          resource_instance_id: instanceId,
          plan_id: planId,
          start: now,
          end: now,
          measured_usage: [{ measure: c.measureId, quantity }],
        }],
      }),
    });
    if (!res.ok) {
      console.error(`[ibmMetering] usage report failed (${res.status}) for ${instanceId}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[ibmMetering] usage report threw for ${instanceId}:`, err.message);
    return false;
  }
};

/**
 * Called once per successful report generation. Counts the generation for an
 * IBM-metered user and reports a pack to IBM when it opens a new one.
 */
const recordIbmGeneration = async (db, uid, { report = reportPacks } = {}) => {
  const userRef = db.collection('users').doc(uid);
  let toReport = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists ? snap.data() : {};
    if (!isIbmMeteredUser(data)) return;
    const before = data.ibmGenerations || 0;
    tx.set(userRef, { ibmGenerations: before + 1 }, { merge: true });
    toReport = startsNewPack(before) ? { instanceId: data.ibmInstanceId, planId: data.ibmPlanId } : null;
  });
  if (toReport) {
    const ok = await report(toReport.instanceId, toReport.planId, 1);
    // Audit trail for reconciliation with IBM's invoice (ok=false => retry by hand).
    await db.collection('ibmUsageReports').add({
      instanceId: toReport.instanceId, uid, planId: toReport.planId, packs: 1, ok, createdAt: new Date().toISOString(),
    }).catch(() => {});
  }
  return toReport;
};

/** Links a provisioned, active, not-yet-claimed instance to the signed-in user. */
const linkInstanceToUser = async (db, { instanceId, sig, uid }) => {
  if (!verifyInstanceSignature(instanceId, sig)) return { ok: false, status: 403, code: 'INVALID_LINK' };
  const instRef = db.collection('ibmInstances').doc(instanceId);
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async (tx) => {
    const inst = await tx.get(instRef);
    const user = await tx.get(userRef);
    if (!inst.exists) return { ok: false, status: 404, code: 'UNKNOWN_INSTANCE' };
    const data = inst.data();
    if (data.status !== 'active') return { ok: false, status: 410, code: 'INSTANCE_NOT_ACTIVE' };
    if (data.linkedUserId && data.linkedUserId !== uid) return { ok: false, status: 409, code: 'INSTANCE_ALREADY_LINKED' };
    const userData = user.exists ? user.data() : {};
    if (userData.ibmInstanceId && userData.ibmInstanceId !== instanceId && userData.ibmStatus === 'active') {
      return { ok: false, status: 409, code: 'USER_ALREADY_LINKED' };
    }
    const now = new Date().toISOString();
    tx.set(instRef, { linkedUserId: uid, linkedAt: data.linkedAt || now, updatedAt: now }, { merge: true });
    tx.set(userRef, {
      ibmInstanceId: instanceId,
      ibmPlanId: data.planId,
      ibmPlanKind: data.planKind,
      ibmStatus: 'active',
      ibmLinkedAt: now,
    }, { merge: true });
    return { ok: true, status: 200, planKind: data.planKind };
  });
};

module.exports = {
  config,
  isBrokerConfigured,
  safeEqual,
  signInstance,
  verifyInstanceSignature,
  dashboardUrlFor,
  planKind,
  isIbmMeteredUser,
  startsNewPack,
  reportPacks,
  recordIbmGeneration,
  linkInstanceToUser,
};
