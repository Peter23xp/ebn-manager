# Mission de correction complète — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 16 problèmes détectés dans techshop-manager (bugs bloquants du flux de retrait MLM, sync offline cassée, vestiges fidélité, OTP en mémoire) en 4 groupes committés séparément.

**Architecture:** Migration Prisma groupée en premier (socle DB), puis corrections backend (groupe A : retraits MLM, groupe D : OTP en DB), puis frontend (groupe B : offline/guards), puis nettoyage (groupe C). Chaque tâche = un commit vérifiable indépendamment.

**Tech Stack:** NestJS 10 + Prisma 5 (PostgreSQL/Supabase), React 18 + Vite + TanStack Query + Zustand, Jest (backend), Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-09-01-fixes-design.md`

## Global Constraints

- **NE JAMAIS lancer `prisma migrate reset`** : la DB `.env` pointe vers une base Supabase distante qui contient des données réelles (11 clients, 1 utilisateur). Reset = perte de données.
- La DB n'a **pas de table `_prisma_migrations`** (schéma créé via `db push`) → un **baseline** est obligatoire avant `migrate dev` (Task 1).
- Working dir racine : `D:\PETER\ebn\techshop-manager`. Backend : `backend/`. Frontend : `frontend/`.
- Tests backend : `cd backend && npx jest <path> --verbose` (Jest). Test ciblé unique : `npx jest <path> -t "<test name>"`.
- Tests frontend : `cd frontend && npx vitest run <path>`. Typecheck backend : `cd backend && npx tsc -p tsconfig.build.json --noEmit`. Typecheck frontend : `cd frontend && npx tsc -b --noEmit`.
- Conventions métier : téléphone stocké `+243XXXXXXXXX`, montants MLM en USD, messages d'erreur backend via `BadRequestException({ code: 'ERR_...', message: '...' })`.
- Les montants Prisma `Decimal` se convertissent avec `Number(x)` ; pour créer : `new Prisma.Decimal(n)`.
- Constructeurs à connaître pour les tests : `PortalService(prisma, mlmWallet, mlmMatrix)` ; `MlmWalletService(prisma, kpay, webhooks)` ; `AuthService(prisma, jwt, config, mailer)`.
- CLAUDE.md dit « Token JWT en mémoire » mais le code stocke en localStorage — c'est le **CLAUDE.md qui sera corrigé** (Task 14), pas le code.

---

### Task 1: Migration Prisma groupée (baseline + WithdrawalRequest + Categorie + PasswordResetToken + drop PortailToken)

**Files:**
- Create: `backend/prisma/migrations/0_init/migration.sql`
- Create: `backend/prisma/migrations/<timestamp>_add_withdrawal_categories_password_reset/migration.sql` (généré)
- Modify: `backend/prisma/schema.prisma` (ajouter `Categorie`, `PasswordResetToken`, retirer `PortailToken` + relation `Client.portailToken` ligne 259)

**Interfaces:**
- Produces: modèles Prisma `prisma.categorie`, `prisma.passwordResetToken` utilisés par Tasks 4, 6, 8. Champ `resetToken String? @unique` consommé en Task 8 via `findUnique({ where: { resetToken } })`.

- [ ] **Step 1: Baseline — capturer l'état réel de la DB dans une migration initiale**

```bash
cd backend
mkdir -p prisma/migrations/0_init
DB_URL=$(grep '^DATABASE_URL' .env | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"')
npx prisma migrate diff --from-empty --to-url "$DB_URL" --script > prisma/migrations/0_init/migration.sql
```

Vérifier le contenu : `grep -c "CREATE TABLE" prisma/migrations/0_init/migration.sql` doit lister ~29 CREATE TABLE (dont `clients`, `utilisateurs`, `ventes`, `membres`) et **PAS** `withdrawal_requests` (vérifier avec `grep withdrawal_requests prisma/migrations/0_init/migration.sql` → aucune ligne).

- [ ] **Step 2: Marquer la baseline comme appliquée**

```bash
npx prisma migrate resolve --applied 0_init
```

Attendu : message de confirmation sans erreur. Vérifier : `npx prisma migrate status` doit montrer `0_init` appliqué et signaler un drift sur le schéma (normal — le schéma contient déjà `WithdrawalRequest`).

- [ ] **Step 3: Modifier le schéma — ajouter Categorie et PasswordResetToken**

Dans `backend/prisma/schema.prisma`, à la fin du fichier (après le modèle `WithdrawalRequest`), ajouter :

```prisma
// ── Catégories de produits (table dédiée, ex-portées par les produits) ──
model Categorie {
  id        String   @id @default(uuid())
  nom       String   @unique
  createdAt DateTime @default(now())

  @@map("categories")
}

// ── Tokens de réinitialisation mot de passe (remplace otpStore en mémoire) ──
model PasswordResetToken {
  id         String    @id @default(uuid())
  identifier String // téléphone de l'utilisateur ciblé
  otpHash    String // OTP 6 chiffres hashé bcrypt
  resetToken String?   @unique // UUID délivré après vérification OTP
  attempts   Int       @default(0) // max 3 essais OTP
  expiresAt  DateTime // OTP : +10 min puis réutilisé pour le resetToken : +15 min
  consumedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([identifier])
  @@map("password_reset_tokens")
}
```

- [ ] **Step 4: Modifier le schéma — supprimer PortailToken**

Supprimer dans `backend/prisma/schema.prisma` :
1. Le bloc `model PortailToken { ... }` (lignes ~540-554, section « PORTAIL TOKEN CLIENT »).
2. La ligne `portailToken      PortailToken?` dans le modèle `Client` (ligne ~259).

- [ ] **Step 5: Vérifier qu'aucun code n'utilise PortailToken**

```bash
cd backend && grep -rn "portailToken\|PortailToken" src/ ; cd .. && grep -rn "portailToken" frontend/src/
```

Attendu : aucune occurrence. (Si une occurrence backend apparaît, la traiter avant de continuer — attendu 0 d'après l'audit.)

- [ ] **Step 6: Générer la migration groupée**

```bash
cd backend
npx prisma migrate dev --name add_withdrawal_categories_password_reset --create-only
```

Inspecter le SQL généré : `cat prisma/migrations/*add_withdrawal_categories_password_reset/migration.sql`. Il DOIT contenir :
- `CREATE TABLE "withdrawal_requests"`,
- `CREATE TABLE "categories"`,
- `CREATE TABLE "password_reset_tokens"`,
- `DROP TABLE "portail_tokens"`,
- les types enum `WithdrawalRequestStatut`, `WithdrawalRequestType`.

**Si la commande échoue avec une erreur de shadow database (Supabase : `permission denied to create database`)**, utiliser le fallback sans shadow DB :

```bash
DB_URL=$(grep '^DATABASE_URL' .env | head -1 | sed 's/^DATABASE_URL=//' | tr -d '"')
mkdir -p "prisma/migrations/$(date +%Y%m%d%H%M%S)_add_withdrawal_categories_password_reset"
npx prisma migrate diff --from-url "$DB_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/$(date +%Y%m%d%H%M%S)_add_withdrawal_categories_password_reset/migration.sql
npx prisma migrate resolve --applied add_withdrawal_categories_password_reset
```

(Noter que le timestamp doit être identique entre le mkdir et le resolve ; résoudre le nom en variable.)

- [ ] **Step 7: Appliquer la migration**

```bash
npx prisma migrate dev
```

Attendu : « Database synchronized ». Si l'outil demande de re-seed, refuser (les données existent).

Vérification DB directe :

```bash
cd backend
node -e "
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\"SELECT tablename FROM pg_tables WHERE tablename IN ('withdrawal_requests','categories','password_reset_tokens','portail_tokens')\")
  .then(r => { console.log(r.rows.map(x=>x.tablename)); pool.end(); });
"
```

Attendu : `['categories', 'password_reset_tokens', 'withdrawal_requests']` — **sans** `portail_tokens`.

- [ ] **Step 8: Vérifier le typecheck backend**

```bash
cd backend && npx tsc -p tsconfig.build.json --noEmit
```

Attendu : 0 erreur. (Si `prisma client pas régénéré`, lancer `npx prisma generate`.)

- [ ] **Step 9: Commit**

```bash
cd backend && git add prisma/
git commit -m "feat(db): baseline migrations + add withdrawal_requests, categories, password_reset_tokens; drop portail_tokens

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Normalisation du téléphone Mobile Money (A2)

**Files:**
- Modify: `backend/src/modules/portal/dto/withdrawal.dto.ts:20-23`
- Modify: `backend/src/modules/portal/portal.service.ts` (méthode `createWithdrawalRequest`, section data `phoneNumber: dto.phoneNumber` ligne ~428)
- Test: `backend/src/modules/portal/portal.service.spec.ts`

**Interfaces:**
- Produces: fonction privée `normalizeDrcPhone(raw: string): string` dans `PortalService` (retourne `+243XXXXXXXXX`, throw `BadRequestException` sinon). Le front reste inchangé (envoie `243XXXXXXXXX`).

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `backend/src/modules/portal/portal.service.spec.ts` (à la fin, avant la dernière accolade), un nouveau bloc describe. Le mock prisma a besoin de `commission.findMany` et `withdrawalRequest.create` — les ajouter au `beforeEach` existant :

```ts
      commission: {
        findMany: jest.fn<any>(),
      },
      withdrawalRequest: {
        create: jest.fn<any>(),
        findMany: jest.fn<any>(),
        findUnique: jest.fn<any>(),
        update: jest.fn<any>(),
      },
```

Puis le bloc de tests :

```ts
  describe('createWithdrawalRequest — normalisation téléphone', () => {
    const baseMembre = { id: 'membre-1', clientId: 'client-1', portefeuille: { id: 'w-1' } };

    function setupHappyPath(phoneNumber: string) {
      prisma.membre.findUnique.mockResolvedValueOnce(baseMembre);
      prisma.commission.findMany.mockResolvedValueOnce([
        { id: 'c-1', montant: 25, statut: 'VALIDEE' },
      ]);
      prisma.withdrawalRequest.create.mockResolvedValueOnce({
        id: 'wr-1', montant: 25, type: 'MOBILE_MONEY', provider: 'AIRTEL_COD',
        phoneNumber, statut: 'EN_ATTENTE', commissionIds: ['c-1'], notes: null, createdAt: new Date(),
      });
      return { montant: 25, type: 'MOBILE_MONEY' as const, provider: 'AIRTEL_COD', phoneNumber, commissionIds: ['c-1'] };
    }

    it('normalizes 243XXXXXXXXX to +243XXXXXXXXX', async () => {
      const dto = setupHappyPath('243812345678');
      await service.createWithdrawalRequest('client-1', dto);
      expect(prisma.withdrawalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phoneNumber: '+243812345678' }),
        }),
      );
    });

    it('normalizes 0XXXXXXXXX (prefixe local) to +243XXXXXXXXX', async () => {
      const dto = setupHappyPath('0812345678');
      await service.createWithdrawalRequest('client-1', dto);
      expect(prisma.withdrawalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phoneNumber: '+243812345678' }),
        }),
      );
    });

    it('rejects a phone that is not a valid DRC number', async () => {
      prisma.membre.findUnique.mockResolvedValueOnce(baseMembre);
      prisma.commission.findMany.mockResolvedValueOnce([{ id: 'c-1', montant: 25, statut: 'VALIDEE' }]);
      await expect(
        service.createWithdrawalRequest('client-1', {
          montant: 25, type: 'MOBILE_MONEY' as never, provider: 'AIRTEL_COD',
          phoneNumber: '12345', commissionIds: ['c-1'],
        }),
      ).rejects.toThrow();
    });
  });
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
cd backend && npx jest src/modules/portal/portal.service.spec.ts --verbose
```

Attendu : les 3 nouveaux tests échouent (DTO actuel exige `+243...` → mais les tests appellent le service directement, donc c'est la normalisation absente qui fait échouer : `phoneNumber` stocké brut).

- [ ] **Step 3: DTO — remplacer la regex stricte par une regex permissive**

Dans `backend/src/modules/portal/dto/withdrawal.dto.ts`, remplacer :

```ts
  @Matches(/^\+243\d{9}$/, { message: 'Format téléphone invalide (+243XXXXXXXXX)' })
```

par :

```ts
  @Matches(/^(\+?243|0)?\d{9}$/, { message: 'Format téléphone invalide (+243XXXXXXXXX)' })
```

- [ ] **Step 4: Service — normaliser avant stockage**

Dans `backend/src/modules/portal/portal.service.ts`, ajouter à la section `// ── Helpers ──` (fin de classe, après `getPeriodStart`) :

```ts
  /**
   * Normalise un numéro RDC vers +243XXXXXXXXX (accepte 243…, +243…, 0…).
   * Même logique que KpayService.normalizeDrcPhone mais avec préfixe +.
   */
  private normalizeDrcPhone(raw: string): string {
    const digits = raw.replace(/[^\d]/g, '').replace(/^00/, '');
    let normalized: string;
    if (digits.startsWith('0')) normalized = `243${digits.slice(1)}`;
    else if (digits.length === 9) normalized = `243${digits}`;
    else normalized = digits;
    if (!/^243\d{9}$/.test(normalized)) {
      throw new BadRequestException({
        code: 'ERR_INVALID_PHONE',
        message: 'Le numéro doit être un numéro RDC valide (+243XXXXXXXXX)',
      });
    }
    return `+${normalized}`;
  }
```

Dans `createWithdrawalRequest`, remplacer le bloc de vérification Mobile Money (lignes ~413-419) :

```ts
    // Vérifier les champs requis selon le type
    if (dto.type === 'MOBILE_MONEY' && (!dto.provider || !dto.phoneNumber)) {
      throw new BadRequestException({
        code: 'ERR_MISSING_PAYMENT_INFO',
        message: 'Le provider et le numéro de téléphone sont requis pour Mobile Money',
      });
    }
```

par :

```ts
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
```

Et dans le `withdrawalRequest.create`, remplacer `phoneNumber: dto.phoneNumber,` par `phoneNumber,`.

- [ ] **Step 5: Vérifier que tous les tests passent**

```bash
cd backend && npx jest src/modules/portal/portal.service.spec.ts --verbose
```

Attendu : PASS (anciens + nouveaux).

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/modules/portal/
git commit -m "fix(portal): normalize DRC phone numbers in withdrawal requests (+243XXXXXXXXX)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Brancher les DTOs admin sur les endpoints de retrait (A3)

**Files:**
- Modify: `backend/src/modules/portal/dto/withdrawal.dto.ts` (classes `ApproveWithdrawalRequestDto`, `RejectWithdrawalRequestDto`)
- Modify: `backend/src/modules/mlm/mlm.controller.ts:243-268`
- Test: `backend/src/modules/mlm/mlm-wallet.service.spec.ts`

**Interfaces:**
- Consumes: `MlmWalletService.approveWithdrawalRequest(requestId: string, approvedById: string, notes?)`, `rejectWithdrawalRequest(requestId: string, rejectReason: string)`, `markWithdrawalAsPaid(requestId: string)` (existants, inchangés).
- Produces: DTOs `ApproveWithdrawalRequestDto { approvedById: string; notes?: string }` et `RejectWithdrawalRequestDto { rejectReason: string }` validés à runtime par le ValidationPipe global.

- [ ] **Step 1: Renforcer les DTOs**

Dans `backend/src/modules/portal/dto/withdrawal.dto.ts`, remplacer les deux classes du bas par :

```ts
export class ApproveWithdrawalRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'approvedById est requis' })
  approvedById: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectWithdrawalRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'Le motif de rejet est requis' })
  @MaxLength(500, { message: 'Le motif de rejet ne doit pas dépasser 500 caractères' })
  rejectReason: string;
}
```

Et mettre à jour l'import en tête de fichier :

```ts
import {
  IsString, IsNumber, IsArray, IsEnum, IsOptional, IsNotEmpty,
  Min, Matches, MaxLength,
} from 'class-validator';
```

- [ ] **Step 2: Brancher les DTOs dans le contrôleur**

Dans `backend/src/modules/mlm/mlm.controller.ts`, ajouter l'import (près de l'import `KpayProvider`) :

```ts
import {
  ApproveWithdrawalRequestDto,
  RejectWithdrawalRequestDto,
} from '../portal/dto/withdrawal.dto';
```

Remplacer les deux handlers (lignes ~243-261) :

```ts
  @Put('withdrawal-requests/:requestId/approve')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  @HttpCode(HttpStatus.OK)
  approveWithdrawalRequest(
    @Param('requestId') requestId: string,
    @Body() dto: ApproveWithdrawalRequestDto,
  ) {
    return this.walletService.approveWithdrawalRequest(requestId, dto.approvedById, dto.notes);
  }

  @Patch('withdrawal-requests/:requestId/reject')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  @HttpCode(HttpStatus.OK)
  rejectWithdrawalRequest(
    @Param('requestId') requestId: string,
    @Body() dto: RejectWithdrawalRequestDto,
  ) {
    return this.walletService.rejectWithdrawalRequest(requestId, dto.rejectReason);
  }
