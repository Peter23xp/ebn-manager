import { describe, expect, it, jest } from '@jest/globals';
import { assertCatalogSafe, assertRestoreTarget, parseOptions, SafetyError } from '../../../scripts/maintenance';
import { runLegacyPurge } from '../../../prisma/purge';

describe('legacy purge entry point and explicit source policy', () => {
  const eventTriggers = [
    ['issue_graphql_placeholder', 'sql_drop', ['DROP EXTENSION'], 'set_graphql_placeholder', 'b0cadab880dc68f569b3e01057dc6f5acee9d05e122de6f4256130ae330bbcec'],
    ['issue_pg_cron_access', 'ddl_command_end', ['CREATE EXTENSION'], 'grant_pg_cron_access', 'eb3fa2e82a0135bc04a6236f93331911861c91b45d72cba5d9c03c1be2c34b4c'],
    ['issue_pg_graphql_access', 'ddl_command_end', ['CREATE EXTENSION'], 'grant_pg_graphql_access', '9ec845adab4ba00bbf7740458b6c4461094697023f0f7adc693b373e2ea54f68'],
    ['issue_pg_net_access', 'ddl_command_end', ['CREATE EXTENSION'], 'grant_pg_net_access', 'e38c4060751c9695123350596f1cb0d0c943015f3267a2a455d8efe02c711184'],
    ['pgrst_ddl_watch', 'ddl_command_end', null, 'pgrst_ddl_watch', '2b4b5d702ddf70fbd1a05c9825f9f9016d5c0ef97dd3df5f5b012ea23d9b94b1'],
    ['pgrst_drop_watch', 'sql_drop', null, 'pgrst_drop_watch', '3a2696133853e17a0456cbfbb233a03815f50895492143e84df983b558d76593'],
  ].map(([name, event, tags, functionName, definitionHash]) => ({ name, event, tags, functionName, definitionHash,
    enabled: 'O', owner: 'supabase_admin', functionOwner: 'supabase_admin', functionSchema: 'extensions', identityArguments: '',
    securityDefiner: false, config: ['search_path=""'] }));
  const catalog = { tables: ['sites', 'utilisateurs', 'config_generale', 'kpay_transactions', 'mlm_payouts', 'withdrawal_requests'],
    foreignKeys: [], triggers: [], unsafeObjects: [], eventTriggers };
  const policy = { workflow: 'transaction-fenced', sourcePolicy: 'supabase-session', target: 'source' };

  it('accepts only the exact reviewed six managed event triggers for the explicit pure-DML source profile', () => {
    expect(() => (assertCatalogSafe as Function)(catalog, policy)).not.toThrow();
    for (const invalid of [eventTriggers.slice(1), [], [...eventTriggers, eventTriggers[0]]]) {
      expect(() => (assertCatalogSafe as Function)({ ...catalog, eventTriggers: invalid }, policy)).toThrow('UNREVIEWED_EVENT_TRIGGER');
    }
  });

  it('rejects changed event identity, tags, owners, security, configuration or exact definition bytes', () => {
    for (const change of [
      { name: 'unreviewed' }, { event: 'ddl_command_start' }, { enabled: 'D' }, { tags: null }, { tags: ['CREATE EXTENSION'] },
      { owner: 'postgres' }, { functionOwner: 'postgres' }, { functionSchema: 'public' }, { functionName: 'other_function' },
      { identityArguments: 'unexpected text' }, { securityDefiner: true }, { config: null }, { config: ['search_path=public'] },
      { definitionHash: '0'.repeat(64) },
    ]) expect(() => (assertCatalogSafe as Function)({ ...catalog, eventTriggers: [{ ...eventTriggers[0], ...change }, ...eventTriggers.slice(1)] }, policy))
      .toThrow('UNREVIEWED_EVENT_TRIGGER');
    expect(() => (assertCatalogSafe as Function)({ ...catalog, unsafeObjects: [{ kind: 'rule' }] }, policy)).toThrow('UNREVIEWED_DATABASE_OBJECT');
  });

  it('keeps strict, direct-fenced and restore profiles closed and forbids every public user trigger under the exception', () => {
    for (const other of [undefined, { ...policy, workflow: 'strict-offline' }, { ...policy, sourcePolicy: 'direct' }, { ...policy, target: 'restore' }]) {
      expect(() => (assertCatalogSafe as Function)(catalog, other)).toThrow('UNREVIEWED_DATABASE_OBJECT');
    }
    for (const trigger of [
      { table: 'placement_history', name: 'placement_history_immutable', enabled: 'O', functionName: 'reject_placement_history_changes', functionSchema: 'public', type: 27 },
      { table: 'positions', name: 'positions_tree_check', enabled: 'O', functionName: 'enforce_matrix_position', functionSchema: 'public', type: 23 },
    ]) expect(() => (assertCatalogSafe as Function)({ ...catalog, triggers: [trigger] }, policy)).toThrow('SESSION_SOURCE_REQUIRES_PURE_DML');
  });

  it('can be imported without constructing a database client or running deletes', () => {
    jest.doMock('@prisma/client', () => ({ PrismaClient: class { constructor() { throw new Error('IMPORT_OPENED_DATABASE_CLIENT'); } } }));
    jest.doMock('pg', () => ({ Client: class { constructor() { throw new Error('IMPORT_OPENED_DATABASE_CLIENT'); } } }));
    try {
      jest.isolateModules(() => expect(() => require('../../../prisma/purge')).not.toThrow());
    } finally { jest.dontMock('@prisma/client'); jest.dontMock('pg'); }
  });

  it('allows the reviewed session endpoint only when its source policy is explicitly selected', () => {
    const source = 'postgresql://postgres.abcdefghijklmnopqrst:fixture@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require';
    const restore = 'postgresql://local:fixture@127.0.0.1:55433/ebn_restore_test';
    expect(() => assertRestoreTarget(restore, source)).toThrow(new SafetyError('DIRECT_CONNECTION_REQUIRED'));
    expect(() => (assertRestoreTarget as Function)(restore, source, 'supabase-session')).not.toThrow();
  });

  it('refuses unsafe session endpoint variants without attempting any connection', () => {
    const restore = 'postgresql://local:fixture@127.0.0.1:55433/ebn_restore_test';
    for (const [source, code] of [
      ['postgresql://postgres.abcdefghijklmnopqrst:fixture@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require', 'UNSAFE_SESSION_ENDPOINT'],
      ['postgresql://postgres.abcdefghijklmnopqrst:fixture@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=disable', 'REMOTE_TLS_REQUIRED'],
      ['postgresql://postgres:fixture@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require', 'UNSAFE_SESSION_ENDPOINT'],
      ['postgresql://postgres.abcdefghijklmnopqrst:fixture@evil.pooler.example.com:5432/postgres?sslmode=require', 'UNSAFE_SESSION_ENDPOINT'],
      ['postgresql://postgres.abcdefghijklmnopqrst:fixture@aws-0-eu-west-1.pooler.supabase.com.evil.example:5432/postgres?sslmode=require', 'UNSAFE_SESSION_ENDPOINT'],
      ['postgresql://postgres.abcdefghijklmnopqrst:fixture@127.0.0.1:5432/postgres?sslmode=require', 'UNSAFE_SESSION_ENDPOINT'],
    ]) expect(() => (assertRestoreTarget as Function)(restore, source, 'supabase-session')).toThrow(new SafetyError(code));
  });

  it('does not accept a source-policy override on the original strict CLI', () => {
    expect(() => parseOptions(['--source-policy', 'supabase-session'])).toThrow(new SafetyError('UNKNOWN_ARGUMENT'));
  });

  it('requires explicit legacy execution inputs before opening a connection and never falls back to application credentials', async () => {
    await expect(runLegacyPurge([], { DATABASE_URL: 'not-a-maintenance-target' })).rejects.toThrow('MAINTENANCE_DATABASE_URL_REQUIRED');
    await expect(runLegacyPurge(['--execute'], {})).rejects.toThrow('EXECUTE_REQUIRES_PURGE');
    await expect(runLegacyPurge(['--mode', 'purge', '--execute', '--preserve-admin-ids', 'first-admin,second-admin'],
      { MAINTENANCE_DATABASE_URL: 'not-a-valid-url' })).rejects.toThrow('FRESH_BACKUP_AND_RESTORE_REQUIRED');
    await expect(runLegacyPurge(['--mode', 'backup'], {})).rejects.toThrow('LEGACY_MODE_REQUIRES_INSPECT_OR_PURGE');
  });
});
