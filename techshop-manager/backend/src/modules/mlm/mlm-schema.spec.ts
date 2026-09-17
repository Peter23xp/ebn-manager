import { readFileSync } from 'fs';
import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

describe('MLM generation schema', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('gives each member a single incoming matrix position', () => {
    expect(schema).toMatch(/filleulId\s+String\?\s+@unique/);
    expect(schema).toContain('matrixPosition');
    expect(schema).toContain('model PlacementHistory');
  });

  it('separates the hold deadline from actual release and links the event', () => {
    expect(schema).toContain('releaseDate');
    expect(schema).toContain('enum HoldStatus');
    expect(schema).toMatch(/commissionId\s+String\?\s+@unique/);
    expect(schema).toContain('model MlmCalendarYear');
  });

  it('migrates without deleting business data', () => {
    const migration = readFileSync(join(process.cwd(), 'prisma/migrations/20260917000000_mlm_generations/migration.sql'), 'utf8');
    expect(migration).toContain('RENAME COLUMN "releasedAt" TO "releaseDate"');
    expect(migration).not.toMatch(/TRUNCATE|DROP TABLE/);
    expect(migration).toContain('positions_slot_check');
    expect(migration).toContain('placement_history_immutable');
  });
});