```

(`mark-paid` reste sans body — inchangé.)

- [ ] **Step 3: Écrire les tests du service admin (TDD inversé : comportement déjà écrit, on le fige)**

Ajouter à `backend/src/modules/mlm/mlm-wallet.service.spec.ts` un second bloc describe (après le premier, avant la dernière accolade) :

```ts
describe('MlmWalletService — withdrawal requests (commissions)', () => {
  const resolved = (value: any) => {
    const mock = jest.fn();
    (mock as any).mockResolvedValue(value);
    return mock;
  };
  const buildService = (prisma: any) =>
    new MlmWalletService(prisma as never, {} as never, {} as never);

  it('approves a CASH request: commissions PAYEE + request directly PAYE', async () => {
    const tx = {
      commission: { updateMany: jest.fn() },
      withdrawalRequest: { update: resolved({ statut: 'PAYE' }) },
    };
    const prisma = {
      withdrawalRequest: {
        findUnique: resolved({
          id: 'wr-1', membreId: 'm-1', type: 'CASH', statut: 'EN_ATTENTE',
          commissionIds: ['c-1', 'c-2'],
        }),
      },
      commission: { findMany: resolved([{ id: 'c-1' }, { id: 'c-2' }]) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = buildService(prisma);

    const result = await service.approveWithdrawalRequest('wr-1', 'user-1', 'note');

    expect(prisma.commission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ statut: 'VALIDEE', membreId: 'm-1' }) }),
    );
    expect(tx.commission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statut: 'PAYEE' }) }),
    );
    expect(result.statut).toBe('PAYE');
  });

  it('rejects approval when a commission is no longer VALIDEE', async () => {
    const prisma = {
      withdrawalRequest: {
        findUnique: resolved({
          id: 'wr-1', membreId: 'm-1', type: 'CASH', statut: 'EN_ATTENTE',
          commissionIds: ['c-1', 'c-2'],
        }),
      },
      commission: { findMany: resolved([{ id: 'c-1' }]) }, // 1 sur 2 → invalide
      $transaction: jest.fn(),
    };
    const service = buildService(prisma);

    await expect(service.approveWithdrawalRequest('wr-1', 'user-1')).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a pending request with a reason', async () => {
    const updated = { id: 'wr-1', statut: 'REJETE', rejectReason: 'Documents manquants' };
    const prisma = {
      withdrawalRequest: {
        findUnique: resolved({ id: 'wr-1', statut: 'EN_ATTENTE' }),
        update: resolved(updated),
      },
    };
    const service = buildService(prisma);

    const result = await service.rejectWithdrawalRequest('wr-1', 'Documents manquants');
    expect(result.statut).toBe('REJETE');
  });

  it('refuses to reject an already-processed request', async () => {
    const prisma = {
      withdrawalRequest: { findUnique: resolved({ id: 'wr-1', statut: 'APPROUVE' }) },
    };
    const service = buildService(prisma);

    await expect(service.rejectWithdrawalRequest('wr-1', 'x')).rejects.toThrow();
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

- [ ] **Step 4: Lancer les tests du wallet**

```bash
cd backend && npx jest src/modules/mlm/mlm-wallet.service.spec.ts --verbose
```

Attendu : PASS (les tests figent le comportement existant ; s'ils échouent, corriger le test ou le service selon le sens réel du code).

- [ ] **Step 5: Typecheck + commit**

```bash
cd backend && npx tsc -p tsconfig.build.json --noEmit
git add src/modules/portal/dto/withdrawal.dto.ts src/modules/mlm/mlm.controller.ts src/modules/mlm/mlm-wallet.service.spec.ts
git commit -m "fix(mlm): wire Approve/RejectWithdrawalRequestDto to admin endpoints (runtime validation)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Annulation d'une demande par le client (A4)

**Files:**
- Modify: `backend/src/modules/portal/portal.service.ts` (nouvelle méthode après `getWithdrawalRequests`)
- Modify: `backend/src/modules/portal/portal.controller.ts` (nouveau endpoint)
- Modify: `frontend/src/lib/portal.api.ts` (nouvelle méthode API + type)
- Modify: `frontend/src/pages/portal/PortalWithdrawalPage.tsx` (bouton Annuler)
- Test: `backend/src/modules/portal/portal.service.spec.ts`

**Interfaces:**
- Produces: `PATCH /api/v1/portal/withdrawal-requests/:requestId/cancel` (auth CLIENT, propriétaire uniquement). Front : `portalApi.cancelWithdrawalRequest(requestId: string): Promise<{ id: string; statut: string }>`.

- [ ] **Step 1: Écrire les tests du service qui échouent**

Ajouter à `backend/src/modules/portal/portal.service.spec.ts` un bloc describe :

```ts
  describe('cancelWithdrawalRequest', () => {
    it('cancels own pending request', async () => {
      prisma.membre.findUnique.mockResolvedValueOnce({ id: 'membre-1', clientId: 'client-1' });
      prisma.withdrawalRequest.findUnique.mockResolvedValueOnce({
        id: 'wr-1', membreId: 'membre-1', statut: 'EN_ATTENTE',
      });
      prisma.withdrawalRequest.update.mockResolvedValueOnce({ id: 'wr-1', statut: 'ANNULE' });

      const res = await service.cancelWithdrawalRequest('client-1', 'wr-1');
      expect(res.statut).toBe('ANNULE');
      expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'wr-1' }, data: expect.objectContaining({ statut: 'ANNULE' }) }),
      );
    });

    it('refuses to cancel someone else’s request (404-like)', async () => {
      prisma.membre.findUnique.mockResolvedValueOnce({ id: 'membre-1', clientId: 'client-1' });
      prisma.withdrawalRequest.findUnique.mockResolvedValueOnce({
        id: 'wr-2', membreId: 'membre-AUTRE', statut: 'EN_ATTENTE',
      });
      await expect(service.cancelWithdrawalRequest('client-1', 'wr-2')).rejects.toThrow();
    });

    it('refuses to cancel a non-pending request', async () => {
      prisma.membre.findUnique.mockResolvedValueOnce({ id: 'membre-1', clientId: 'client-1' });
      prisma.withdrawalRequest.findUnique.mockResolvedValueOnce({
        id: 'wr-1', membreId: 'membre-1', statut: 'APPROUVE',
      });
      await expect(service.cancelWithdrawalRequest('client-1', 'wr-1')).rejects.toThrow();
    });
  });
