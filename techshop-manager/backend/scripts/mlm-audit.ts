import { Client } from 'pg';
import { config } from 'dotenv';

export async function auditMlm(client: Client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout = '30s'");
    const duplicates = await client.query('SELECT "filleulId", count(*)::integer AS count FROM positions WHERE "filleulId" IS NOT NULL GROUP BY "filleulId" HAVING count(*) > 1');
    const invalidSlots = await client.query('SELECT id FROM positions WHERE "numeroPosition" NOT BETWEEN 1 AND 4');
    const missingMembers = await client.query('SELECT position.id FROM positions position LEFT JOIN membres member ON member.id = position."filleulId" WHERE position."filleulId" IS NOT NULL AND member.id IS NULL');
    const higherGenerationPositions = await client.query('SELECT position.id FROM positions position JOIN matrices matrix ON matrix.id = position."matrixId" JOIN mlm_levels level ON level.id = matrix."mlmLevelId" WHERE level.ordre <> 1');
    const overloadedParents = await client.query('SELECT matrix."membreId", count(*)::integer AS count FROM positions position JOIN matrices matrix ON matrix.id = position."matrixId" WHERE position."filleulId" IS NOT NULL GROUP BY matrix."membreId" HAVING count(*) > 4');
    const cycles = await client.query(`
      WITH RECURSIVE paths(origin, id, path, cycle) AS (
        SELECT member.id, member.id, ARRAY[]::text[], false FROM membres member
        UNION ALL
        SELECT paths.origin, matrix."membreId", paths.path || paths.id, paths.id = ANY(paths.path)
        FROM paths JOIN positions position ON position."filleulId" = paths.id
        JOIN matrices matrix ON matrix.id = position."matrixId" WHERE NOT paths.cycle
      ) SELECT DISTINCT origin FROM paths WHERE cycle
    `);
    let aggregateDrift: unknown[] = [];
    let totalDescendantsDrift: unknown[] = [];
    let currentRankDrift: unknown[] = [];
    if (!duplicates.rowCount && !cycles.rowCount && !higherGenerationPositions.rowCount) {
      const counts = await client.query(`
        WITH RECURSIVE network(ancestor, descendant, depth, valid) AS (
          SELECT member.id, member.id, 0, member.statut = 'ACTIF' FROM membres member
          UNION ALL
          SELECT network.ancestor, position."filleulId", network.depth + 1,
            network.valid AND position."estValide" AND child.statut = 'ACTIF'
          FROM network JOIN matrices matrix ON matrix."membreId" = network.descendant
          JOIN mlm_levels level ON level.id = matrix."mlmLevelId" AND level.ordre = 1
          JOIN positions position ON position."matrixId" = matrix.id
          JOIN membres child ON child.id = position."filleulId"
        ), actual AS (
          SELECT ancestor, depth, count(*) FILTER (WHERE valid)::integer AS count, count(*)::integer AS occupied
          FROM network WHERE depth BETWEEN 1 AND 8 GROUP BY ancestor, depth
        ), expected AS (
          SELECT member.id AS "membreId", level.id AS "mlmLevelId", level.ordre, matrix.id,
            matrix."filleulsValides" AS stored, coalesce(actual.count, 0) AS actual,
            matrix."occupiedPositions" AS "storedOccupied", coalesce(actual.occupied, 0) AS "actualOccupied",
            matrix."estComplete" AS "storedComplete", coalesce(actual.count, 0) = power(4, level.ordre) AS "actualComplete"
          FROM membres member CROSS JOIN mlm_levels level
          LEFT JOIN matrices matrix ON matrix."membreId" = member.id AND matrix."mlmLevelId" = level.id
          LEFT JOIN actual ON actual.ancestor = member.id AND actual.depth = level.ordre
          WHERE level.ordre BETWEEN 1 AND 8
        ), totals AS (
          SELECT ancestor, count(DISTINCT descendant)::integer AS count FROM network WHERE depth > 0 GROUP BY ancestor
        ), ranks AS (
          SELECT "membreId", coalesce(min(ordre) FILTER (WHERE NOT "actualComplete"), 9) - 1 AS ordre
          FROM expected GROUP BY "membreId"
        )
        SELECT 'matrix' AS kind, jsonb_build_object(
          'id', id, 'membreId', "membreId", 'mlmLevelId', "mlmLevelId", 'stored', stored, 'actual', actual,
          'storedOccupied', "storedOccupied", 'actualOccupied', "actualOccupied",
          'storedComplete', "storedComplete", 'actualComplete', "actualComplete", 'missing', id IS NULL
        ) AS finding FROM expected
        WHERE (id IS NULL AND (ordre = 1 OR "actualOccupied" > 0))
          OR (id IS NOT NULL AND (stored <> actual OR "storedOccupied" <> "actualOccupied" OR "storedComplete" <> "actualComplete"))
        UNION ALL
        SELECT 'totalDescendants', jsonb_build_object('id', member.id, 'stored', member."totalDescendants", 'actual', coalesce(totals.count, 0))
        FROM membres member LEFT JOIN totals ON totals.ancestor = member.id
        WHERE member."totalDescendants" <> coalesce(totals.count, 0)
        UNION ALL
        SELECT 'currentRank', jsonb_build_object('id', member.id, 'stored', member."mlmLevelId", 'actual', level.id, 'currentGeneration', ranks.ordre)
        FROM membres member JOIN ranks ON ranks."membreId" = member.id
        JOIN mlm_levels level ON level.ordre = greatest(ranks.ordre, 1)
        WHERE member."mlmLevelId" <> level.id
      `);
      aggregateDrift = counts.rows.filter(row => row.kind === 'matrix').map(row => row.finding);
      totalDescendantsDrift = counts.rows.filter(row => row.kind === 'totalDescendants').map(row => row.finding);
      currentRankDrift = counts.rows.filter(row => row.kind === 'currentRank').map(row => row.finding);
    }
    return {
      duplicates: duplicates.rows, invalidSlots: invalidSlots.rows, missingMembers: missingMembers.rows,
      higherGenerationPositions: higherGenerationPositions.rows, overloadedParents: overloadedParents.rows,
      cycles: cycles.rows, aggregateDrift, totalDescendantsDrift, currentRankDrift,
    };
  } finally {
    await client.query('ROLLBACK');
  }
}

if (require.main === module) {
  config({ quiet: true });
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  client.connect().then(() => auditMlm(client)).then(report => console.log(JSON.stringify(report, null, 2)))
    .catch(error => { console.error('MLM audit failed:', error.code ?? error.name); process.exitCode = 1; })
    .finally(() => client.end());
}
