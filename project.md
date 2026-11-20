# Career Strike — Project Status

> Local-first, private-by-design career operating system (Fastify 5 + SQLite + React 19 + TanStack Router + Tailwind v4 + MCP server). Candidate data never leaves the device.

## Repository

- Remote: `https://github.com/irshadpc/career-strike.git`
- Branch: `main`
- Service: `http://127.0.0.1:47615` (PID via `career-strike status`)

## Architecture

- **Backend:** Fastify 5, better-sqlite3 (WAL mode, `foreign_keys=ON`, `synchronous=NORMAL`, `busy_timeout=2000`), zod validation, MCP server.
- **Frontend:** React 19, TanStack Router, Tailwind v4, Radix UI, @fontsource fonts.
- **Storage:** SQLite single-file DB + private vault directory (documents, secrets). Backups via `VACUUM INTO`.
- **AI:** Local-first; BYO cloud models only with explicit candidate permission. Local embeddings + FTS5.
- **Classification:** Every table/column classified (PUBLIC/INTERNAL/PERSONAL/SENSITIVE/SECRET) — enforced by `test/unit/classification.test.ts`.

## Recent Work — Candidate UX Audit (90-day blueprint)

Source: `Career Strike Candidate UX Audit.docx` (recovered from a truncated download). Full audit covers 6 pillars + 90-day roadmap.

### Phase 1 — Calm Foundation (commit `22f95b7`)
- Daily Focus Cap + Protected Rest state (anti-burnout guardrail)
- Ghost-Job "Worth your energy?" triage on every opportunity row (age, salary, role match)
- "What the ATS sees" extracted-text preview in Documents
- SQLite hardening (`synchronous=NORMAL`)
- Toast system, lazy routes, skeletons/EmptyState, fonts wired, Home Apply/Watch/Skip spinners+toasts

### Phase 2 — Leverage & Diagnostics (commit `342a624`)
- 4-Layer Auditable Match Inspector on every job (gate check, skill alignment, experience audit, counterfactual coach)
- Warm-Path Referral CRM (`/contacts`): CRUD, LinkedIn CSV import, warm-path lookup, outreach drafts
- Funnel Leak Diagnostics on Insights (Applied→Screen / Screen→Offer vs benchmarks, leak diagnosis, CV A/B variants)

### Phase 3 — Close & Compound (commit `342a624`)
- Offer Intelligence Lab (`/offers`): 4-year cash+equity model, tax (US/India), COL adjustment, negotiation levers
- STAR Story Vault + Voice Simulator (`/star-vault`): competency-tagged stories, browser-mic speech, persona-based scoring, hot debrief
- Hired Mode (`/hired`): 30-60-90 plan, stakeholder map, promotion-scope brag vault
- Read-only IMAP sync (Settings → own page): TLS, allowlist, confirmation cards

### Resume upload auto-extraction (commit `0dec624`)
- Identity (name/headline/summary) auto-filled when empty and persisted
- Skills, roles, education, certifications, languages extracted from PDF/DOCX/MD/TXT
- Unapproved document-sourced facts; candidate must approve before matching uses them

## Verification status

- TypeScript: all 3 targets pass
- Biome: 0 errors
- Unit/integration: 361/362 (single failure is the offline-npm-cache `install.test.ts` environment issue)
- Playwright e2e: 57 passed, 1 skipped (axe a11y, keyboard-only, 375/768/1280 layouts, outage recovery)

## Remaining roadmap (Phases 2–3 polish)

- unpdf + X/Y column reconstruction + OCR fallback for scanned PDFs
- Chrome Native Messaging clipper bridge (eliminate CORS/localhost issues)
- `.mcpb` one-click bundle for Claude Desktop
- Full IMAP transport (currently pluggable storage + confirmation cards)
- Local embeddings via @huggingface/transformers v4 (currently TF-IDF cosine baseline)
- Post-hire: onboarding auto-generation from job description, promotion-scope gap surfacing

## Key files

- `src/store/db.ts`, `src/store/migrations.ts`, `src/store/classification.ts`
- `src/service/routes/career-os.ts` (new pillars API)
- `src/career/resume-facts.ts`, `resume-suggest.ts`, `resume-profile.ts`
- `src/web/pages/{Contacts,Offers,StarVault,HiredMode,ImapSync}/`
- `src/web/pages/JobPage/-components/MatchInspector.tsx`
- `src/web/pages/Profile/` (auto-extraction + toasts)
- `src/web/Shell.tsx`, `src/web/routes.tsx`

## Recent commits

- `342a624` feat(career-os): Phases 2-3 of candidate UX audit
- `22f95b7` feat(calm-foundation): Phase 1 of candidate UX audit
- `0dec624` fix(profile): make skill add/approve feedback visible and accept markdown résumés
- `abd0a2a` feat: resume upload auto-extraction + UX refactoring
- `c296cd9` baseline

## Notes

- Service token: `~/Library/Application Support/career-strike/service.json`
- Dashboard links are single-use (~1 min); regenerate with `career-strike dashboard --no-open`
- Pre-commit hook runs full tests; use `--no-verify` only for the known env-related `install.test.ts` failure
EOF
echo "written"