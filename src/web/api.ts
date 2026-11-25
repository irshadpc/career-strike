// Browser client for the local Career Strike API. Authentication is the HttpOnly session cookie;
// every non-GET request carries the per-session CSRF token.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown,
  ) {
    const bodyMessage =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof (body as { message?: unknown }).message === 'string' &&
      (body as { message: string }).message.trim().length > 0
        ? (body as { message: string }).message.trim()
        : null;
    super(bodyMessage ?? `${code} (HTTP ${status})`);
  }
}

/** The service could not be reached at all (stopped, restarting, or network failure). */
export class ServiceUnavailableError extends Error {}

type ConnectionListener = (state: 'unavailable' | 'unauthenticated') => void;

let csrfToken: string | null = null;
const listeners = new Set<ConnectionListener>();

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function currentCsrfToken(): string {
  return csrfToken ?? '';
}

export function onConnectionProblem(listener: ConnectionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-cs-csrf'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    listeners.forEach((l) => l('unavailable'));
    throw new ServiceUnavailableError('Career Strike service is not reachable.');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) listeners.forEach((l) => l('unauthenticated'));
    const code =
      typeof data === 'object' && data !== null && 'error' in data ? String(data.error) : `HTTP_${res.status}`;
    throw new ApiError(res.status, code, data);
  }
  return data as T;
}

// ---- response shapes ----

export interface NextAction {
  rule: string;
  title: string;
  reason: string;
  href: string;
}

export interface FollowUp {
  id: string;
  applicationId: string;
  dueAt: string;
  note: string;
  status: 'OPEN' | 'DONE' | 'DISMISSED';
  createdAt: string;
  closedAt: string | null;
  title?: string;
  employer?: string;
}

export interface Overview {
  service: { version: string; schemaVersion: number; startedAt: string | null };
  applications: {
    drafts: number;
    readyForReview: number;
    approved: number;
    awaitingConfirmation: number;
    submitted: number;
    interviewing: number;
    offers: number;
    expiredUnsent: number;
  };
  followUps: FollowUp[];
  interviews: Interview[];
  aiHosts: { connected: string[]; configured: string[] };
  jobs: JobCounts;
  sources: { boards: number; healthy: number; failing: number; lastSuccessfulDiscovery: string | null };
  activeTasks: Task[];
  nextActions: NextAction[];
}

export interface JsonSchema {
  type?: string;
  enum?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  maximum?: number;
  additionalProperties?: JsonSchema | boolean;
}

export interface SettingDefinition {
  key: string;
  label: string;
  help: string;
  options: Record<string, string>;
  classification: 'PUBLIC' | 'PERSONAL' | 'SENSITIVE';
  schema: JsonSchema;
}

export interface UpdateStatus {
  current: string;
  checks: 'off' | 'weekly';
  checkedAt: string | null;
  latest: { version: string; name: string; url: string; notes: string; publishedAt: string | null } | null;
  updateAvailable: boolean;
  error: string | null;
  whatsNew: { from: string; to: string; notes: string | null } | null;
}

export interface SettingsResponse {
  settings: Record<string, unknown>;
  definitions: SettingDefinition[];
}

export interface ValidationIssue {
  message: string;
  path: (string | number)[];
}

export type EffectiveStatus = 'OPEN' | 'STALE' | 'CLOSED' | 'UNVERIFIED';
export type Disposition = 'none' | 'shortlisted' | 'excluded';

export interface PublishedSalary {
  currency: string;
  min: number | null;
  max: number | null;
  interval: 'year' | 'month' | 'week' | 'day' | 'hour';
}

export interface MarketFacts {
  location: { countryCode: string | null; city: string | null; originalText: string | null };
  remoteEligibility: 'global' | 'country_restricted' | 'region_restricted' | 'unknown' | 'not_remote';
  remoteEligibleCountries: string[];
  visaSponsorship: 'yes' | 'no' | 'unknown';
  workAuthorization: 'required' | 'not_required' | 'unknown';
  relocationAssistance: 'yes' | 'no' | 'unknown';
}

