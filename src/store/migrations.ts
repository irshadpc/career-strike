export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Forward-only. Never edit an applied migration; add a new one.
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'foundation',
    sql: `
      CREATE TABLE settings (
        key            TEXT PRIMARY KEY,
        value_json     TEXT NOT NULL,
        classification TEXT NOT NULL CHECK (classification IN ('PUBLIC', 'PERSONAL', 'SENSITIVE')),
        updated_at     TEXT NOT NULL
      );
      CREATE TABLE audit_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        at          TEXT NOT NULL,
        actor       TEXT NOT NULL,
        action      TEXT NOT NULL,
        subject     TEXT,
        detail_json TEXT
      );
      CREATE INDEX audit_events_at ON audit_events (at);
    `,
  },
  {
    version: 2,
    name: 'dashboard_sessions',
    sql: `
      -- Session ids are stored hashed; the raw id only exists in the browser's HttpOnly cookie.
      CREATE TABLE dashboard_sessions (
        id_hash      TEXT PRIMARY KEY,
        csrf_token   TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        expires_at   TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX dashboard_sessions_expires ON dashboard_sessions (expires_at);
    `,
  },
  {
    version: 3,
    name: 'opportunities_and_tasks',
    sql: `
      -- PUBLIC: postings as published by employers. Nothing candidate-specific lives here.
      CREATE TABLE jobs (
        id                 TEXT PRIMARY KEY,
        canonical_key      TEXT NOT NULL UNIQUE,
        duplicate_key      TEXT NOT NULL,
        duplicate_of       TEXT REFERENCES jobs (id) ON DELETE SET NULL,
        employer           TEXT NOT NULL,
        title              TEXT NOT NULL,
        location_text      TEXT,
        remote_policy      TEXT NOT NULL CHECK (remote_policy IN ('remote', 'hybrid', 'onsite', 'unknown')),
        employment_type    TEXT NOT NULL CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'temporary', 'internship', 'unknown')),
        department         TEXT,
        salary_json        TEXT,
        description_json   TEXT NOT NULL,
        description_text   TEXT NOT NULL,
        apply_url          TEXT,
        posting_url        TEXT,
        published_at       TEXT,
        status             TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'UNVERIFIED')),
        first_seen_at      TEXT NOT NULL,
        last_seen_at       TEXT NOT NULL,
        last_verified_at   TEXT,
        closed_at          TEXT,
        unresolved_json    TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX jobs_duplicate_key ON jobs (duplicate_key);
      CREATE INDEX jobs_status ON jobs (status);

      -- PUBLIC: where each posting was found. One job can be listed by several sources.
      CREATE TABLE job_sources (
        job_id        TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
        source        TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby', 'manual')),
        board         TEXT NOT NULL,
        source_job_id TEXT NOT NULL,
        source_url    TEXT,
        fetched_at    TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        PRIMARY KEY (source, board, source_job_id)
      );
      CREATE INDEX job_sources_job ON job_sources (job_id);

      -- PERSONAL: which public boards the candidate monitors, and their health.
      CREATE TABLE source_boards (
        id                   TEXT PRIMARY KEY,
        source               TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby')),
        board                TEXT NOT NULL,
        added_at             TEXT NOT NULL,
        health               TEXT NOT NULL DEFAULT 'NEVER_RUN' CHECK (health IN ('NEVER_RUN', 'OK', 'DEGRADED', 'NOT_FOUND')),
        last_success_at      TEXT,
        last_error           TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        UNIQUE (source, board)
      );

      -- PERSONAL: the candidate's decision about a job.
      CREATE TABLE job_user_state (
        job_id      TEXT PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
        disposition TEXT NOT NULL CHECK (disposition IN ('none', 'shortlisted', 'excluded')),
        updated_at  TEXT NOT NULL,
        updated_by  TEXT NOT NULL
      );

      -- PERSONAL: durable record of supervised work. RUNNING requires a live owner process.
      CREATE TABLE tasks (
        id               TEXT PRIMARY KEY,
        kind             TEXT NOT NULL,
        dedupe_key       TEXT NOT NULL,
        trigger          TEXT NOT NULL,
        client           TEXT NOT NULL,
        params_json      TEXT NOT NULL,
        state            TEXT NOT NULL CHECK (state IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED')),
        created_at       TEXT NOT NULL,
        started_at       TEXT,
        ended_at         TEXT,
        heartbeat_at     TEXT,
        owner_pid        INTEGER,
        cancel_requested INTEGER NOT NULL DEFAULT 0,
        progress_json    TEXT,
        result_json      TEXT,
        error            TEXT
      );
      CREATE UNIQUE INDEX tasks_single_flight ON tasks (dedupe_key) WHERE state IN ('QUEUED', 'RUNNING');
      CREATE INDEX tasks_created ON tasks (created_at);
    `,
  },
  {
    version: 4,
    name: 'profile_and_requirements',
    sql: `
      -- SENSITIVE: facts about the candidate. Only approved facts are ever used for matching,
      -- drafting or disclosure. Facts entered by the candidate are approved when saved.
      CREATE TABLE profile_facts (
        id         TEXT PRIMARY KEY,
        kind       TEXT NOT NULL CHECK (kind IN ('skill', 'role', 'education', 'certification', 'language')),
        value_json TEXT NOT NULL,
        source     TEXT NOT NULL CHECK (source IN ('user', 'document')),
        source_ref TEXT,
        approved   INTEGER NOT NULL CHECK (approved IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX profile_facts_kind ON profile_facts (kind);

      -- PUBLIC (derived from posting text only): requirements extracted with quoted evidence.
      ALTER TABLE jobs ADD COLUMN requirements_json TEXT;
      ALTER TABLE jobs ADD COLUMN requirements_version INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 5,
    name: 'applications_and_approvals',
    sql: `
      -- SENSITIVE: files in the private vault. The vault path is never stored here or exposed.
      CREATE TABLE documents (
        id          TEXT PRIMARY KEY,
        kind        TEXT NOT NULL CHECK (kind IN ('resume', 'cover_letter', 'other')),
        filename    TEXT NOT NULL,
        mime        TEXT NOT NULL,
        size_bytes  INTEGER NOT NULL,
        sha256      TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );

      -- PERSONAL: one application per job; its state is the tracker's source of truth.
      CREATE TABLE applications (
        id             TEXT PRIMARY KEY,
        job_id         TEXT NOT NULL UNIQUE REFERENCES jobs (id),
        state          TEXT NOT NULL,
        mode           TEXT NOT NULL CHECK (mode IN ('manual', 'assisted', 'automated')),
        current_version INTEGER NOT NULL,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      -- SENSITIVE: every version of what would be submitted, with its hash and why it changed.
      CREATE TABLE application_versions (
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        version        INTEGER NOT NULL,
        payload_json   TEXT NOT NULL,
        payload_hash   TEXT NOT NULL,
        created_by     TEXT NOT NULL,
        reason         TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        PRIMARY KEY (application_id, version)
      );

      -- SENSITIVE: an approval binds one exact payload, destination and identity. Single use.
      CREATE TABLE approvals (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        version        INTEGER NOT NULL,
        payload_hash   TEXT NOT NULL,
        destination    TEXT NOT NULL,
        identity_hash  TEXT NOT NULL,
        nonce          TEXT NOT NULL,
        issued_at      TEXT NOT NULL,
        expires_at     TEXT NOT NULL,
        mac            TEXT NOT NULL,
        state          TEXT NOT NULL CHECK (state IN ('ACTIVE', 'CONSUMED', 'INVALIDATED', 'EXPIRED', 'REVOKED')),
        state_reason   TEXT,
        consumed_at    TEXT
      );
      CREATE UNIQUE INDEX approvals_one_active ON approvals (application_id) WHERE state = 'ACTIVE';

      -- PERSONAL: every state change with who made it and why.
      CREATE TABLE application_events (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        from_state     TEXT,
        to_state       TEXT NOT NULL,
        actor          TEXT NOT NULL,
        note           TEXT,
        evidence_json  TEXT,
        at             TEXT NOT NULL
      );
      CREATE INDEX application_events_app ON application_events (application_id, id);
    `,
  },
  {
    version: 6,
    name: 'follow_ups',
    sql: `
      -- PERSONAL: reminders the candidate set for an application.
      CREATE TABLE follow_ups (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        due_at         TEXT NOT NULL,
        note           TEXT NOT NULL,
        status         TEXT NOT NULL CHECK (status IN ('OPEN', 'DONE', 'DISMISSED')),
        created_at     TEXT NOT NULL,
        closed_at      TEXT
      );
      CREATE INDEX follow_ups_due ON follow_ups (status, due_at);
    `,
  },
  {
    version: 7,
    name: 'mcp_clients',
    sql: `
      -- PERSONAL: AI assistants connected over MCP and what the candidate allows each to see.
      -- Tokens are stored hashed; the token itself lives in an owner-only file for the MCP process.
      CREATE TABLE mcp_clients (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        token_hash   TEXT NOT NULL UNIQUE,
        scopes_json  TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at   TEXT
      );
      CREATE INDEX mcp_clients_name ON mcp_clients (name);
    `,
  },
  {
    version: 8,
    name: 'submission_attempts',
    sql: `
      -- SENSITIVE: each attempt to deliver an approved application. One attempt per approval:
      -- the approval id is the idempotency key, so a retry can never create a second submission.
      CREATE TABLE submission_attempts (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        approval_id    TEXT NOT NULL UNIQUE REFERENCES approvals (id),
        endpoint       TEXT NOT NULL,
        state          TEXT NOT NULL CHECK (state IN ('IN_PROGRESS', 'CONFIRMED', 'UNCONFIRMED', 'FAILED')),
        started_at     TEXT NOT NULL,
        ended_at       TEXT,
        receipt_json   TEXT,
        error          TEXT
      );
      CREATE INDEX submission_attempts_app ON submission_attempts (application_id);

      -- Internal (not a user setting): the owned practice endpoint automated submission may target.
      CREATE TABLE practice_endpoint (
        id         INTEGER PRIMARY KEY CHECK (id = 1),
        origin     TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 9,
    name: 'interviews_and_practice',
    sql: `
      -- PERSONAL: interviews and assessments for an application.
      CREATE TABLE interviews (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        stage          TEXT NOT NULL,
        format         TEXT NOT NULL CHECK (format IN ('phone', 'video', 'onsite', 'take_home', 'other')),
        scheduled_at   TEXT NOT NULL,
        notes          TEXT,
        outcome        TEXT NOT NULL CHECK (outcome IN ('pending', 'passed', 'not_passed', 'cancelled')),
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
      CREATE INDEX interviews_when ON interviews (scheduled_at);

      -- SENSITIVE: the candidate's practice log, with self-rated confidence.
      CREATE TABLE practice_sessions (
        id             TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
        topic_id       TEXT NOT NULL,
        notes          TEXT,
        confidence     INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 5),
        minutes        INTEGER CHECK (minutes BETWEEN 1 AND 600),
        practiced_at   TEXT NOT NULL
      );
      CREATE INDEX practice_sessions_app ON practice_sessions (application_id, topic_id);
    `,
  },
  {
    version: 10,
    name: 'scheduling',
    sql: `
      -- PERSONAL: each schedule slot is claimed once. The primary key makes a second claim fail, so
      -- the same slot can never run twice, even if two processes race.
      CREATE TABLE schedule_slots (
        schedule   TEXT NOT NULL,
        slot       TEXT NOT NULL,
        claimed_at TEXT NOT NULL,
        claimed_by INTEGER NOT NULL,
        result     TEXT,
        PRIMARY KEY (schedule, slot)
      );
      ALTER TABLE tasks ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;
      -- Scheduled fetches of a failing board wait until this time (bounded exponential backoff).
      ALTER TABLE source_boards ADD COLUMN next_attempt_at TEXT;
    `,
  },
  {
    version: 11,
    name: 'practice_source',
    sql: `
      -- Allow the owned practice board as a source. SQLite cannot alter a CHECK constraint, so the
      -- two tables are rebuilt with identical columns and data.
      CREATE TABLE source_boards_v11 (
        id                   TEXT PRIMARY KEY,
        source               TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby', 'practice')),
        board                TEXT NOT NULL,
        added_at             TEXT NOT NULL,
        health               TEXT NOT NULL DEFAULT 'NEVER_RUN' CHECK (health IN ('NEVER_RUN', 'OK', 'DEGRADED', 'NOT_FOUND')),
        last_success_at      TEXT,
        last_error           TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        next_attempt_at      TEXT,
        UNIQUE (source, board)
      );
      INSERT INTO source_boards_v11 (id, source, board, added_at, health, last_success_at, last_error, consecutive_failures, next_attempt_at)
        SELECT id, source, board, added_at, health, last_success_at, last_error, consecutive_failures, next_attempt_at FROM source_boards;
      DROP TABLE source_boards;
      ALTER TABLE source_boards_v11 RENAME TO source_boards;

      CREATE TABLE job_sources_v11 (
        job_id        TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
        source        TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby', 'manual', 'practice')),
        board         TEXT NOT NULL,
        source_job_id TEXT NOT NULL,
        source_url    TEXT,
        fetched_at    TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        PRIMARY KEY (source, board, source_job_id)
      );
      INSERT INTO job_sources_v11 SELECT job_id, source, board, source_job_id, source_url, fetched_at, content_hash FROM job_sources;
      DROP TABLE job_sources;
      ALTER TABLE job_sources_v11 RENAME TO job_sources;
      CREATE INDEX job_sources_job ON job_sources (job_id);
    `,
  },
  {
    version: 12,
    name: 'strategy_learning',
    sql: `
      -- PERSONAL: suggestions derived from the candidate's own outcomes, and their decisions.
      CREATE TABLE strategy_proposals (
        id          TEXT PRIMARY KEY,
        rule        TEXT NOT NULL,
        fingerprint TEXT NOT NULL UNIQUE,
        title       TEXT NOT NULL,
        rationale   TEXT NOT NULL,
        action_json TEXT NOT NULL,
        status      TEXT NOT NULL CHECK (status IN ('OPEN', 'ACCEPTED', 'DISMISSED')),
        created_at  TEXT NOT NULL,
        decided_at  TEXT
      );
      -- PERSONAL: one snapshot of the metrics per day, for the learning history.
      CREATE TABLE strategy_snapshots (
        day          TEXT PRIMARY KEY,
        metrics_json TEXT NOT NULL
      );
    `,
  },
  {
    version: 13,
    name: 'ai_disclosures',
    sql: `
      -- SENSITIVE while approved: a single-use, previewed release of profile facts to one AI assistant.
      -- The released content is kept only until it is delivered or expires; the consent record stays.
      CREATE TABLE disclosures (
        id                  TEXT PRIMARY KEY,
        client_id           TEXT NOT NULL REFERENCES mcp_clients (id),
        provider            TEXT NOT NULL,
        purpose             TEXT NOT NULL,
        requested_json      TEXT NOT NULL,
        approved_json       TEXT,
        content_json        TEXT,
        content_hash        TEXT,
        state               TEXT NOT NULL CHECK (state IN ('PENDING', 'APPROVED', 'DECLINED', 'DELIVERED', 'EXPIRED')),
        created_at          TEXT NOT NULL,
        expires_at          TEXT NOT NULL,
        decided_at          TEXT,
        delivered_at        TEXT
      );
      CREATE INDEX disclosures_state ON disclosures (state);
    `,
  },
  {
    version: 14,
    name: 'global_market_foundation',
    sql: `
      -- PUBLIC: source-published international location and eligibility evidence. Existing rows
      -- are deliberately left empty and are interpreted as UNKNOWN, never inferred retroactively.
      ALTER TABLE jobs ADD COLUMN market_json TEXT NOT NULL DEFAULT '{}';
      CREATE INDEX jobs_market_json ON jobs (market_json);
    `,
  },
  {
    version: 15,
    name: 'application_personalization',
    sql: `
      -- Candidate-authored or document-derived evidence that is reviewed separately from core
      -- profile facts. Nothing in this table is eligible for a generated claim until confirmed.
      CREATE TABLE profile_evidence (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('project', 'achievement', 'portfolio', 'employment_detail')),
        value_json TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('user', 'document')),
        source_ref TEXT,
        confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX profile_evidence_kind ON profile_evidence (kind, confirmed);

      -- The exact public job-description representation used for a document package. A hash lets
      -- us detect updates without treating a first-seen date as a job-description version.
      CREATE TABLE job_description_snapshots (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        description_hash TEXT NOT NULL,
        completeness TEXT NOT NULL CHECK (completeness IN ('FULL', 'INCOMPLETE', 'MISSING')),
        requirements_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX job_description_snapshots_job ON job_description_snapshots (job_id, created_at);

      -- Variants are immutable: editing or regenerating makes a new row and supersedes the old
      -- one. Source text comes first; exportable DOCX/PDF files are an explicitly later phase.
      CREATE TABLE document_variants (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        snapshot_id TEXT NOT NULL REFERENCES job_description_snapshots(id),
        kind TEXT NOT NULL CHECK (kind IN ('resume', 'cover_letter')),
        format TEXT NOT NULL CHECK (format IN ('source_text')),
        locale TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        profile_fingerprint TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('DRAFT', 'CANDIDATE_EDITED', 'APPROVED', 'SUPERSEDED')),
        based_on_variant_id TEXT REFERENCES document_variants(id),
        created_at TEXT NOT NULL
      );
      CREATE INDEX document_variants_application ON document_variants (application_id, kind, created_at);

      -- Each non-boilerplate proposed claim retains the fact/evidence reference that supports it.
      CREATE TABLE document_variant_evidence (
        variant_id TEXT NOT NULL REFERENCES document_variants(id) ON DELETE CASCADE,
        claim_index INTEGER NOT NULL,
        claim_text TEXT NOT NULL,
        evidence_ref TEXT NOT NULL,
        classification TEXT NOT NULL CHECK (classification IN (
          'STRONG_MATCH', 'PARTIAL_MATCH', 'TRANSFERABLE_EXPERIENCE',
          'MISSING', 'UNVERIFIED', 'NOT_APPLICABLE'
        )),
        PRIMARY KEY (variant_id, claim_index, evidence_ref)
      );
    `,
  },
  {
    version: 16,
    name: 'company_registry',
    sql: `
      -- PUBLIC: every employer observed in a posting held by this installation, plus the curated
      -- targets and any company the candidate adds by hand. The registry records what was seen and
      -- where; it never claims that a company is or is not hiring.
      CREATE TABLE company_registry (
        id                TEXT PRIMARY KEY,
        employer_key      TEXT NOT NULL UNIQUE,
        display_name      TEXT NOT NULL,
        aliases_json      TEXT NOT NULL DEFAULT '[]',
        origin            TEXT NOT NULL CHECK (origin IN ('OBSERVED_POSTING', 'CURATED_TARGET', 'CANDIDATE_ENTRY')),
        official_website  TEXT,
        careers_url       TEXT,
        first_observed_at TEXT NOT NULL,
        last_observed_at  TEXT NOT NULL,
        notes             TEXT
      );
      CREATE INDEX company_registry_name ON company_registry (display_name);

      -- PUBLIC: the public board and source where a registry employer was observed.
      CREATE TABLE company_registry_sources (
        company_id    TEXT NOT NULL REFERENCES company_registry (id) ON DELETE CASCADE,
        source        TEXT NOT NULL,
        board         TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at  TEXT NOT NULL,
        PRIMARY KEY (company_id, source, board)
      );
    `,
  },
  {
    version: 17,
    name: 'evidence_provenance',
    sql: `
      -- SENSITIVE: revision history for candidate evidence. Every add, edit and confirmation is
      -- retained so the candidate can see exactly what changed, when and by whom.
      ALTER TABLE profile_evidence ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE profile_evidence ADD COLUMN last_confirmed_at TEXT;
      ALTER TABLE profile_evidence ADD COLUMN last_confirmed_by TEXT;
      UPDATE profile_evidence
        SET last_confirmed_at = updated_at
        WHERE confirmed = 1 AND last_confirmed_at IS NULL;

      CREATE TABLE profile_evidence_revisions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        evidence_id TEXT NOT NULL REFERENCES profile_evidence (id) ON DELETE CASCADE,
        revision    INTEGER NOT NULL,
        change      TEXT NOT NULL CHECK (change IN ('CREATED', 'UPDATED', 'CONFIRMED', 'BACKFILLED')),
        value_json  TEXT NOT NULL,
        source      TEXT NOT NULL,
        confirmed   INTEGER NOT NULL,
        actor       TEXT NOT NULL,
        at          TEXT NOT NULL,
        UNIQUE (evidence_id, revision)
      );
      CREATE INDEX profile_evidence_revisions_evidence ON profile_evidence_revisions (evidence_id, revision);

      INSERT INTO profile_evidence_revisions (evidence_id, revision, change, value_json, source, confirmed, actor, at)
        SELECT id, 1, 'BACKFILLED', value_json, source, confirmed, 'migration', updated_at
        FROM profile_evidence;
    `,
  },
  {
    version: 18,
    name: 'professional_outreach',
    sql: `
      -- SENSITIVE: people the candidate has decided to contact about their search.
      CREATE TABLE professional_contacts (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        employer    TEXT,
        role_title  TEXT,
        profile_url TEXT,
        email       TEXT,
        notes       TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX professional_contacts_employer ON professional_contacts (employer);

      -- SENSITIVE: drafts remain local. A person approves the exact text; Career Strike never
      -- sends anything. SENT_MANUALLY means the candidate confirmed they sent it themselves.
      CREATE TABLE outreach_drafts (
        id             TEXT PRIMARY KEY,
        contact_id     TEXT NOT NULL REFERENCES professional_contacts (id) ON DELETE CASCADE,
        application_id TEXT REFERENCES applications (id) ON DELETE SET NULL,
        channel        TEXT NOT NULL CHECK (channel IN ('linkedin', 'email', 'other')),
        purpose        TEXT NOT NULL CHECK (purpose IN ('referral', 'recruiter', 'follow_up', 'thank_you', 'other')),
        subject        TEXT,
        body           TEXT NOT NULL,
        state          TEXT NOT NULL CHECK (state IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT_MANUALLY', 'DISMISSED')),
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL,
        approved_at    TEXT,
        sent_at        TEXT,
        decided_by     TEXT
      );
      CREATE INDEX outreach_drafts_state ON outreach_drafts (state, updated_at);

      CREATE TABLE outreach_events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        outreach_id TEXT NOT NULL REFERENCES outreach_drafts (id) ON DELETE CASCADE,
        from_state TEXT,
        to_state   TEXT NOT NULL,
        actor      TEXT NOT NULL,
        note       TEXT,
        at         TEXT NOT NULL
      );
      CREATE INDEX outreach_events_draft ON outreach_events (outreach_id, id);
    `,
  },
  {
    version: 19,
    name: 'learning_feedback',
    sql: `
      -- Rebuild strategy_proposals so candidate feedback can be richer than accept/dismiss.
      CREATE TABLE strategy_proposals_v19 (
        id                 TEXT PRIMARY KEY,
        rule               TEXT NOT NULL,
        fingerprint        TEXT NOT NULL UNIQUE,
        title              TEXT NOT NULL,
        rationale          TEXT NOT NULL,
        action_json        TEXT NOT NULL,
        edited_action_json TEXT,
        status             TEXT NOT NULL CHECK (status IN ('OPEN', 'ACCEPTED', 'DISMISSED', 'REJECTED', 'EDITED', 'SNOOZED')),
        snoozed_until      TEXT,
        created_at         TEXT NOT NULL,
        decided_at         TEXT
      );
      INSERT INTO strategy_proposals_v19 (id, rule, fingerprint, title, rationale, action_json, status, created_at, decided_at)
        SELECT id, rule, fingerprint, title, rationale, action_json, status, created_at, decided_at FROM strategy_proposals;
      DROP TABLE strategy_proposals;
      ALTER TABLE strategy_proposals_v19 RENAME TO strategy_proposals;

      CREATE TABLE strategy_proposal_decisions (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        proposal_id        TEXT NOT NULL REFERENCES strategy_proposals (id) ON DELETE CASCADE,
        decision           TEXT NOT NULL CHECK (decision IN ('ACCEPT', 'REJECT', 'DISMISS', 'EDIT', 'SNOOZE', 'UNDO')),
        previous_status    TEXT NOT NULL,
        new_status         TEXT NOT NULL,
        previous_action_json TEXT,
        new_action_json    TEXT,
        setting_reverts_json TEXT,
        actor              TEXT NOT NULL,
        at                 TEXT NOT NULL
      );
      CREATE INDEX strategy_proposal_decisions_proposal ON strategy_proposal_decisions (proposal_id, id);
    `,
  },
  {
    version: 20,
    name: 'document_exports',
    sql: `
      -- SENSITIVE: a record of each PDF/DOCX export. Files are generated on demand and are not
      -- stored separately; the hash lets the candidate verify what was exported.
      CREATE TABLE document_exports (
        id             TEXT PRIMARY KEY,
        application_id TEXT REFERENCES applications (id) ON DELETE CASCADE,
        variant_id     TEXT REFERENCES document_variants (id) ON DELETE SET NULL,
        source         TEXT NOT NULL CHECK (source IN ('MASTER', 'VARIANT')),
        kind           TEXT NOT NULL,
        format         TEXT NOT NULL CHECK (format IN ('pdf', 'docx')),
        filename       TEXT NOT NULL,
        sha256         TEXT NOT NULL,
        size_bytes     INTEGER NOT NULL,
        created_by     TEXT NOT NULL,
        created_at     TEXT NOT NULL
      );
      CREATE INDEX document_exports_application ON document_exports (application_id, created_at);
    `,
  },
  {
    version: 21,
    name: 'company_intelligence_and_collections',
    sql: `
      -- PUBLIC: Structured 360 attributes for companies with dated provenance.
      CREATE TABLE company_profiles (
        company_id             TEXT PRIMARY KEY REFERENCES company_registry (id) ON DELETE CASCADE,
        industry               TEXT,
        product_domain         TEXT,
        stage                  TEXT NOT NULL DEFAULT 'UNKNOWN',
        headquarters_city      TEXT,
        headquarters_country   TEXT,
        team_size_range        TEXT NOT NULL DEFAULT 'UNKNOWN',
        headcount_trend        TEXT NOT NULL DEFAULT 'UNKNOWN',
        funding_summary_json   TEXT NOT NULL DEFAULT '{"totalRaised":null,"currency":null,"rounds":[]}',
        tech_stack_json        TEXT NOT NULL DEFAULT '[]',
        employee_signals_json  TEXT NOT NULL DEFAULT '{"summary":null,"source":null,"observedAt":null}',
        provenance_json        TEXT NOT NULL DEFAULT '{}',
        updated_at             TEXT NOT NULL
      );
      CREATE INDEX company_profiles_stage ON company_profiles (stage);

      -- PERSONAL: Companies the candidate watches/follows with alert preferences.
      CREATE TABLE company_watches (
        company_id             TEXT PRIMARY KEY REFERENCES company_registry (id) ON DELETE CASCADE,
        notify_on_new_roles    INTEGER NOT NULL DEFAULT 1,
        notify_on_hiring_surge INTEGER NOT NULL DEFAULT 0,
        notes                  TEXT,
        followed_at            TEXT NOT NULL,
        updated_at             TEXT NOT NULL
      );

      -- PUBLIC: Dated timeline of observed company-level events.
      CREATE TABLE company_events (
        id                     TEXT PRIMARY KEY,
        company_id             TEXT NOT NULL REFERENCES company_registry (id) ON DELETE CASCADE,
        kind                   TEXT NOT NULL,
        title                  TEXT NOT NULL,
        detail                 TEXT NOT NULL,
        source                 TEXT NOT NULL,
        source_url             TEXT,
        event_at               TEXT NOT NULL,
        created_at             TEXT NOT NULL
      );
      CREATE INDEX company_events_company_date ON company_events (company_id, event_at DESC);

      -- PUBLIC / PERSONAL: Curated and candidate-defined company and career collections.
      CREATE TABLE curated_collections (
        id                     TEXT PRIMARY KEY,
        slug                   TEXT NOT NULL UNIQUE,
        title                  TEXT NOT NULL,
        description            TEXT NOT NULL,
        rule_kind              TEXT NOT NULL,
        rule_filter_json       TEXT NOT NULL DEFAULT '{}',
        badge                  TEXT NOT NULL,
        is_custom              INTEGER NOT NULL DEFAULT 0,
        created_at             TEXT NOT NULL,
        updated_at             TEXT NOT NULL
      );
      CREATE INDEX curated_collections_slug ON curated_collections (slug);

      -- PUBLIC: Source-aware compensation benchmark records with sample size thresholds.
      CREATE TABLE compensation_benchmarks (
        id                     TEXT PRIMARY KEY,
        role_family            TEXT NOT NULL,
        seniority              TEXT NOT NULL,
        country_code           TEXT NOT NULL,
        city                   TEXT,
        currency               TEXT NOT NULL,
        period                 TEXT NOT NULL CHECK (period IN ('year', 'month', 'hour')),
        base_min               REAL NOT NULL,
        base_max               REAL NOT NULL,
        p25                    REAL,
        p50                    REAL,
        p75                    REAL,
        sample_size            INTEGER,
        source_kind            TEXT NOT NULL CHECK (source_kind IN ('EMPLOYER_DISCLOSED', 'EXTERNAL_BENCHMARK', 'CANDIDATE_REPORTED', 'MODEL_ESTIMATE')),
        source_name            TEXT NOT NULL,
        observed_at            TEXT NOT NULL,
        limitations            TEXT NOT NULL
      );
      CREATE INDEX compensation_benchmarks_query ON compensation_benchmarks (role_family, seniority, country_code);
    `,
  },
  {
    version: 22,
    name: 'chief_of_staff_missions_and_plans',
    sql: `
        -- PERSONAL / SENSITIVE: Durable career mission with dual-track strategy.
        CREATE TABLE career_missions (
          id                            TEXT PRIMARY KEY,
          version                       INTEGER NOT NULL DEFAULT 1,
          title                         TEXT NOT NULL,
          desired_outcome               TEXT NOT NULL,
          target_roles_json             TEXT NOT NULL DEFAULT '[]',
          adjacent_roles_json           TEXT NOT NULL DEFAULT '[]',
          track_a_params_json           TEXT NOT NULL DEFAULT '{}',
          track_b_params_json           TEXT NOT NULL DEFAULT '{}',
          salary_floor                  REAL,
          salary_currency               TEXT,
          target_locations_json         TEXT NOT NULL DEFAULT '[]',
          remote_policy                 TEXT NOT NULL DEFAULT 'remote_only',
          relocation_willingness        INTEGER NOT NULL DEFAULT 0,
          work_authorization_json       TEXT NOT NULL DEFAULT '{}',
          joining_availability          TEXT NOT NULL DEFAULT 'unspecified',
          company_preferences_json      TEXT NOT NULL DEFAULT '{}',
          career_growth_priorities_json TEXT NOT NULL DEFAULT '[]',
          non_negotiables_json          TEXT NOT NULL DEFAULT '[]',
          search_urgency                TEXT NOT NULL DEFAULT 'moderate',
          weekly_effort_hours           INTEGER NOT NULL DEFAULT 5,
          success_criteria_json         TEXT NOT NULL DEFAULT '[]',
          status                        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED')),
          created_at                    TEXT NOT NULL,
          updated_at                    TEXT NOT NULL
        );
        CREATE INDEX career_missions_status ON career_missions (status);

        -- PERSONAL / SENSITIVE: Versioned history of career strategy adjustments.
        CREATE TABLE career_mission_history (
          id                            INTEGER PRIMARY KEY AUTOINCREMENT,
          mission_id                    TEXT NOT NULL REFERENCES career_missions (id) ON DELETE CASCADE,
          version                       INTEGER NOT NULL,
          change_summary                TEXT NOT NULL,
          snapshot_json                 TEXT NOT NULL,
          actor                         TEXT NOT NULL,
          created_at                    TEXT NOT NULL
        );
        CREATE INDEX career_mission_history_mission ON career_mission_history (mission_id, version DESC);

        -- PERSONAL: Goal-driven career execution plans.
        CREATE TABLE career_plans (
          id                            TEXT PRIMARY KEY,
          mission_id                    TEXT NOT NULL REFERENCES career_missions (id) ON DELETE CASCADE,
          title                         TEXT NOT NULL,
          track                         TEXT NOT NULL DEFAULT 'TRACK_A' CHECK (track IN ('TRACK_A', 'TRACK_B', 'HYBRID')),
          summary                       TEXT NOT NULL,
          status                        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
          created_at                    TEXT NOT NULL,
          updated_at                    TEXT NOT NULL
        );
        CREATE INDEX career_plans_mission ON career_plans (mission_id, status);

        -- PERSONAL / INTERNAL: Multi-step plan work items and checkpoints.
        CREATE TABLE career_plan_steps (
          id                            TEXT PRIMARY KEY,
          plan_id                       TEXT NOT NULL REFERENCES career_plans (id) ON DELETE CASCADE,
          step_order                    INTEGER NOT NULL,
          objective                     TEXT NOT NULL,
          reason                        TEXT NOT NULL,
          priority                      TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
          category                      TEXT NOT NULL CHECK (category IN ('DISCOVERY', 'RESEARCH', 'EVALUATION', 'PREPARATION', 'DECISION_REQUEST', 'STRATEGY_REVIEW')),
          permission_tier               TEXT NOT NULL CHECK (permission_tier IN ('AUTOMATIC', 'CONFIRMATION_REQUIRED', 'APPROVAL_REQUIRED')),
          dependencies_json             TEXT NOT NULL DEFAULT '[]',
          estimated_minutes             INTEGER,
          status                        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'BLOCKED', 'COMPLETED', 'FAILED', 'CANCELLED')),
          task_id                       TEXT REFERENCES tasks (id) ON DELETE SET NULL,
          requires_approval             INTEGER NOT NULL DEFAULT 0,
          approval_state                TEXT NOT NULL DEFAULT 'NONE' CHECK (approval_state IN ('NONE', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED')),
          evidence_requirements_json    TEXT NOT NULL DEFAULT '[]',
          recovery_instructions         TEXT,
          result_json                   TEXT,
          error                         TEXT,
          started_at                    TEXT,
          completed_at                  TEXT,
          created_at                    TEXT,
          updated_at                    TEXT
        );
        CREATE INDEX career_plan_steps_plan_order ON career_plan_steps (plan_id, step_order ASC);

        -- PERSONAL: Assistant transparent activity ledger.
        CREATE TABLE assistant_activity_ledger (
          id                            TEXT PRIMARY KEY,
          category                      TEXT NOT NULL CHECK (category IN ('OBSERVATION', 'ACTION_COMPLETED', 'APPROVAL_REQUESTED', 'DECISION_RECORDED', 'ERROR_ENCOUNTERED', 'STRATEGY_SHIFT')),
          title                         TEXT NOT NULL,
          detail                        TEXT NOT NULL,
          entity_type                   TEXT,
          entity_id                     TEXT,
          provenance                    TEXT NOT NULL,
          created_at                    TEXT NOT NULL
        );
        CREATE INDEX assistant_activity_ledger_date ON assistant_activity_ledger (created_at DESC);
    `,
  },
  {
    version: 23,
    name: 'career_os_phase2_phase3',
    sql: `
        -- Warm-Path Referral CRM (Pillar 3).
        CREATE TABLE contacts (
          id              TEXT PRIMARY KEY,
          name            TEXT NOT NULL,
          company         TEXT,
          title           TEXT,
          email           TEXT,
          linkedin_url    TEXT,
          source          TEXT NOT NULL DEFAULT 'manual',
          last_contact_at TEXT,
          notes           TEXT,
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        );
        CREATE INDEX contacts_company ON contacts (company);
        CREATE TABLE contact_interactions (
          id         TEXT PRIMARY KEY,
          contact_id TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
          kind       TEXT NOT NULL,
          note       TEXT,
          at         TEXT NOT NULL
        );
        CREATE INDEX contact_interactions_contact ON contact_interactions (contact_id, at DESC);

        -- STAR Story Vault (Pillar 5).
        CREATE TABLE star_stories (
          id            TEXT PRIMARY KEY,
          competency    TEXT NOT NULL,
          title         TEXT NOT NULL,
          situation     TEXT NOT NULL DEFAULT '',
          task          TEXT NOT NULL DEFAULT '',
          action        TEXT NOT NULL DEFAULT '',
          result        TEXT NOT NULL DEFAULT '',
          reuse_count   INTEGER NOT NULL DEFAULT 0,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );
        CREATE INDEX star_stories_competency ON star_stories (competency);

        -- Brag Vault / Promotion scope (Pillar 6).
        CREATE TABLE brag_entries (
          id            TEXT PRIMARY KEY,
          scope_tier    TEXT NOT NULL CHECK (scope_tier IN ('individual','team','cross_team','org')),
          competency    TEXT NOT NULL,
          title         TEXT NOT NULL,
          impact        TEXT NOT NULL DEFAULT '',
          created_at    TEXT NOT NULL
        );
        CREATE INDEX brag_entries_scope ON brag_entries (scope_tier);

        -- Onboarding plans for Hired Mode (Pillar 6).
        CREATE TABLE onboarding_plans (
          id              TEXT PRIMARY KEY,
          application_id  TEXT,
          job_title       TEXT,
          company         TEXT,
          plan_json       TEXT NOT NULL,
          created_at      TEXT NOT NULL
        );

        -- Resume variants for CV A/B (Pillar 4).
        CREATE TABLE resume_variants (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          content    TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );

        -- Offer Lab scenarios (Pillar 6), stored server-side for cross-device reuse.
        CREATE TABLE offer_scenarios (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          data_json  TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        -- Optional read-only IMAP sync settings (Pillar 6).
        CREATE TABLE imap_settings (
          id              INTEGER PRIMARY KEY CHECK (id = 1),
          host            TEXT NOT NULL,
          port            INTEGER NOT NULL DEFAULT 993,
          username        TEXT NOT NULL,
          password        TEXT,
          allowlist_json  TEXT NOT NULL DEFAULT '[]',
          enabled         INTEGER NOT NULL DEFAULT 0,
          last_sync_at    TEXT
        );
        CREATE TABLE imap_candidates (
          id          TEXT PRIMARY KEY,
          message_id  TEXT NOT NULL UNIQUE,
          from_addr   TEXT,
          subject     TEXT,
          detected_at TEXT NOT NULL,
          status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed'))
        );
    `,
  },
  {
    version: 24,
    name: 'job_location_and_source_sync_health',
    sql: `
        -- Deterministic location normalisation (resume-studio audit Step 3). The raw employer
        -- string stays in location_text; these columns are derived from it and used for filtering.
        ALTER TABLE jobs ADD COLUMN country_code TEXT;
        ALTER TABLE jobs ADD COLUMN country_codes_json TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE jobs ADD COLUMN work_mode TEXT NOT NULL DEFAULT 'unknown'
          CHECK (work_mode IN ('remote', 'hybrid', 'onsite', 'unknown'));
        ALTER TABLE jobs ADD COLUMN normalized_location TEXT;
        CREATE INDEX jobs_country_code ON jobs (country_code);
        CREATE INDEX jobs_work_mode ON jobs (work_mode);

        -- Per-source sync health: a failed fetch is always visible, never silent (audit Step 4).
        ALTER TABLE source_boards ADD COLUMN last_synced_at TEXT;
        ALTER TABLE source_boards ADD COLUMN last_status TEXT
          CHECK (last_status IN ('ok', 'error', 'skipped'));
        ALTER TABLE source_boards ADD COLUMN jobs_fetched_count INTEGER;
    `,
  },
  {
    version: 25,
    name: 'resume_studio_master_vault_and_snapshots',
    sql: `
        -- 1. Canonical Master Vault Entities (Roles, Projects, Education, Certs)
        CREATE TABLE IF NOT EXISTS master_entries (
          id TEXT PRIMARY KEY,
          entry_type TEXT NOT NULL CHECK (entry_type IN ('experience','project','education','certification')),
          organization TEXT NOT NULL,
          title TEXT NOT NULL,
          location TEXT,
          start_date TEXT,
          end_date TEXT,
          is_current INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_master_entries_type ON master_entries (entry_type, sort_order);

        -- 2. Atomic Achievements / Brag-Doc Bullets with Verified Provenance
        CREATE TABLE IF NOT EXISTS master_bullets (
          id TEXT PRIMARY KEY,
          entry_id TEXT NOT NULL REFERENCES master_entries(id) ON DELETE CASCADE,
          raw_text TEXT NOT NULL,
          verified_metrics_json TEXT NOT NULL DEFAULT '[]',
          canonical_skill_ids_json TEXT NOT NULL DEFAULT '[]',
          scope_level TEXT CHECK (scope_level IN ('individual','team','org')),
          xyz_score INTEGER NOT NULL DEFAULT 0,
          star_story_id TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_master_bullets_entry ON master_bullets (entry_id);

        -- 3. Per-Job Tailored Variants (Copy-on-Write Inheritance Overlay)
        -- Upgrades the existing resume_variants table with relational inheritance columns.
        ALTER TABLE resume_variants ADD COLUMN job_application_id TEXT;
        ALTER TABLE resume_variants ADD COLUMN template_id TEXT NOT NULL DEFAULT 'classic-single-col';
        ALTER TABLE resume_variants ADD COLUMN page_format TEXT NOT NULL DEFAULT 'LETTER';
        ALTER TABLE resume_variants ADD COLUMN summary_override TEXT;
        ALTER TABLE resume_variants ADD COLUMN included_entries_json TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE resume_variants ADD COLUMN bullet_overrides_json TEXT NOT NULL DEFAULT '{}';
        ALTER TABLE resume_variants ADD COLUMN design_tokens_json TEXT NOT NULL DEFAULT '{}';
        ALTER TABLE resume_variants ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
        CREATE INDEX idx_resume_variants_app ON resume_variants (job_application_id);

        -- 4. Immutable Submitted Snapshots (Verified Audit Trail + A/B Conversion Analytics)
        CREATE TABLE IF NOT EXISTS resume_snapshots (
          id TEXT PRIMARY KEY,
          variant_id TEXT NOT NULL REFERENCES resume_variants(id) ON DELETE CASCADE,
          job_application_id TEXT,
          format TEXT NOT NULL CHECK (format IN ('pdf','docx')),
          file_path TEXT NOT NULL,
          file_size_bytes INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          resolved_payload_json TEXT NOT NULL,
          ats_audit_report_json TEXT NOT NULL,
          jd_alignment_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_resume_snapshots_variant ON resume_snapshots (variant_id);

        -- 5. Local Skills Taxonomy (ESCO v1.2.1 + O*NET 31.0 + Curated Aliases)
        CREATE TABLE IF NOT EXISTS skills_taxonomy (
          canonical_id TEXT PRIMARY KEY,
          preferred_label TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('esco','onet','curated')),
          category TEXT,
          aliases_text TEXT NOT NULL DEFAULT '',
          embedding_blob BLOB
        );
        CREATE INDEX idx_skills_preferred_label ON skills_taxonomy (preferred_label);
        CREATE INDEX idx_skills_source ON skills_taxonomy (source);
    `,
  },
  {
    version: 26,
    name: 'expand_source_types_for_global_feeds',
    sql: `
      -- Global keyless feeds (Remotive, Arbeitnow) extend the set of allowed sources.
      -- SQLite cannot alter CHECK constraints, so both tables are rebuilt.

      CREATE TABLE job_sources_v26 (
        job_id        TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
        source        TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby', 'remotive', 'arbeitnow', 'manual', 'practice')),
        board         TEXT NOT NULL,
        source_job_id TEXT NOT NULL,
        source_url    TEXT,
        fetched_at    TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        PRIMARY KEY (source, board, source_job_id)
      );
      INSERT INTO job_sources_v26 (job_id, source, board, source_job_id, source_url, fetched_at, content_hash)
        SELECT job_id, source, board, source_job_id, source_url, fetched_at, content_hash FROM job_sources;
      DROP TABLE job_sources;
      ALTER TABLE job_sources_v26 RENAME TO job_sources;
      CREATE INDEX job_sources_job ON job_sources (job_id);

      CREATE TABLE source_boards_v26 (
        id                   TEXT PRIMARY KEY,
        source               TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby', 'remotive', 'arbeitnow', 'practice')),
        board                TEXT NOT NULL,
        added_at             TEXT NOT NULL,
        health               TEXT NOT NULL DEFAULT 'NEVER_RUN' CHECK (health IN ('NEVER_RUN', 'OK', 'DEGRADED', 'NOT_FOUND')),
        last_success_at      TEXT,
        last_error           TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        next_attempt_at      TEXT,
        last_synced_at       TEXT,
        last_status          TEXT CHECK (last_status IN ('ok', 'error', 'skipped')),
        jobs_fetched_count   INTEGER,
        UNIQUE (source, board)
      );
      INSERT INTO source_boards_v26
        (id, source, board, added_at, health, last_success_at, last_error, consecutive_failures, next_attempt_at, last_synced_at, last_status, jobs_fetched_count)
        SELECT id, source, board, added_at, health, last_success_at, last_error, consecutive_failures, next_attempt_at, last_synced_at, last_status, jobs_fetched_count
        FROM source_boards;
      DROP TABLE source_boards;
      ALTER TABLE source_boards_v26 RENAME TO source_boards;
    `,
  },
  {
    version: 27,
    name: 'job_skills_table',
    sql: `
      CREATE TABLE IF NOT EXISTS job_skills (
        job_id TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
        skill_slug TEXT NOT NULL,
        skill_label TEXT NOT NULL,
        PRIMARY KEY (job_id, skill_slug)
      );
      CREATE INDEX IF NOT EXISTS idx_job_skills_slug ON job_skills (skill_slug);
      CREATE INDEX IF NOT EXISTS idx_job_skills_job_id ON job_skills (job_id);
    `,
  },
  {
    version: 28,
    name: 'expand_source_types_for_smartrecruiters_adzuna',
    sql: `
      -- SmartRecruiters (official public API) and Adzuna (official BYOK API) extend allowed sources.
      -- SQLite cannot alter CHECK constraints, so both tables are rebuilt.

      CREATE TABLE job_sources_v28 (
        job_id        TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
        source        TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'adzuna', 'remotive', 'arbeitnow', 'manual', 'practice')),
        board         TEXT NOT NULL,
        source_job_id TEXT NOT NULL,
        source_url    TEXT,
        fetched_at    TEXT NOT NULL,
        content_hash  TEXT NOT NULL,
        PRIMARY KEY (source, board, source_job_id)
      );
      INSERT INTO job_sources_v28 (job_id, source, board, source_job_id, source_url, fetched_at, content_hash)
        SELECT job_id, source, board, source_job_id, source_url, fetched_at, content_hash FROM job_sources;
      DROP TABLE job_sources;
      ALTER TABLE job_sources_v28 RENAME TO job_sources;
      CREATE INDEX job_sources_job ON job_sources (job_id);

      CREATE TABLE source_boards_v28 (
        id                   TEXT PRIMARY KEY,
        source               TEXT NOT NULL CHECK (source IN ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'adzuna', 'remotive', 'arbeitnow', 'practice')),
        board                TEXT NOT NULL,
        added_at             TEXT NOT NULL,
        health               TEXT NOT NULL DEFAULT 'NEVER_RUN' CHECK (health IN ('NEVER_RUN', 'OK', 'DEGRADED', 'NOT_FOUND')),
        last_success_at      TEXT,
        last_error           TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        next_attempt_at      TEXT,
        last_synced_at       TEXT,
        last_status          TEXT CHECK (last_status IN ('ok', 'error', 'skipped')),
        jobs_fetched_count   INTEGER,
        UNIQUE (source, board)
      );
      INSERT INTO source_boards_v28
        (id, source, board, added_at, health, last_success_at, last_error, consecutive_failures, next_attempt_at, last_synced_at, last_status, jobs_fetched_count)
        SELECT id, source, board, added_at, health, last_success_at, last_error, consecutive_failures, next_attempt_at, last_synced_at, last_status, jobs_fetched_count
        FROM source_boards;
      DROP TABLE source_boards;
      ALTER TABLE source_boards_v28 RENAME TO source_boards;
    `,
  },
  {
    version: 29,
    name: 'saved_search_loops',
    sql: `
      CREATE TABLE IF NOT EXISTS saved_searches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        skills_json TEXT NOT NULL DEFAULT '[]',
        country_codes_json TEXT NOT NULL DEFAULT '[]',
        cities_json TEXT NOT NULL DEFAULT '[]',
        work_mode TEXT,
        min_match_score REAL,
        last_run_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_saved_searches_updated ON saved_searches (updated_at DESC);
    `,
  },
];
