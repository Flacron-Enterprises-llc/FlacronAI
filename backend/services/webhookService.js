const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getFirestore } = require('../config/firebase');
const {
  isValidWebhookEvent,
  SIGNATURE_HEADER,
  SIGNATURE_VERSION,
  DELIVERY_POLICY,
} = require('../config/webhookEvents');

// ── SIGNING ───────────────────────────────────────────────────────────────────
// Sign `${timestamp}.${body}` with the endpoint secret (HMAC-SHA256). This binds
// the signature to both the exact bytes AND the time, so a captured payload can't
// be replayed indefinitely (receivers reject stale timestamps).
const computeSignature = (secret, timestamp, rawBody) =>
  crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

const buildSignatureHeader = (secret, timestamp, rawBody) =>
  `t=${timestamp},${SIGNATURE_VERSION}=${computeSignature(secret, timestamp, rawBody)}`;

// Constant-time verification used by tests and (documented) by receivers.
// toleranceSeconds guards against replay of old payloads.
const verifySignature = (secret, header, rawBody, { toleranceSeconds = 300, now } = {}) => {
  if (typeof header !== 'string') return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const idx = kv.indexOf('=');
      return idx === -1 ? [kv, ''] : [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    })
  );
  const t = Number(parts.t);
  const provided = parts[SIGNATURE_VERSION];
  if (!Number.isFinite(t) || !provided) return false;

  const current = Number.isFinite(now) ? now : Math.floor(Date.now() / 1000);
  if (Math.abs(current - t) > toleranceSeconds) return false;

  const expected = computeSignature(secret, t, rawBody);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

// ── ENDPOINT MANAGEMENT ─────────────────────────────────────────────────────
const generateSecret = () => 'whsec_' + crypto.randomBytes(24).toString('hex');

const maskSecret = (secret) =>
  typeof secret === 'string' && secret.length > 12
    ? `${secret.slice(0, 10)}…${secret.slice(-4)}`
    : 'whsec_…';

const registerEndpoint = async (userId, { url, events, description }) => {
  const db = getFirestore();
  const endpointId = uuidv4();
  const secret = generateSecret();
  const doc = {
    endpointId,
    userId,
    url,
    events: [...new Set(events)].filter(isValidWebhookEvent),
    description: (description || '').slice(0, 200),
    secret, // stored server-side only; returned in full ONCE at creation/rotation
    active: true,
    createdAt: new Date().toISOString(),
    lastDeliveryAt: null,
    failureCount: 0,
  };
  await db.collection('webhookEndpoints').doc(endpointId).set(doc);
  // Full secret returned exactly once — the caller must store it now.
  return { endpointId, url: doc.url, events: doc.events, description: doc.description, secret };
};

const listEndpoints = async (userId) => {
  const db = getFirestore();
  const snap = await db.collection('webhookEndpoints')
    .where('userId', '==', userId)
    .where('active', '==', true)
    .get();
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((d) => ({
      endpointId: d.endpointId,
      url: d.url,
      events: d.events,
      description: d.description,
      createdAt: d.createdAt,
      lastDeliveryAt: d.lastDeliveryAt,
      failureCount: d.failureCount || 0,
      secretHint: maskSecret(d.secret),
    }));
};

const deleteEndpoint = async (endpointId, userId) => {
  const db = getFirestore();
  const ref = db.collection('webhookEndpoints').doc(endpointId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().userId !== userId) throw new Error('Webhook endpoint not found');
  await ref.update({ active: false, revokedAt: new Date().toISOString() });
};

const rotateSecret = async (endpointId, userId) => {
  const db = getFirestore();
  const ref = db.collection('webhookEndpoints').doc(endpointId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().userId !== userId) throw new Error('Webhook endpoint not found');
  const secret = generateSecret();
  await ref.update({ secret, rotatedAt: new Date().toISOString() });
  return { endpointId, secret };
};

