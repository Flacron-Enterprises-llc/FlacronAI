# Proposed legal-text corrections (NOT applied — awaiting client review)

> Revised 2026-10-07 per client instruction: every sentence states only verified implementation; no
> invented periods, trial terms or refund commitments; no "[confirm]" placeholders. Values the company
> has not decided are listed separately at the end and are simply not stated until decided.

## Evidence

- No approved requirement for account recovery; automated retention/expiry deliberately deferred by
  the client on 2026-07-22 (CLAUDE.md / PROGRESS.md).
- `DELETE /users/account` (+ `services/accountDeletionCleanup.js`): Stripe subscriptions cancelled and
  confirmed first; profile, reports (versions/comments), photos, exports, logos, drafts, templates, API
  keys, webhooks, CRM records, notifications, push devices and the sign-in deleted immediately; a
  part-failed deletion is finished automatically (sweeper, ~10 min); no recovery path exists. Kept:
  billing/invoice/purchase records, audit logs, contact/sales-form messages, a deletion record.
- No automatic expiry of reports, photos or audit logs (live Settings → Data already says "There is
  currently no automatic expiry").
- No free trial in code, Stripe checkout or the Pricing page.

## 1. Privacy Policy §5 — `frontend/src/pages/PrivacyPolicy.jsx`

**Before**
> - **After account closure:** Account data is retained for 90 days after account closure to allow for recovery requests, then deleted from primary systems within 180 days. Backups may retain data for an additional 90 days.
> - **Reports:** Generated reports are retained until explicitly deleted by you, or for 3 years if you do not delete them, subject to your plan's storage limits.
> - **Photos:** Uploaded photos are stored for 90 days after report generation, then automatically purged unless explicitly saved.

**After**
> - **After account deletion:** When you delete your account, your profile, reports, photos, exports and other account content are permanently deleted from our active systems right away. Deleted accounts cannot be recovered. If part of a deletion cannot be completed immediately, it is completed automatically shortly afterwards.
> - **Reports:** Generated reports are retained until you delete them or delete your account.
> - **Photos:** Uploaded photos are retained with their report until you delete the report or your account.
> - **Records kept after account deletion:** billing and invoice records (see Payment records), security audit logs, messages you sent through our contact or sales forms, and a minimal record that the account was deleted, which prevents it from being recreated or re-linked to a purchase.

Unchanged: intro sentence, "Active accounts", "Payment records … 7 years", "Deletion requests".

## 2. Security page — `frontend/src/pages/Security.jsx`

**Before**
> Audit logs (login events, security actions, admin actions) are retained for 90 days after the event. Logs are stored in Firestore and are accessible only to platform administrators.

**After**
> Audit logs (login events, security actions, admin actions) are stored in Firestore, are accessible only to platform administrators, and are kept after account deletion for security purposes.

## 3. Refund & Cancellation Policy — `frontend/src/pages/RefundPolicy.jsx`

**Add (end of §4 Refund Policy)**
> Subscriptions purchased in the FlacronAI iOS or Android app are billed by Apple (App Store) or Google (Google Play). Manage or cancel them in your App Store or Google Play subscription settings; refund requests for these purchases are handled by Apple or Google under their own policies. Deleting your FlacronAI account does not cancel an App Store or Google Play subscription.

**§6 Free Trial Terms — Before**
> [CLIENT TO CONFIRM: Does FlacronAI offer a free trial? If yes, specify duration, features, and billing behavior.]
> If a free trial is offered: … (conditional bullets)

**After** (states only the verified fact; no trial terms)
> FlacronAI does not currently offer a free trial. The Starter plan is free.

## Values not decided by the company (left out of the text above until decided)

1. **Backup retention** — whether Firestore/Storage backups (PITR, versioning) are enabled and for how long. If enabled, add one sentence with the real period.
2. **Audit-log retention period** — none is enforced today; choose a period (and implement expiry) if one should be stated.
3. **Contact/sales-form message retention period** — none enforced or stated.
