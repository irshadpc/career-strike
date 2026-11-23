# Career Strike — Project Status

> Local-first, private-by-design career operating system (Fastify 5 + SQLite + React 19 + TanStack Router + Tailwind v4 + MCP server). Candidate data never leaves the device.

## Repository

- Remote: `https://github.com/irshadpc/career-strike.git`
- Branch: `main`
- Service: `http://127.0.0.1:47615` (PID via `career-strike status`)

## Architecture

- **Backend:** Fastify 5, better-sqlite3 (WAL mode, `foreign_keys=ON`, `synchronous=NORMAL`, `busy_timeout=5000`), zod validation, MCP server.
- **Frontend:** React 19, TanStack Router, Tailwind v4, Radix UI, @fontsource fonts.
- **Storage:** SQLite single-file DB + private vault directory (documents, secrets). Backups via `VACUUM INTO`.
- **AI:** Local-first; BYO cloud models only with explicit candidate permission. Local ONNX embeddings (@huggingface/transformers in dedicated worker thread) + FTS5.
- **Classification:** Every table/column classified (PUBLIC/INTERNAL/PERSONAL/SENSITIVE/SECRET) — enforced by `test/unit/classification.test.ts`.

## Recent Work — Candidate UX Audit & Hardening

### Phase 1 — Calm Foundation
- Daily Focus Cap + Protected Rest state (anti-burnout guardrail)
- Ghost-Job "Worth your energy?" triage on every opportunity row (age, salary, role match)
- "What the ATS sees" extracted-text preview in Documents
- SQLite hardening (`synchronous=NORMAL`, `busy_timeout=5000`)
- Toast system, lazy routes, skeletons/EmptyState, fonts wired, Home Apply/Watch/Skip spinners+toasts

### Phase 2 — Leverage & Diagnostics
- 4-Layer Auditable Match Inspector on every job (gate check, skill alignment, experience audit, counterfactual coach)
- Warm-Path Referral CRM (`/contacts`): CRUD, LinkedIn CSV import, warm-path lookup, outreach drafts
- Funnel Leak Diagnostics on Insights (Applied→Screen / Screen→Offer vs benchmarks, leak diagnosis, CV A/B variants)

### Phase 3 — Close & Compound
- Offer Intelligence Lab (`/offers`): 4-year cash+equity model, tax (US/India), COL adjustment, negotiation levers
- STAR Story Vault + Voice Simulator (`/star-vault`): competency-tagged stories, browser-mic speech, persona-based scoring, hot debrief
- Hired Mode (`/hired`): 30-60-90 plan, stakeholder map, promotion-scope brag vault
- Read-only IMAP sync (Settings → own page): TLS, allowlist, confirmation cards

### Phase 4 — Daily Friction Wins & Hardened Loops
- **Persistent Localhost Session:** 14-day sliding TTL HttpOnly, SameSite=Strict localhost session cookie so tab restores and bookmarks work seamlessly.
- **100% Offline Green Commits:** `install.test.ts` gated behind `RUN_NETWORK_TESTS=1` so git commit and pre-commit hooks run fully green offline without `--no-verify`.
- **Batch-Approve Extracted Facts:** "Approve all high-confidence facts" bulk action with instant Undo toast in Profile.
- **Complete Read-Only IMAP Transport:** Polling transport via `imapflow` with TLS allowlist and confirmation cards advancing Applied → Screening → Interview.
- **Local ONNX Embeddings:** Semantic matching engine with `@huggingface/transformers` in a dedicated Node `worker_thread` to prevent event-loop blocking and resolve semantic misses (e.g. payment authentication <-> 3DS / ACS / Passkey).
- **Auto-Seed Hired Mode:** When an offer is accepted, generates initial 30-60-90 plan, stakeholder checklist, and week-1 questions from JD and interview debrief notes.
- **Round-Trip ATS Verification + Scanned PDF Fallback:** X/Y column reconstruction for multi-column resumes and Tesseract OCR fallback for scanned PDFs.
- **Chrome Native Messaging Clipper:** Native messaging host bridge (`career-strike clipper`) + Manifest V3 extension in `plugins/chrome-clipper/` for 1-click clipping from LinkedIn, Workday, and Naukri into SQLite without CORS friction.
- **One-Click .mcpb Desktop Bundle:** `career-strike mcp-bundle` and `npm run pack:mcpb` packaging for Claude Desktop for zero-JSON-config MCP integration.