export interface JobSummary {
  id: string;
  employer: string;
  title: string;
  locationText: string | null;
  remotePolicy: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  employmentType: string;
  salary: PublishedSalary | null;
  status: EffectiveStatus;
  firstSeenAt: string;
  lastVerifiedAt: string | null;
  publishedAt: string | null;
  sources: string[];
  duplicateOf: string | null;
  disposition: Disposition;
  employerExcluded: boolean;
  market: MarketFacts;
  sourceCapabilities: string[];
  countryCode?: string | null;
  countryCodes?: string[];
  workMode?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  normalizedLocation?: string | null;
  applyUrl?: string | null;
  allSkills?: string[];
  matchedSkills?: string[];
  fit?: FitSummary;
}

export interface SkillFacet {
  slug: string;
  label: string;
  count: number;
}

export async function getSkillFacets(filters?: {
  country?: string;
  remote?: string;
  q?: string;
}): Promise<{ skills: SkillFacet[] }> {
  const params = new URLSearchParams();
  if (filters?.country) params.set('country', filters.country);
  if (filters?.remote) params.set('remote', filters.remote);
  if (filters?.q) params.set('q', filters.q);
  const qStr = params.toString();
  return api<{ skills: SkillFacet[] }>(`/api/opportunities/skills${qStr ? `?${qStr}` : ''}`);
}

export interface TextBlock {
  type: 'heading' | 'paragraph' | 'item';
  text: string;
}

export interface JobDetail extends JobSummary {
  department: string | null;
  description: TextBlock[];
  applyUrl: string | null;
  postingUrl: string | null;
  closedAt: string | null;
  unresolved: string[];
  sourceRecords: { source: string; board: string; sourceJobId: string; url: string | null; fetchedAt: string }[];
  duplicates: { id: string; title: string; employer: string; sources: string[] }[];
  requirements: PostingRequirements;
  fitDetail?: FitDetail;
}

export interface JobList {
  total: number;
  jobs: JobSummary[];
  fitAvailable: boolean;
  countryCounts?: Record<string, number>;
}

