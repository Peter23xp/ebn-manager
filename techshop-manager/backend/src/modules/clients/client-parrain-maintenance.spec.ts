import { describe, expect, it } from '@jest/globals';
import { assertCatalogSafe, DELETE_TABLES, orderDeletes } from '../../../scripts/maintenance';

describe('Recruiter attribution maintenance compatibility', () => {
  const tables = ['sites', 'utilisateurs', 'clients', 'config_generale', 'kpay_transactions', 'mlm_payouts', 'withdrawal_requests', 'client_parrain_attributions'];
  const foreignKeys = [['clientId', 'clients'], ['parrainClientId', 'clients'], ['actorId', 'utilisateurs']].map(([column, target]) => ({
    sourceSchema: 'public', source: 'client_parrain_attributions', targetSchema: 'public', target,
    name: `client_parrain_attributions_${column}_fkey`, sourceColumns: [column], targetColumns: ['id'], onDelete: 'r', onUpdate: 'c',
  }));

  it('recognizes the additive audit table and orders it before its client and actor dependencies', () => {
    expect(() => assertCatalogSafe({ tables, foreignKeys, triggers: [], unsafeObjects: [] })).not.toThrow();
    const ordered = orderDeletes(DELETE_TABLES.filter(table => tables.includes(table)), foreignKeys);
    expect(ordered.indexOf('client_parrain_attributions')).toBeGreaterThanOrEqual(0);
    expect(ordered.indexOf('client_parrain_attributions')).toBeLessThan(ordered.indexOf('clients'));
    expect(ordered.indexOf('client_parrain_attributions')).toBeLessThan(ordered.indexOf('utilisateurs'));
  });

  it('still refuses unexpected cascading changes to audit foreign keys', () => {
    expect(() => assertCatalogSafe({ tables, foreignKeys: [{ ...foreignKeys[0], onDelete: 'c' }], triggers: [], unsafeObjects: [] })).toThrow();
  });
});
