# Retrait portefeuille 60/40 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bouton « Retirer » de la carte portefeuille → flux de retrait solde-based (Mobile Money / Espèces) → demande chez l'admin → approbation débite la carte, avec règle 60 % retirable immédiat / 40 % réinvesti libéré à J+30.

**Architecture:** Deux poches dans `Portefeuille` (`soldeDisponible` retirable, `soldeReinvesti` bloqué) + table `ReinvestLote` (lots datés, libérés par un cron `@nestjs/schedule`). Les `WithdrawalRequest` deviennent basées sur un montant plafonné par la réserve `soldeReserve` ; l'approbation admin débite le montant de la demande.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, @nestjs/schedule (déjà enregistré via `ScheduleModule.forRoot()` dans `backend/src/app.module.ts`), Jest (backend), React 18 + TanStack Query + Vitest (frontend).

**Spec :** `docs/superpowers/specs/2026-09-10-wallet-withdrawal-6040-design.md`

## Global Constraints

- Migration non-interactive obligatoire : `prisma migrate diff --from-migrations … --script` puis `migrate deploy` (jamais `migrate dev` dans un shell non-TTY).
- Tests backend = mocks d'objets prisma purs (motif `const resolved = (v) => { const m = jest.fn(); m.mockResolvedValue(v); return m }` + `$transaction: jest.fn(async (cb) => cb(tx))`) — pas de TestContainer.
- Monnaie affichée : USD avec `toLocaleString('en-US', {minimumFractionDigits: 2})`.
- Textes UI en français ; code d'erreur serveur en préfixe `ERR_`.
- Ne pas toucher au flux KPay `MlmPayout` (`initPayout`/`approvePayout` admin) — hors scope.
- Les soldes existants ne sont pas rétro-bloqués : migration purement additive (défauts à 0).

---

### Task 1: Schéma Prisma — poche `soldeReinvesti` + table `ReinvestLote` + `commissionIds` optionnel

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `Portefeuille` ~ligne 701, model `WithdrawalRequest` ~ligne 897, model `Membre` ~637-664)
- Create: `backend/prisma/migrations/20260910000000_add_wallet_6040/migration.sql`

**Interfaces:**
- Produces: `portefeuille.soldeReinvesti Decimal @default(0)`; modèle `ReinvestLote` (table `reinvest_lots`, champs `id, membreId, amount, releasedAt, released, commissionId?, createdAt`, relation `membre.reinvestLots[]`); `WithdrawalRequest.commissionIds Json?`.

- [ ] **Step 1: Éditer `schema.prisma`**

Dans `model Portefeuille`, après `soldeReserve` :

```prisma
  soldeReinvesti  Decimal  @default(0) @db.Decimal(12, 2)
```

Dans `model Membre`, à côté des relations existantes (avant `@@map("membres")`) :

```prisma
  reinvestLots   ReinvestLote[]
```

Après le bloc `model WithdrawalRequest`, ajouter :

```prisma
// ── Lot de réinvestissement 40 % — libéré 30 jours après crédit ──
model ReinvestLote {
  id           String   @id @default(uuid())
  membreId     String
  amount       Decimal  @db.Decimal(12, 2)
  releasedAt   DateTime
  released     Boolean  @default(false)
  commissionId String?
  createdAt    DateTime @default(now())

  membre Membre @relation(fields: [membreId], references: [id])

  @@index([released, releasedAt])
  @@index([membreId])
  @@map("reinvest_lots")
}
```

Dans `model WithdrawalRequest`, rendre `commissionIds` optionnel :

```prisma
  commissionIds Json?
```

- [ ] **Step 2: Générer le SQL de migration (procédure non-interactive)**

```bash
cd backend
git show HEAD:prisma/schema.prisma > /tmp/schema_old.prisma
# restaurer temporairement l'ancien fichier n'est PAS nécessaire — diff depuis la base de migrations :
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$DATABASE_URL" \
  --script > /tmp/mig.sql
```

Si `--shadow-database-url` échoue (env non chargé en bash, vu dans ce repo) : charger d'abord avec `set -a; . ./.env; set +a` puis relancer. En dernier recours, écrire le SQL à la main :

```sql
-- AlterTable
ALTER TABLE "portefeuilles" ADD COLUMN "soldeReinvesti" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "withdrawal_requests" ALTER COLUMN "commissionIds" DROP NOT NULL;

-- CreateTable
CREATE TABLE "reinvest_lots" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "commissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reinvest_lots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reinvest_lots_released_releasedAt_idx" ON "reinvest_lots"("released", "releasedAt");
CREATE INDEX "reinvest_lots_membreId_idx" ON "reinvest_lots"("membreId");
ALTER TABLE "reinvest_lots" ADD CONSTRAINT "reinvest_lots_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 3: Créer le dossier de migration et déployer**

```bash
mkdir -p prisma/migrations/20260910000000_add_wallet_6040
cp /tmp/mig.sql prisma/migrations/20260910000000_add_wallet_6040/migration.sql
set -a; . ./.env; set +a
npx prisma migrate deploy
npx prisma generate
```

Expected: `No pending migrations` après deploy, `Generated Prisma Client` après generate.

- [ ] **Step 4: Vérifier le build backend**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260910000000_add_wallet_6040/migration.sql
git commit -m "feat(prisma): poche soldeReinvesti + table reinvest_lots + commissionIds optionnel"
```

---

### Task 2: Crédit du 40 % → `soldeReinvesti` + lot daté

**Files:**
- Modify: `backend/src/modules/mlm/mlm-wallet.service.ts` (ajouter `creditReinvestInTx` après `creditWalletInTx` ~ligne 354)
- Modify: `backend/src/modules/mlm/mlm-matrix.service.ts:267-295` (bloc « Crédit automatique du montantRetour »)
- Test: `backend/src/modules/mlm/mlm-wallet.service.spec.ts`

