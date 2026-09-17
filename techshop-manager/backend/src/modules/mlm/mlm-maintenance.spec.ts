import { describe, it, expect } from '@jest/globals';
import { spawnSync } from 'child_process';
import { parseOptions, orderDeletes, assertCatalogSafe, assertRestoreTarget, SafetyError, WINDOWS_PRIVATE_ACL_POLICY } from '../../../scripts/maintenance';

describe('maintenance fail-closed policy', () => {
  it('defaults to read-only inspection and refuses ambiguous destructive arguments', () => {
    expect(parseOptions([])).toEqual({ mode: 'inspect', execute: false });
    expect(parseOptions(['--mode', 'purge']).execute).toBe(false);
    expect(parseOptions(['--preserve-admin-id', 'selected-admin'])['preserve-admin-id']).toBe('selected-admin');
    expect(() => parseOptions(['--execute'])).toThrow('EXECUTE_REQUIRES_PURGE');
    expect(() => parseOptions(['--maintenance'])).toThrow('UNKNOWN_ARGUMENT');
    expect(() => parseOptions(['--mode', 'purge', '--mode', 'inspect'])).toThrow('DUPLICATE_ARGUMENT');
  });

  it('orders only allowlisted children before parents without cascading', () => {
    expect(orderDeletes(['sites', 'clients', 'utilisateurs'], [
      { sourceSchema: 'public', source: 'clients', targetSchema: 'public', target: 'utilisateurs' },
      { sourceSchema: 'public', source: 'utilisateurs', targetSchema: 'public', target: 'sites' },
      { sourceSchema: 'public', source: 'clients', targetSchema: 'public', target: 'clients' },
    ])).toEqual(['clients', 'utilisateurs', 'sites']);
    expect(() => orderDeletes(['sites', 'clients'], [
      { sourceSchema: 'public', source: 'sites', targetSchema: 'public', target: 'clients' },
      { sourceSchema: 'public', source: 'clients', targetSchema: 'public', target: 'sites' },
    ])).toThrow('DEPENDENCY_CYCLE');
  });

  it('normalizes an explicit admin set and refuses mixed, empty, duplicate or invalid selections', () => {
    expect(parseOptions(['--preserve-admin-ids', ' second-admin, first-admin '])['preserve-admin-ids'])
      .toEqual(['first-admin', 'second-admin']);
    expect(() => parseOptions(['--preserve-admin-id', 'first-admin', '--preserve-admin-ids', 'second-admin']))
      .toThrow(new SafetyError('MIXED_ADMIN_SELECTION'));
    for (const value of [' ', ',first-admin', 'first-admin,', 'first-admin,,second-admin', 'first admin', 'first-admin\nsecond-admin']) {
      expect(() => parseOptions(['--preserve-admin-ids', value])).toThrow(new SafetyError('INVALID_ADMIN_SELECTION'));
    }
    expect(() => parseOptions(['--preserve-admin-ids', 'first-admin, first-admin']))
      .toThrow(new SafetyError('DUPLICATE_ADMIN_SELECTION'));
    expect(() => parseOptions(['--preserve-admin-ids', 'first-admin', '--preserve-admin-ids', 'second-admin']))
      .toThrow(new SafetyError('DUPLICATE_ARGUMENT'));
  });

  it('rejects unknown or cross-schema dependencies even if the unknown table is empty', () => {
    for (const sourceSchema of ['public', 'auth']) {
      expect(() => assertCatalogSafe({
        tables: ['sites', 'utilisateurs', 'config_generale', 'kpay_transactions', 'mlm_payouts', 'withdrawal_requests'],
        foreignKeys: [{ sourceSchema, source: 'unreviewed', targetSchema: 'public', target: 'sites' }],
        unsafeObjects: [], triggers: [],
      })).toThrow('UNKNOWN_DEPENDENCY');
    }
  });

  it('rejects unrelated trigger side effects but accepts the named immutable application trigger', () => {
    const catalog = {
      tables: ['sites', 'utilisateurs', 'config_generale', 'kpay_transactions', 'mlm_payouts', 'withdrawal_requests'],
      foreignKeys: [], unsafeObjects: [], triggers: [
        { table: 'placement_history', name: 'placement_history_immutable', enabled: 'O', functionName: 'reject_placement_history_changes', functionSchema: 'public', type: 27 },
      ],
    };
    expect(() => assertCatalogSafe(catalog)).not.toThrow();
    expect(() => assertCatalogSafe({ ...catalog, triggers: [{ ...catalog.triggers[0], name: 'send_payment' }] })).toThrow('UNKNOWN_TRIGGER');
    expect(() => assertCatalogSafe({ ...catalog, triggers: [{ ...catalog.triggers[0], enabled: 'D' }] })).toThrow('DISABLED_TRIGGER');
  });

  it('accepts only a separate, explicitly named loopback restore database', () => {
    expect(() => assertRestoreTarget('postgresql://local@127.0.0.1:55432/ebn_restore_test', 'postgresql://local@127.0.0.1:55432/source')).not.toThrow();
    for (const [url, code] of [
      ['postgresql://local@example.com:55433/ebn_restore_test?sslmode=require', 'RESTORE_REQUIRES_LITERAL_LOOPBACK'],
      ['postgresql://local@localhost:55433/ebn_restore_test?sslmode=disable', 'RESTORE_REQUIRES_LITERAL_LOOPBACK'],
      ['postgresql://local@127.0.0.1:55433/source?sslmode=disable', 'RESTORE_REQUIRES_DEDICATED_DATABASE'],
      ['postgresql://local@localhost:55433/ebn_restore_test?host=remote.example.com&sslmode=disable', 'UNSAFE_CONNECTION_OPTION'],
      ['postgresql://local@127.0.0.1:55433/ebn_restore_test?options=-csearch_path=auth&sslmode=disable', 'UNSAFE_CONNECTION_OPTION'],
    ]) expect(() => assertRestoreTarget(url, 'postgresql://local@127.0.0.1:55432/source')).toThrow(new SafetyError(code));
    expect(() => assertRestoreTarget('postgresql://local@127.0.0.1:55433/ebn_restore_test?sslmode=disable',
      'postgresql://local@127.0.0.1:55432/ebn_restore_test')).toThrow(new SafetyError('RESTORE_MUST_DIFFER_FROM_SOURCE'));
  });

  (process.platform === 'win32' ? it : it.skip)('rejects foreign descriptor ownership despite trusted Allow entries, without changing filesystem ownership', () => {
    const runPolicy = (owner: string, extraAllow = false) => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $allowed=@($sid,'S-1-5-18'); $acl=New-Object System.Security.AccessControl.DirectorySecurity; $owner=if($env:MAINTENANCE_POLICY_OWNER -eq 'CURRENT') {$sid} else {$env:MAINTENANCE_POLICY_OWNER}; $acl.SetOwner([System.Security.Principal.SecurityIdentifier]$owner); $rule=New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.SecurityIdentifier]$sid,'FullControl','Allow'); $acl.AddAccessRule($rule); if($env:MAINTENANCE_POLICY_EXTRA_ALLOW -eq '1') {$extra=New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.SecurityIdentifier]'S-1-1-0','Read','Allow'); $acl.AddAccessRule($extra)}; ${WINDOWS_PRIVATE_ACL_POLICY}`],
      { env: { ...process.env, MAINTENANCE_POLICY_OWNER: owner, MAINTENANCE_POLICY_EXTRA_ALLOW: extraAllow ? '1' : '0' }, windowsHide: true, timeout: 10000 }).status;
    expect(runPolicy('CURRENT')).toBe(0);
    expect(runPolicy('S-1-5-18')).toBe(0);
    expect(runPolicy('S-1-5-21-1-2-3-1002')).toBe(2);
    expect(runPolicy('CURRENT', true)).toBe(2);
  }, 30000);

  it('rejects an omitted port even when PGPORT would route the control client elsewhere', () => {
    const previous = process.env.PGPORT;
    process.env.PGPORT = '55432';
    try {
      expect(() => assertRestoreTarget('postgresql://local:fixture@127.0.0.1/ebn_restore_test',
        'postgresql://local@127.0.0.1:55432/source')).toThrow(new SafetyError('EXPLICIT_DATABASE_PORT_REQUIRED'));
    } finally {
      if (previous === undefined) delete process.env.PGPORT;
      else process.env.PGPORT = previous;
    }
  });

  it('refuses TLS modes whose control and native semantics are not explicitly supported', () => {
    expect(() => assertRestoreTarget('postgresql://local:fixture@127.0.0.1:55433/ebn_restore_test?sslmode=prefer',
      'postgresql://local@127.0.0.1:55432/source')).toThrow(new SafetyError('UNSUPPORTED_SSL_MODE'));
  });
});