// ── DELIVERY ─────────────────────────────────────────────────────────────────
// One HTTP attempt with a hard timeout. Returns { ok, status } — never throws.
const attemptDelivery = async (url, headers, rawBody) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_POLICY.timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: controller.signal,
    });
    const [min, max] = DELIVERY_POLICY.successStatusRange;
    return { ok: resp.status >= min && resp.status <= max, status: resp.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
};

// Deliver one event to one endpoint with bounded in-process retries.
// NOTE: retries are in-process (setTimeout) and best-effort — a process restart
// drops any pending retry. This is deliberately NOT a durable queue; the docs
// state this limitation plainly. Every attempt is logged to webhookDeliveries.
const deliverToEndpoint = async (endpoint, envelope) => {
  const db = getFirestore();
  const rawBody = JSON.stringify(envelope);
  const deliveryId = envelope.id; // event id doubles as idempotency key for receivers

  const runAttempt = async (attempt) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'FlacronAI-Webhooks/1',
      'Flacron-Event': envelope.type,
      'Flacron-Delivery': deliveryId,
      'Flacron-Attempt': String(attempt + 1),
      [SIGNATURE_HEADER]: buildSignatureHeader(endpoint.secret, timestamp, rawBody),
    };
    const result = await attemptDelivery(endpoint.url, headers, rawBody);

    // Best-effort delivery log (never blocks / throws).
    db.collection('webhookDeliveries').add({
      endpointId: endpoint.endpointId,
      userId: endpoint.userId,
      eventId: deliveryId,
      eventType: envelope.type,
      attempt: attempt + 1,
      ok: result.ok,
      responseStatus: result.status,
      error: result.error || null,
      at: new Date().toISOString(),
    }).catch(() => {});

    if (result.ok) {
      db.collection('webhookEndpoints').doc(endpoint.endpointId)
        .update({ lastDeliveryAt: new Date().toISOString(), failureCount: 0 })
        .catch(() => {});
      return;
    }

    const nextAttempt = attempt + 1;
    if (nextAttempt < DELIVERY_POLICY.maxAttempts) {
      const delay = DELIVERY_POLICY.backoffMs[nextAttempt] || 0;
      setTimeout(() => { runAttempt(nextAttempt).catch(() => {}); }, delay);
    } else {
      db.collection('webhookEndpoints').doc(endpoint.endpointId)
        .update({ failureCount: (endpoint.failureCount || 0) + 1 })
        .catch(() => {});
    }
  };

  await runAttempt(0);
};

// ── EMIT ─────────────────────────────────────────────────────────────────────
// Build the signed envelope and fan out to every active endpoint the user has
// subscribed to this event. Fire-and-forget: callers do NOT await this and it
// never throws — a webhook problem must never break the API request that
// triggered it. Returns the event id (useful for logs/tests).
const emitEvent = async (userId, type, data) => {
  if (!isValidWebhookEvent(type)) return null;
  const eventId = 'evt_' + uuidv4().replace(/-/g, '');
  try {
    const db = getFirestore();
    const snap = await db.collection('webhookEndpoints')
      .where('userId', '==', userId)
      .where('active', '==', true)
      .get();

    const targets = snap.docs
      .map((d) => d.data())
      .filter((e) => Array.isArray(e.events) && e.events.includes(type));

    if (targets.length === 0) return eventId;

    const envelope = {
      id: eventId,
      type,
      createdAt: new Date().toISOString(),
      data,
    };

    // Deliver to each endpoint independently; one failure never blocks another.
    targets.forEach((endpoint) => { deliverToEndpoint(endpoint, envelope).catch(() => {}); });
    return eventId;
  } catch (err) {
    console.error('[webhookService] emitEvent error:', err.message);
    return eventId;
  }
};

module.exports = {
  computeSignature,
  buildSignatureHeader,
  verifySignature,
  generateSecret,
  maskSecret,
  registerEndpoint,
  listEndpoints,
  deleteEndpoint,
  rotateSecret,
  emitEvent,
};
