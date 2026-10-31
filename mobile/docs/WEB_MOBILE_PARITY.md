# Web ↔ Mobile Parity Plan and Checklist

Started 2026-10-30 on local branch `integration/web-mobile-combined`. Source baseline `b3a2176`
(= `origin/qa/web-mobile-combined`; contains `origin/main` `0e98bed` and the PR #30 head `eda1d76` through merge
`9f15606`, so PR #30 is represented in history and was not re-merged). Recovery point: local branch
`checkpoint/pre-mobile-parity-2026-10-30`. Nothing pushed, deployed or distributed.

Reference = the web code (`frontend/src`). **Status:** ✅ done · 🟡 partial · ⛔ not native (reason + equivalent).
**Evidence:** S = source review against the web/backend code · U = unit test · T = typecheck + lint · B = Android + iOS
Hermes bundle export · E = emulator/device. **No E evidence exists for this work** (no emulator or phone on this PC).

## Phases

| Phase | Scope | Status | Commit |
|---|---|---|---|
| P1 | Design system (web tokens, Card/Badge/TierBadge/MetricCard/ProgressBar/ScreenHeader, Feather icons, web StatusBadge palette), tabs = web sidebar | ✅ S T B | `fec4a3a` |
| P2 | Dashboard = web home view | ✅ S T B | `fec4a3a` |
| P3 | Notification inbox + bell | ✅ S T B | `fec4a3a` |
| P4 | Report detail: formatted body, live analysis, edit, export options, share links, photo review, comment replies, owner menu | ✅ S U T B | `c1ce230` |
| P5 | My Reports search + filters; archive/restore/delete/duplicate | ✅ S T B | `c1ce230` |
| P6 | Wizard field parity + saved templates | 🟡 S T B (see gaps) | `fec4a3a` |
| P7 | Settings sections, email prefs, login history, data export, delete archived | ✅ S T B | `cbf4d00` |
| P8 | Analytics, Usage & Billing, product tour (per-user, shared with web), More | ✅ S T B | `fec4a3a` |
| SEO | Private web routes noindex + test; store listing draft; app-links recommendation | ✅ S U | `fec4a3a`, `1a6ee0f` |

## Checklist

### Navigation & design
| Item | Status | Evidence / file |
|---|---|---|
| Brand tokens (orange #FD4403, navy #002A64, surfaces, gray-600 muted) | ✅ | S — `src/theme/colors.ts` (dark muted drift fixed) |
| Space Grotesk headings / Inter body | ✅ (existing) | S |
| Icons in the web's lucide style | ✅ | S B — `components/ui/Icon.tsx` (Feather; font asset hash-verified in the bundle) |
| Web `.card`, `.btn-primary/secondary/danger`, StatusBadge, TierBadge | ✅ | S — `components/ui/*`, `PrimaryButton.tsx`, `StatusBadge.tsx` |
| Sidebar → tabs: Dashboard, My Reports, Generate, More | ✅ | S T — `app/(app)/(tabs)/_layout.tsx` |
| Templates, Analytics, Usage & Billing, Settings, Notifications, Help in More | ✅ | `features/more/MoreScreen.tsx` |
| CRM / Integrations / Organization / Enterprise Portal shown only to plans that include them, opening the web | ✅ | gated on `/users/usage` features + tier |
| 16px phone gutter, max-width columns on tablets, 44pt targets | ✅ | S — `ScreenContainer`, screens' `maxWidth` |
| "Super Intelligence" / "FLACRON ENGINE" wording | ✅ | S — no user-facing "AI" in `mobile/src`/`app` |

### Dashboard (web `home` view)
| Item | Status | Evidence |
|---|---|---|
| Time-of-day greeting, first name, Generate Report CTA | ✅ | `DashboardScreen.tsx` |
| Plan card: avatar, email, tier badge, Used / Limit / Left, % bar with 70/90 colours, 80% warning, limit reached → upgrade | ✅ | `GET /users/usage` |
| Four metric cards (Reports This Month, Photos Analyzed, Awaiting Review, Completed) | ✅ | usage + `GET /reports/dashboard-summary`; "—"/"Unavailable" on error |
| Recent Reports (claim, insured, type, loss, photos, status, updated, created by) | ✅ | `ReportCard.tsx` |
| Shared With You | ✅ | `GET /reports/assigned-to-me` (new client fn) |
| FLACRON ENGINE usage panel, storage "Not yet available" | ✅ | no invented numbers |
| Starter watermark banner | ✅ | `usage.features.watermark` |
| Notification bell with unread count | ✅ | `NotificationBell.tsx` |
| Two-column layout on tablets (≥720pt) | ✅ | S |

### Generate Report wizard
| Item | Status | Evidence |
|---|---|---|
| 5 steps, camera/library, per-photo upload, duplicates, retry, capacity, resume, discard (existing) | ✅ | Phase 5 |
| Inspection time, inspector name, inspector ID/license, contact present/name, Recommendations | ✅ | `LossDetailsStep.tsx` (server enums/lengths) |
| Report type `Re-Inspection` (web value) | ✅ | `wizard/constants.ts` |
| My Templates load + save (web field subset) | ✅ | `WizardTemplates.tsx` |
| Supporting documents (PDF/DOC/TXT) | 🟡 | API supports it; needs `expo-document-picker` (new native module → next native build). Not added. |
| Structural template picker, address autocomplete + property profile, CRM claim link, quick demos, commercial/flood/theft specialty fields, photo rotate/reorder/multi-select | 🟡 | Not built this pass — follow-up list below |

### Report detail
| Item | Status | Evidence |
|---|---|---|
| Report body rendered like web ReportMarkdown | ✅ | `markdown/*` + 5 parser tests |
| Live analysis progress (X of Y photos, drafting), retry on failure | ✅ | `AnalysisProgress.tsx` (`GET /:id/analysis-status`) |
| Edit draft content (owner/reviewer; blocked while processing/finalized; legacy approved reopens) | ✅ | `EditContentSheet.tsx`, rules unit-tested |
| Approve with signature (existing) + "Approved by" record | ✅ | `OverviewTab.tsx` |
| Photo review: accept, edit observation, note, room/area, exclude/include, analysis tags, suggestion label | ✅ | `PhotosTab.tsx`; **bug fixed:** Include never offered (mobile read `review.excluded`, backend uses `review.status`) |
| Comments with replies, author, time, resolve/reopen | ✅ | `CommentsTab.tsx` |
| Version history (list) | ✅ | existing; the backend has no restore endpoint |
| Export: plan-locked formats, photos per page, 5 content toggles, template defaults, DRAFT watermark note, native share | ✅ | `ExportSheet.tsx` (owner-only, matches backend) |
| Share links: view/comment/review, expiry, list, revoke | ✅ | `ShareSheet.tsx` (new client fns) |
| Duplicate, archive, restore, permanent delete | ✅ | owner menu, confirmations |
| Request supervisor review (needs an org member picker) | 🟡 | Not built; reviewers can already respond on mobile |
| Super Intelligence section assist / regenerate section, annotations, photo reorder, add photos to a report | 🟡 | Desktop editor tools — follow-up |
| Repair/Detailed Estimate, Invoice, Coverage Letter, Mold Supplement, Property Intelligence | ⛔ | Spreadsheet-style editors (ReportPreviewPage ~3,000 lines). Equivalent: web. Candidate for a later phase |

### My Reports
| Item | Status | Evidence |
|---|---|---|
| Search (debounced), status, loss type, report type filters; infinite scroll; empty/offline states | ✅ | `ReportsListScreen.tsx`, `useReportsList.ts` |
| Bulk select archive/delete | 🟡 | Single-report actions only |

### Account, billing, help
| Item | Status | Evidence |
|---|---|---|
| Sign-in, Google, Apple, MFA, verify, reset, website-account QA federation (existing) | ✅ | unchanged |
| Settings sections like web tabs | ✅ | `SettingsScreen.tsx` |
| Email notification preferences (6 web keys) | ✅ | `EmailNotificationsCard.tsx` |
| Push notification settings (existing) | ✅ | |
| Login history | ✅ | `LoginHistoryScreen.tsx` |
| Export my data, delete all archived | ✅ | `DataControlsCard.tsx` |
| Usage & Billing: meter + invoices | ✅ | `UsageBillingScreen.tsx` |
| Store purchase / restore (existing); Stripe checkout/cancel not in app | ⛔ | Store rules (Phase 7, §10 #5/#15) — unchanged billing code |
| Analytics (5 ranges, breakdowns, 12-month usage, per member) | ✅ | `AnalyticsScreen.tsx` (custom date range is web-only) |
| Saved templates management | ✅ | `TemplatesScreen.tsx` |
| Product tour, auto once per user, replay, `POST /users/product-tour` (shared completion with web) | ✅ | `features/tour/*` |
| Onboarding questionnaire (web `/onboarding`) | 🟡 | Not built — follow-up |
| Global search, Photo Library | 🟡 | Photo Library opens the web; search follow-up |
| API keys, webhooks, CRM, organization/team, enterprise, white-label, audit logs, admin | ⛔ | Desktop consoles; client decisions §10 #8–#14 open. Equivalent: More → On flacronai.com (plan-gated) |

## Billing / backend

No backend, billing, Stripe, store or deployment file was changed. Mobile reuses existing authorized endpoints only.
The export format lock uses the same display-only plan map as the web; the server stays authoritative.

## Verification (2026-10-30)

- Mobile: `tsc --noEmit` 0 errors · `expo lint` 0 problems · Jest **55 suites / 535 tests** pass ·
  `expo export` Android + iOS Hermes bundles build (Feather font included).
- Web: Vitest 356/356 (two files need their documented env: Growth Engine tests with `VITE_FCGE_DISABLED` unset,
  `apiMfaHeader` with a dummy `VITE_FIREBASE_API_KEY`) · `vite build` clean · new `privateRoutesNoindex` test.
- Not done: emulator/device runs, screenshots, tablet/landscape/large-text/TalkBack/VoiceOver checks, live staging
  API calls for the new endpoints. These need the next QA APK.

## External blockers

- No Android emulator or phone on this PC (8 GB RAM, no hypervisor).
- New QA APK: build + distribution need explicit approval (workflow builds `qa/web-mobile-combined` — this work is
  local on `integration/web-mobile-combined` and must be pushed there first, which also needs approval).
- Store products / sandbox testers; App Links / Universal Links signing fingerprints (client decision).

## Follow-up backlog (ranked)

1. Supporting documents (add `expo-document-picker` in a native build).
2. Request supervisor review (org member picker from `GET /teams/members`).
3. Section assist / regenerate section (`/:id/sections/assist`, `/sections/suggest`).
4. Address autocomplete + property profile, structural template picker, specialty claim fields.
5. Onboarding questionnaire; global search (`GET /search`).
6. Bulk archive/delete in My Reports; photo reorder/annotations; add photos to an existing report.
7. Derived documents (estimate, invoice, letters) — scope with the client.
