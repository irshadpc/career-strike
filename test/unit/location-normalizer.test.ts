import { describe, expect, it } from 'vitest';
import { normalizeIngestedLocation } from '../../src/ingestion/locationNormalizer.js';

describe('normalizeIngestedLocation', () => {
  describe('US locations', () => {
    it('detects US from US state abbreviations', () => {
      const sf = normalizeIngestedLocation('San Francisco, CA');
      expect(sf.countryCode).toBe('US');
      expect(sf.countryCodes).toContain('US');

      const nyc = normalizeIngestedLocation('New York, NY');
      expect(nyc.countryCode).toBe('US');
      expect(nyc.countryCodes).toContain('US');

      const austin = normalizeIngestedLocation('Austin, TX');
      expect(austin.countryCode).toBe('US');
      expect(austin.countryCodes).toContain('US');

      const seattle = normalizeIngestedLocation('Seattle, WA');
      expect(seattle.countryCode).toBe('US');
      expect(seattle.countryCodes).toContain('US');
    });

    it('detects US from explicit city or country names', () => {
      const us = normalizeIngestedLocation('Chicago, United States');
      expect(us.countryCode).toBe('US');

      const usa = normalizeIngestedLocation('Boston, USA');
      expect(usa.countryCode).toBe('US');
    });
  });

  describe('Indian cities', () => {
    it('detects India from major tech hubs', () => {
      const b1 = normalizeIngestedLocation('Bengaluru');
      expect(b1.countryCode).toBe('IN');
      expect(b1.countryCodes).toContain('IN');

      const b2 = normalizeIngestedLocation('Bangalore, Karnataka');
      expect(b2.countryCode).toBe('IN');

      const hyd = normalizeIngestedLocation('Hyderabad, India');
      expect(hyd.countryCode).toBe('IN');

      const mum = normalizeIngestedLocation('Mumbai');
      expect(mum.countryCode).toBe('IN');

      const pune = normalizeIngestedLocation('Pune, MH');
      expect(pune.countryCode).toBe('IN');

      const ncr = normalizeIngestedLocation('Gurugram / Noida');
      expect(ncr.countryCode).toBe('IN');
    });
  });

  describe('UK and EU cities', () => {
    it('detects United Kingdom', () => {
      const london = normalizeIngestedLocation('London, UK');
      expect(london.countryCode).toBe('GB');
      expect(london.countryCodes).toContain('GB');

      const manchester = normalizeIngestedLocation('Manchester');
      expect(manchester.countryCode).toBe('GB');
    });

    it('detects Germany', () => {
      const berlin = normalizeIngestedLocation('Berlin, Germany');
      expect(berlin.countryCode).toBe('DE');

      const munich = normalizeIngestedLocation('Munich');
      expect(munich.countryCode).toBe('DE');
    });

    it('detects Netherlands, Ireland, France', () => {
      const ams = normalizeIngestedLocation('Amsterdam, Netherlands');
      expect(ams.countryCode).toBe('NL');

      const dublin = normalizeIngestedLocation('Dublin, Ireland');
      expect(dublin.countryCode).toBe('IE');

      const paris = normalizeIngestedLocation('Paris, France');
      expect(paris.countryCode).toBe('FR');
    });
  });

  describe('Multi-location strings', () => {
    it('extracts all countries and sets primary to the first', () => {
      const multi = normalizeIngestedLocation('London, UK; Bengaluru, India');
      expect(multi.countryCode).toBe('GB');
      expect(multi.countryCodes).toEqual(['GB', 'IN']);

      const multi2 = normalizeIngestedLocation('San Francisco, CA / Amsterdam / Singapore');
      expect(multi2.countryCode).toBe('US');
      expect(multi2.countryCodes).toContain('US');
      expect(multi2.countryCodes).toContain('NL');
      expect(multi2.countryCodes).toContain('SG');
    });
  });

  describe('Remote & Worldwide edge cases', () => {
    it('handles explicit worldwide / global remote strings', () => {
      const global1 = normalizeIngestedLocation('Remote - Worldwide');
      expect(global1.countryCode).toBe('GLOBAL');
      expect(global1.workMode).toBe('remote');
      expect(global1.normalizedLocation).toBe('Remote (Global)');

      const global2 = normalizeIngestedLocation('Anywhere');
      expect(global2.countryCode).toBe('GLOBAL');
      expect(global2.workMode).toBe('remote');

      const global3 = normalizeIngestedLocation(null, 'remote');
      expect(global3.countryCode).toBe('GLOBAL');
      expect(global3.workMode).toBe('remote');
    });

    it('detects country-specific remote roles', () => {
      const usRemote = normalizeIngestedLocation('Remote, US');
      expect(usRemote.countryCode).toBe('US');
      expect(usRemote.workMode).toBe('remote');

      const inRemote = normalizeIngestedLocation('Bengaluru (Remote)');
      expect(inRemote.countryCode).toBe('IN');
      expect(inRemote.workMode).toBe('remote');
    });
  });

  describe('Work mode detection', () => {
    it('detects hybrid and onsite', () => {
      const hybrid = normalizeIngestedLocation('London (Hybrid)');
      expect(hybrid.workMode).toBe('hybrid');

      const onsite = normalizeIngestedLocation('New York, NY (On-site)');
      expect(onsite.workMode).toBe('onsite');
    });
  });
});
