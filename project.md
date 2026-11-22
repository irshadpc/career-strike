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
- **One-Click .mcpb Desktop Bundle:** `career-strike mcp-bundle` packaging for Claude Desktop for zero-JSON-config MCP integration.

## Key files

- `src/store/db.ts`, `src/store/migrations.ts`, `src/store/classification.ts`
- `src/service/server.ts`, `src/service/sessions.ts`
- `src/sources/imap-transport.ts`
- `src/matching/embeddings-worker.ts`, `src/matching/semantic-matcher.ts`
- `src/career/hired-seed.ts`
- `src/vault/text-extraction.ts`
- `src/cli/native-clipper.ts`, `plugins/chrome-clipper/`
- `src/mcp/bundle.ts`
- `src/service/routes/career-os.ts`, `src/service/routes/opportunities.ts`
- `src/web/pages/{Contacts,Offers,StarVault,HiredMode,ImapSync,Profile}/`

## Notes

- Service token: `~/Library/Application Support/career-strike/service.json`
- Sessions use a 14-day sliding TTL HttpOnly cookie; launch tokens are single-use initial auth.
- Pre-commit hook runs 100% green offline; network tests can be enabled via `RUN_NETWORK_TESTS=1`.
