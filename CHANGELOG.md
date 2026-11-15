# Changelog

Every release of Career Strike is listed here, newest first. The section for a version is shown in
the dashboard after you update, and is published as that version's release notes on GitHub.

## [0.6.0] - 2026-11-15

### Added

- **Personal Career Mission Engine**: Durable candidate career mission distinct from raw profile facts, supporting dual-track strategy: **Track A** (realistic, high-confidence near-term employment) and **Track B** (ambitious, high-leverage growth targets). Mission state tracks desired outcomes, salary floor, target/adjacent roles, mobility preferences, and weekly effort allocation without mutating verified profile facts.
- **Autonomous Career Planner & Activity Ledger**: Translates active missions into prioritized, multi-phase execution plans (`DISCOVERY`, `PREPARATION`, `OUTREACH`, `EVALUATION`). Maintains an append-only assistant activity ledger recording autonomous actions and proposal history with candidate accountability.
- **Proactive Opportunity Hunter & 6D Decision Engine**: Background opportunity identification matching live postings against mission track criteria with explainable decision factors (`fitTier`, `salaryAlignment`, `remoteAlignment`, `trackTarget`). Surfaces proactive matches directly to the Assistant Desk without speculative vacancy guessing.
- **Assistant Desk & Daily Mission Briefing**: Executive briefing dashboard widget on `/` providing today's top recommended actions, proactive shortlist highlights, pending strategy proposals, active mission summaries, and quick action execution buttons.
- **Application Concierge & Pre-Flight Rehearsal Workbench**: Dedicated rehearsal interface (`/applications/:id`) featuring a 7-point readiness checklist (Resume Document, Tailored Cover Letter, Application Packet Approval, Compensation Floor Alignment, Right-to-Work Fit, Sponsor Status Fit, Rehearsal Completeness), custom screening question draft review with gap and contradiction detection, and explicit candidate-controlled submission policy reaffirmation.
- **Multi-Offer Decision Adviser & Negotiation Strategy**: Compares competing employment offers against verified market compensation percentiles (P25/P50/P75 with $N \ge 5$ threshold), target roles, and candidate salary floors. Evaluates total cash, variable bonus, and equity alongside role-tailored negotiation talking points.
- **Relationship Outreach Assistant**: Candidate-governed communication drafting supporting referral requests, recruiter responses, offer inquiries, post-interview thank-yous, and status inquiries with full approval states (`DRAFT` → `APPROVED` → `SENT` / `DISMISSED`).
- **Continuous Strategy Improvement & Expanded Action Allowlist**: Expanded proposal actions (`rebalance-tracks`, `expand-role-family`, `investigate-recurring-gap`) allowing the system to learn from application and interview outcomes while preserving candidate decision authority and rollback capabilities.
- **Evaluation Harness Expansion (11 Scenarios / 29 Invariant Checks)**: Added automated test scenarios verifying dual-track isolation (Track A vs Track B parameters remain strictly separated and never mutate profile facts) and consequential action approval invariants (strategy changes, submission, outreach stay quiescent until explicit candidate decision).
- **Company Intelligence 360 & Startup Momentum Radar**: Canonical company profile model tracking stage (Seed through Public), industry domain, headquarters and hiring locations, historical headcount changes, funding rounds, detected tech stack, and dated observation provenance. Classifies momentum trends (`SURGING`, `STEADY`, `STAGNANT`, `COOLING`) strictly from observed local activity and provides a chronological company event timeline without guessing vacancies or inventing trajectory scores.
- **Decision-Ready Opportunity Shortlists (6D Engine)**: Multi-dimensional opportunity evaluation across six orthogonal dimensions: Hard Eligibility, Professional Relevance, Candidate Preferences, Source Confidence, Company Context, and Application Effort. Critical statutory eligibility blockers strictly prevent false recommendations and are never collapsed into an attractive aggregate score. Generates actionable `nextBestAction` recommendations.
- **Curated Career Collections Hub**: 8 explainable, dynamic market collections (Emerging AI, Fintech & Payment Infrastructure, High-Growth Scaleups, Global International Employers, Remote-First Engineering, Active Product Roles, QA & IT Operations Opportunities, Early-Career & Transition Paths) calculated live from verified local data. Candidates can also create and follow custom rule-based collections.
- **Compensation & Offer Intelligence**: Source-aware compensation model distinguishing Employer-Disclosed ranges, External Benchmarks, Candidate-Reported figures, and Model Estimates. Displays P25, P50 (median), and P75 compensation curves only when backed by a verified sample size of $N \ge 5$. Total compensation breakdowns include base salary, variable bonus, signing bonus, and equity, paired with strict purchasing-power caveats on foreign currency conversions.
- **Career Market Pulse**: Localized aggregated telemetry reporting remote vs hybrid vs onsite distributions, top competencies in demand, salary distributions, and 14-day hiring velocity across active markets.
- **Interview & Career Knowledge Studio**: Stage-specific format playbooks (Screening, System Design, Behavioral STAR, Executive), a structured 4-step company research protocol (Business Model, Tech Architecture, Team Dynamics, Competitive Landscape), and principled salary negotiation tactics with dated practitioner citations.
- **Model Context Protocol (MCP) Server Expansion (20 tools)**: Expanded stdio MCP tool suite to 20 tools across 5 security tiers, introducing company intelligence retrieval, hiring signals, multi-role comparison, compensation evidence, market pulse telemetry, watchlist management, and company opportunity evaluation with strict candidate-in-the-loop safeguards.

