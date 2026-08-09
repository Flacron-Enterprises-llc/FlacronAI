// Canonical catalog of outbound webhook events FlacronAI actually emits.
// Only events listed here can be delivered or subscribed to. Do NOT add an
// event name here unless code somewhere calls emitEvent() with it — the API
// docs are generated from this list and must never advertise a phantom event.
const WEBHOOK_EVENTS = Object.freeze([
  'report.generated', // a new AI draft report was created (status: draft)
  'report.finalized', // a report was reviewed + approved by a licensed adjuster
]);

const isValidWebhookEvent = (event) => WEBHOOK_EVENTS.includes(event);

// Signature scheme (mirrors the Stripe-style scheme already used inbound):
//   header:  Flacron-Signature: t=<unixSeconds>,v1=<hex HMAC-SHA256>
//   signed:  `${t}.${rawJsonBody}`  using the endpoint's signing secret
const SIGNATURE_HEADER = 'Flacron-Signature';
const SIGNATURE_VERSION = 'v1';

// Delivery policy — the values here are what the service actually enforces and
// what the docs quote. Keep the two in lock-step.
const DELIVERY_POLICY = Object.freeze({
  timeoutMs: 8000, // per-attempt HTTP timeout
  maxAttempts: 4, // 1 initial + 3 retries
  backoffMs: Object.freeze([0, 5000, 30000, 120000]), // delay before attempt N (index 0 = first try)
  successStatusRange: Object.freeze([200, 299]), // any 2xx = delivered
});

module.exports = {
  WEBHOOK_EVENTS,
  isValidWebhookEvent,
  SIGNATURE_HEADER,
  SIGNATURE_VERSION,
  DELIVERY_POLICY,
};
