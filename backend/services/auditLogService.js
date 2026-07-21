const { getFirestore } = require('../config/firebase');

// Central audit trail for security-relevant events (Golden Rule #6 / T-3.10).
// Best-effort: a logging failure must never block the action it's recording.
const recordAuditLog = async ({ actorUid, actorEmail, action, targetType, targetId, meta = {}, req }) => {
  try {
    await getFirestore().collection('auditLogs').add({
      actorUid: actorUid || null,
      actorEmail: actorEmail || null,
      action,
      targetType: targetType || null,
      targetId: targetId || null,
      meta,
      ip: req?.ip || null,
      userAgent: req?.headers?.['user-agent'] || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
};

module.exports = { recordAuditLog };
