# Web ↔ Mobile Parity Plan and Checklist

Started 2026-10-30 on local branch `integration/web-mobile-combined` (base `b3a2176` = `origin/qa/web-mobile-combined`,
contains `origin/main` `0e98bed` and PR #30 head `eda1d76` via merge `9f15606`). Recovery point: local branch
`checkpoint/pre-mobile-parity-2026-10-30`. Nothing pushed, deployed or distributed.

Reference = the web code (`frontend/src`), not marketing copy. Status keys: ✅ done · 🟡 partial · ⛔ not on mobile (reason
given) · ⏳ planned. Evidence keys: **S** source review, **U** unit test, **T** typecheck/lint, **B** bundle export,
**E** emulator/device (none available on this PC — see blockers).

## Phases

| Phase | Scope | Status |
|---|---|---|
| P1 | Design system: web tokens (tints, card, status/tier badges), Feather icons (lucide's origin set), tab icons, "More" tab = web sidebar | ⏳ |
| P2 | Dashboard home = web `home` view: time greeting, usage meter + plan badge, 4 metric cards, recent reports, Shared With You, FLACRON ENGINE panel, Starter watermark banner, notification bell | ⏳ |
| P3 | Notification inbox (list, unread badge, mark read / all, tap-through) | ⏳ |
| P4 | Report detail: formatted report body, live analysis progress, content editing, tier-aware export + options, reviewer export, photo observation edit/note/area, comment replies, approved-by, share links | ⏳ |
| P5 | Reports list: search + filters, archive / restore / delete / duplicate | ⏳ |
| P6 | Wizard field parity (recommendations, inspector, inspection time, contact, Re-Inspection value), saved templates | ⏳ |
| P7 | Usage & Billing (meter, invoices), email notification preferences, login history, data export, delete archived, Help + tour replay | ⏳ |
| P8 | Analytics summary, onboarding tour with per-user completion (`POST /users/product-tour`) | ⏳ |

## Not offered natively (each has an equivalent)

| Web feature | Reason | Mobile equivalent |
|---|---|---|
| Stripe Checkout / cancel / photo packs | Apple/Google rules (Phase 7, §10 #5/#15) | Store purchase + restore; "managed on the web" note |
| Admin dashboard / plan config / tier update | Single-admin back office (Reuse §6) | None (web) |
| CRM, Organization/Team admin, Enterprise portal, White-label, Audit logs, API keys, Webhooks | Large desk-top admin/developer consoles; client decisions §10 #8–#14 still open | Listed under "More → On the web" (opens flacronai.com) |
| Derived documents (Repair/Detailed Estimate, Invoice, Coverage Letter, Mold Supplement, Property Intelligence) | Spreadsheet-style editors (ReportPreviewPage ~3000 lines) | Planned follow-up; open on web |
| Section-level rich editor, Super Intelligence section assist/regenerate, photo annotations, reorder | Desktop editing tools | Whole-report text editing (P4); follow-up |

## Checklist (updated per phase — evidence column)

See "Progress" below; each phase appends rows.

## Progress

- 2026-10-30 — Audit complete (two read-only sweeps of web report flow and account/org surfaces). Web: private routes now
  set `noindex, nofollow` (`frontend/src/components/ProtectedRoute.jsx`). Added `@expo/vector-icons@^15.0.2`
  (SDK-57 expected version, JS + font only, no native rebuild).

## External blockers

- No Android emulator/physical device on this PC (8 GB RAM, no hypervisor) — screens verified by source, unit tests,
  typecheck and bundle export only. Device QA needs the next QA APK (not built/distributed without approval).
- Store products / sandbox testers (App Store Connect, Play Console) — unchanged from Phase 7.
