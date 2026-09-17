import { inspectTarget, parseOptions, purge, SafetyError, SourcePolicy } from '../scripts/maintenance';

export async function runLegacyPurge(args: string[] = process.argv.slice(2), environment: NodeJS.ProcessEnv = process.env) {
  const options = parseOptions(args, 'transaction-fenced');
  if (!['inspect', 'purge'].includes(options.mode)) throw new SafetyError('LEGACY_MODE_REQUIRES_INSPECT_OR_PURGE');
  if (options.bundle) throw new SafetyError('FRESH_BACKUP_REQUIRED');
  const sourceUrl = environment.MAINTENANCE_DATABASE_URL;
  if (!sourceUrl) throw new SafetyError('MAINTENANCE_DATABASE_URL_REQUIRED');
  const sourcePolicy = (options['source-policy'] || 'direct') as SourcePolicy;
  if (options.mode === 'inspect') return inspectTarget(sourceUrl, sourcePolicy);
  return purge({ sourceUrl, sourcePolicy, workflow: 'transaction-fenced', fingerprint: options.fingerprint,
    preserveAdminId: options['preserve-admin-id'], preserveAdminIds: options['preserve-admin-ids'], execute: options.execute,
    backupRoot: options['backup-root'], pgBin: options['pg-bin'], restoreUrl: environment.MAINTENANCE_RESTORE_URL });
}

if (require.main === module) {
  runLegacyPurge().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    process.stderr.write(`${error instanceof SafetyError ? error.message : 'MAINTENANCE_FAILED_NO_DETAILS_LOGGED'}\n`);
    process.exitCode = 1;
  });
}
