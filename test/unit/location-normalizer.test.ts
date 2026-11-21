import { describe, expect, it } from 'vitest';
import { normalizeIngestedLocation } from '../../src/ingestion/locationNormalizer.js';

describe('normalizeIngestedLocation', () => {
  it('detects US cities and states', () => {
    expect(normalizeIngestedLocation('San Francisco, CA').countryCode).toBe('US');
    expect(normalizeIngestedLocation('New York, NY').countryCode).toBe('US');
    expect(normalizeIngestedLocation('Seattle, WA').countryCode).toBe('US');
    expect(normalizeIngestedLocation('Austin, TX').countryCode).toBe('US');
    expect(normalizeIngestedLocation('United States').countryCode).toBe('US');
  });

  it('detects Indian cities including Bengaluru, Bangalore, Hyderabad', () => {
    expect(normalizeIngestedLocation('Bengaluru, India').countryCode).toBe('IN');
    expect(normalizeIngestedLocation('Bangalore, India').countryCode).toBe('IN');
    expect(normalizeIngestedLocation('Hyderabad, India').countryCode).toBe('IN');
    expect(normalizeIngestedLocation('Mumbai').countryCode).toBe('IN');
    expect(normalizeIngestedLocation('Pune, India').countryCode).toBe('IN');
  });

  it('normalizes Bangalore/BLR aliases to Bengaluru, IN', () => {
    expect(normalizeIngestedLocation('BLR, India').countryCode).toBe('IN');
    expect(normalizeIngestedLocation('Bangalore').countryCode).toBe('IN');
    const blr = normalizeIngestedLocation('BLR');
    expect(blr.countryCode).toBe('IN');
  });

  it('detects UK and EU cities', () => {
    expect(normalizeIngestedLocation('London, UK').countryCode).toBe('GB');
    expect(normalizeIngestedLocation('London, United Kingdom').countryCode).toBe('GB');
    expect(normalizeIngestedLocation('Berlin, Germany').countryCode).toBe('DE');
    expect(normalizeIngestedLocation('Munich, Germany').countryCode).toBe('DE');
    expect(normalizeIngestedLocation('Amsterdam, Netherlands').countryCode).toBe('NL');
    expect(normalizeIngestedLocation('Dublin, Ireland').countryCode).toBe('IE');
    expect(normalizeIngestedLocation('Paris, France').countryCode).toBe('FR');
    expect(normalizeIngestedLocation('Singapore').countryCode).toBe('SG');
  });

  it('handles multi-location strings', () => {
    const multi = normalizeIngestedLocation('London, UK; Bengaluru, India');
    expect(multi.countryCodes).toEqual(expect.arrayContaining(['GB', 'IN']));
    expect(multi.countryCode).toBe('GB');
    const slash = normalizeIngestedLocation('New York, NY / London, UK');
    expect(slash.countryCodes).toEqual(expect.arrayContaining(['US', 'GB']));
  });

  it('handles Remote - Worldwide and global remote edge cases', () => {
    const worldwide = normalizeIngestedLocation('Remote - Worldwide');
    expect(worldwide.countryCode).toBe('GLOBAL');
    expect(worldwide.workMode).toBe('remote');
    const anywhere = normalizeIngestedLocation('Anywhere');
    expect(anywhere.countryCode).toBe('GLOBAL');
    const remoteNoLocation = normalizeIngestedLocation(null, 'remote');
    expect(remoteNoLocation.countryCode).toBe('GLOBAL');
    expect(remoteNoLocation.normalizedLocation).toBe('Remote (Global)');
  });

  it('detects work mode from tokens', () => {
    expect(normalizeIngestedLocation('Hybrid - Berlin, Germany').workMode).toBe('hybrid');
    expect(normalizeIngestedLocation('On-site, London, UK').workMode).toBe('onsite');
    expect(normalizeIngestedLocation('Remote, Bengaluru, India').workMode).toBe('remote');
  });

  it('preserves raw location', () => {
    const raw = 'London, UK; Bengaluru, India';
    expect(normalizeIngestedLocation(raw).rawLocation).toBe(raw);
  });
});
