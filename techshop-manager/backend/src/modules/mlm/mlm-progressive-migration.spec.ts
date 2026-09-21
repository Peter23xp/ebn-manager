import { describe, expect, it } from '@jest/globals';
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const integration = process.env.MLM_TEST_DATABASE_URL ? describe : describe.skip;

integration('additive progressive migration on a disposable legacy database', () => {
  it('preserves the full historical rows and balances while adding safe defaults and uniqueness', async () => {
    if (process.env.MLM_TEST_DATABASE_URL !== 'postgresql://postgres@127.0.0.1:55432/mlm_integration') throw new Error('Only synthetic loopback PostgreSQL allowed');
    const database = `mlm_progressive_migration_${randomUUID().replace(/-/g, '')}`;
    const admin = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres' });
    const client = new Client({ connectionString: `postgresql://postgres@127.0.0.1:55432/${database}` });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    try {
      await client.connect();
      const directory = join(process.cwd(), 'prisma/migrations');
      const target = '20260921000000_mlm_progressive_commissions';
      for (const migration of readdirSync(directory).filter(name => name < target).sort()) {
        await client.query(readFileSync(join(directory, migration, 'migration.sql'), 'utf8'));
      }
      await client.query(`
        INSERT INTO sites(id,nom,ville,"updatedAt") VALUES ('site','Synthetic','Test',now());
        INSERT INTO utilisateurs(id,nom,telephone,"passwordHash",role,"updatedAt") VALUES ('admin','Synthetic','migration-admin','synthetic','SUPER_ADMIN',now());
        INSERT INTO mlm_levels(id,ordre,nom,"commissionParFilleul","commissionTotale","commissionSysteme","commissionRetour","bonusDescription",couleur,icone,"updatedAt")
          VALUES (1,1,'Builder',0,40,24,16,'','#000','test',now());
        INSERT INTO clients(id,prenom,nom,telephone,"siteInscriptionId","createdById","updatedAt")
          SELECT 'client-' || number,'Test','Synthetic','migration-' || number,'site','admin',now() FROM generate_series(0,4) number;
        INSERT INTO membres(id,"clientId",matricule,"mlmLevelId","parrainId")
          SELECT 'member-' || number,'client-' || number,'migration-' || number,1,CASE WHEN number = 0 THEN NULL ELSE 'member-0' END FROM generate_series(0,4) number;
        INSERT INTO matrices(id,"membreId","mlmLevelId","filleulsValides","occupiedPositions","estComplete","dateComplete") VALUES ('matrix','member-0',1,4,4,true,'2026-09-01');
        INSERT INTO positions(id,"matrixId","numeroPosition","filleulId","estValide","dateValidation") SELECT 'slot-' || number,'matrix',number,'member-' || number,true,'2026-09-01' FROM generate_series(1,4) number;
        INSERT INTO commissions(id,"membreId","filleulId","mlmLevelId",montant,"montantSysteme","montantRetour",statut,"referenceId",description,"matrixId","updatedAt","valideeAt","payeeAt")
          VALUES ('commission','member-0','member-4',1,40,24,16,'PAYEE','generation:member-0:1','Legacy Builder','matrix',now(),'2026-09-01','2026-09-02');
        INSERT INTO portefeuilles(id,"membreId","soldeDisponible","soldeReinvesti","totalGagne","updatedAt") VALUES ('wallet','member-0',24,16,40,now());
        INSERT INTO transactions_portefeuille(id,"portefeuilleId",type,montant,description,"referenceId") VALUES ('journal','wallet','COMMISSION',24,'Legacy credit','generation:member-0:1');
        INSERT INTO promotions(id,"membreId","niveauAvantId","niveauApresId","commissionVersee","declencheParId") VALUES ('promotion','member-0',0,1,0,'member-4');
        INSERT INTO reinvest_lots(id,"membreId",amount,"releaseDate","commissionId",status,"calendarVersion") VALUES ('hold','member-0',16,'2026-10-07','commission','HOLD_PERIOD','legacy-calendar');
      `);
      const tables = ['clients', 'membres', 'matrices', 'positions', 'commissions', 'portefeuilles', 'transactions_portefeuille', 'promotions', 'reinvest_lots'];
      const before = new Map<string, any[]>();
      for (const table of tables) before.set(table, (await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows);
      await client.query(readFileSync(join(directory, target, 'migration.sql'), 'utf8'));
      for (const table of tables) {
        const original = before.get(table);
        const after = (await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows;
        expect(after.map(row => Object.fromEntries(Object.keys(original[0]).map(key => [key, row[key]])))).toEqual(original);
      }
      expect((await client.query('SELECT "commissionAccountedPositions", "commissionBudgetTotal", "generationRewardedAt" FROM matrices')).rows[0]).toEqual({ commissionAccountedPositions: 0, commissionBudgetTotal: null, generationRewardedAt: null });
      expect((await client.query('SELECT "progressFrom", "progressTo" FROM commissions')).rows[0]).toEqual({ progressFrom: null, progressTo: null });
      await expect(client.query('UPDATE matrices SET "commissionBudgetTotal"=40')).rejects.toMatchObject({ code: '23514' });
      await client.query(`INSERT INTO commissions(id,"membreId","mlmLevelId",montant,"montantSysteme","montantRetour","referenceId",description,"matrixId","updatedAt","progressFrom","progressTo") VALUES ('catchup','member-0',1,10,6,4,'synthetic-catchup','Catchup','matrix',now(),0,1)`);
      expect((await client.query("SELECT \"filleulId\" FROM commissions WHERE id='catchup'")).rows[0].filleulId).toBeNull();
      await expect(client.query(`INSERT INTO commissions(id,"membreId","mlmLevelId",montant,"montantSysteme","montantRetour","referenceId",description,"matrixId","updatedAt","progressFrom","progressTo") VALUES ('duplicate','member-0',1,10,6,4,'synthetic-duplicate','Duplicate','matrix',now(),0,1)`)).rejects.toMatchObject({ code: '23505' });
    } finally {
      await client.end();
      await admin.query(`DROP DATABASE "${database}"`);
      await admin.end();
    }
  }, 60000);
});