## [0.5.0] - 2026-11-15

### Added

- **Market-wide company registry and hiring intelligence**: Discover employers from locally observed public postings, curated targets, and manual candidate entries. Provides honest, evidence-based hiring signals (`VERIFIED_OPEN_ROLES`, `NO_CURRENT_ROLES_OBSERVED`, `EVIDENCE_STALE`, `REGISTRY_ONLY`, `CANDIDATE_ENTRY_UNVERIFIED`) without claiming vacancies or interview likelihood.
- **Evidence revision history & conflict resolution**: Full audit ledger tracking evidence modifications, actor provenance (`last_confirmed_at`, `last_confirmed_by`), and automated conflict flagging for duplicate identity items with mismatched details.
- **Persisted outreach workflow**: Candidate-governed contact management and communication drafts with explicit approval states (`DRAFT` → `APPROVED` → `SENT` / `DISMISSED`). AI assistants cannot send messages autonomously.
- **Candidate learning feedback & evaluation harness**: Full proposal decision lifecycle (`ACCEPT`, `REJECT`, `DISMISS`, `EDIT`, `SNOOZE`, `UNDO`) with safe setting rollback. Includes a 6-scenario local invariant evaluation suite (`npm run evaluate`).
- **Offline PDF and DOCX document exports**: Direct, dependency-free local generation of PDF-1.4 documents and OpenXML DOCX packages, paired with offline text extractability and word-retention parser verification.
- **OS-level scheduled background discovery**: Register native background jobs (`launchd` on macOS, `systemd` user timer on Linux, Task Scheduler on Windows) with `career-strike schedule-install` to fetch monitored boards while the application is closed.
- **Complete React Hook Form & component colocation migration**: Migrated all forms across Settings, Data & Privacy, Profile, Applications, Search, Markets, and Outreach to React Hook Form with Zod schemas and route-colocated architecture.
- **Exhaustive WCAG 2.2 AA accessibility**: Validated with axe-core across every dashboard screen in both light and dark modes, ensuring complete keyboard navigation and responsive viewport support.
- **Efficacy and benchmark transparency**: Documented independent review of AutoPlaced.ai and automated application efficacy claims in `docs/limitations.md`, reaffirming non-guarantee principles and strict candidate review.

### Changed

- Updated document export and readiness panels to emphasize that local extractability testing is an integrity heuristic, not a commercial ATS certification.
- Reorganized dashboard routes with colocated components, schemas, and helpers.

## [0.4.0] - 2026-11-05

### Changed

- Recorded the frontend modernization scope for this release: full screen-by-screen
  Tailwind conversion and complete React Hook Form migration across every existing
  form remain intentionally incremental. The Tailwind CSS v4 tooling and design
  tokens are in place and the Add Job form demonstrates the React Hook Form plus
  Zod-ready pattern, without breaking existing candidate workflows.
- Recorded that route-local `-components`, `-hooks`, `-helpers` and `-schema`
  colocation was not fully reorganized in this release, to avoid destabilizing the
  existing route architecture.

### Known limitations

- Tailwind conversion and React Hook Form migration are incremental; not every
  screen or form has been converted yet.
- Route-local component, hook, helper and schema files are not yet colocated
  per route.

## [0.3.0] - 2026-11-05

### Added

- Tailwind CSS v4 is now part of the dashboard build, with Career Strike design tokens for brand
  colors, typography, spacing, radii and surfaces.
- React Hook Form now manages dashboard forms such as Add Job, with React Hook Form plus Zod-ready
  resolver support available for further form migrations.
- `career-strike uninstall` now asks whether to delete locally stored candidate data. The default
  is No; data is preserved unless you explicitly confirm deletion. Non-interactive uninstalls
  keep data by default and require `--delete-data --confirm "delete my career data"` for removal.
- Uninstall now offers an optional backup before deleting candidate data and shows the exact
  Career Strike-managed files and folders it would remove.

### Changed

- The dashboard keeps its existing Career Strike visual identity while Tailwind CSS is introduced
  for layout and component styling.
- Candidate data safety documentation now describes uninstall data retention and explicit deletion
  consent.

### Fixed

- Uninstall no longer implies consent to delete personal data from a generic confirmation.

## [0.2.0] - 2026-11-01

The first published release. From now on, `career-strike update` keeps you current.

### Added

- `career-strike update`: installs the newest release in one step. It checks the download against
  its published checksum (and its build provenance, if the GitHub CLI is signed in), backs up your
  data, restarts the service and confirms the new version works. If anything fails, the previous
  version and your data are put back automatically.
- `career-strike update --undo` returns to the version you had before the last update.
  `career-strike update --check` only says whether a new version exists.
- Optional weekly update checks (Settings → Background monitoring, or asked once by
  `career-strike init`). Off unless you turn them on. When a new version is out, the dashboard
  says so; after you update, it shows what changed.
- Settings → Updates shows your version, the last check, and a "Check now" button.
- `career-strike status` warns when the running service is older than the installed program.
- `npm run dev` for working on the dashboard with hot reload.

### Changed

- The dashboard's navigation and data loading were rebuilt on TanStack Router and TanStack
  Query. Pages, links and bookmarks work as before; a page opened during a service outage now
  loads by itself once the service is back.
- More consistent spacing above form buttons.

### Updating from 0.1.0

0.1.0 has no `update` command, so this one update is done by hand. See
[Updating](docs/install.md#updating).

## [0.1.0]

Initial development version, installed by building from source.