```

```bash
cd backend && npx jest src/modules/portal/portal.service.spec.ts -t "cancelWithdrawalRequest"
```

Attendu : FAIL (`cancelWithdrawalRequest is not a function`).

- [ ] **Step 2: Implémenter la méthode service**

Dans `backend/src/modules/portal/portal.service.ts`, après `getWithdrawalRequests` (avant `getValidatedCommissions`) :

```ts
  async cancelWithdrawalRequest(clientId: string, requestId: string) {
    const membre = await this.ensureMember(clientId);
    if (!membre) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Compte MLM introuvable' });
    }

    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.membreId !== membre.id) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Demande de retrait introuvable' });
    }

    if (request.statut !== 'EN_ATTENTE') {
      throw new BadRequestException({
        code: 'ERR_NOT_CANCELLABLE',
        message: 'Seules les demandes en attente peuvent être annulées',
      });
    }

    return this.prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: { statut: 'ANNULE' },
      select: { id: true, statut: true },
    });
  }
```

- [ ] **Step 3: Ajouter le endpoint contrôleur**

Dans `backend/src/modules/portal/portal.controller.ts`, après le handler `getWithdrawalRequests` :

```ts
  @Patch('withdrawal-requests/:requestId/cancel')
  cancelWithdrawalRequest(
    @CurrentUser() user: any,
    @Param('requestId') requestId: string,
  ) {
    return this.portalService.cancelWithdrawalRequest(user.id, requestId);
  }