**Interfaces:**
- Consumes: `tx.reinvestLote.create` (Task 1).
- Produces: `MlmWalletService.creditReinvestInTx(tx: Prisma.TransactionClient, memberId: string, montant: number, commissionId: string | null, levelNom: string, now?: Date): Promise<void>` — incrémente `soldeReinvesti` + `totalGagne`, crée le `ReinvestLote` (`releasedAt = now + 30j`), journalise `REINVESTISSEMENT`.

- [ ] **Step 1: Écrire le test échouant**

Dans `mlm-wallet.service.spec.ts`, ajouter (motif des suites existantes) :

```ts
describe('MlmWalletService.creditReinvestInTx — 40 % bloqué J+30', () => {
  const resolved = (value: any) => {
    const mock = jest.fn();
    (mock as any).mockResolvedValue(value);
    return mock;
  };

  it('crédite soldeReinvesti+totalGagne, crée le lot à +30j et journalise REINVESTISSEMENT', async () => {
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'pf-1' }), update: jest.fn() },
      reinvestLote: { create: jest.fn() },
      transactionPortefeuille: { create: jest.fn() },
    };
    const service = new MlmWalletService({} as never, {} as never, {} as never);
    const now = new Date('2026-09-10T12:00:00Z');

    await service.creditReinvestInTx(tx as never, 'm-1', 40, 'c-1', 'Argent', now);

    expect(tx.portefeuille.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pf-1' },
        data: { soldeReinvesti: { increment: 40 }, totalGagne: { increment: 40 } },
      }),
    );
    expect(tx.reinvestLote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          membreId: 'm-1', amount: expect.anything(),
          releasedAt: new Date('2026-10-10T12:00:00Z'),
          commissionId: 'c-1', released: false,
        }),
      }),
    );
    expect(tx.transactionPortefeuille.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'REINVESTISSEMENT', portefeuilleId: 'pf-1' }),
      }),
    );
  });

  it('lève une erreur si le portefeuille du membre est introuvable', async () => {
    const tx = { portefeuille: { findUnique: resolved(null) } };
    const service = new MlmWalletService({} as never, {} as never, {} as never);
    await expect(service.creditReinvestInTx(tx as never, 'm-x', 40, null, 'Bronze')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `cd backend && npx jest mlm-wallet -t "creditReinvestInTx"`
Expected: FAIL — `creditReinvestInTx is not a function`.

- [ ] **Step 3: Implémenter**

Dans `mlm-wallet.service.ts`, après `creditWalletInTx` :

```ts
  /** Crédit 40 % réinvestissement — bloqué jusqu'à releasedAt (J+30). */
  async creditReinvestInTx(
    tx: Prisma.TransactionClient,
    memberId: string,
    montant: number,
    commissionId: string | null,
    levelNom: string,
    now: Date = new Date(),
  ) {
    const pf = await tx.portefeuille.findUnique({ where: { membreId: memberId }, select: { id: true } });
    if (!pf) throw new NotFoundException(`Portefeuille introuvable pour membre ${memberId}`);
    const montantDecimal = new Prisma.Decimal(montant);
    await tx.portefeuille.update({
      where: { id: pf.id },
      data: { soldeReinvesti: { increment: montantDecimal }, totalGagne: { increment: montantDecimal } },
    });
    await tx.reinvestLote.create({
      data: {
        membreId: memberId,
        amount: montantDecimal,
        releasedAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        released: false,
        commissionId,
      },
    });
    await tx.transactionPortefeuille.create({
      data: {
        portefeuilleId: pf.id,
        type: 'REINVESTISSEMENT',
        montant: montantDecimal,
        description: `Réinvestissement auto niveau ${levelNom} — ${montant} USD bloqués 30 jours`,
        referenceId: commissionId,
      },
    });
  }
```

- [ ] **Step 4: Brancher la matrice**

Dans `mlm-matrix.service.ts`, remplacer le bloc `if (montantRetour > 0) { … }` (lignes ~268-295 : findUnique/create portefeuille + update soldeDisponible + transactionPortefeuille) par :

```ts
        // Crédit 40 % → poche réinvestissement bloquée J+30 (voir creditReinvestInTx)
        if (montantRetour > 0) {
          let portefeuille = await tx.portefeuille.findUnique({ where: { membreId }, select: { id: true } });
          if (!portefeuille) {
            await tx.portefeuille.create({ data: { membreId, soldeDisponible: 0, totalGagne: 0 } });
          }
          await this.walletService.creditReinvestInTx(tx, membreId, montantRetour, commission.id, completedLevel.nom);
        }
```

- [ ] **Step 5: Lancer les tests**

Run: `cd backend && npx jest mlm-wallet mlm-parrain-link && npx tsc --noEmit -p tsconfig.json`
Expected: PASS + exit 0 (les specs `mlm-parrain-link` ne passent pas par ce bloc ; elles valident la non-régression du constructeur).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/mlm/mlm-wallet.service.ts backend/src/modules/mlm/mlm-wallet.service.spec.ts backend/src/modules/mlm/mlm-matrix.service.ts
git commit -m "feat(mlm): 40% retour → poche soldeReinvesti avec lot J+30"
```

---

### Task 3: Libération J+30 — `ReinvestReleaseService` (cron)

**Files:**
- Create: `backend/src/modules/mlm/reinvest-release.service.ts`
- Modify: `backend/src/modules/mlm/mlm.module.ts`
- Test: `backend/src/modules/mlm/reinvest-release.service.spec.ts`

**Interfaces:**
- Consumes: `prisma.reinvestLote`, `prisma.portefeuille` (Task 1).
- Produces: `ReinvestReleaseService.releaseDueLots(now?: Date): Promise<number>` (nombre de lots libérés), appelé par `@Cron(EVERY_HOUR)`.

- [ ] **Step 1: Écrire le test échouant**

`reinvest-release.service.spec.ts` :

