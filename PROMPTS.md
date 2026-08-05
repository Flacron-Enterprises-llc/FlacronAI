# PROMPTS.md — Claude Code Prompts (copy-paste, one at a time)

**How to use:** Put `CLAUDE.md`, `PROGRESS.md`, `TASKS.md`, `PROMPTS.md` in the project root.
Start each Claude Code session by pasting the **Session-start prompt**, then paste **one task prompt**. Never paste two task prompts at once.

---

## Session-start prompt (paste at the beginning of every session)

```
Read CLAUDE.md, then PROGRESS.md, then the relevant task in TASKS.md — in that order.
Do NOT re-scan the whole codebase; use the Project Map + Tech Stack in CLAUDE.md.
Confirm back to me in 3 lines: (1) current focus from PROGRESS.md, (2) the Golden Rules that apply to today's task, (3) the exact files you expect to touch.
Then wait for me to give you the task prompt. Do not start coding yet.
```

---

## Reusable task-prompt template (fill the blanks for any T-x.y)

```
TASK: <T-x.y — title from TASKS.md>

Follow the working method in CLAUDE.md §3 exactly:
1. Plan first: list the minimal files you'll touch and why. Wait for nothing — proceed once planned.
2. Implement the SMALLEST change that satisfies the acceptance criteria below. No extra features, no refactors I didn't ask for.
3. Self-QA: actually run/test each QA item below and paste the result (command output / what you clicked / screenshot note). "Looks correct" is not acceptable.
4. Update PROGRESS.md: add a changelog entry (use the template), flip the status, note follow-ups, confirm no Golden Rule violated.
5. Stop and report. Do not start the next task.

ACCEPTANCE CRITERIA:
<paste the Acceptance bullets from TASKS.md>

QA CHECKLIST (must actually test):
<paste the QA bullets from TASKS.md>

GOLDEN RULES IN FORCE:
<name the relevant ones, e.g. #1 no fabricated claims, #4 server-side entitlements>

CONSTRAINTS:
- Keep the change small and reviewable.
- Match existing code style and the design tokens (CLAUDE.md §6).
- If anything is ambiguous or a Golden Rule is at risk, STOP and ask — write the question in PROGRESS.md "Open Questions". Do not guess.
- Do not introduce console/server errors. Do not break other pages.
```

---

## PROMPT — T-0.1 Full project audit (use this first, verbatim)

```
TASK: T-0.1 — Full project audit. This is documentation only — DO NOT change any application code.

Do the following and report:
1. Detect and list the tech stack: frontend framework, backend/API framework, language(s), database + ORM, auth method, payment/subscription provider, AI provider + how image analysis is wired, file storage, email/SMS provider, hosting/deploy, package manager, and the exact dev/build/test/lint commands.
2. Map the project: where do marketing pages, report-creation flow, AI analysis, dashboard, billing, admin, shared UI components, and API routes live? Give real file paths.
3. List known issues / tech debt / obvious bugs / dead code / anything that already violates a Golden Rule (esp. fabricated claims from CLAUDE.md §2 #1).
4. List the env var NAMES the app needs (names only — never print secret values).

Then WRITE all of the above into CLAUDE.md:
- Fill §4 Tech Stack and §5 Project Map.
- Add findings to §5 "Known issues".
Finally, add a changelog entry to PROGRESS.md and set T-0.1 to DONE.

Do not modify any other file. Report a concise summary to me when done.
```

---

## PROMPT — T-1.1 Remove unverified claims (example, ready to use)

```
TASK: T-1.1 — Remove all unverified/fabricated claims site-wide.

Working method: CLAUDE.md §3. Golden Rule #1 is the whole point of this task.

1. Plan: grep the codebase for these and report every occurrence with file+line:
   "50,000", "98%", "10x"/"10×", "thousands", "accuracy", "trusted by", "certified", "partner", any fake testimonial or carrier logo.
2. Implement: for each, either DELETE it or REPLACE with a verifiable fact only (number of report templates, supported export formats, max photos per report, available integrations, average generation time IF we have a real measured number — otherwise omit). Do not invent replacements.
3. Self-QA: re-run the greps and paste output showing zero remaining; list what each item was changed to.
4. Update PROGRESS.md changelog + status.
5. Stop and report.

ACCEPTANCE: no fabricated stat/testimonial/badge/logo/cert anywhere; replacements are verifiable-only or removed.
GOLDEN RULE IN FORCE: #1.
CONSTRAINT: content-only change; don't restructure layout in this task (that's later tasks).
```

---

## PROMPT — T-2.5 AI cautious-language guard (example, high-risk — use carefully)

```
TASK: T-2.5 — AI-assisted analysis must only ever produce cautious, non-final language.

Working method: CLAUDE.md §3. Golden Rules #2 and #3 are critical here.

1. Plan: find where the AI prompt/response for report analysis is built and where its output is inserted.
2. Implement:
   - Add/adjust the system prompt so the AI only uses cautious phrasing ("Visible conditions appear consistent with…", "The image may show…", "A qualified professional should confirm…", "Further inspection may be required…").
   - Add a server-side guard/validator that blocks or flags output making prohibited final determinations (coverage, liability, cause of loss, fraud, policy interpretation, structural safety, mold, engineering conclusions, code compliance, final repair costs, approval/denial).
   - Ensure AI output is stored as a SUGGESTION and never auto-inserted into a finalized report.
3. Self-QA: feed test inputs designed to bait a definitive verdict; paste outputs showing cautious language and that prohibited verdicts are blocked/flagged; confirm nothing auto-inserts.
4. Update PROGRESS.md.
5. Stop and report.

ACCEPTANCE + QA: as in TASKS.md T-2.5 and T-2.6.
GOLDEN RULES IN FORCE: #2, #3.
```

---

## How to generate the remaining task prompts
For any task in TASKS.md, fill the **Reusable task-prompt template** above by pasting that task's Acceptance + QA bullets and naming its Golden Rules. Keep one task per prompt. That keeps every change micro, testable, and logged — exactly the workflow in CLAUDE.md.

## Tips for better Claude Code results
- Always run the **Session-start prompt** first so it reloads context instead of re-scanning.
- Force it to **paste real test output** in QA — this is what prevents "looks done but broken".
- If a task is big (templates, security, CRM), tell it: "Do only sub-item 1 of N in this task; we'll do the rest as separate prompts."
- End risky tasks with: "If unsure, stop and ask — do not guess."
- After each task, quickly skim the PROGRESS.md entry before starting the next.
```