```

Et compléter l'import `@nestjs/common` en tête : ajouter `Patch` à la liste (`Controller, Get, Param, Query, UseGuards, ParseIntPipe, DefaultValuePipe, Post, Body, Patch`).

- [ ] **Step 4: Vérifier les tests backend**

```bash
cd backend && npx jest src/modules/portal/portal.service.spec.ts --verbose && npx tsc -p tsconfig.build.json --noEmit
```

Attendu : tout PASS, 0 erreur TS.

- [ ] **Step 5: Côté frontend — méthode API**

Dans `frontend/src/lib/portal.api.ts`, dans l'objet `portalApi` après `getWithdrawalRequests` :

```ts
  cancelWithdrawalRequest: (requestId: string): Promise<{ id: string; statut: string }> =>
    api.patch(`/portal/withdrawal-requests/${requestId}/cancel`).then((r) => r.data),
```

- [ ] **Step 6: Côté frontend — bouton Annuler**

Dans `frontend/src/pages/portal/PortalWithdrawalPage.tsx` :

1. Dans le composant principal, après `createWithdrawalMutation` :

```ts
  const cancelWithdrawalMutation = useMutation({
    mutationFn: (requestId: string) => portalApi.cancelWithdrawalRequest(requestId),
    onSuccess: () => {
      toast.success('Demande annulée');
      queryClient.invalidateQueries({ queryKey: ['portal', 'commissions', 'validated'] });
      queryClient.invalidateQueries({ queryKey: ['portal', 'withdrawal-requests'] });
    },
    onError: (error: any) =>
      toast.error(error?.response?.data?.message ?? 'Erreur lors de l\'annulation'),
  });
```

2. Passer la mutation à la carte : remplacer `{requests.map((request) => (
          <WithdrawalRequestCard key={request.id} request={request} />
        ))}` par :

```tsx
                {requests.map((request) => (
                  <WithdrawalRequestCard
                    key={request.id}
                    request={request}
                    onCancel={
                      request.statut === 'EN_ATTENTE' && !cancelWithdrawalMutation.isPending
                        ? () => cancelWithdrawalMutation.mutate(request.id)
                        : undefined
                    }
                  />
                ))}
```

3. Adapter la signature de la carte et ajouter le bouton — remplacer `function WithdrawalRequestCard({ request }: { request: WithdrawalRequest }) {` par :

```tsx
function WithdrawalRequestCard({
  request,
  onCancel,
}: {
  request: WithdrawalRequest;
  onCancel?: () => void;
}) {
```

Et dans le JSX de la carte, juste après le bloc `{request.notes && (<p className="text-neutral-600 mt-2 italic">Note: {request.notes}</p>)}` (fin de la div `text-xs text-neutral-500 space-y-1`), ajouter :

```tsx
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-3 w-full h-9 rounded-lg border border-neutral-200 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            Annuler la demande
          </button>
        )}
```

- [ ] **Step 7: Vérifier le build frontend + tests**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run src/pages/portal/
```

Attendu : 0 erreur TS, tests portail PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/portal/ frontend/src/lib/portal.api.ts frontend/src/pages/portal/PortalWithdrawalPage.tsx
git commit -m "feat(withdrawals): allow client to cancel own pending withdrawal request

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Masquer les actions d'approbation pour GERANT (A5)

