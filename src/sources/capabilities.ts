import type { SourceId } from './types.js';

export type SourceCapability =
  | 'AUTHORIZED_PUBLIC_API'
  | 'AUTHORIZED_PARTNER_API'
  | 'PERMITTED_STRUCTURED_FEED'
  | 'AUTHORIZED_EMPLOYER_DIRECT'
  | 'USER_DRIVEN_DISCOVERY'
  | 'LINK_ONLY'
  | 'RESTRICTED'
  | 'UNAVAILABLE'
  | 'UNVERIFIED';

export interface SourceCapabilityRecord {
  source: SourceId;
  capability: SourceCapability;
  label: string;
  automatedRetrieval: boolean;
  applicationRetrieval: boolean;
  note: string;
}

const RECORDS: Readonly<Record<SourceId, SourceCapabilityRecord>> = {
  greenhouse: {
    source: 'greenhouse',
    capability: 'AUTHORIZED_EMPLOYER_DIRECT',
    label: 'Verified employer-direct feed',
    automatedRetrieval: true,
    applicationRetrieval: true,
    note: 'Public board API; a user-selected board is verified by a successful fetch.',
  },
  lever: {
    source: 'lever',
    capability: 'AUTHORIZED_EMPLOYER_DIRECT',
    label: 'Verified employer-direct feed',
    automatedRetrieval: true,
    applicationRetrieval: false,
    note: 'Public employer posting feed; application questions are completed on the employer site.',
  },
  ashby: {
    source: 'ashby',
    capability: 'AUTHORIZED_EMPLOYER_DIRECT',
    label: 'Verified employer-direct feed',
    automatedRetrieval: true,
    applicationRetrieval: false,
    note: 'Public listed-posting feed; unlisted postings are excluded.',
  },
  smartrecruiters: {
    source: 'smartrecruiters',
    capability: 'AUTHORIZED_PUBLIC_API',
    label: 'SmartRecruiters public API',
    automatedRetrieval: true,
    applicationRetrieval: false,
    note: 'Official public posting API; a user-selected company board is verified by a successful fetch. Applications happen on the employer site.',
  },
  adzuna: {
    source: 'adzuna',
    capability: 'AUTHORIZED_PARTNER_API',
    label: 'Adzuna (BYOK)',
    automatedRetrieval: true,
    applicationRetrieval: false,
    note: 'Official Adzuna developer API. Requires your own API credentials; when unconfigured the source stays visible but inactive.',
  },
  remotive: {
    source: 'remotive',
    capability: 'PERMITTED_STRUCTURED_FEED',
    label: 'Global remote feed',
    automatedRetrieval: true,
    applicationRetrieval: false,
    note: 'Public aggregated remote-job feed; applications happen on each employer site.',
  },
  arbeitnow: {
    source: 'arbeitnow',
    capability: 'PERMITTED_STRUCTURED_FEED',
    label: 'EU / Germany feed',
    automatedRetrieval: true,
    applicationRetrieval: false,
    note: 'Public aggregated job feed for EU and Germany; applications happen on each employer site.',
  },
  practice: {
    source: 'practice',
    capability: 'UNAVAILABLE',
    label: 'Local practice only',
    automatedRetrieval: true,
    applicationRetrieval: true,
    note: 'Owned loopback test endpoint, never a real employer source.',
  },
};

export function capabilityFor(source: SourceId): SourceCapabilityRecord {
  return RECORDS[source];
}

/** Manual entries are user-driven records, not an implied integration. Unknown IDs stay unverified. */
export function capabilityForName(source: string): SourceCapability {
  if (source in RECORDS) return RECORDS[source as SourceId].capability;
  return source === 'manual' ? 'USER_DRIVEN_DISCOVERY' : 'UNVERIFIED';
}
