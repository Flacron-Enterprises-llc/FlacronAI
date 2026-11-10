// Open Service Broker API (v2.12+) for the IBM Cloud catalog listing.
// IBM's Resource Controller calls these with HTTP Basic auth whenever a
// customer adds, removes or binds the FlacronAI agent. Mounted at
// /ibm-broker, so the broker URL registered in Partner Center is
// https://<api host>/ibm-broker. See services/ibmAgentService.js for the
// full lifecycle.
const express = require('express');
const { getFirestore } = require('../config/firebase');
const ibm = require('../services/ibmAgentService');

const createIbmBrokerRouter = ({ getDb = getFirestore } = {}) => {
  const router = express.Router();

  router.get('/', (req, res) => res.json({ ok: true, name: 'flacronai-osb-broker', configured: ibm.isBrokerConfigured() }));

  router.use('/v2', (req, res, next) => {
    const c = ibm.config();
    if (!ibm.isBrokerConfigured()) {
      return res.status(503).json({ description: 'Broker is not configured' });
    }
    const [scheme, encoded] = String(req.headers.authorization || '').split(' ');
    const [user, ...rest] = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString('utf8').split(':') : [];
    if (!user || !ibm.safeEqual(user, c.brokerUsername) || !ibm.safeEqual(rest.join(':'), c.brokerPassword)) {
      res.set('WWW-Authenticate', 'Basic realm="flacronai-osb-broker"');
      return res.status(401).json({ description: 'Invalid broker credentials' });
    }
    return next();
  });

  router.get('/v2/catalog', (req, res) => {
    const c = ibm.config();
    const plans = [];
    if (c.freePlanId) plans.push({ id: c.freePlanId, name: 'free', description: 'Free to add. Uses your FlacronAI plan limits.', free: true });
    if (c.starterPlanId) plans.push({ id: c.starterPlanId, name: 'starter', description: `Pay as you go: one pack = ${c.packSize} Super Intelligence report generations, billed by IBM.`, free: false });
    res.json({
      services: [{
        id: c.serviceId,
        name: 'flacronai-agent',
        description: 'Super Intelligence agent that generates insurance and property inspection reports, exports them and manages CRM clients and claims.',
        bindable: true,
        plan_updateable: false,
        plans,
      }],
    });
  });

  router.put('/v2/service_instances/:instanceId', async (req, res) => {
    const { instanceId } = req.params;
    const { service_id: serviceId, plan_id: planId, context = {} } = req.body || {};
    const kind = ibm.planKind(planId);
    if (serviceId !== ibm.config().serviceId || !kind) {
      return res.status(400).json({ description: 'Unknown service_id or plan_id' });
    }
    try {
      const ref = getDb().collection('ibmInstances').doc(instanceId);
      const snap = await ref.get();
      const dashboardUrl = ibm.dashboardUrlFor(instanceId);
      if (snap.exists) {
        const existing = snap.data();
        if (existing.planId === planId && existing.status === 'active') {
          return res.status(200).json({ dashboard_url: dashboardUrl });
        }
        return res.status(409).json({ description: 'Instance already exists with different attributes' });
      }
      const now = new Date().toISOString();
      await ref.set({
        instanceId,
        planId,
        planKind: kind,
        status: 'active',
        accountId: context.account_id || null,
        crn: context.crn || null,
        linkedUserId: null,
        createdAt: now,
        updatedAt: now,
      });
      return res.status(201).json({ dashboard_url: dashboardUrl });
    } catch (err) {
      console.error('[ibmBroker] provision failed:', err.message);
      return res.status(500).json({ description: 'Provision failed' });
    }
  });

  // Plans are not updatable (plan_updateable: false in the catalog).
  router.patch('/v2/service_instances/:instanceId', (req, res) =>
    res.status(422).json({ error: 'PlanChangeNotSupported', description: 'Changing plans is not supported; create a new instance.' }));

  router.delete('/v2/service_instances/:instanceId', async (req, res) => {
    const { instanceId } = req.params;
    try {
      const db = getDb();
      const ref = db.collection('ibmInstances').doc(instanceId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(410).json({});
      const { linkedUserId } = snap.data();
      const now = new Date().toISOString();
      await ref.set({ status: 'deprovisioned', deprovisionedAt: now, updatedAt: now }, { merge: true });
      if (linkedUserId) {
        // Stop IBM metering; the user keeps their FlacronAI account and data.
        await db.collection('users').doc(linkedUserId).set({ ibmStatus: 'deprovisioned' }, { merge: true });
      }
      return res.status(200).json({});
    } catch (err) {
      console.error('[ibmBroker] deprovision failed:', err.message);
      return res.status(500).json({ description: 'Deprovision failed' });
    }
  });

  router.get('/v2/service_instances/:instanceId/last_operation', (req, res) => res.status(200).json({ state: 'succeeded' }));

  router.put('/v2/service_instances/:instanceId/service_bindings/:bindingId', async (req, res) => {
    const { instanceId } = req.params;
    try {
      const snap = await getDb().collection('ibmInstances').doc(instanceId).get();
      if (!snap.exists || snap.data().status !== 'active') {
        return res.status(422).json({ description: 'Instance is not active' });
      }
      const c = ibm.config();
      return res.status(201).json({
        credentials: {
          dashboard_url: ibm.dashboardUrlFor(instanceId),
          openapi_url: `${c.apiUrl}/api/v1/orchestrate/openapi.json`,
          docs_url: `${c.webUrl}/developers`,
          auth: 'Create an API key in FlacronAI (Settings > API keys) and send it as the x-api-key header.',
        },
      });
    } catch (err) {
      console.error('[ibmBroker] bind failed:', err.message);
      return res.status(500).json({ description: 'Bind failed' });
    }
  });

  router.delete('/v2/service_instances/:instanceId/service_bindings/:bindingId', (req, res) => res.status(200).json({}));

  return router;
};

module.exports = createIbmBrokerRouter();
module.exports.createIbmBrokerRouter = createIbmBrokerRouter;