**Files:**
- Modify: `frontend/src/pages/mlm/MlmWithdrawalRequestsPage.tsx:87` (et blocs d'actions lignes ~353-377)

- [ ] **Step 1: Ajouter le flag de modération**

Dans `MlmWithdrawalRequestsPage.tsx`, après `const { user } = useAuthStore();` :

```ts
  const canModerate =
    user?.role === 'SUPER_ADMIN' || user?.role === 'DIRECTEUR_REGIONAL';
```

- [ ] **Step 2: Cadrer les boutons d'action**

Remplacer `{r.statut === 'EN_ATTENTE' && (` par `{r.statut === 'EN_ATTENTE' && canModerate && (` et `{r.statut === 'APPROUVE' && r.type === 'MOBILE_MONEY' && (` par `{r.statut === 'APPROUVE' && r.type === 'MOBILE_MONEY' && canModerate && (`.

- [ ] **Step 3: Typecheck + tests + commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run
git add frontend/src/pages/mlm/MlmWithdrawalRequestsPage.tsx
git commit -m "fix(mlm): hide withdrawal approval actions from GERANT (403 server-side)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Persistance des OTP de reset password en DB (D2+D3)

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts` (refonte `otpStore`/`resetTokenStore` → `prisma.passwordResetToken`)
- Test: `backend/src/modules/auth/auth.service.spec.ts` (nouveau)

**Interfaces:**
- Consumes: modèle `prisma.passwordResetToken` (Task 1). Champs : `identifier, otpHash, resetToken?, attempts, expiresAt, consumedAt?`.
- Produces: comportement externe inchangé (`forgotPassword` → `{success, maskedPhone, maskedEmail, expiresIn, retryAfter}` ; `verifyOtp` → `{success, resetToken}` ; `resetPassword` → `{success, message}`) + cron de purge quotidien.

- [ ] **Step 1: Écrire le spec du nouveau AuthService (TDD)**

Créer `backend/src/modules/auth/auth.service.spec.ts` :

```ts
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { AuthService } from './auth.service';

describe('AuthService — password reset (persisted tokens)', () => {
  let service: AuthService;
  let prisma: any;
  let mailer: any;

  beforeEach(() => {
    prisma = {
      passwordResetToken: {
        deleteMany: jest.fn<any>(),
        create: jest.fn<any>(),
        findFirst: jest.fn<any>(),
        findUnique: jest.fn<any>(),
        update: jest.fn<any>(),
      },
      utilisateur: {
        findFirst: jest.fn<any>(),
        update: jest.fn<any>(),
      },
    };
    mailer = { sendOtpResetPassword: jest.fn<any>() };
    service = new AuthService(
      prisma as never,
      { sign: jest.fn(), verify: jest.fn() } as never,
      { get: jest.fn() } as never,
      mailer as never,
    );
  });

  describe('forgotPassword', () => {
    it('stores a hashed OTP in DB and deletes previous tokens', async () => {
      prisma.utilisateur.findFirst.mockResolvedValueOnce({
        id: 'u-1', email: 'jean@example.com', nom: 'Jean', passwordHash: 'x',
      });
      prisma.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 1 });
      prisma.passwordResetToken.create.mockResolvedValueOnce({ id: 't-1' });

      const res = await service.forgotPassword({ phone: '+243812345678' });

      expect(res.success).toBe(true);
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { identifier: '+243812345678' },
      });
      const createArg = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createArg.data.identifier).toBe('+243812345678');
      expect(createArg.data.otpHash).not.toBe(createArg.data.otp); // hashé
      expect(createArg.data.otp).toMatch(/^\d{6}$/);
      expect(mailer.sendOtpResetPassword).toHaveBeenCalled();
    });

    it('still fails with PHONE_NOT_FOUND for unknown phone', async () => {
      prisma.utilisateur.findFirst.mockResolvedValueOnce(null);
      await expect(service.forgotPassword({ phone: '+243000000000' })).rejects.toThrow();
    });
  });

  describe('verifyOtp', () => {
    const storedToken = (over: Partial<any> = {}) => ({
      id: 't-1', identifier: '+243812345678', otpHash: '$2a$10$hash',
      attempts: 0, expiresAt: new Date(Date.now() + 5 * 60000),
      consumedAt: null, ...over,
    });

    it('issues a resetToken and consumes the OTP on success', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValueOnce(storedToken());
      prisma.passwordResetToken.update.mockResolvedValueOnce({});
      // bcrypt.compare mocké via la dépendance réelle : on force un OTP hashé identifiable
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValueOnce(true as never);

      const res = await service.verifyOtp({ phone: '+243812345678', otp: '123456' });

      expect(res.success).toBe(true);
      expect(res.resetToken).toMatch(/^[0-9a-f-]{36}$/);
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't-1' },
          data: expect.objectContaining({ consumedAt: expect.any(Date), attempts: 1 }),
        }),
      );
    });

    it('rejects after expiry and deletes the token', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValueOnce(
        storedToken({ expiresAt: new Date(Date.now() - 60000) }),
      );
      prisma.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 1 });

      await expect(service.verifyOtp({ phone: '+243812345678', otp: '123456' })).rejects.toThrow();
    });
  });

  describe('resetPassword', () => {
    it('updates the password and consumes the reset token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce({
        id: 't-1', identifier: '+243812345678', resetToken: 'uuid-1',
        expiresAt: new Date(Date.now() + 60000), consumedAt: null,
      });
      prisma.utilisateur.findFirst.mockResolvedValueOnce({
        id: 'u-1', passwordHash: '$2a$12$old',
      });
      jest.spyOn(require('bcrypt'), 'compare')
        .mockResolvedValueOnce(false as never) // sameAsOld → false
        ;
      jest.spyOn(require('bcrypt'), 'hash').mockResolvedValueOnce('$2a$12$new' as never);
      prisma.utilisateur.update.mockResolvedValueOnce({});
      prisma.passwordResetToken.update.mockResolvedValueOnce({});

      const res = await service.resetPassword({ resetToken: 'uuid-1', newPassword: 'N3wPassword' });

      expect(res.success).toBe(true);
      expect(prisma.utilisateur.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-1' },
          data: expect.objectContaining({ passwordHash: '$2a$12$new' }),
        }),
      );
    });

    it('refuses an already-consumed reset token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValueOnce({
        id: 't-1', identifier: '+243812345678', resetToken: 'uuid-1',
        expiresAt: new Date(Date.now() + 60000), consumedAt: new Date(),
      });
      await expect(
        service.resetPassword({ resetToken: 'uuid-1', newPassword: 'N3wPassword' }),
      ).rejects.toThrow();
    });
  });
});
```

Note : les mocks bcrypt doivent être remis à zéro entre tests — ajouter `jest.restoreAllMocks()` dans le `beforeEach` si des interférences apparaissent.

- [ ] **Step 2: Vérifier l'échec initial**

```bash
cd backend && npx jest src/modules/auth/auth.service.spec.ts
```

Attendu : FAIL (le service actuel lit une Map en mémoire, jamais `prisma.passwordResetToken`).

- [ ] **Step 3: Refondre AuthService**

Dans `backend/src/modules/auth/auth.service.ts` :

1. Ajouter les imports : `import { Cron, CronExpression } from '@nestjs/schedule';` et `import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';` (déjà présent).

2. Supprimer les deux lignes de propriétés (lignes 20-21) :

```ts
  private otpStore = new Map<string, { otpHash: string; expiresAt: Date; attempts: number }>();
  private resetTokenStore = new Map<string, { phone: string; expiresAt: Date }>();
```

3. Remplacer `forgotPassword` (bloc `this.otpStore.set(...)` lignes ~140-143) :

```ts
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60000);

    await this.prisma.passwordResetToken.deleteMany({
      where: { identifier: dto.phone },
    });
    await this.prisma.passwordResetToken.create({
      data: { identifier: dto.phone, otpHash, attempts: 0, expiresAt },
    });
```

4. Remplacer le corps de `verifyOtp` (lignes 153-194) :

```ts
  async verifyOtp(dto: VerifyOtpDto) {
    const entry = await this.prisma.passwordResetToken.findFirst({
      where: { identifier: dto.phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!entry || entry.expiresAt < new Date()) {
      await this.prisma.passwordResetToken.deleteMany({ where: { identifier: dto.phone } });
      throw new BadRequestException({
        error: { code: 'OTP_EXPIRED', message: 'Code OTP expiré. Demandez un nouveau code.' },
      });
    }

    if (entry.attempts >= 3) {
      await this.prisma.passwordResetToken.deleteMany({ where: { identifier: dto.phone } });
      throw new BadRequestException({
        error: {
          code: 'TOO_MANY_OTP_ATTEMPTS',
          message: 'Trop de tentatives invalides. Recommencez.',
        },
      });
    }

    const valid = await bcrypt.compare(dto.otp, entry.otpHash);
    if (!valid) {
      await this.prisma.passwordResetToken.update({
        where: { id: entry.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException({
        error: {
          code: 'INVALID_OTP',
          message: 'Code incorrect.',
          attemptsLeft: 3 - (entry.attempts + 1),
        },
      });
    }

    // Consommer l'OTP et délivrer le resetToken (15 min)
    const resetToken = crypto.randomUUID();
    await this.prisma.passwordResetToken.update({
      where: { id: entry.id },
      data: {
        consumedAt: new Date(),
        attempts: { increment: 1 },
        resetToken,
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
    });

    return { success: true, resetToken };
  }
```

5. Remplacer le début de `resetPassword` (lignes 196-207) :

```ts
  async resetPassword(dto: ResetPasswordDto) {
    const entry = await this.prisma.passwordResetToken.findUnique({
      where: { resetToken: dto.resetToken },
    });

    if (!entry || entry.consumedAt || entry.expiresAt < new Date()) {
      throw new BadRequestException({
        error: {
          code: 'RESET_TOKEN_EXPIRED',
          message: 'Session expirée. Recommencez la réinitialisation.',
        },
      });
    }

    const user = await this.prisma.utilisateur.findFirst({
      where: { telephone: entry.identifier },
    });
```

(Et supprimer, plus bas dans la même méthode, la ligne `this.resetTokenStore.delete(dto.resetToken);` — la consommation se fait par `consumedAt` :)

6. Remplacer cette suppression par la consommation explicite juste après l'update utilisateur (après `await this.prisma.utilisateur.update({...})`) :

```ts
    await this.prisma.passwordResetToken.update({
      where: { id: entry.id },
      data: { consumedAt: new Date() },
    });
```

7. Ajouter le cron de purge (à la fin de la classe) :

```ts
  /** Purge quotidienne des tokens de reset expirés depuis plus de 24h */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredResetTokens() {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
    const res = await this.prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    if (res.count > 0) {
      console.log(`[AUTH] Purged ${res.count} expired password reset tokens`);
    }
  }
```