export interface Task {
  id: string;
  kind: string;
  trigger: string;
  client: string;
  state: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  heartbeatAt: string | null;
  attempt: number;
  live: boolean;
  progress: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface SourceBoard {
  id: string;
  source: 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'adzuna' | 'remotive' | 'arbeitnow' | 'practice';
  board: string;
  boardUrl: string;
  addedAt: string;
  health: 'NEVER_RUN' | 'OK' | 'DEGRADED' | 'NOT_FOUND';
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastSyncedAt: string | null;
  lastStatus: 'ok' | 'error' | 'skipped' | null;
  jobsFetchedCount: number | null;
  lastTask: { id: string; state: Task['state']; endedAt: string | null } | null;
}

export interface JobCounts {
  open: number;
  stale: number;
  unverified: number;
  shortlisted: number;
  unreviewed: number;
  newSince24h: number;
}

export type Tier = 'strong' | 'possible' | 'stretch' | 'ineligible' | 'unknown';
export type Verdict = 'meets' | 'partial' | 'gap' | 'unknown';

export interface FitSummary {
  tier: Tier;
  tierRule: string;
  matchedSkills: string[];
  missingRequiredSkills: string[];
  immediateStartAsked: boolean;
}

export interface FitFactor {
  id: string;
  label: string;
  verdict: Verdict;
  detail: string;
  evidence: { source: 'posting' | 'profile' | 'settings' | 'inferred'; text: string }[];
  hard: boolean;
}

export interface FitDetail {
  tier: Tier;
  tierRule: string;
  factors: FitFactor[];
  matchedSkills: string[];
  missingRequiredSkills: string[];
  transferableSkills: string[];
  immediateStart: { asked: boolean; candidateAvailable: boolean | null };
}

export interface PostingRequirements {
  skills: { skill: string; importance: 'required' | 'preferred' | 'mentioned'; evidence: string }[];
  yearsRequired: { min: number; evidence: string } | null;
  seniority: { level: string; evidence: string } | null;
  urgency: string[];
  locationConstraints: string[];
}

export type FactKind = 'skill' | 'role' | 'education' | 'certification' | 'language';

export type ProfileReadinessState =
  | 'PROFILE_MISSING_INFORMATION'
  | 'PROFILE_EXTRACTED_UNCONFIRMED'
  | 'PROFILE_READY_FOR_MATCHING'
  | 'APPLICATION_INFORMATION_INCOMPLETE'
  | 'PROFILE_READY_FOR_APPLICATION_PREPARATION';

export interface ProfileReadinessCounts {
  confirmedRoles: number;
  unconfirmedRoles: number;
  confirmedSkills: number;
  unconfirmedSkills: number;
  confirmedEducation: number;
  confirmedCertifications: number;
  confirmedLanguages: number;
  confirmedEvidence: number;
  unconfirmedEvidence: number;
  totalUnconfirmed: number;
}

export interface ProfileReadinessReport {
  state: ProfileReadinessState;
  title: string;
  summary: string;
  actionLabel: string;
  actionHref: string;
  counts: ProfileReadinessCounts;
  hasContactDetails: boolean;
  hasLinkedInUrl: boolean;
  missingRequirements: string[];
  recommendations: string[];
}

export interface ProfileFact {
  id: string;
  kind: FactKind;
  value: Record<string, unknown>;
  source: 'user' | 'document';
  approved: boolean;
  createdAt: string;
}

export type DocumentCheckStatus = 'PASS' | 'WARN' | 'FAIL';
export type DocumentReadinessState = 'READY_TO_TAILOR' | 'NEEDS_ATTENTION' | 'INCOMPLETE';

export interface DocumentCheck {
  id: string;
  label: string;
  status: DocumentCheckStatus;
  explanation: string;
  fixHref: string | null;
}

export interface DocumentReadinessReport {
  state: DocumentReadinessState;
  score: number;
  passed: number;
  warnings: number;
  failed: number;
  checks: DocumentCheck[];
  summary: string;
  disclaimer: string;
  generatedAt: string;
}

export interface MasterResumeDocument {
  content: string;
  generatedAt: string;
  profileFingerprint: string;
  counts: {
    roles: number;
    skills: number;
    projects: number;
    achievements: number;
    employmentDetails: number;
    education: number;
    certifications: number;
    languages: number;
  };
  identity: {
    hasName: boolean;
    hasEmail: boolean;
    hasPhone: boolean;
    hasLinkedIn: boolean;
    hasHeadline: boolean;
    hasSummary: boolean;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedin?: string | null;
  };
  sourceFacts: number;
  sourceEvidence: number;
}

export type HiringSignal =
  | 'VERIFIED_OPEN_ROLES'
  | 'NO_OPEN_ROLES_OBSERVED'
  | 'EVIDENCE_STALE'
  | 'BOARD_UNAVAILABLE'
  | 'NOT_YET_OBSERVED';

export interface CompanySignal {
  id: string;
  employer: string;
  officialWebsite: string;
  careersUrl: string;
  countries: string[];
  source: 'greenhouse' | 'lever' | 'ashby';
  board: string;
  boardUrl: string;
  signal: HiringSignal;
  openRoles: number;
  lastSuccessfulRetrievalAt: string | null;
  lastVerifiedAt: string | null;
  sampleRoles: { title: string; location: string | null; lastSeenAt: string }[];
  explanation: string;
  evidence: string[];
}

export interface StoredDocument {
  id: string;
  kind: 'resume' | 'cover_letter' | 'other';
  filename: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export type ApplicationState =
  | 'DRAFTED'
  | 'NEEDS_INFORMATION'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'NEEDS_MANUAL_ACTION'
  | 'SUBMISSION_IN_PROGRESS'
  | 'SUBMITTED_CONFIRMED'
  | 'SUBMISSION_UNCONFIRMED'
  | 'SUBMISSION_FAILED'
  | 'RESPONSE_RECEIVED'
  | 'INTERVIEW'
  | 'OFFER'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'CLOSED'
  | 'EXPIRED'
  | 'DUPLICATE'
  | 'BLOCKED'
  | 'CANCELLED';

export interface PayloadField {
  key: string;
  label: string;
  required: boolean;
  kind: 'text' | 'long_text' | 'file' | 'choice';
  options: string[];
  source: 'identity' | 'document' | 'draft' | 'candidate' | 'empty';
  value: string | null;
}

export interface ApplicationPayload {
  job: { id: string; canonicalKey: string; employer: string; title: string };
  destination: { method: 'manual' | 'assisted' | 'test-ats'; url: string | null };
  identity: { fullName: string | null; email: string | null; phone: string | null; links: string[] };
  fields: PayloadField[];
  coverLetter: string | null;
  personalization?: {
    profileFingerprint: string;
    snapshotId: string;
    variants: { id: string; kind: 'resume' | 'cover_letter'; contentHash: string }[];
  } | null;
  attachments: { documentId: string; kind: string; filename: string; sha256: string }[];
  notAnswered: string[];
}

export interface ProfileEvidence {
  id: string;
  kind: 'project' | 'achievement' | 'portfolio' | 'employment_detail';
  value: Record<string, unknown>;
  source: 'user' | 'document';
  confirmed: boolean;
  revision: number;
  lastConfirmedAt: string | null;
  lastConfirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceRevision {
  id: number;
  evidenceId: string;
  revision: number;
  change: 'CREATED' | 'UPDATED' | 'CONFIRMED' | 'BACKFILLED';
  value: Record<string, unknown>;
  source: 'user' | 'document';
  confirmed: boolean;
  actor: string;
  at: string;
}

export interface EvidenceConflict {
  evidenceId: string;
  otherId: string;
  kind: ProfileEvidence['kind'];
  reason: 'DUPLICATE_IDENTITY_WITH_DIFFERENT_DETAILS';
  message: string;
}

export type RegistrySignal =
  | 'VERIFIED_OPEN_ROLES'
  | 'NO_CURRENT_ROLES_OBSERVED'
  | 'EVIDENCE_STALE'
  | 'REGISTRY_ONLY'
  | 'CANDIDATE_ENTRY_UNVERIFIED';

export interface CompanyRegistryEntry {
  id: string;
  name: string;
  origin: 'OBSERVED_POSTING' | 'CURATED_TARGET' | 'CANDIDATE_ENTRY';
  officialWebsite: string | null;
  careersUrl: string | null;
  markets: string[];
  sources: { source: string; board: string; lastSeenAt: string }[];
  openRoles: number;
  observedRoles: number;
  firstObservedAt: string;
  lastObservedAt: string;
  signal: RegistrySignal;
  monitored: boolean;
  curatedTargetId: string | null;
  sampleRoles: {
    title: string;
    location: string | null;
    lastSeenAt: string;
    status: 'OPEN' | 'CLOSED' | 'UNVERIFIED';
  }[];
  explanation: string;
  evidence: string[];
}

export interface CompanyRegistrySummary {
  total: number;
  verifiedOpenRoles: number;
  registryOnly: number;
  stale: number;
  monitored: number;
}

export type OutreachChannel = 'linkedin' | 'email' | 'other';
export type OutreachPurpose = 'referral' | 'recruiter' | 'follow_up' | 'thank_you' | 'other';
export type OutreachState = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT_MANUALLY' | 'DISMISSED';

export interface ProfessionalContact {
  id: string;
  name: string;
  employer: string | null;
  roleTitle: string | null;
  profileUrl: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachDraft {
  id: string;
  contactId: string;
  contact: ProfessionalContact;
  applicationId: string | null;
  application: { id: string; title: string; employer: string } | null;
  channel: OutreachChannel;
  purpose: OutreachPurpose;
  subject: string | null;
  body: string;
  state: OutreachState;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  decidedBy: string | null;
  events: { from: string | null; to: string; actor: string; note: string | null; at: string }[];
}

export interface ExportVerificationCheck {
  id: string;
  label: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  explanation: string;
}
export interface ExportVerification {
  passed: boolean;
  checks: ExportVerificationCheck[];
  warnings: string[];
  failures: string[];
  generatedSha256: string;
  extractedCharacters: number;
  generatedBytes: number;
}
export interface ExportResult {
  filename: string;
  pdf?: string;
  docx?: string;
  verification: ExportVerification;
}
export interface ParserReport {
  format: 'pdf' | 'docx';
  mime: string;
  sizeBytes: number;
  sha256: string;
  extracted: boolean;
  extractedCharacters: number;
  sparse: boolean;
  ligatureCorruption: boolean;
  sourceCharacters: number;
  wordCoverage: number;
  missingWords: string[];
  basis: 'LOCAL_PARSER_TEST_ONLY';
  note: string;
}

export interface DocumentExportHistory {
  id: string;
  applicationId: string | null;
  variantId: string | null;
  source: string;
  kind: string;
  format: 'pdf' | 'docx';
  filename: string;
  sha256: string;
  sizeBytes: number;
  createdBy: string;
  createdAt: string;
}

export interface LinkedInImportResult {
  imported: {
    skills: number;
    roles: number;
    education: number;
    certifications: number;
    languages: number;
    projects: number;
  };
  total: number;
  skipped: number;
  profile?: {
    fullName?: string;
    headline?: string;
    summary?: string;
  };
}

export interface PersonalizationVariant {
  id: string;
  kind: 'resume' | 'cover_letter';
  format: 'source_text';
  locale: string;
  content: string;
  contentHash: string;
  profileFingerprint: string;
  status: 'DRAFT' | 'CANDIDATE_EDITED' | 'APPROVED' | 'SUPERSEDED';
  basedOnVariantId: string | null;
  createdAt: string;
  evidence: { requirement: string; classification: string; evidenceRefs: string[]; explanation: string }[];
}

export interface PersonalizationView {
  applicationId: string;
  snapshot: { id: string; completeness: 'FULL' | 'INCOMPLETE' | 'MISSING'; createdAt: string } | null;
  variants: PersonalizationVariant[];
  requirements: { requirement: string; classification: string; evidenceRefs: string[]; explanation: string }[];
  stale: boolean;
  warnings: string[];
}

export interface ApplicationView {
  id: string;
  jobId: string;
  state: ApplicationState;
  mode: string;
  version: number;
  payload: ApplicationPayload;
  payloadHash: string;
  createdAt: string;
  updatedAt: string;
  job: { title: string; employer: string; status: string };
  versions: { version: number; createdBy: string; reason: string; createdAt: string; payloadHash: string }[];
  events: {
    from: string | null;
    to: string;
    actor: string;
    note: string | null;
    evidence: Record<string, unknown> | null;
    at: string;
  }[];
  followUps: FollowUp[];
  duplicateRisk: { applicationId: string; state: ApplicationState; source: string }[];
  approval: {
    valid: boolean;
    reason: string;
    approval: {
      id: string;
      state: string;
      version: number;
      issuedAt: string;
      expiresAt: string;
      stateReason: string | null;
    } | null;
  };
  warnings: { kind: string; message: string }[];
  missingRequired: string[];
  disclosures: string[];
  allowedTransitions: ApplicationState[];
}

export interface ApplicationSummary {
  id: string;
  jobId: string;
  state: ApplicationState;
  title: string;
  employer: string;
  version: number;
  updatedAt: string;
}

export interface Interview {
  id: string;
  applicationId: string;
  stage: string;
  format: string;
  scheduledAt: string;
  notes: string | null;
  outcome: 'pending' | 'passed' | 'not_passed' | 'cancelled';
  title?: string;
  employer?: string;
}

export interface PrepTopic {
  id: string;
  title: string;
  kind: string;
  source: 'posting' | 'inferred';
  quote: string | null;
  gap: boolean;
  prompts: string[];
  sessions: number;
  lastConfidence: number | null;
  lastPracticedAt: string | null;
}

export interface Prep {
  application: { id: string; state: ApplicationState; title: string; employer: string };
  topics: PrepTopic[];
  sessions: {
    id: string;
    topicId: string;
    notes: string | null;
    confidence: number;
    minutes: number | null;
    practicedAt: string;
  }[];
  interviews: Interview[];
}

// ---- V14 Company Intelligence 360 & Decision Engine ----

export type CompanyStage =
  | 'BOOTSTRAPPED'
  | 'SEED'
  | 'SERIES_A'
  | 'SERIES_B'
  | 'SERIES_C_PLUS'
  | 'GROWTH'
  | 'PUBLIC'
  | 'SUBSIDIARY'
  | 'UNKNOWN';

export type HeadcountRange = '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1001-5000' | '5000+' | 'UNKNOWN';

export type HeadcountTrend = 'GROWING' | 'STABLE' | 'CONTRACTING' | 'UNKNOWN';

export type CompanyHiringSignal =
  | 'VERIFIED_OPEN_ROLES'
  | 'NO_CURRENT_ROLES_OBSERVED'
  | 'EVIDENCE_STALE'
  | 'REGISTRY_ONLY'
  | 'CANDIDATE_ENTRY_UNVERIFIED';

export interface ProvenanceClaim<T> {
  value: T;
  source: string;
  sourceUrl?: string | null;
  observedAt: string;
  confidence: 'CONFIRMED' | 'HIGH' | 'MEDIUM' | 'UNVERIFIED';
}

export interface FundingRound {
  roundName: string;
  amountUsd: number | null;
  announcedDate: string;
  source: string;
  sourceUrl?: string | null;
}

export interface CompanyMomentum {
  trend: 'SURGING' | 'STEADY' | 'STAGNANT' | 'COOLING' | 'UNKNOWN';
  rationale: string;
  openedLast30Days: number;
  closedLast30Days: number;
  totalObserved: number;
  lastEventDate?: string | null;
}

export interface Company360Profile {
  id: string;
  name: string;
  employerKey: string;
  origin: string;
  officialWebsite: string | null;
  careersUrl: string | null;
  stage: ProvenanceClaim<CompanyStage>;
  industry: ProvenanceClaim<string> | null;
  productDomain: ProvenanceClaim<string> | null;
  primaryLocations: ProvenanceClaim<string[]>;
  teamSizeRange: ProvenanceClaim<HeadcountRange>;
  headcountTrend: ProvenanceClaim<HeadcountTrend>;
  fundingSummary: {
    totalRaised: number | null;
    rounds: FundingRound[];
  };
  techStack: ProvenanceClaim<string[]>;
  employeeExperience: {
    signals: { topic: string; summary: string; source: string; observedAt: string }[];
  };
  openRolesCount: number;
  hiringSignal: CompanyHiringSignal;
  isWatched: boolean;
  watchNotes?: string | null;
  momentum: CompanyMomentum;
  updatedAt: string;
}

export interface CompanyEvent {
  id: string;
  companyId: string;
  kind: string;
  title: string;
  detail: string;
  source: string;
  sourceUrl?: string | null;
  eventAt: string;
  createdAt: string;
}

export interface CuratedCollectionSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  ruleKind: string;
  ruleFilterJson: string;
  badge: string;
  isCustom: boolean;
  activeOpenRolesCount: number;
  matchingCompaniesCount: number;
  updatedAt: string;
}

export interface CuratedCollectionDetail extends CuratedCollectionSummary {
  matchingCompanies: {
    id: string;
    name: string;
    stage: string;
    openRoles: number;
    signal: string;
  }[];
  activeRoles: JobSummary[];
}

export interface CompensationBenchmarkRecord {
  id: string;
  roleFamily: string;
  seniority: string;
  countryCode: string;
  city: string | null;
  currency: string;
  period: 'year' | 'month' | 'hour';
  baseMin: number;
  baseMax: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  sampleSize: number | null;
  sourceKind: string;
  sourceName: string;
  observedAt: string;
  limitations: string;
}

export interface CompensationComparison {
  status: 'ABOVE_MEDIAN' | 'WITHIN_MARKET_RANGE' | 'BELOW_MEDIAN' | 'INSUFFICIENT_DATA';
  offeredAnnualized: number | null;
  benchmarkAnnualizedP50: number | null;
  percentileRank: number | null;
  relativeDifferencePct: number | null;
  verdict: string;
  caveats: string[];
}

export interface MarketPulseDistributionItem {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

export interface MarketPulseSkillCount {
  skill: string;
  count: number;
  percentage: number;
}

export interface CareerMarketPulseReport {
  generatedAt: string;
  sampleSummary: {
    totalObservedPostings: number;
    activeOpenPostings: number;
    monitoredEmployers: number;
  };
  remotePolicyDistribution: MarketPulseDistributionItem[];
  topSkillsDemand: MarketPulseSkillCount[];
  topJobTitles: { title: string; count: number }[];
  countryDistribution: MarketPulseDistributionItem[];
  salaryTransparency: {
    disclosedCount: number;
    undisclosedCount: number;
    disclosurePercentage: number;
  };
  hiringVelocity: {
    openedLast14Days: number;
    closedLast14Days: number;
    netChange: number;
  };
  methodologyAndLimitations: {
    sourcePopulation: string;
    collectionMethod: string;
    timeWindow: string;
    samplingLimitations: string;
  };
}

export interface ShortlistDimensions {
  hardEligibility: {
    passed: boolean;
    reasons: string[];
    criticalFailures: string[];
  };
  professionalRelevance: {
    tier: Tier;
    matchedSkills: string[];
    missingSkills: string[];
    transferableSkills: string[];
    seniorityAlignment: 'aligned' | 'stretch' | 'below' | 'unknown';
  };
  candidatePreferences: {
    roleFit: 'preferred' | 'neutral' | 'unfavorable';
    locationFit: 'preferred' | 'neutral' | 'unfavorable';
    remoteFit: 'preferred' | 'neutral' | 'unfavorable';
    salaryFit: 'meets' | 'below' | 'unspecified';
  };
  sourceConfidence: {
    level: 'HIGH' | 'MEDIUM' | 'UNVERIFIED';
    verifiedWithin72h: boolean;
    sourceType: 'official_ats' | 'candidate_entry';
  };
  companyContext: {
    stage: CompanyStage;
    teamSize: HeadcountRange;
    hiringSignal: CompanyHiringSignal;
    isWatched: boolean;
    momentumTrend: CompanyMomentum['trend'];
  };
  applicationEffort: {
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTENSIVE';
    estimatedMinutes: number | null;
    basis: string;
  };
}

export type NextBestAction = 'APPLY' | 'INVESTIGATE_COMPANY' | 'PRACTICE_GAPS' | 'SKIP';

export interface DecisionReadyShortlistEntry {
  job: JobSummary;
  dimensions: ShortlistDimensions;
  recommendationExplanation: string;
  nextBestAction: NextBestAction;
}

export interface InterviewKnowledgeStudio {
  formatGuides: {
    stage: string;
    title: string;
    description: string;
    typicalDurationMinutes: number;
    evaluationCriteria: string[];
    keyPreparationTactics: string[];
    pitfallsToAvoid: string[];
  }[];
  researchFramework: {
    step: number;
    title: string;
    purpose: string;
    checkItems: string[];
    evidenceSources: string[];
  }[];
  negotiationPlaybook: {
    id: string;
    title: string;
    tactic: string;
    whenToUse: string;
    exampleScript: string;
    ethicalGuardrail: string;
  }[];
  externalCuratedResources: {
    title: string;
    authorOrPublisher: string;
    url: string;
    topic: string;
    attributionNote: string;
  }[];
}

export const fetchCompany360 = (id: string) =>
  api<{ company: Company360Profile }>(`/api/company-360/${encodeURIComponent(id)}`);

export const updateCompany360 = (id: string, updates: Record<string, unknown>) =>
  api<{ ok: boolean; profile: Company360Profile }>(`/api/company-360/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: updates,
  });

export const fetchCompanyEvents = (id: string, limit = 50) =>
  api<{ events: CompanyEvent[] }>(`/api/company-360/${encodeURIComponent(id)}/events?limit=${limit}`);

export const recordCompanyEvent = (
  id: string,
  event: { kind: string; title: string; detail?: string; source?: string; sourceUrl?: string | null; eventAt?: string },
) =>
  api<{ event: CompanyEvent }>(`/api/company-360/${encodeURIComponent(id)}/events`, {
    method: 'POST',
    body: event,
  });

export const toggleCompanyWatch = (
  id: string,
  watch: boolean,
  options?: { notifyOnNewRoles?: boolean; notifyOnHiringSurge?: boolean; notes?: string },
) =>
  watch
    ? api<{ ok: boolean; profile: Company360Profile }>(`/api/company-360/${encodeURIComponent(id)}/watch`, {
        method: 'POST',
        body: options ?? {},
      })
    : api<{ ok: boolean; profile: Company360Profile }>(`/api/company-360/${encodeURIComponent(id)}/watch`, {
        method: 'DELETE',
      });

export const fetchCollections = () => api<{ collections: CuratedCollectionSummary[] }>('/api/collections');

export const fetchCollectionDetail = (slugOrId: string) =>
  api<{ collection: CuratedCollectionDetail }>(`/api/collections/${encodeURIComponent(slugOrId)}`);

export const createCustomCollection = (data: {
  title: string;
  description: string;
  badge?: string;
  filter: Record<string, unknown>;
}) =>
  api<{ collection: CuratedCollectionSummary }>('/api/collections', {
    method: 'POST',
    body: data,
  });

export const fetchCompensationBenchmarks = (filters?: { roleFamily?: string; countryCode?: string }) => {
  const p = new URLSearchParams();
  if (filters?.roleFamily) p.set('roleFamily', filters.roleFamily);
  if (filters?.countryCode) p.set('countryCode', filters.countryCode);
  return api<{ benchmarks: CompensationBenchmarkRecord[] }>(`/api/compensation/benchmarks?${p.toString()}`);
};

export const evaluateCompensationOffer = (data: {
  roleFamily: string;
  seniority: string;
  countryCode: string;
  salary: PublishedSalary | null;
}) =>
  api<{ comparison: CompensationComparison }>('/api/compensation/evaluate', {
    method: 'POST',
    body: data,
  });

export const fetchMarketPulse = () => api<{ pulse: CareerMarketPulseReport }>('/api/market-pulse');

export const fetchDecisionReadyShortlists = () =>
  api<{ shortlists: DecisionReadyShortlistEntry[] }>('/api/opportunities/shortlist');

export const fetchInterviewKnowledgeStudio = () =>
  api<{ studio: InterviewKnowledgeStudio }>('/api/interview/knowledge');