### Phase 5 — Autopilot Queue & Reusable Answer Vault
- **Supervised Application Autopilot Queue (`/autopilot`):** High-intent application runtime with human-in-the-loop guardrail. Autonomous fill pauses at the Submit button for candidate verification (never auto-submits).
- **Reusable Screening Answer Vault (`answer_vault`):** Persisted common screening question answers (`eu_work_auth`, `notice_period`, `relocation`, etc.) auto-resolved during queue generation with "Save as default" support.
- **Batch Picker on `/opportunities`:** Multi-select queue creation with ATS provider detection pills (Greenhouse, Lever, Ashby, Workday, Direct Portal), Daily Focus Cap enforcement, duplicate employer warning banners, and warm-path referral CRM intercept (`/contacts`).
- **Honest Interactive Fallback:** Specialized 1-click clipboard helpers for portals gated by candidate SSO or CAPTCHA (e.g., Workday), allowing rapid, accurate paste without brittle DOM hacking.
- **Immutable Application Receipts:** Generates verifiable receipt cards containing resume snapshot ID, filled field counters, ATS target, and timestamp, advancing tracker status to `Applied`.

### Phase 6 — Editorial Design System & Automated Playwright Contrast Gate
- **Calm Editorial Semantic Tokens (`src/web/index.css`):** Tailwind v4 semantic token system enforcing 90% neutral surfaces (`--color-canvas: #FAF9F7`, `--color-surface: #FFFFFF`, `--color-subtle: #F3F2EE`, `--color-border: #E4E2DC`), 8% structural ink (`--color-ink: #18181B`, `--color-ink-secondary: #52525B`, `--color-ink-muted: #71717A`), and 2% intent accent across both Light and Dark (`.dark` / `prefers-color-scheme: dark`) themes.
- **WCAG AAA Status Signals:** Standardized color tokens for success (`#ECFDF5`/`#065F46`), warning (`#FFFBEB`/`#92400E`), and danger (`#FEF2F2`/`#991B1B`) achieving 7.2:1–10.6:1 contrast ratios in both themes.
- **Button & Badge Contrast Hardening:** Hardened `Button`, `Badge`, `Alert`, and dense components (`JobRow.tsx`, `Autopilot/index.tsx`, `Profile/index.tsx`, `FitPanel.tsx`, `jobBits.tsx`) to eliminate low-contrast raw utilities (`bg-gray-*`, `text-slate-*`, `bg-amber-500`, etc.) and ensure accessible form select names.
- **Automated Playwright Contrast E2E Gate:** Integrated automated contrast gate in `test/e2e/accessibility.spec.ts` using `@axe-core/playwright` (`color-contrast` rule and full WCAG 2.1 AA/AAA suite) asserting zero contrast violations across light and dark modes across all core views (`/opportunities`, `/autopilot`, `/settings`, `/profile`, `/applications`, `/contacts`, `/offers`, `/star-vault`, `/hired`).

## Key files

- `src/store/db.ts`, `src/store/migrations.ts`, `src/store/classification.ts`
- `src/service/server.ts`, `src/service/sessions.ts`
- `src/service/routes/autopilot.ts`, `src/service/routes/career-os.ts`, `src/service/routes/opportunities.ts`
- `src/sources/imap-transport.ts`
- `src/matching/embeddings-worker.ts`, `src/matching/semantic-matcher.ts`
- `src/career/hired-seed.ts`
- `src/vault/text-extraction.ts`
- `src/cli/native-clipper.ts`, `plugins/chrome-clipper/`
- `src/mcp/bundle.ts`, `mcpb/manifest.json`
- `src/web/index.css`, `src/web/styles.css`
- `src/web/components/ui/{button,badge,alert,toast,tabs}.tsx`
- `src/web/pages/{Autopilot,Contacts,Offers,StarVault,HiredMode,ImapSync,Profile,Opportunities}/`
- `test/e2e/accessibility.spec.ts`

## Notes

- Service token: `~/Library/Application Support/career-strike/service.json`
- Sessions use a 14-day sliding TTL HttpOnly cookie; launch tokens are single-use initial auth.
- Pre-commit hook runs 100% green offline; network tests can be enabled via `RUN_NETWORK_TESTS=1`.
- Design system mandates 90% neutral canvas/surface, 8% structural ink/borders, and 2% accent; contrast gate enforces zero WCAG AA/AAA violations in Playwright.