- [ ] **Step 4: Vérifier tests + typecheck**

```bash
cd backend && npx jest src/modules/auth/auth.service.spec.ts --verbose && npx jest && npx tsc -p tsconfig.build.json --noEmit
```

Attendu : nouveau spec PASS, tous les specs backend PASS, 0 erreur TS. (Si d'autres specs instanciennent AuthService sans `config`/`jwt` complets, ajuster ces specs en conséquence — ne pas toucher au service.)

- [ ] **Step 5: Commit**

```bash
cd backend && git add src/modules/auth/
git commit -m "feat(auth): persist password-reset OTP/tokens in DB (multi-instance safe) + daily purge cron

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Monter useOnlineSync et retirer la bannière doublon (B1+B3)

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx:32,390` (retirer OfflineBanner) et top-level du composant (monter `useOnlineSync`)

**Interfaces:**
- Consumes: `useOnlineSync()` (`frontend/src/hooks/useOnlineSync.ts`, existant, inchangé) — drain `pending-ventes` → `POST /ventes`, alimente `uiStore.pendingSyncCount`.

- [ ] **Step 1: Retirer l'OfflineBanner d'AppLayout**

Dans `frontend/src/components/layout/AppLayout.tsx` : supprimer la ligne `import { OfflineBanner } from '@/components/ui/OfflineBanner';` (ligne 32) et la ligne `<OfflineBanner />` (ligne ~390).

- [ ] **Step 2: Monter useOnlineSync**

Ajouter l'import en tête du même fichier :

```ts
import { useOnlineSync } from '@/hooks/useOnlineSync';
```

Au début du corps du composant `AppLayout` (avant le return) :

```ts
  useOnlineSync();
```

- [ ] **Step 3: Vérifier absence d'autres doublons + typecheck**

```bash
cd frontend && grep -rn "OfflineBanner" src/ --include="*.tsx" | grep -v "components/ui/OfflineBanner"
```

Attendu : seulement `App.tsx:116` (le global, conservé). Puis :

```bash
npx tsc -b --noEmit && npx vitest run
```

Attendu : 0 erreur, tests PASS.

- [ ] **Step 4: Test manuel du flux offline (procédure)**

1. `cd frontend && npm run dev` + `cd backend && npm run start:dev` (si DB dispo).
2. Se connecter en AGENT+, ouvrir `/sales/pos`, couper le réseau (DevTools → Network → Offline).
3. Créer une vente → toast succès (file IndexedDB). Reconnecter.
4. Attendre ~2 s : la bannière doit passer « syncing » puis « synced », `pending-ventes` vidé (DevTools → Application → IndexedDB → ebn-network-offline).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AppLayout.tsx
git commit -m "fix(frontend): mount useOnlineSync in AppLayout and remove duplicate OfflineBanner

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Supprimer le filtre niveauFidelite qui crashe (B2)

**Files:**
- Modify: `backend/src/modules/clients/clients.service.ts:217,231-233`

- [ ] **Step 1: Vérifier que le front n'envoie jamais `niveau`**

```bash
grep -rn "niveau" frontend/src/lib/clients.api.ts frontend/src/hooks/useClients.ts frontend/src/pages/clients/ClientsListPage.tsx
```

Attendu : aucune occurrence (confirmé à l'audit). Le filtre est mort des deux côtés.

- [ ] **Step 2: Supprimer le filtre**

Dans `backend/src/modules/clients/clients.service.ts`, ligne ~217, retirer `niveau` de la déstructuration :

```ts
    const { statut, search, page = 1, limit = 50 } = query;
```

Et supprimer le bloc (lignes ~231-233) :

```ts
    if (niveau) {
      where.niveauFidelite = niveau;
    }
```

- [ ] **Step 3: Typecheck + test de non-régression + commit**

```bash
cd backend && npx tsc -p tsconfig.build.json --noEmit && npx jest
git add src/modules/clients/clients.service.ts
git commit -m "fix(clients): remove niveauFidelite filter (field dropped in MLM migration, caused Prisma error)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Corriger la redirection CLIENT et la boucle RoleGuard (B4)

**Files:**
- Modify: `frontend/src/components/layout/RoleGuard.tsx`
- Modify: `frontend/src/pages/auth/LoginPage.tsx:92` (+ import `useLocation`)

**Interfaces:**
- Produces: `RoleGuard` redirige `CLIENT` → `/portal/home`, autres → `/dashboard`. `LoginPage` honore `location.state.from` posé par `AuthGuard`.

- [ ] **Step 1: RoleGuard conditionnel**

Remplacer le corps de `frontend/src/components/layout/RoleGuard.tsx` :

```tsx
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';

interface RoleGuardProps {
  children: React.ReactNode;
  minRole: Role;
}

export function RoleGuard({ children, minRole }: RoleGuardProps) {
  const { user, hasRole } = useAuthStore();

  if (!hasRole(minRole)) {
    // Un CLIENT ne peut pas aller au back-office : renvoyer vers son portail
    return <Navigate to={user?.role === 'CLIENT' ? '/portal/home' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: LoginPage honore state.from**

Dans `frontend/src/pages/auth/LoginPage.tsx` : ajouter `useLocation` à l'import react-router-dom et dans le composant :

```ts
  const location = useLocation();
```

Remplacer la ligne ~92 :

```ts
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(redirect ?? from ?? getRoleRedirect(user.role), { replace: true });
```

- [ ] **Step 3: Vérifier + commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run
git add frontend/src/components/layout/RoleGuard.tsx frontend/src/pages/auth/LoginPage.tsx
git commit -m "fix(frontend): redirect CLIENT out of back-office to portal, honor login return path

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Catégories produits persistées en DB (C1)

**Files:**
- Modify: `backend/src/modules/stocks/stocks.service.ts:693-726` (getCategories/addCategorie/deleteCategorie) + `createProduit`
- Test: `backend/src/modules/stocks/stocks.service.spec.ts` (nouveau)

**Interfaces:**
- Consumes: modèle `prisma.categorie` (Task 1).
- Produces: `getCategories(): Promise<string[]>` — lit la table ; si vide, la peuple depuis les produits distincts (transition) ; `addCategorie(nom): Promise<{categories: string[]}>` — upsert case-insensitive ; `deleteCategorie(nom)` — refuse si produits actifs, sinon delete. Le contrat API du contrôleur (lignes 154-168, `StocksController`) est inchangé.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `backend/src/modules/stocks/stocks.service.spec.ts`. **Attention** : vérifier d'abord le constructeur réel avec `grep -n "constructor" src/modules/stocks/stocks.service.ts` et instancier `new StocksService(prisma)` avec les bonnes dépendances mockées (adapter les arguments) :

```ts
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { StocksService } from './stocks.service';

describe('StocksService — catégories persistées', () => {
  let service: StocksService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      categorie: {
        findMany: jest.fn<any>(),
        findUnique: jest.fn<any>(),
        create: jest.fn<any>(),
        delete: jest.fn<any>(),
        createMany: jest.fn<any>(),
      },
      produit: {
        findMany: jest.fn<any>(),
        count: jest.fn<any>(),
      },
    };
    service = new StocksService(prisma as never);
  });

  it('seeds the table from distinct product categories when empty', async () => {
    prisma.categorie.findMany.mockResolvedValueOnce([]);
    prisma.produit.findMany.mockResolvedValueOnce([
      { categorie: 'Bio' }, { categorie: 'Cosmetiques' }, { categorie: 'Bio' },
    ]);
    prisma.categorie.createMany.mockResolvedValueOnce({ count: 2 });
    prisma.categorie.findMany.mockResolvedValueOnce([{ nom: 'Bio' }, { nom: 'Cosmetiques' }]);

    const categories = await service.getCategories();

    expect(prisma.categorie.createMany).toHaveBeenCalledWith({
      data: [{ nom: 'Bio' }, { nom: 'Cosmetiques' }],
      skipDuplicates: true,
    });
    expect(categories).toEqual(['Bio', 'Cosmetiques']);
  });

  it('reads existing categories without re-seeding', async () => {
    prisma.categorie.findMany.mockResolvedValue([{ nom: 'Bio' }]);

    const categories = await service.getCategories();

    expect(prisma.produit.findMany).not.toHaveBeenCalled();
    expect(categories).toEqual(['Bio']);
  });

  it('upserts a new category case-insensitively', async () => {
    prisma.categorie.findMany.mockResolvedValueOnce([{ nom: 'Bio' }]);

    await expect(service.addCategorie('Cosmetiques')).rejects.toThrow();
  });
});
```

(Le 3ᵉ test est volontairement faux : le corriger après lecture de l'implémentation du Step 2 — `addCategorie('Cosmetiques')` avec liste existante `['Bio']` doit créer, pas rejeter. Remplacer son corps par :

```ts
  it('creates a new category (case-insensitive check)', async () => {
    prisma.categorie.findMany.mockResolvedValueOnce([{ nom: 'Bio' }]);
    prisma.categorie.create.mockResolvedValueOnce({ nom: 'Cosmetiques' });
    prisma.categorie.findMany.mockResolvedValueOnce([{ nom: 'Bio' }, { nom: 'Cosmetiques' }]);

    const res = await service.addCategorie('Cosmetiques');

    expect(prisma.categorie.create).toHaveBeenCalledWith({ data: { nom: 'Cosmetiques' } });
    expect(res.categories).toEqual(['Bio', 'Cosmetiques']);
  });

  it('refuses a duplicate category (case-insensitive)', async () => {
    prisma.categorie.findMany.mockResolvedValueOnce([{ nom: 'Bio' }]);
    await expect(service.addCategorie('bio')).rejects.toThrow();
  });

  it('refuses to delete a category in use by active products', async () => {
    prisma.produit.count.mockResolvedValueOnce(3);
    await expect(service.deleteCategorie('Bio')).rejects.toThrow();
    expect(prisma.categorie.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused category', async () => {
    prisma.produit.count.mockResolvedValueOnce(0);
    prisma.categorie.findUnique.mockResolvedValueOnce({ id: 'cat-1', nom: 'Vieux' });
    prisma.categorie.delete.mockResolvedValueOnce({});
    prisma.categorie.findMany.mockResolvedValueOnce([]);

    const res = await service.deleteCategorie('Vieux');

    expect(prisma.categorie.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    expect(res.categories).toEqual([]);
  });
```

)

- [ ] **Step 2: Implémenter dans stocks.service.ts**

Remplacer les trois méthodes (lignes ~693-726) :

```ts
  // ── Catégories (table dédiée) ─────────────────────────────────────────────────

  async getCategories(): Promise<string[]> {
    let rows = await this.prisma.categorie.findMany({
      orderBy: { nom: 'asc' },
      select: { nom: true },
    });

    // Transition : peupler la table depuis les catégories portées par les produits
    if (rows.length === 0) {
      const distinct = await this.prisma.produit.findMany({
        select: { categorie: true },
        distinct: ['categorie'],
        orderBy: { categorie: 'asc' },
      });
      if (distinct.length > 0) {
        await this.prisma.categorie.createMany({
          data: distinct.map((d: { categorie: string }) => ({ nom: d.categorie })),
          skipDuplicates: true,
        });
        rows = await this.prisma.categorie.findMany({
          orderBy: { nom: 'asc' },
          select: { nom: true },
        });
      }
    }
    return rows.map((r: { nom: string }) => r.nom);
  }

  async addCategorie(nom: string): Promise<{ categories: string[] }> {
    const existing = await this.getCategories();
    if (existing.map((c) => c.toLowerCase()).includes(nom.toLowerCase())) {
      throw new ConflictException({ code: 'CATEGORIE_EXISTE', message: 'Cette catégorie existe déjà.' });
    }
    await this.prisma.categorie.create({ data: { nom } });
    return { categories: [...existing, nom].sort() };
  }

  async deleteCategorie(nom: string): Promise<{ categories: string[] }> {
    const count = await this.prisma.produit.count({ where: { categorie: nom, actif: true } });
    if (count > 0) {
      throw new BadRequestException({
        code: 'CATEGORIE_EN_USE',
        message: `Impossible de supprimer : ${count} produit(s) actif(s) dans cette catégorie.`,
      });
    }
    const row = await this.prisma.categorie.findUnique({ where: { nom } });
    if (row) {
      await this.prisma.categorie.delete({ where: { id: row.id } });
    }
    const remaining = await this.getCategories();
    return { categories: remaining.filter((c) => c !== nom) };
  }
```

3. Dans `createProduit`, après la création du produit (dans la même logique, hors transaction si la création ne l'est pas), ajouter la garantie que la catégorie existe :

```ts
    await this.prisma.categorie.upsert({
      where: { nom },
      update: {},
      create: { nom },
    }).catch(() => undefined); // best-effort : la table n'est qu'un index des catégories
```

(Insérer juste après le `this.prisma.produit.create(...)` ; adapter `nom` au champ catégorie réel du code — lire le contexte autour de la ligne 739 avant d'insérer.)

- [ ] **Step 3: Vérifier les tests**

```bash
cd backend && npx jest src/modules/stocks/stocks.service.spec.ts --verbose
```

Attendu : PASS. Si `StocksService` a d'autres dépendances dans son constructeur, les mocker avec `{}` et ajuster.

- [ ] **Step 4: Typecheck + tests complets + commit**

```bash
cd backend && npx tsc -p tsconfig.build.json --noEmit && npx jest
git add src/modules/stocks/
git commit -m "feat(stocks): persist product categories in dedicated table (was request-scoped only)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Corriger les logs mensongers du seed (C2)

**Files:**
- Modify: `backend/prisma/seed.ts:1031` (bloc RÉSUMÉ FINAL)

- [ ] **Step 1: Corriger les logs**

Dans `backend/prisma/seed.ts`, remplacer dans le bloc RÉSUMÉ FINAL :

```ts
  console.log('  • Utilisateurs (8)   : Super Admin (+243902238740), Dir. Régional, Gérants, Agents, Formateur');
```

par :

```ts
  console.log('  • Utilisateurs (1)   : Super Admin (+243902238740) — les comptes de démo sont désactivés (bloc if (false))');
```

- [ ] **Step 2: Commit**

```bash
cd backend && git add prisma/seed.ts
git commit -m "fix(seed): correct misleading user count in summary logs (only 1 user seeded)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Supprimer routes doublons, pages stubs et page parrainage orpheline (C4+C5+C6)

**Files:**
- Modify: `frontend/src/App.tsx:178` (retirer route `mlm/member/:id`)
- Delete: `frontend/src/pages/mlm/BonusesPage.tsx`, `frontend/src/pages/mlm/SalaryPage.tsx`, `frontend/src/pages/mlm/MemberMatrixPage.tsx`
- Delete: `frontend/src/pages/rapports/RapportParrainagePage.tsx`, `frontend/src/hooks/useParrainageReport.ts`

- [ ] **Step 1: Vérifier qu'aucun import ne référence ces fichiers**

```bash
cd frontend && grep -rn "BonusesPage\|SalaryPage\|MemberMatrixPage\|RapportParrainagePage\|useParrainageReport" src/ --include="*.tsx" --include="*.ts" | grep -v "^src/pages/mlm/BonusesPage\|^src/pages/mlm/SalaryPage\|^src/pages/mlm/MemberMatrixPage\|^src/pages/rapports/RapportParrainagePage\|^src/hooks/useParrainageReport"
```

Attendu : vide. Idem pour la route `mlm/member/` :

```bash
grep -rn "mlm/member/" src/ --include="*.tsx" --include="*.ts"
```

Attendu : seulement `App.tsx:178`.

- [ ] **Step 2: Supprimer**

```bash
cd frontend
rm src/pages/mlm/BonusesPage.tsx src/pages/mlm/SalaryPage.tsx src/pages/mlm/MemberMatrixPage.tsx src/pages/rapports/RapportParrainagePage.tsx src/hooks/useParrainageReport.ts
```

Et retirer la route dans `App.tsx:178` :

```tsx
            <Route path="mlm/member/:id" element={<RoleGuard minRole="AGENT"><MemberProgressPage /></RoleGuard>} />
```

- [ ] **Step 3: Vérifier build + tests + commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npm run build
git add -A src/
git commit -m "chore(frontend): remove stub pages, orphan parrainage report, duplicate mlm/member route

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: Nettoyer offline.ts (dashboardCache) et les vestiges fidélité (C7+C9)

**Files:**
- Modify: `frontend/src/lib/offline.ts` (retirer store `dashboardCache` + helpers, DB_VERSION 2→3)
- Modify: `frontend/src/store/cart.store.ts` (retirer `appliquerRemise`/`toggleRemise`/`remiseMontant`)
- Modify: `frontend/src/types/index.ts:46` (retirer `refreshToken` de `LoginResponse`)

- [ ] **Step 1: offline.ts**

Remplacer `const DB_VERSION = 2;` par `const DB_VERSION = 3;`, et l'upgrade par :

```ts
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        if (!database.objectStoreNames.contains('pending-ventes')) {
          database.createObjectStore('pending-ventes', { keyPath: 'localId' });
        }
        if (!database.objectStoreNames.contains('cache')) {
          database.createObjectStore('cache', { keyPath: 'key' });
        }
      }
      // v2 avait un store dashboardCache jamais utilisé → supprimé en v3
      if (oldVersion < 3 && database.objectStoreNames.contains('dashboardCache')) {
        database.deleteObjectStore('dashboardCache');
      }
    },
```

Et supprimer les fonctions `saveDashboardCache` / `getDashboardCache` (lignes 59-67).

- [ ] **Step 2: cart.store.ts**

Dans `frontend/src/store/cart.store.ts` :
1. Supprimer de l'interface `CartState` : la ligne `appliquerRemise: boolean;` (l.27) et `toggleRemise: () => void;` si présente dans l'interface (chercher `toggleRemise` dans l'interface).
2. Supprimer l'état initial `appliquerRemise: true,` (l.60), le getter `remiseMontant` (l.69-71) et `toggleRemise` (l.132).
3. Remplacer `montantNet` par :

```ts
  montantNet: () => {
    // Remises fidélité supprimées avec la migration MLM
    return get().montantBrut();
  },
```

4. Dans `resetAfterSale` et tout autre setter d'état (l.142,154), retirer `appliquerRemise: true,`.

Vérifier d'abord qu'aucun composant ne lit `appliquerRemise`/`toggleRemise` (grep confirmé vide à l'audit) :

```bash
cd frontend && grep -rn "appliquerRemise\|toggleRemise\|remiseMontant" src/pages src/components
```

Attendu : vide. (Si des usages existent dans `POSPage`, les retirer aussi.)

- [ ] **Step 3: types/index.ts**

Dans `frontend/src/types/index.ts`, retirer la ligne `refreshToken: string;` de l'interface `LoginResponse` (~l.46). Vérifier :

```bash
grep -rn "refreshToken" src/
```

Attendu : plus aucune occurrence front (le refresh passe par le cookie httpOnly dans `api.ts`).

- [ ] **Step 4: Build + tests + commit**

```bash
cd frontend && npx tsc -b --noEmit && npx vitest run && npm run build
git add src/
git commit -m "chore(frontend): drop unused IndexedDB dashboardCache store and dead loyalty/discount remnants

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 5: Test manuel IndexedDB (procédure)**

Ouvrir l'app (données v2 existantes), créer une vente offline, recharger : la vente doit rester dans `pending-ventes` (DevTools → IndexedDB, version 3, pas de store `dashboardCache`).

---

### Task 14: Corriger commentaires et CLAUDE.md (C10+C11)

**Files:**
- Modify: `backend/src/modules/clients/clients.service.ts:1153` (commentaire)
- Modify: `CLAUDE.md` (conventions code parrain + règle Auth)

- [ ] **Step 1: Commentaire clients.service.ts**

Remplacer (ligne ~1153) :

```ts
    // Générer un code parrain unique format TSG-XXXX
```

par :

```ts
    // Générer un code parrain unique au format AAAAMMJJ#### (ex: 202609010001)
```

- [ ] **Step 2: CLAUDE.md — convention code parrain**

Dans `CLAUDE.md`, section Conventions, remplacer :

```markdown
- **Code parrain** : format `TSG-XXXX` (incrémental par site)
```

par :

```markdown
- **Code parrain** : format `AAAAMMJJ####` (ex: `202609010001`) — les SKU produits utilisent `TSG-<CAT>-<seq>`
```

- [ ] **Step 3: CLAUDE.md — règle Auth**

Remplacer la règle 7 des Règles métier critiques :

```markdown
7. **Auth** : token JWT en mémoire uniquement (jamais localStorage) + httpOnly cookie refresh token
```

par :

```markdown
7. **Auth** : access token JWT en localStorage (clé `ebn_auth_v1` — session persiste au F5) + refresh token en cookie httpOnly
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md backend/src/modules/clients/clients.service.ts
git commit -m "docs: align CLAUDE.md and comments with reality (sponsor code format, auth token storage)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 15: Vérification finale globale

**Files:** aucun (vérification only)

- [ ] **Step 1: Backend — tous les tests + build**

```bash
cd backend && npx jest --verbose && npx tsc -p tsconfig.build.json --noEmit && npm run build
```

Attendu : 0 échec, 0 erreur.

- [ ] **Step 2: Frontend — tous les tests + build**

```bash
cd frontend && npx vitest run && npx tsc -b --noEmit && npm run build
```

Attendu : 0 échec, 0 erreur.

- [ ] **Step 3: Sweep des restes**

```bash
grep -rn "niveauFidelite" backend/src/ frontend/src/ ; grep -rn "PortailToken" backend/src/ backend/prisma/schema.prisma ; grep -rn "otpStore\|resetTokenStore" backend/src/ ; grep -rn "dashboardCache" frontend/src/ ; grep -rn "mlm/member/" frontend/src/
```

Attendu : tout vide.

- [ ] **Step 4: Statut migrations**

```bash
cd backend && npx prisma migrate status
```

Attendu : « Database schema is up to date! » (ou équivalent, aucune migration en attente).

- [ ] **Step 5: Rapport final à l'utilisateur**

Résumer : les 16 problèmes corrigés, les tests qui couvrent le flux de retrait, le test manuel offline effectué (Task 7 Step 4), et les points laissés volontairement de côté (route `internal/activate-member` inchangée — décision utilisateur ; section fidélité de la config générale conservée — moindre risque ; OTP resetToken passe de 10 à 15 min de validité selon la spec).

---

## Notes d'exécution

- **Ordre impératif** : Task 1 (migration) AVANT Tasks 4, 6, 10 qui consomment les nouveaux modèles Prisma. Les Tasks 2, 3, 5, 7-9, 11-14 sont indépendantes entre elles mais dépendent du typecheck propre.
- **Commits** : un par task, messages fournis. Ne jamais committer `.env`.
- **Si un test existant casse** après une modification : comprendre l'écart de comportement avant de modifier le test ; si le comportement voulu a changé (ex: `verifyOtp` incrémente les tentatives), mettre à jour le test pour figer le NOUVEAU comportement.
- **Section fidélité de ConfigGeneralePage** : laissée en l'état (décision moindre risque, spec C9). Ne pas la supprimer dans cette mission.
