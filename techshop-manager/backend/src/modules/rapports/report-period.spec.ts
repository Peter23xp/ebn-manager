import { describe, expect, it } from '@jest/globals';
import { reportPeriod, reportBuckets, reportBucketLabel } from './report-period';

describe('Périodes des rapports', () => {
  it('inclut le dernier jour et conserve les instants explicites', () => {
    expect(reportPeriod('2026-09-01', '2026-09-30').lte.toISOString()).toBe('2026-09-30T23:59:59.999Z');
    expect(reportPeriod('2026-09-01T00:00:00+02:00', '2026-09-02T00:00:00+02:00').gte.toISOString()).toBe('2026-08-31T22:00:00.000Z');
  });

  it.each(['2026-02-30', 'incorrect', '2026-15-01'])('refuse la date %s', invalid => {
    expect(() => reportPeriod(invalid, '2026-12-31')).toThrow();
  });

  it('borne les périodes trop grandes et inversées', () => {
    expect(() => reportPeriod('2026-10-01', '2026-09-01')).toThrow();
    expect(() => reportPeriod('2000-01-01', '2026-09-01')).toThrow();
  });

  it('ne saute aucun mois en commençant le 31 et conserve la dernière semaine partielle', () => {
    expect(reportBuckets(new Date('2026-01-31Z'), new Date('2026-03-02Z'), 'month').map(date => date.toISOString().slice(0, 10))).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(reportBuckets(new Date('2026-09-02Z'), new Date('2026-09-07Z'), 'week').map(date => date.toISOString().slice(0, 10))).toEqual(['2026-08-31', '2026-09-07']);
  });

  it('distingue les mêmes jours de deux années', () => {
    expect(reportBucketLabel(new Date('2025-09-01Z'), 'day')).not.toBe(reportBucketLabel(new Date('2026-09-01Z'), 'day'));
  });
});
