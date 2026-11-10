// Customer-facing side of the IBM Cloud catalog listing: the signed
// dashboard link from the broker lands on /ibm/connect in the web app, which
// calls POST /api/v1/ibm/link with the signed-in user's session.
const express = require('express');
const { getFirestore } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');
const ibm = require('../services/ibmAgentService');

const router = express.Router();

router.post('/link', authenticateToken, async (req, res) => {
  const instanceId = String(req.body?.instanceId || '').trim();
  const sig = String(req.body?.sig || '').trim();
  if (!instanceId || !sig) {
    return res.status(400).json({ success: false, error: 'Missing IBM instance link', code: 'VALIDATION_ERROR' });
  }
  try {
    const result = await ibm.linkInstanceToUser(getFirestore(), { instanceId, sig, uid: req.user.uid });
    if (!result.ok) {
      return res.status(result.status).json({ success: false, code: result.code, error: linkErrorMessage(result.code) });
    }
    return res.json({ success: true, planKind: result.planKind });
  } catch (err) {
    console.error('[ibm/link] failed:', err.message);
    return res.status(500).json({ success: false, error: 'Could not link your IBM subscription', code: 'IBM_LINK_FAILED' });
  }
});

router.get('/status', authenticateToken, async (req, res) => {
  const snap = await getFirestore().collection('users').doc(req.user.uid).get();
  const d = snap.exists ? snap.data() : {};
  return res.json({
    success: true,
    linked: Boolean(d.ibmInstanceId && d.ibmStatus === 'active'),
    planKind: d.ibmPlanKind || null,
    status: d.ibmStatus || null,
    generations: d.ibmGenerations || 0,
    packSize: ibm.config().packSize,
  });
});

const linkErrorMessage = (code) => ({
  INVALID_LINK: 'This IBM link is not valid. Open the agent again from your IBM Cloud resource list.',
  UNKNOWN_INSTANCE: 'This IBM subscription was not found.',
  INSTANCE_NOT_ACTIVE: 'This IBM subscription has been removed.',
  INSTANCE_ALREADY_LINKED: 'This IBM subscription is already linked to another FlacronAI account.',
  USER_ALREADY_LINKED: 'Your FlacronAI account is already linked to another IBM subscription.',
}[code] || 'Could not link your IBM subscription.');

module.exports = router;