```ts
import { describe, expect, it, jest } from '@jest/globals';
import { ReinvestReleaseService } from './reinvest-release.service';

const resolved = (value: any) => {
  const mock = jest.fn();
  (mock as any).mockResolvedValue(value);
  return mock;
};

describe('ReinvestReleaseService.releaseDueLots', () => {
  it('transfère chaque lot échu de soldeReinvesti vers soldeDisponible', async () => {
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'pf-1' }), update: jest.fn() },
      reinvestLote: { update: jest.fn() },
    };
    const prisma = {
      reinvestLote: {
        findMany: resolved([{ id: 'l-1', membreId: 'm-1', amount: 40 }]),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = new ReinvestReleaseService(prisma as never);

    const count = await service.releaseDueLots(new Date('2026-10-11T00:00:00Z'));

    expect(count).toBe(1);
    expect(prisma.reinvestLote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { released: false, releasedAt: { lte: new Date('2026-10-11T00:00:00Z') } },
      }),
    );
    expect(tx.portefeuille.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pf-1' },
        data: { soldeDisponible: { increment: 40 }, soldeReinvesti: { decrement: 40 } },
      }),
    );
    expect(tx.reinvestLote.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'l-1' }, data: { released: true } }),
    );
  });

  it('ignore un lot sans portefeuille et ne casse pas les autres', async () => {
    const tx = {
      portefeuille: { findUnique: resolved(null), update: jest.fn() },
      reinvestLote: { update: jest.fn() },
    };
    const prisma = {
      reinvestLote: { findMany: resolved([{ id: 'l-1', membreId: 'm-x', amount: 10 }]) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = new ReinvestReleaseService(prisma as never);

    const count = await service.releaseDueLots();

    expect(count).toBe(0);
    expect(tx.reinvestLote.update).not.toHaveBeenCalled();
  });

  it('ne libère rien quand aucun lot n\'est échu', async () => {
    const prisma = { reinvestLote: { findMany: resolved([]) }, $transaction: jest.fn() };
    const service = new ReinvestReleaseService(prisma as never);
    expect(await service.releaseDueLots()).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `cd backend && npx jest reinvest-release`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

`reinvest-release.service.ts` :

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Libère les lots de réinvestissement (40 %) arrivés à échéance J+30 :
 * bascule amount de soldeReinvesti → soldeDisponible.
 * Idempotent via le filtre `released: false` + update conditionné.
 */
@Injectable()
export class ReinvestReleaseService {
  private readonly logger = new Logger(ReinvestReleaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    const count = await this.releaseDueLots();
    if (count > 0) this.logger.log(`${count} lot(s) de réinvestissement libéré(s)`);
  }

  async releaseDueLots(now: Date = new Date()): Promise<number> {
    const lots = await this.prisma.reinvestLote.findMany({
      where: { released: false, releasedAt: { lte: now } },
      select: { id: true, membreId: true, amount: true },
    });
    let released = 0;
    for (const lot of lots) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const pf = await tx.portefeuille.findUnique({
            where: { membreId: lot.membreId },
            select: { id: true },
          });
          if (!pf) throw new Error(`Portefeuille introuvable pour ${lot.membreId}`);
          const amount = new Prisma.Decimal(lot.amount);
          await tx.portefeuille.update({
            where: { id: pf.id },
            data: { soldeDisponible: { increment: amount }, soldeReinvesti: { decrement: amount } },
          });
          await tx.reinvestLote.update({ where: { id: lot.id }, data: { released: true } });
        });
        released++;
      } catch (err) {
        this.logger.error(`Libération lot ${lot.id} échouée: ${err instanceof Error ? err.message : err}`);
      }
    }
    return released;
  }
}
```

`mlm.module.ts` — providers + exports :

```ts
import { ReinvestReleaseService } from './reinvest-release.service';
// providers: [MlmService, MlmMatrixService, MlmWalletService, MlmClaimService, ReinvestReleaseService],
// exports:   [MlmService, MlmMatrixService, MlmWalletService, MlmClaimService, ReinvestReleaseService],
```

- [ ] **Step 4: Lancer les tests**

Run: `cd backend && npx jest reinvest-release && npx tsc --noEmit -p tsconfig.json`
Expected: 3 PASS + exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/mlm/reinvest-release.service.ts backend/src/modules/mlm/reinvest-release.service.spec.ts backend/src/modules/mlm/mlm.module.ts
git commit -m "feat(mlm): libération cron des lots réinvestis à J+30"
```

---

### Task 4: Demande de retrait solde-based (portal) — validation + réserve + restitution à l'annulation

**Files:**
- Modify: `backend/src/modules/portal/dto/withdrawal.dto.ts` (supprimer `commissionIds`)
- Modify: `backend/src/modules/portal/portal.service.ts` (`createWithdrawalRequest` ~386-462, `cancelWithdrawalRequest` ~519-545)
- Test: `backend/src/modules/portal/portal.service.spec.ts`

**Interfaces:**
- Consumes: `prisma.portefeuille.update` via `$transaction` ; `membre.portefeuille` chargé par `ensureMember` (existant).
- Produces: `createWithdrawalRequest(clientId, dto: { montant: number; type: 'MOBILE_MONEY' | 'CASH'; provider?: string; phoneNumber?: string; notes?: string })` — erreur `ERR_INSUFFICIENT_WITHDRAWABLE` si `montant > soldeDisponible - soldeReserve` ; incrémente `soldeReserve`. `cancelWithdrawalRequest` décrémente `soldeReserve`.

- [ ] **Step 1: Réécrire les tests (échouants)**

Dans `portal.service.spec.ts`, remplacer la suite `createWithdrawalRequest — normalisation téléphone` (lignes ~155-199) par — mock `$transaction` à ajouter au `prisma` du `beforeEach` (`$transaction: jest.fn(async (cb: any) => cb(prisma))`, plus `portefeuille: { findUnique: jest.fn(), update: jest.fn() }`) :

```ts
describe('createWithdrawalRequest — plafond 60 % (poche dispo)', () => {
  const membreAvecPortefeuille = {
    id: 'membre-1', clientId: 'client-1',
    portefeuille: { id: 'w-1', soldeDisponible: 120, soldeReserve: 20 }, // retirable = 100
  };

  function mockHappy() {
    prisma.membre.findUnique.mockResolvedValue(membreAvecPortefeuille);
    prisma.portefeuille.update.mockResolvedValue({ id: 'w-1' });
    prisma.withdrawalRequest.create.mockResolvedValue({
      id: 'wr-1', montant: 25, type: 'MOBILE_MONEY', provider: 'AIRTEL_COD',
      phoneNumber: '+243812345678', statut: 'EN_ATTENTE', commissionIds: [], notes: null, createdAt: new Date(),
    });
  }

  it('normalise 243XXXXXXXXX en +243XXXXXXXXX et réserve le montant', async () => {
    mockHappy();
    await service.createWithdrawalRequest('client-1', {
      montant: 25, type: 'MOBILE_MONEY' as never, provider: 'AIRTEL_COD', phoneNumber: '243812345678',
    });
    expect(prisma.withdrawalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phoneNumber: '+243812345678',
          commissionIds: [],
        }),
      }),
    );
    expect(prisma.portefeuille.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w-1' },
        data: { soldeReserve: { increment: expect.anything() } },
      }),
    );
  });

  it('refuse un montant supérieur au solde retirable', async () => {
    prisma.membre.findUnique.mockResolvedValue(membreAvecPortefeuille);
    await expect(
      service.createWithdrawalRequest('client-1', { montant: 100.01, type: 'CASH' as never }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ERR_INSUFFICIENT_WITHDRAWABLE' }) });
    expect(prisma.withdrawalRequest.create).not.toHaveBeenCalled();
  });

  it('refuse sans portefeuille (retirable = 0)', async () => {
    prisma.membre.findUnique
      .mockResolvedValueOnce({ id: 'membre-1', clientId: 'client-1', portefeuille: null })
      .mockResolvedValue(null); // ensureMember rechargement — pas de membre
    prisma.client.findUnique.mockResolvedValue({ id: 'client-1', statut: 'EN_COURS', parrainClientId: null });
    await expect(
      service.createWithdrawalRequest('client-1', { montant: 1, type: 'CASH' as never }),
    ).rejects.toThrow();
  });

  it('rejette un téléphone invalide (inchangé)', async () => {
    prisma.membre.findUnique.mockResolvedValue(membreAvecPortefeuille);
    await expect(
      service.createWithdrawalRequest('client-1', {
        montant: 25, type: 'MOBILE_MONEY' as never, provider: 'AIRTEL_COD', phoneNumber: '12345',
      }),
    ).rejects.toThrow();
  });
});

describe('cancelWithdrawalRequest', () => {
  it('annule et restitue la réserve', async () => {
    prisma.membre.findUnique.mockResolvedValue({
      id: 'membre-1', clientId: 'client-1', portefeuille: { id: 'w-1' },
    });
    prisma.withdrawalRequest.findUnique.mockResolvedValue({
      id: 'wr-1', membreId: 'membre-1', montant: 25, statut: 'EN_ATTENTE',
    });
    prisma.portefeuille.update.mockResolvedValue({ id: 'w-1' });
    prisma.withdrawalRequest.update.mockResolvedValue({ id: 'wr-1', statut: 'ANNULE' });

    const res = await service.cancelWithdrawalRequest('client-1', 'wr-1');

    expect(res.statut).toBe('ANNULE');
    expect(prisma.portefeuille.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w-1' },
        data: { soldeReserve: { decrement: expect.anything() } },
      }),
    );
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `cd backend && npx jest portal.service` → FAIL (signature/validation absentes).

- [ ] **Step 3: DTO**

`withdrawal.dto.ts` — supprimer le bloc `@IsArray() … commissionIds: string[];` (lignes 35-37) et l'import `IsArray` devenu inutile.

- [ ] **Step 4: Service**

`createWithdrawalRequest` dans `portal.service.ts` — remplacer le corps après `ensureMember` (lignes ~392-462, tout le bloc commissions + montantTotal + create) par :

```ts
    const pf = membre.portefeuille;
    const retirable = pf ? Number(pf.soldeDisponible) - Number(pf.soldeReserve) : 0;
    if (dto.montant > retirable) {
      throw new BadRequestException({
        code: 'ERR_INSUFFICIENT_WITHDRAWABLE',
        message: `Retrait maximum : ${retirable.toFixed(2)} USD`,
      });
    }

    // Vérifier les champs requis selon le type et normaliser le téléphone
    let phoneNumber: string | undefined;
    if (dto.type === 'MOBILE_MONEY') {
      if (!dto.provider || !dto.phoneNumber) {
        throw new BadRequestException({
          code: 'ERR_MISSING_PAYMENT_INFO',
          message: 'Le provider et le numéro de téléphone sont requis pour Mobile Money',
        });
      }
      phoneNumber = this.normalizeDrcPhone(dto.phoneNumber);
    }

    // Réserver le montant (empêche deux demandes cumulées sur le même argent)
    const request = await this.prisma.$transaction(async (tx) => {
      if (pf) {
        await tx.portefeuille.update({
          where: { id: pf.id },
          data: { soldeReserve: { increment: new Prisma.Decimal(dto.montant) } },
        });
      }
      return tx.withdrawalRequest.create({
        data: {
          membreId: membre.id,
          montant: new Prisma.Decimal(dto.montant),
          type: dto.type,
          provider: dto.provider,
          phoneNumber,
          commissionIds: [],
          notes: dto.notes,
          statut: 'EN_ATTENTE',
        },
        include: {
          membre: { include: { client: { select: { id: true, prenom: true, nom: true, telephone: true } } } },
        },
      });
    });

    return {
      id: request.id,
      montant: Number(request.montant),
      type: request.type,
      provider: request.provider,
      phoneNumber: request.phoneNumber,
      statut: request.statut,
      commissionIds: request.commissionIds,
      notes: request.notes,
      createdAt: request.createdAt,
    };
```

`cancelWithdrawalRequest` (~540) — envelopper le `update` final dans une transaction qui restitue la réserve :

```ts
    return this.prisma.$transaction(async (tx) => {
      const pf = await tx.portefeuille.findUnique({ where: { membreId: membre.id }, select: { id: true } });
      if (pf) {
        await tx.portefeuille.update({
          where: { id: pf.id },
          data: { soldeReserve: { decrement: new Prisma.Decimal(request.montant) } },
        });
      }
      return tx.withdrawalRequest.update({
        where: { id: requestId },
        data: { statut: 'ANNULE' },
        select: { id: true, statut: true },
      });
    });
```

- [ ] **Step 5: Lancer les tests**

Run: `cd backend && npx jest portal.service && npx tsc --noEmit -p tsconfig.json`
Expected: PASS + exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/portal
git commit -m "feat(portal): demande de retrait plafonnée au solde retirable + réserve"
```

---

### Task 5: Approbation admin — débit du montant de la demande, restitution au rejet

**Files:**
- Modify: `backend/src/modules/mlm/mlm-wallet.service.ts` (`approveWithdrawalRequest` ~421-524, `rejectWithdrawalRequest` ~526-549, `listWithdrawalRequests` ligne ~398)
- Test: `backend/src/modules/mlm/mlm-wallet.service.spec.ts` (suite `withdrawal requests`)

**Interfaces:**
- Consumes: `request.montant`, `request.statut` (Task 4 garantit la réserve).
- Produces: `approveWithdrawalRequest(id, approvedById, notes?)` débite `request.montant` de `soldeDisponible` ET `soldeReserve` ; `rejectWithdrawalRequest(id, reason)` décrémente `soldeReserve`. CASH → `PAYE` auto (conservé).

- [ ] **Step 1: Réécrire la suite de tests**

Dans `mlm-wallet.service.spec.ts`, remplacer `describe('MlmWalletService — withdrawal requests (commissions)')` par :

```ts
describe('MlmWalletService — withdrawal requests (solde)', () => {
  const resolved = (value: any) => {
    const mock = jest.fn();
    (mock as any).mockResolvedValue(value);
    return mock;
  };
  const buildService = (prisma: any) =>
    new MlmWalletService(prisma as never, {} as never, {} as never);

  const demande = (over: any = {}) => ({
    id: 'wr-1', membreId: 'm-1', type: 'CASH', statut: 'EN_ATTENTE',
    montant: 150, commissionIds: [], notes: null, ...over,
  });

  it('approuve CASH: débit montant + réserve, journalise DEBIT, statut PAYE', async () => {
    const tx = {
      portefeuille: {
        findUnique: resolved({ id: 'pf-1', soldeDisponible: 200, soldeReserve: 150 }),
        update: jest.fn(),
      },
      transactionPortefeuille: { create: jest.fn() },
      withdrawalRequest: {
        update: jest
          .fn()
          .mockResolvedValueOnce({ statut: 'APPROUVE', montant: 150 }) // APPROUVE
          .mockResolvedValueOnce({ statut: 'PAYE' }),                   // CASH → PAYE
      },
    };
    const prisma = {
      withdrawalRequest: { findUnique: resolved(demande()) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = buildService(prisma);

    const result = await service.approveWithdrawalRequest('wr-1', 'user-1', 'note');

    expect(tx.portefeuille.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pf-1' },
        data: expect.objectContaining({
          soldeDisponible: { decrement: expect.anything() },
          soldeReserve: { decrement: expect.anything() },
        }),
      }),
    );
    expect(tx.transactionPortefeuille.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DEBIT', portefeuilleId: 'pf-1', referenceId: 'wr-1' }),
      }),
    );
    expect(result.statut).toBe('PAYE');
  });

  it('approuve MOBILE_MONEY: statut APPROUVE (payé manuellement ensuite)', async () => {
    const tx = {
      portefeuille: {
        findUnique: resolved({ id: 'pf-1', soldeDisponible: 200, soldeReserve: 150 }),
        update: jest.fn(),
      },
      transactionPortefeuille: { create: jest.fn() },
      withdrawalRequest: { update: resolved({ statut: 'APPROUVE', montant: 150 }) },
    };
    const prisma = {
      withdrawalRequest: { findUnique: resolved(demande({ type: 'MOBILE_MONEY' })) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = buildService(prisma);

    const result = await service.approveWithdrawalRequest('wr-1', 'user-1');
    expect(result.statut).toBe('APPROUVE');
  });

  it('refuse si soldeDisponible < montant au moment de l\'approbation', async () => {
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'pf-1', soldeDisponible: 100, soldeReserve: 150 }), update: jest.fn() },
      transactionPortefeuille: { create: jest.fn() },
      withdrawalRequest: { update: jest.fn() },
    };
    const prisma = {
      withdrawalRequest: { findUnique: resolved(demande()) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = buildService(prisma);
    await expect(service.approveWithdrawalRequest('wr-1', 'user-1')).rejects.toThrow();
    expect(tx.portefeuille.update).not.toHaveBeenCalled();
  });

  it('refuse une demande déjà traitée', async () => {
    const prisma = { withdrawalRequest: { findUnique: resolved(demande({ statut: 'APPROUVE' })) } };
    const service = buildService(prisma);
    await expect(service.approveWithdrawalRequest('wr-1', 'user-1')).rejects.toThrow();
  });

  it('rejet: REJETE + restitution de la réserve', async () => {
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'pf-1' }), update: jest.fn() },
      withdrawalRequest: { update: resolved({ id: 'wr-1', statut: 'REJETE', rejectReason: 'Coordonnées invalides' }) },
    };
    const prisma = {
      withdrawalRequest: { findUnique: resolved(demande()) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = buildService(prisma);

    const result = await service.rejectWithdrawalRequest('wr-1', 'Coordonnées invalides');

    expect(result.statut).toBe('REJETE');
    expect(tx.portefeuille.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pf-1' },
        data: { soldeReserve: { decrement: expect.anything() } },
      }),
    );
  });

  it('refuses mark-paid on a request that is not APPROUVE', async () => {
    const prisma = {
      withdrawalRequest: { findUnique: resolved({ id: 'wr-1', statut: 'EN_ATTENTE' }) },
    };
    const service = buildService(prisma);
    await expect(service.markWithdrawalAsPaid('wr-1')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `cd backend && npx jest mlm-wallet` → FAIL (logique commissions encore en place).

- [ ] **Step 3: Réécrire `approveWithdrawalRequest`**

Remplacer le contenu de la transaction existante (le bloc « Vérifier que les commissions sont toujours valides » lignes ~437-451 et tout `this.prisma.$transaction` ~453-524) par :

```ts
    return this.prisma.$transaction(async (tx) => {
      const montant = new Prisma.Decimal(Number(request.montant));

      const portefeuille = await tx.portefeuille.findUnique({
        where: { membreId: request.membreId },
        select: { id: true, soldeDisponible: true },
      });
      if (!portefeuille) {
        throw new NotFoundException(`Portefeuille introuvable pour le membre ${request.membreId}`);
      }
      if (Number(portefeuille.soldeDisponible) < Number(request.montant)) {
        throw new BadRequestException('Solde disponible insuffisant pour valider ce retrait');
      }

      await tx.portefeuille.update({
        where: { id: portefeuille.id },
        data: { soldeDisponible: { decrement: montant }, soldeReserve: { decrement: montant } },
      });

      await tx.transactionPortefeuille.create({
        data: {
          portefeuilleId: portefeuille.id,
          type: 'DEBIT',
          montant,
          description: 'Retrait approuvé',
          referenceId: withdrawalRequestId,
        },
      });

      const approved = await tx.withdrawalRequest.update({
        where: { id: withdrawalRequestId },
        data: { statut: 'APPROUVE', approvedAt: new Date(), approvedById, notes: notes || request.notes },
        include: { membre: { include: { client: { select: { id: true, prenom: true, nom: true, telephone: true } } } } },
      });

      // CASH : argent remis en boutique → payé immédiatement
      if (request.type === 'CASH') {
        return tx.withdrawalRequest.update({
          where: { id: withdrawalRequestId },
          data: { statut: 'PAYE', paidAt: new Date() },
        });
      }
      return approved;
    });
```

- [ ] **Step 4: `rejectWithdrawalRequest` — restituer la réserve**

Remplacer par :

```ts
    return this.prisma.$transaction(async (tx) => {
      const pf = await tx.portefeuille.findUnique({ where: { membreId: request.membreId }, select: { id: true } });
      if (pf) {
        await tx.portefeuille.update({
          where: { id: pf.id },
          data: { soldeReserve: { decrement: new Prisma.Decimal(request.montant) } },
        });
      }
      return tx.withdrawalRequest.update({
        where: { id: withdrawalRequestId },
        data: { statut: 'REJETE', rejectReason, updatedAt: new Date() },
      });
    });
```

- [ ] **Step 5: `listWithdrawalRequests` — tolérer `commissionIds` null**

Ligne ~398 : `commissionIds: r.commissionIds as string[],` → `commissionIds: (r.commissionIds as string[]) ?? [],`

- [ ] **Step 6: Lancer les tests**

Run: `cd backend && npx jest mlm-wallet && npx tsc --noEmit -p tsconfig.json`
Expected: PASS + exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/mlm
git commit -m "feat(mlm): approbation retrait débite le montant de la demande; rejet restitue la réserve"
```

---

### Task 6: `getWallet` portail & admin — `soldeReinvesti` + lots

**Files:**
- Modify: `backend/src/modules/portal/portal.service.ts` (`getWallet` ~109-137)
- Modify: `backend/src/modules/mlm/mlm-wallet.service.ts` (`getWallet` ~26-50)
- Test: `backend/src/modules/portal/portal.service.spec.ts` (suite `getWallet & auto-heal`)

**Interfaces:**
- Produces: réponse `GET /portal/wallet` = `{ wallet: { soldeDisponible, soldeReserve, soldeDisponibleRetrait, soldeReinvesti, totalGagne }, reinvestLots: [{ id, amount, releasedAt }], stats: { gainsTotaux } }`.

- [ ] **Step 1: Étendre le test existant**

Dans la spec `getWallet & auto-heal`, ajouter au mock membre rechargé `portefeuille: { …, soldeReinvesti: 80 }`, et au `prisma` du `beforeEach` : `reinvestLote: { findMany: jest.fn().mockResolvedValue([]) }`. Compléter les assertions :

```ts
      expect(res.wallet?.soldeReinvesti).toBe(80);
      expect(res.reinvestLots).toEqual([]);
```

Ajouter un test de lots non libérés :

```ts
  it('retourne les lots de réinvestissement en attente', async () => {
    prisma.membre.findUnique.mockResolvedValue({
      id: 'm-1', clientId: 'c-1',
      portefeuille: { soldeDisponible: 50, soldeReserve: 0, soldeReinvesti: 40, totalGagne: 90 },
    });
    prisma.reinvestLote.findMany.mockResolvedValueOnce([
      { id: 'l-1', amount: 40, releasedAt: new Date('2026-10-12') },
    ]);
    const res = await service.getWallet('c-1');
    expect(res.reinvestLots).toEqual([{ id: 'l-1', amount: 40, releasedAt: '2026-10-12T00:00:00.000Z' }]);
    expect(prisma.reinvestLote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { membreId: 'm-1', released: false } }),
    );
  });
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `cd backend && npx jest portal.service` → FAIL (`soldeReinvesti` absent).

- [ ] **Step 3: Implémenter**

`portal.service.ts getWallet` — branch vide (`!membre || !membre.portefeuille`) : ajouter `soldeReinvesti: 0` et `reinvestLots: []`. Branche normale :

```ts
    const pf = membre.portefeuille;
    const lots = await this.prisma.reinvestLote.findMany({
      where: { membreId: membre.id, released: false },
      orderBy: { releasedAt: 'asc' },
      select: { id: true, amount: true, releasedAt: true },
    });
    return {
      wallet: {
        soldeDisponible: Number(pf.soldeDisponible),
        soldeReserve: Number(pf.soldeReserve),
        soldeDisponibleRetrait: Number(pf.soldeDisponible) - Number(pf.soldeReserve),
        soldeReinvesti: Number(pf.soldeReinvesti),
        totalGagne: Number(pf.totalGagne),
      },
      reinvestLots: lots.map((l) => ({ id: l.id, amount: Number(l.amount), releasedAt: l.releasedAt.toISOString() })),
      stats: { gainsTotaux: Number(pf.totalGagne) },
    };
```

`mlm-wallet.service.ts getWallet` — ajouter `soldeReinvesti: Number(wallet.soldeReinvesti),` au return.

- [ ] **Step 4: Lancer les tests**

Run: `cd backend && npx jest portal.service mlm-wallet && npx tsc --noEmit -p tsconfig.json` → PASS + exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules
git commit -m "feat(api): wallet expose soldeReinvesti et lots J+30"
```

---

### Task 7: Frontend — `WalletCard` branchée sur le vrai flux (suppression WhatsApp)

**Files:**
- Modify: `frontend/src/lib/portal.api.ts` (interfaces `getWallet`)
- Modify: `frontend/src/components/portal/WalletCard.tsx` (réécriture)
- Modify: `frontend/src/pages/portal/PortalHomePage.tsx:82-91`
- Modify: `frontend/src/hooks/usePortalMlm.ts` (exposer lots + `soldeDisponibleRetrait`)

**Interfaces:**
- Consumes: réponse `GET /portal/wallet` (Task 6).
- Produces: `<WalletCard solde={number} gainsTotaux={number} soldeReinvesti={number} lots={ReinvestLot[]} onWithdraw={() => void} />` avec `interface ReinvestLot { id: string; amount: number; releasedAt: string }`.

- [ ] **Step 1: Types API**

`portal.api.ts` — remplacer `CreateWithdrawalRequestInput` et typer `getWallet` :

```ts
export interface ReinvestLot {
  id: string;
  amount: number;
  releasedAt: string; // ISO
}

export interface PortalWalletResponse {
  wallet: {
    soldeDisponible: number;
    soldeReserve: number;
    soldeDisponibleRetrait: number;
    soldeReinvesti: number;
    totalGagne: number;
  };
  reinvestLots: ReinvestLot[];
  stats: { gainsTotaux: number };
}

export interface CreateWithdrawalRequestInput {
  montant: number;
  type: 'MOBILE_MONEY' | 'CASH';
  provider?: string;
  phoneNumber?: string;
  notes?: string;
}
```

```ts
  getWallet: (): Promise<PortalWalletResponse> =>
    api.get('/portal/wallet').then((r) => r.data),
```

- [ ] **Step 2: `usePortalMlm.ts`**

```ts
  return {
    wallet: walletData?.wallet ?? null,
    stats: walletData?.stats ?? null,
    lots: (walletData?.reinvestLots ?? []) as ReinvestLot[],
    isLoading: isWalletLoading,
  };
```

(ajouter `import type { ReinvestLot } from '@/lib/portal.api';` — et au fichier : `interface PortalWallet` local typé par le champ existant ou via `walletData` déjà typé par l'API).

- [ ] **Step 3: Réécrire `WalletCard.tsx`**

Composant sans modale ; props nouvelles ; bouton navigue via `onWithdraw` :

```tsx
import { Wallet, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ReinvestLot } from '@/lib/portal.api';

interface WalletCardProps {
  solde: number;          // soldeDisponibleRetrait
  gainsTotaux: number;
  soldeReinvesti: number;
  lots: ReinvestLot[];
  onWithdraw: () => void;
}

export function WalletCard({ solde, gainsTotaux, soldeReinvesti, lots, onWithdraw }: WalletCardProps) {
  const fmt = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      className="rounded-2xl text-white relative overflow-hidden"
      style={{ background: 'linear-gradient(150deg, #0A1628 0%, #13294b 55%, #1a3a5c 100%)' }}
    >
      {/* Trame gravée + ronds décoratifs : inchangés (copier depuis l'actuel, lignes 22-39) */}
      <div className="relative p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet size={15} className="text-[#e8a33d]" strokeWidth={2.2} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
              Portefeuille partenaire
            </p>
          </div>
          <p className="font-mono text-[10px] text-white/35 tracking-wider">USD</p>
        </div>

        <p
          className="mt-3 text-[34px] leading-none font-bold font-mono tabular-nums tracking-tight"
          aria-label={`Solde disponible au retrait : ${fmt(solde)} dollars`}
        >
          {fmt(solde)}
        </p>
        <p className="mt-1.5 text-xs text-white/50">Disponible au retrait</p>

        {soldeReinvesti > 0 && (
          <div className="mt-3 rounded-xl bg-white/[0.06] px-3.5 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">
              Réinvesti (libération sous 30 j) : <strong className="text-white/80 tabular-nums">${fmt(soldeReinvesti)}</strong>
            </p>
            <ul className="mt-1.5 space-y-1">
              {lots.map((l) => (
                <li key={l.id} className="flex items-center justify-between text-[11px] text-white/65 tabular-nums">
                  <span>${fmt(l.amount)}</span>
                  <span>libéré le {format(new Date(l.releasedAt), 'd MMM yyyy', { locale: fr })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3.5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Gains totaux</p>
            <p className="mt-0.5 text-sm font-semibold text-white/90 tabular-nums">${fmt(gainsTotaux)}</p>
          </div>
          {solde > 0 ? (
            <button
              type="button"
              onClick={onWithdraw}
              className="flex items-center gap-1.5 rounded-lg bg-[#b45309] px-3.5 py-2 text-xs font-bold text-white transition-colors duration-150 hover:bg-[#92400e] active:scale-[0.98]"
            >
              Retirer <ArrowRight size={13} />
            </button>
          ) : (
            <span className="text-[11px] text-white/40">Rien à retirer pour l'instant</span>
          )}
        </div>
      </div>
    </div>
  );
}
```

Supprimer : `createPortal`, état `showWithdraw`, toute la modale WhatsApp (lignes 82-122 de l'actuel), imports `ArrowDownRight`, `ArrowUpRight`, `useState`.

- [ ] **Step 4: `PortalHomePage.tsx`**

```tsx
  const { wallet, stats, lots } = usePortalMlm();
  …
            <WalletCard
              solde={wallet?.soldeDisponibleRetrait ?? 0}
              gainsTotaux={stats?.gainsTotaux ?? 0}
              soldeReinvesti={wallet?.soldeReinvesti ?? 0}
              lots={lots}
              onWithdraw={() => navigate('/portal/commissions')}
            />
```

- [ ] **Step 5: Vérifier**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0 ; vitest au baseline (21 échecs préexistants NotFoundPage/PortalPointsPage, pas de nouveaux).

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(portal): WalletCard retire → /portal/commissions + détail lots réinvestis"
```

---

### Task 8: Frontend — `PortalWithdrawalPage` en montant plafonné

**Files:**
- Modify: `frontend/src/pages/portal/PortalWithdrawalPage.tsx`

**Interfaces:**
- Consumes: `portalApi.getWallet()` (Task 6/7), `createWithdrawalRequest` sans `commissionIds` (Task 4/7).

- [ ] **Step 1: Réécrire le tab « Nouvelle demande »**

Supprimer : query `commissions validated`, `selectedIds`/`toggleCommission`/`CommissionCard`, `selectedTotal`, la ligne `{request.commissionIds.length} commission(s)` du `WithdrawalRequestCard`, l'import `ValidatedCommission`.

Ajouter :

```tsx
  const { data: walletData } = useQuery({
    queryKey: ['portal', 'wallet'],
    queryFn: () => portalApi.getWallet(),
  });
  const maxRetirable = walletData?.wallet?.soldeDisponibleRetrait ?? 0;
  const [montant, setMontant] = useState('');
```

`handleSubmit` :

```tsx
    const value = Number(montant);
    if (!value || value <= 0) { toast.error('Entrez un montant valide'); return; }
    if (value > maxRetirable) { toast.error(`Retrait maximum : $${maxRetirable.toFixed(2)}`); return; }
    if (withdrawalType === 'MOBILE_MONEY' && (!provider || phoneNumber.length < 12)) {
      toast.error('Veuillez fournir un numéro de téléphone valide'); return;
    }
    createWithdrawalMutation.mutate({
      montant: value,
      type: withdrawalType,
      provider: withdrawalType === 'MOBILE_MONEY' ? provider : undefined,
      phoneNumber: withdrawalType === 'MOBILE_MONEY' ? phoneNumber : undefined,
      notes: notes || undefined,
    });
```

Le contenu du tab `new` devient le formulaire existant (mode de retrait / opérateur / téléphone / note / submit) avec, en tête :

```tsx
  <div className="rounded-2xl border border-[#b45309]/40 bg-amber-50/40 p-5">
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
      Vous pouvez retirer jusqu'à
    </p>
    <p className="mt-1 text-2xl font-bold tabular-nums text-[#b45309]">
      ${maxRetirable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
    </p>
    <div className="mt-3 flex items-end gap-2">
      <div className="form-group flex-1">
        <label htmlFor="wd-montant" className="form-label">Montant (USD)</label>
        <input
          id="wd-montant"
          type="number" inputMode="decimal" min="0.01" max={maxRetirable} step="0.01"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          placeholder="0.00"
        />
      </div>
      <button
        type="button"
        onClick={() => setMontant(String(maxRetirable))}
        className="h-10 rounded-xl border border-[#b45309]/50 px-3 text-xs font-bold text-[#b45309] hover:bg-[#b45309]/10"
      >
        Tout
      </button>
    </div>
    {maxRetirable === 0 && (
      <p className="mt-2 text-xs text-text-muted">
        Aucun solde retirable — vos gains réinvestis se libèrent 30 jours après leur attribution.
      </p>
    )}
  </div>
```

Le formulaire complet (mode retrait etc.) n'est affiché que si `maxRetirable > 0`. `onSuccess` de la mutation : garder toasts/invalidate ; invalider aussi `['portal', 'wallet']` et `['portal', 'mlm']`.

- [ ] **Step 2: Vérifier**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: exit 0 + baseline.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/portal/PortalWithdrawalPage.tsx
git commit -m "feat(portal): retrait en montant plafonné au solde retirable (60%)"
```

---

### Task 9: Vérification bout-en-bout + push

- [ ] **Step 1: Suite complète backend**

Run: `cd backend && npx jest`
Expected: tous verts (baseline 80 + nouvelles specs ≈ +12).

- [ ] **Step 2: Vérification manuelle (utilisateur, UI)**

Scénario : client ACTIF avec gains → `/portal/home` carte affiche « Disponible au retrait » + « Réinvesti : … libéré le … » → « Retirer » ouvre `/portal/commissions` → choisir Mobile Money ou Espèces + montant ≤ plafond → soumettre → `/mlm/withdrawal-requests` : approuver → la carte client diminue.

- [ ] **Step 3: Push**

```bash
git push origin main
```
