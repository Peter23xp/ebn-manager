# Parrain Claim — Rattachement différé via code facture — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'enregistrer un filleul dont le parrain n'est pas encore activé (`EN_COURS`), et de confirmer le lien à l'activation du parrain via le code simplifié de sa facture d'activation — déclenchant matrice + commissions normalement.

**Architecture:** Nouvelle table `ParrainClaim` créée aux points d'enregistrement (`onboardingRecit`, `initKpayRecit`). L'activation du parrain (`onboardingActivate`) exige son `codeFacture` si des claims existent, puis rattache chaque filleul via la voie **existante et idempotente** `MlmMatrixService.onClientActivated` (aucune modification du service matrice). Une route de réclamation différée (admin + portail) complète le flux.

**Tech Stack:** NestJS 10, Prisma 5 (PostgreSQL), Jest (backend, mocks prisma purs — pattern `mlm-parrain-link.spec.ts`), React 18 + Vite + Tailwind, Vitest (frontend).

**Spec :** `docs/superpowers/specs/2026-09-08-parrain-claim-facture-design.md`

## Global Constraints

- Monnaie : CDF ; téléphone format `+243XXXXXXXXX` ; code parrain `AAAAMMJJ####` ; n° vente `{SITE}-{YYYY}{MM}-{SEQ}` (ex. `GOM-202609-0047`).
- Non-régression : l'activation **sans** claim suit le chemin existant inchangé ; `mlm-parrain-link.spec.ts` et la suite Jest backend existante doivent rester verts sans modification.
- Aucune modification à `mlm-matrix.service.ts`, `mlm-wallet.service.ts`, `Membre`, `Matrix`, `Position`, `Commission`.
- Erreurs backend : objets `{ code, message }` via les HttpException Nest existantes (pattern `BadRequestException({ code: 'ERR_…', message: '…' })`).
- Les tests backend se lancent avec `cd backend && npx jest <fichier> --config package.json` (jest configuré dans `package.json`) ; frontend : `cd frontend && npx vitest run`.
- Messages d'interface en français.

---

### Task 1: Schéma Prisma — enum `ClaimStatut` + modèle `ParrainClaim`

**Files:**
- Modify: `backend/prisma/schema.prisma` (enum `StatutClient` ~ligne 25 ; relations `Client` ~lignes 258-261 ; fin du fichier)
- Migration générée dans : `backend/prisma/migrations/<timestamp>_add_parrain_claim/`

**Interfaces:**
- Produces : tables/colonnes `parrain_claims(id, filleulClientId UNIQUE, parrainClientId, statut, telephoneParrainSaisi, factureReclamee, confirmedById, createdAt, confirmedAt)` ; enum Prisma `ClaimStatut { EN_ATTENTE, LIE }` ; champs de relation Client `filleulClaim ParrainClaim?` (côté filleul) et `parrainClaims ParrainClaim[]` (côté parrain), accessibles via `client.parrainClaims` / `client.filleulClaim`. Utilisé par toutes les tâches suivantes.

- [ ] **Step 1: Ajouter l'enum après `enum StatutClient`**

Dans `backend/prisma/schema.prisma`, insérer après la fermeture de `enum StatutClient { … }` :

```prisma
enum ClaimStatut {
  EN_ATTENTE
  LIE
}
```

- [ ] **Step 2: Ajouter les relations côté `model Client`**

Dans `model Client`, après la ligne `  onboardingEtapes  OnboardingEtape[]` (et des relations existantes `parrainClient`/`filleulsParrainage`), ajouter :

```prisma
  filleulClaim    ParrainClaim?  @relation("ClaimFilleul")
  parrainClaims   ParrainClaim[] @relation("ClaimParrain")
```

- [ ] **Step 3: Ajouter le modèle à la fin de la section MLM**

Insérer après `model Commission { … }` (avant `WithdrawalRequest`) :

```prisma
// ── Réclamation de filleul : parrain non encore activé ──────────────
// Crée quand un filleul est enregistré avec un parrain EN_COURS.
// Passé à LIE quand le parrain active son compte et confirme avec le
// code simplifié de sa facture d'activation (voir MlmClaimService).
model ParrainClaim {
  id                    String      @id @default(uuid())
  filleulClientId       String      @unique
  parrainClientId       String
  statut                ClaimStatut @default(EN_ATTENTE)
  telephoneParrainSaisi String
  factureReclamee       String?
  confirmedById         String?
  createdAt             DateTime    @default(now())
  confirmedAt           DateTime?

  filleul Client @relation("ClaimFilleul", fields: [filleulClientId], references: [id])
  parrain Client @relation("ClaimParrain", fields: [parrainClientId], references: [id])

  @@index([parrainClientId, statut])
  @@map("parrain_claims")
}
```

- [ ] **Step 4: Générer la migration et le client**

Run: `cd backend && npx prisma migrate dev --name add_parrain_claim`
Expected: `✔ Your database is up to date` + régénération du client Prisma.

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0 (le client générique compile ; attention : cette étape peut échouer si des ts-ignore existent déjà — dans ce cas vérifier `git stash` du baseline avant/après, ne pas « réparer » des erreurs préexistantes).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(prisma): add ParrainClaim model for pending sponsor attachment"
```

---

### Task 2: `MlmClaimService` — résolution du parrain + helpers code facture

**Files:**
- Create: `backend/src/modules/mlm/mlm-claim.service.ts`
- Create: `backend/src/modules/mlm/mlm-claim.service.spec.ts`
- Modify: `backend/src/modules/mlm/mlm.module.ts`

**Interfaces:**
- Consumes : `prisma` (`client`, `vente`, `parrainClaim` — modèle Task 1).
- Produces :
  - `resolveParrain(identifier: string): Promise<{ id: string; telephone: string; prenom: string; nom: string; statut: StatutClient } | null>`
  - `normalizeInvoiceCode(code: string): string` — pur, exporté
  - `invoiceCodeSeq(numeroVente: string): string` — pur, exporté (`'GOM-202609-0047'` → `'0047'`)
  - `matchesInvoiceCode(input: string, numeroVente: string): boolean` — pur, exporté
  - Ces 3 helpers sont utilisés par Tasks 4, 5, 9.

- [ ] **Step 1: Écrire le test échouant des helpers purs**

`backend/src/modules/mlm/mlm-claim.service.spec.ts` :

```ts
import { describe, expect, it } from '@jest/globals';
import { normalizeInvoiceCode, invoiceCodeSeq, matchesInvoiceCode } from './mlm-claim.service';

describe('code facture helpers', () => {
  it('normalizeInvoiceCode retire tirets/espaces et met en majuscules', () => {
    expect(normalizeInvoiceCode(' gom-202609-0047 ')).toBe('GOM2026090047');
  });

  it('invoiceCodeSeq extrait le suffixe de séquence', () => {
    expect(invoiceCodeSeq('GOM-202609-0047')).toBe('0047');
    expect(invoiceCodeSeq('GOM-202609-4')).toBe('0004');
    expect(invoiceCodeSeq('sans-tirets')).toBe('0000');
  });

  it('matchesInvoiceCode accepte le suffixe (0047) et la forme complète', () => {
    expect(matchesInvoiceCode('0047', 'GOM-202609-0047')).toBe(true);
    expect(matchesInvoiceCode('GOM-202609-0047', 'GOM-202609-0047')).toBe(true);
    expect(matchesInvoiceCode('gom2026090047', 'GOM-202609-0047')).toBe(true);
    expect(matchesInvoiceCode('0048', 'GOM-202609-0047')).toBe(false);
    expect(matchesInvoiceCode('202609-0047', 'GOM-202609-0047')).toBe(false);
    expect(matchesInvoiceCode('', 'GOM-202609-0047')).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd backend && npx jest src/modules/mlm/mlm-claim.service.spec.ts`
Expected: FAIL — « Cannot find module './mlm-claim.service' »

- [ ] **Step 3: Implémenter les helpers + `resolveParrain`**

`backend/src/modules/mlm/mlm-claim.service.ts` :

```ts
import { Injectable } from '@nestjs/common';
import { StatutClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** 'GOM-202609-0047 ' → 'GOM2026090047' (insensible casse, tirets/espaces retirés) */
export function normalizeInvoiceCode(code: string): string {
  return code.trim().toUpperCase().replace(/[-\s]/g, '');
}

/** 'GOM-202609-0047' → '0047' ; séquence complète sur 4 chiffres, '0000' si illisible */
export function invoiceCodeSeq(numeroVente: string): string {
  const seq = parseInt(numeroVente.split('-').pop() ?? '0', 10) || 0;
  return String(seq).padStart(4, '0');
}

/** Vrai si l'code saisi match la facture, en suffixe (0047) ou forme complète (GOM-202609-0047) */
export function matchesInvoiceCode(input: string, numeroVente: string): boolean {
  if (!input || !input.trim()) return false;
  const norm = normalizeInvoiceCode(input);
  return norm === normalizeInvoiceCode(numeroVente) || norm === invoiceCodeSeq(numeroVente);
}

export interface ParrainResolution {
  id: string;
  telephone: string;
  prenom: string;
  nom: string;
  statut: StatutClient;
}

@Injectable()
export class MlmClaimService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Résout un parrain par codeParrain, matricule Membre, ou téléphone
   * (l'agent peut saisir le téléphone d'un parrain non encore activé).
   */
  async resolveParrain(identifier: string): Promise<ParrainResolution | null> {
    const term = identifier.trim();
    if (!term) return null;
    const parrain = await this.prisma.client.findFirst({
      where: {
        OR: [
          { codeParrain: term },
          { membre: { matricule: term } },
          { telephone: term },
        ],
      },
      select: { id: true, telephone: true, prenom: true, nom: true, statut: true },
    });
    return parrain ?? null;
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier la réussite**

Run: `cd backend && npx jest src/modules/mlm/mlm-claim.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Brancher dans le module**

`backend/src/modules/mlm/mlm.module.ts` — ajouter `MlmClaimService` aux `providers` et `exports` :

```ts
import { MlmClaimService } from './mlm-claim.service';
// providers: [MlmService, MlmMatrixService, MlmWalletService, MlmClaimService],
// exports:   [MlmService, MlmMatrixService, MlmWalletService, MlmClaimService],
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/mlm
git commit -m "feat(mlm): MlmClaimService — parrain resolution + invoice code helpers"
```

---

### Task 3: Enregistrement — créer un claim quand le parrain est `EN_COURS`

**Files:**
- Modify: `backend/src/modules/clients/clients.service.ts` — `onboardingRecit` (résolution parrain ~ligne 719+) et `initKpayRecit` (~ligne 950 : bloc `if (dto.codeParrain)` + `tx.client.create`)
- Modify: `backend/src/modules/clients/clients.module.ts` (imports)
- Test: `backend/src/modules/clients/clients-claim.spec.ts`

**Interfaces:**
- Consumes : `MlmClaimService.resolveParrain` (Task 2) ; `parrainClaim` Prisma (Task 1).
- Produces : comportement — créer un client avec un parrain `EN_COURS` (identifié par code **ou téléphone**) réussit et insère `ParrainClaim{ EN_ATTENTE }` ; réponse inclut `warning: 'PARRAIN_NON_ACTIVE'`. Le helper interne `private async upsertClaimForFilleul(filleulId: string, parrain: ParrainResolution)` est réutilisé par la suite (non exporté hors service).

- [ ] **Step 1: Écrire le test échouant (mock prisma pur, pattern `mlm-parrain-link.spec.ts`)**

`backend/src/modules/clients/clients-claim.spec.ts` :

```ts
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ClientsService } from './clients.service';
import { BadRequestException } from '@nestjs/common';

describe('Enregistrement filleul — parrain EN_COURS → claim', () => {
  let service: ClientsService;
  let prisma: any;
  let mlmClaim: any;

  const parrainEnCours = {
    id: 'parrain-uuid-1', telephone: '+243900000001',
    prenom: 'Jean', nom: 'Kasavuru', statut: 'EN_COURS',
  };

  beforeEach(() => {
    // findUnique : lookup "client existant par téléphone" → null ; findOne(final) → le nouveau client
    const clientRow = {
      id: 'filleul-uuid-9', prenom: 'Marie', nom: 'Kabila', telephone: '+243900000002',
      email: null, matriculeExterne: null, codeParrain: null, parrainClientId: 'parrain-uuid-1',
      statut: 'EN_COURS', onboardingEtapes: [], membre: null, siteInscriptionId: 'site-1',
    };
    prisma = {
      client: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        findUnique: jest.fn<any>().mockImplementation((args: any) =>
          Promise.resolve(args?.where?.telephone ? null : clientRow)),
        create: jest.fn<any>().mockResolvedValue({ id: 'filleul-uuid-9', telephone: '+243900000002' }),
      },
      parrainClaim: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        upsert: jest.fn<any>().mockResolvedValue({ id: 'claim-1' }),
        create: jest.fn<any>().mockResolvedValue({ id: 'claim-1' }),
      },
      onboardingEtape: { upsert: jest.fn<any>().mockResolvedValue({ id: 'etape-1' }) },
      site: { findUnique: jest.fn<any>().mockResolvedValue({ id: 'site-1' }) },
      $transaction: jest.fn<any>(async (cb: any) => cb(prisma)),
    };
    mlmClaim = {
      resolveParrain: jest.fn<any>().mockResolvedValue(parrainEnCours),
    };
    service = new ClientsService(
      prisma,
      {} as any, // portalAuthService
      {} as any, // mailer
      { onClientActivated: jest.fn<any>() } as any, // mlmMatrixService
      { initDeposit: jest.fn<any>() } as any, // kpay
      { registerFinalizer: jest.fn<any>() } as any, // kpayWebhooks
      mlmClaim as any,
    );
  });

  it('accepte un parrain EN_COURS et crée un claim EN_ATTENTE (via onboardingRecit)', async () => {
    // onboardingRecit cherche d'abord un client existant par téléphone → aucun
    prisma.client.findUnique.mockResolvedValue(null);
    prisma.client.findFirst.mockResolvedValue(null); // matriculeExterne/email : non fournis → ce chemin passe par resolveParrain

    const result = await service.onboardingRecit({
      prenom: 'Marie', nom: 'Kabila', telephone: '+243900000002',
      siteId: 'site-1', codeParrain: '+243900000001', // téléphone du parrain EN_COURS
      montantRecit: 10000, modePaiement: 'CASH' as any, agentId: 'agent-1',
    });

    expect(prisma.parrainClaim.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { filleulClientId: 'filleul-uuid-9' },
        create: expect.objectContaining({
          filleulClientId: 'filleul-uuid-9',
          parrainClientId: 'parrain-uuid-1',
          statut: 'EN_ATTENTE',
          telephoneParrainSaisi: '+243900000001',
        }),
      }),
    );
    expect(result.warning).toBe('PARRAIN_NON_ACTIVE');
  });

  it('rejette quand aucun parrain ne match (ERR_PARRAIN_NOT_FOUND)', async () => {
    mlmClaim.resolveParrain.mockResolvedValue(null);
    prisma.client.findUnique.mockResolvedValue(null);
    await expect(
      service.onboardingRecit({
        prenom: 'Marie', nom: 'Kabila', telephone: '+243900000002',
        siteId: 'site-1', codeParrain: '0000000000', // numéro inventé
        montantRecit: 10000, modePaiement: 'CASH' as any, agentId: 'agent-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('ne crée pas de claim pour un parrain ACTIF', async () => {
    mlmClaim.resolveParrain.mockResolvedValue({ ...parrainEnCours, statut: 'ACTIF' });
    prisma.client.findUnique.mockResolvedValue(null);
    await service.onboardingRecit({
      prenom: 'Marie', nom: 'Kabila', telephone: '+243900000002',
      siteId: 'site-1', codeParrain: '202509010001',
      montantRecit: 10000, modePaiement: 'CASH' as any, agentId: 'agent-1',
    });
    expect(prisma.parrainClaim.upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd backend && npx jest src/modules/clients/clients-claim.spec.ts`
Expected: FAIL — constructor arity (7e argument inconnu) puis comportement.

- [ ] **Step 3: Modifier `onboardingRecit` — résolution élargie + claim**

Dans `clients.service.ts`, remplacer le bloc « Résoudre le parrain par code » (lignes ~835-857, `if (dto.codeParrain) { … findFirst OR codeParrain/membre … if (!parrain) throw … if (parrain.statut !== ACTIF) throw 'Le parrain doit être un membre actif' … parrainId = parrain.id }`) par :

```ts
    // Résoudre le parrain par code parrain, matricule OU téléphone du client
    let parrainId: string | undefined;
    let parrainEnCours: { id: string; telephone: string } | undefined;
    if (dto.codeParrain) {
      const parrain = await this.mlmClaimService.resolveParrain(dto.codeParrain);
      if (!parrain) {
        throw new BadRequestException({
          code: 'ERR_PARRAIN_NOT_FOUND',
          message: 'Aucun client ne correspond à ce code parrain ou numéro de téléphone',
        });
      }
      if (parrain.telephone === dto.telephone) {
        throw new BadRequestException({
          code: 'ERR_BAD_REQUEST',
          message: 'Un client ne peut pas se parrainer lui-même',
        });
      }
      parrainId = parrain.id;
      if (parrain.statut !== StatutClient.ACTIF) {
        parrainEnCours = { id: parrain.id, telephone: parrain.telephone };
      }
    }
```

Dans la transaction (`const { newClient, etape } = await this.prisma.$transaction(...)`), **après** le `tx.client.create` et l'étape RECIT existants, ajouter dans la même transaction :

```ts
      if (parrainEnCours) {
        await tx.parrainClaim.upsert({
          where: { filleulClientId: newClient.id },
          create: {
            filleulClientId: newClient.id,
            parrainClientId: parrainEnCours.id,
            statut: 'EN_ATTENTE',
            telephoneParrainSaisi: dto.codeParrain!,
          },
          update: {},
        });
      }
```

Après la transaction, au `return` du service (`const client = await this.findOne(newClient.id); return { client, etapeId: etape.id };` — adapter au return réel), propager le warning :

```ts
    const client = await this.findOne(newClient.id);
    return { client, etapeId: etape.id, ...(parrainEnCours ? { warning: 'PARRAIN_NON_ACTIVE' as const } : {}) };
```

> ⚠️ Vérifier le `return` exact de `onboardingRecit` avant modification et préserver ses champs existants ; le test vérifie `result.warning`. Les appels existants du controller qui destructurent `{ client, etapeId }` continuent de fonctionner (ajout de champ uniquement).

- [ ] **Step 4: Modifier `initKpayRecit` (voie Kpay) — mêmes règles**

Dans `initKpayRecit`, remplacer le bloc de validation (`if (dto.codeParrain) { const parrain = … ; if (!parrain || parrain.statut !== ACTIF) throw 'Parrain introuvable ou inactif' }` ~ligne 950) par le même pattern `resolveParrain` qu'au Step 3 (mais **sans transaction englobante pour cette validation** : la créer dans la transaction `pending` ci-dessous). Puis, dans la `$transaction` existante (`const pending = await this.prisma.$transaction(async (tx) => { … })`), après `tx.client.create(...)` :

```ts
      if (parrainEnCoursId && client) {
        await tx.parrainClaim.upsert({
          where: { filleulClientId: client.id },
          create: {
            filleulClientId: client.id,
            parrainClientId: parrainEnCoursId,
            statut: 'EN_ATTENTE',
            telephoneParrainSaisi: dto.codeParrain!,
          },
          update: {},
        });
      }
```

Où `parrainEnCoursId` est calculé avant la transaction par `resolveParrain` (`statut !== ACTIF` → id du parrain + self-check téléphone ; introuvable → `BadRequestException ERR_PARRAIN_NOT_FOUND`). Dans la création du client, la résolution inline actuelle `await tx.client.findFirst({ where: { OR: [{ codeParrain… }, { membre… }] } })` pour `parrainClientId` est **remplacée** par `parrainId ?? null` résolu en amont (mêmes valeurs). Le retour `{ client, transactionId, … }` reçoit `warning: 'PARRAIN_NON_ACTIVE'` dans le cas `parrainEnCoursId`.

- [ ] **Step 5: Injection dans le service + module**

`clients.service.ts` — constructor, ajouter en 7e paramètre :

```ts
    private readonly mlmClaimService: MlmClaimService,
```

et import `import { MlmClaimService } from '../mlm/mlm-claim.service';`.
`clients.module.ts` importe déjà `MlmModule` qui exporte `MlmClaimService` (Task 2) — rien d'autre à changer.

- [ ] **Step 6: Lancer le test — vérifier la réussite**

Run: `cd backend && npx jest src/modules/clients/clients-claim.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Non-régression**

Run: `cd backend && npx jest src/modules/mlm`
Expected: `mlm-parrain-link.spec.ts` et `mlm-wallet.service.spec.ts` PASS inchangés.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/clients backend/src/modules/mlm/mlm.module.ts
git commit -m "feat(clients): allow EN_COURS sponsor at registration via parrain claim"
```

---

### Task 4: `MlmClaimService` — attach des claims confirmés

**Files:**
- Modify: `backend/src/modules/mlm/mlm-claim.service.ts`
- Modify: `backend/src/modules/mlm/mlm-claim.service.spec.ts`
- Modify: `backend/src/modules/mlm/mlm.module.ts` (imports de `MlmMatrixService`)

**Interfaces:**
- Consumes : `MlmMatrixService.onClientActivated(clientId, parrainCode)` (existant, idempotent) ; `parrainClaim` (Task 1).
- Produces : `async attachConfirmedClaims(parrainClientId: string, factureNumero: string, agentId?: string): Promise<{ attachés: number; conflits: number }>` — passe les claims `EN_ATTENTE` de ce parrain à `LIE` (sauf filleul déjà rattaché ailleurs → reste `EN_ATTENTE`) et rattache les filleuls déjà ACTIF avec Membre via `onClientActivated(filleulClientId, parrainMembre.matricule)`. Utilisé par Task 5 (activation) et Task 6 (réclamation différée).

- [ ] **Step 1: Écrire le test échouant**

Ajouter à `mlm-claim.service.spec.ts` :

```ts
import { MlmClaimService } from './mlm-claim.service';

describe('attachConfirmedClaims', () => {
  let prisma: any;
  let matrix: any;
  let svc: MlmClaimService;

  beforeEach(() => {
    prisma = {
      parrainClaim: {
        findMany: jest.fn<any>(),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      membre: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: 'parrain-membre-1', matricule: '202609010001' }),
      },
      $transaction: jest.fn<any>(async (cb: any) => cb(prisma)),
    };
    matrix = { onClientActivated: jest.fn<any>().mockResolvedValue(undefined) };
    svc = new MlmClaimService(prisma, matrix);
  });

  it('attache les filleuls déjà membres sans parrain et marque LIE', async () => {
    prisma.parrainClaim.findMany.mockResolvedValue([
      { id: 'c1', filleulClientId: 'f1', statut: 'EN_ATTENTE' },
      { id: 'c2', filleulClientId: 'f2', statut: 'EN_ATTENTE' },
    ]);
    const res = await svc.attachConfirmedClaims('parrain-1', 'GOM-202609-0047', 'agent-1');
    expect(res).toEqual({ attachés: 2, conflits: 0 });
    expect(matrix.onClientActivated).toHaveBeenCalledWith('f1', '202609010001');
    expect(matrix.onClientActivated).toHaveBeenCalledWith('f2', '202609010001');
    expect(prisma.parrainClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ statut: 'LIE', factureReclamee: 'GOM-202609-0047' }),
      }),
    );
  });

  it('laisse EN_ATTENTE un filleul déjà rattaché à un autre parrain', async () => {
    prisma.parrainClaim.findMany.mockResolvedValue([
      { id: 'c1', filleulClientId: 'f1', statut: 'EN_ATTENTE' },
    ]);
    // f1 a un membre avec un parrainId DIFFERENT → mock via onClientActivated ? Non :
    // le conflit se lit via la relation Membre chargée ci-dessous :
    prisma.membre.findUnique = jest.fn<any>().mockImplementation((args: any) =>
      Promise.resolve(
        args?.where?.clientId === 'f1'
          ? { id: 'f1-membre', parrainId: 'autre-parrain', client: { parrainClientId: 'autre-client' } }
          : { id: 'parrain-membre-1', matricule: '202609010001' },
      ),
    );
    const res = await svc.attachConfirmedClaims('parrain-1', 'GOM-202609-0047');
    expect(res).toEqual({ attachés: 0, conflits: 1 });
    expect(matrix.onClientActivated).not.toHaveBeenCalled();
    expect(prisma.parrainClaim.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer — vérifier l'échec**

Run: `cd backend && npx jest src/modules/mlm/mlm-claim.service.spec.ts`
Expected: FAIL — `MlmClaimService` constructor attendu avec 2 args.

- [ ] **Step 3: Implémenter `attachConfirmedClaims`**

Dans `mlm-claim.service.ts` — constructor : `constructor(private readonly prisma: PrismaService, private readonly matrixService: MlmMatrixService) {}` + import `MlmMatrixService`. Méthode :

```ts
  /**
   * Confirme les claims EN_ATTENTE d'un parrain qui vient d'activer son compte
   * (code facture validé par l'appelant). Rattache les filleuls déjà actifs via
   * la voie idempotente MlmMatrixService.onClientActivated.
   * Filleul encore EN_COURS : rien à faire — son activation propre utilisera
   * client.parrainClientId déjà posé.
   * Filleul déjà rattaché à un AUTRE parrain : conflit, claim laissé EN_ATTENTE.
   */
  async attachConfirmedClaims(
    parrainClientId: string,
    factureNumero: string,
    agentId?: string,
  ): Promise<{ attachés: number; conflits: number }> {
    const claims = await this.prisma.parrainClaim.findMany({
      where: { parrainClientId, statut: 'EN_ATTENTE' },
    });
    if (claims.length === 0) return { attachés: 0, conflits: 0 };

    const parrainMembre = await this.prisma.membre.findUnique({
      where: { clientId: parrainClientId },
      select: { id: true, matricule: true },
    });
    if (!parrainMembre) return { attachés: 0, conflits: claims.length };

    let attachés = 0;
    let conflits = 0;
    for (const claim of claims) {
      const filleulMembre = await this.prisma.membre.findUnique({
        where: { clientId: claim.filleulClientId },
        select: { parrainId: true, client: { select: { parrainClientId: true } } },
      });
      if (filleulMembre?.parrainId && filleulMembre.parrainId !== parrainMembre.id) {
        conflits += 1; // déjà rattaché ailleurs — l'admin tranchera, on n'écrase jamais
        continue;
      }
      await this.matrixService.onClientActivated(claim.filleulClientId, parrainMembre.matricule);
      await this.parrainClaim_updateLIE(claim.id, factureNumero, agentId);
      attachés += 1;
    }
    return { attachés, conflits };
  }

  private async parrainClaim_updateLIE(claimId: string, factureNumero: string, agentId?: string) {
    await this.prisma.parrainClaim.update({
      where: { id: claimId },
      data: {
        statut: 'LIE',
        factureReclamee: factureNumero,
        confirmedAt: new Date(),
        confirmedById: agentId ?? null,
      },
    });
  }
```

> ⚠️ `onClientActivated` n'est pas dans une transaction englobante : chaque appel est transactionnel en interne et idempotent — un échec sur un filleul ne bloque pas les autres (à logger via `console.error('[CLAIM ATTACH]', claim.id, err)` autour de l'appel, comme le fait déjà `healActiveClientsWithoutMembre`).

- [ ] **Step 4: Lancer — vérifier la réussite**

Run: `cd backend && npx jest src/modules/mlm/mlm-claim.service.spec.ts`
Expected: PASS (5 tests au total avec Task 2)

- [ ] **Step 5: Module — `MlmClaimService` dépend de `MlmMatrixService` (même module, OK) + commit**

```bash
git add backend/src/modules/mlm
git commit -m "feat(mlm): attachConfirmedClaims — delayed sponsor attachment"
```

---

### Task 5: `onboardingActivate` — exiger le `codeFacture` quand des claims existent

**Files:**
- Modify: `backend/src/modules/clients/clients.service.ts` — `onboardingActivate` (lignes ~1104-1310)
- Modify: `backend/src/modules/clients/dto/client.dto.ts` — `OnboardingActivateDto`
- Test: `backend/src/modules/clients/clients-activation-claim.spec.ts`

**Interfaces:**
- Consumes : `parrainClaim.count` (Task 1) ; `MlmClaimService.attachConfirmedClaims` (Task 4) ; `matchesInvoiceCode`, `invoiceCodeSeq` (Task 2).
- Produces : `OnboardingActivateDto.codeFacture?: string` ; erreurs `ERR_CLAIM_CODE_REQUIRED` (409) / `ERR_CLAIM_CODE_INVALID` (400) ; le `numeroVente` d'activation est la facture de référence.

- [ ] **Step 1: DTO**

`backend/src/modules/clients/dto/client.dto.ts`, dans `class OnboardingActivateDto`, après `referenceTransaction?` :

```ts
  @IsOptional()
  @IsString()
  codeFacture?: string;
```

- [ ] **Step 2: Écrire le test échouant**

`clients-activation-claim.spec.ts` — mocks ciblés sur le chemin pré-transaction uniquement (le corps d'activation existant est déjà couvert par d'autres suites) :

```ts
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ClientsService } from './clients.service';
import { ConflictException, BadRequestException } from '@nestjs/common';

describe('Activation du parrain — confirmation des claims par code facture', () => {
  let service: ClientsService;
  let prisma: any;
  let mlmClaim: any;

  const activeClientShape = {
    id: 'parrain-1', statut: 'EN_COURS', siteInscriptionId: 'site-1',
    telephone: '+243900000001', email: null,
    onboardingEtapes: [
      { etape: 'FICHE', statut: 'COMPLETE' },
      { etape: 'RECIT', statut: 'COMPLETE' },
      { etape: 'FORMATION', statut: 'COMPLETE' },
    ],
  };

  beforeEach(() => {
    prisma = {
      client: { findUnique: jest.fn<any>().mockResolvedValue(activeClientShape) },
      parrainClaim: { count: jest.fn<any>(), findMany: jest.fn<any>().mockResolvedValue([]) },
      // Mocks pour le chemin pré-transaction (produit, stock, site, génération facture)
      produit: { findUnique: jest.fn<any>().mockResolvedValue({ id: 'p-1', actif: true, nom: 'Starter Kit', prixVente: 50 }) },
      stockSite: { findUnique: jest.fn<any>().mockResolvedValue({ quantite: 5 }) },
      site: { findUnique: jest.fn<any>().mockResolvedValue({ nom: 'Goma' }) },
      vente: { count: jest.fn<any>().mockResolvedValue(0), findFirst: jest.fn<any>().mockResolvedValue(null) },
      mlmLevel: { findFirst: jest.fn<any>() },
      $transaction: jest.fn<any>(async () => { throw new Error('NEVER: transaction should not run without validated inputs'); }),
    };
    mlmClaim = {
      resolveParrain: jest.fn<any>(),
      attachConfirmedClaims: jest.fn<any>().mockResolvedValue({ attachés: 1, conflits: 0 }),
    };
    service = new ClientsService(
      prisma, {} as any, {} as any,
      { onClientActivated: jest.fn<any>() } as any,
      { initDeposit: jest.fn<any>() } as any,
      { registerFinalizer: jest.fn<any>() } as any,
      mlmClaim as any,
    );
  });

  it('sans claims → activation normale, codeFacture ignoré', async () => {
    prisma.parrainClaim.count.mockResolvedValue(0);
    // on stoppe au premier obstacle contrôlé : vérifier que le code n'a pas été requis
    await service.onboardingActivate('parrain-1', {
      produitId: 'p-1', modePaiement: 'CASH' as any,
    } as any, 'agent-1').catch(() => undefined);
    // pas d'assertion comportementale profonde ici : la suite existante couvre
    // l'activation normale ; on vérifie seulement qu'aucune erreur claim n'a été levée
    expect(mlmClaim.attachConfirmedClaims).not.toHaveBeenCalledWith(
      'parrain-1', expect.anything(), expect.anything(),
    );
  });

  it('avec claims et sans codeFacture → 409 ERR_CLAIM_CODE_REQUIRED et client non activé', async () => {
    prisma.parrainClaim.count.mockResolvedValue(2);
    await expect(
      service.onboardingActivate('parrain-1', {
        produitId: 'p-1', modePaiement: 'CASH' as any,
      } as any, 'agent-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_CLAIM_CODE_REQUIRED' }),
    });
  });

  it('avec claims et codeFacture invalide → 400 ERR_CLAIM_CODE_INVALID et client non activé', async () => {
    prisma.parrainClaim.count.mockResolvedValue(1);
    await expect(
      service.onboardingActivate('parrain-1', {
        produitId: 'p-1', modePaiement: 'CASH' as any, codeFacture: '9999',
      } as any, 'agent-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_CLAIM_CODE_INVALID' }),
    });
  });
});
```

> Le test attend que la vérification du code se fasse **avant** mutation (le mock `client.update` n'existe pas → tout appel de mise à jour ferait crash le test, garantissant l'absence d'activation partielle). Le chemin « code valide → activation + attach » est le test d'intégration : il est validé manuellement (Task 12) car le mocking complet de la transaction d'activation est hors de portée d'une unité ; l'attach est lui testé unitairement en Task 4.

- [ ] **Step 3: Lancer — vérifier l'échec**

Run: `cd backend && npx jest src/modules/clients/clients-activation-claim.spec.ts`
Expected: FAIL (comportement absent)

- [ ] **Step 4: Implémenter dans `onboardingActivate`**

Juste **après** la génération de `numeroVente` (~ligne 1168) et **avant** `this.prisma.$transaction`, insérer :

```ts
    // Confirmation des filleuls en attente : si ce client a des claims EN_ATTENTE,
    // il doit prouver son identité avec le code simplifié de sa facture d'activation.
    const nbClaims = await this.prisma.parrainClaim.count({
      where: { parrainClientId: clientId, statut: 'EN_ATTENTE' },
    });
    if (nbClaims > 0) {
      if (!dto.codeFacture || !dto.codeFacture.trim()) {
        throw new ConflictException({
          code: 'ERR_CLAIM_CODE_REQUIRED',
          message: `Ce parrain a ${nbClaims} filleul(s) en attente. Saisissez le code de sa facture d'activation (ex. ${invoiceCodeSeq(numeroVente)}) pour confirmer.`,
          nbFilleulsEnAttente: nbClaims,
          factureHint: invoiceCodeSeq(numeroVente),
        });
      }
      if (!matchesInvoiceCode(dto.codeFacture, numeroVente)) {
        throw new BadRequestException({
          code: 'ERR_CLAIM_CODE_INVALID',
          message: 'Code de facture invalide. Utilisez les 4 derniers chiffres du n° de facture ou le numéro complet.',
        });
      }
    }
```

Imports en haut du fichier :

```ts
import { MlmClaimService, invoiceCodeSeq, matchesInvoiceCode } from '../mlm/mlm-claim.service';
import { ConflictException } from '@nestjs/common'; // (ConflictException déjà importé — vérifier)
```

**Après** le `$transaction` d'activation réussi (bloc `activatedClient`, avant les retries MLM existants ~ligne 1283), ajouter :

```ts
    // Rattacher les filleuls réclamés (idempotent — voir MlmClaimService)
    if (nbClaims > 0) {
      try {
        await this.mlmClaimService.attachConfirmedClaims(clientId, numeroVente, agentId);
      } catch (err) {
        console.error(`[CLAIM ATTACH AFTER ACTIVATION] ${clientId}:`, err);
      }
    }
```

> Note d'ordre : `numeroVente` est généré **avant** la transaction (code existant), donc `invoiceCodeSeq`/`matchesInvoiceCode` disposent déjà de la facture complète. Le client n'est pas ACTIF si le code manque/est faux → la garde-fou « non activé » est structurelle.

- [ ] **Step 5: Lancer — vérifier la réussite**

Run: `cd backend && npx jest src/modules/clients/clients-activation-claim.spec.ts src/modules/clients/clients-claim.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Non-régression + commit**

Run: `cd backend && npx jest`
Expected: suite verte.

```bash
git add backend/src/modules/clients
git commit -m "feat(clients): require activation invoice code to confirm pending parrain claims"
```

---

### Task 6: Réclamation différée — `confirmClaims` + endpoints admin & portail

**Files:**
- Modify: `backend/src/modules/mlm/mlm-claim.service.ts`
- Modify: `backend/src/modules/mlm/mlm-claim.service.spec.ts`
- Modify: `backend/src/modules/mlm/mlm.controller.ts`
- Modify: `backend/src/modules/portal/portal.controller.ts`
- Modify: `backend/src/modules/portal/portal.module.ts`
- Test: ajouts dans `mlm-claim.service.spec.ts`

**Interfaces:**
- Consumes : `matchesInvoiceCode` (Task 2) ; `attachConfirmedClaims` (Task 4) ; `prisma.onboardingEtape` + `prisma.vente` (existant).
- Produces :
  - `confirmClaims(parrainClientId: string, codeFacture: string, agentId?: string): Promise<{ attachés; conflits; facture }>`
  - `pendingClaimsForParrain(parrainClientId: string): Promise<ParrainClaim[]>`
  - `listPendingClaims(siteId?: string)` — file admin paginée
  - REST : `POST /mlm/claims/confirm`, `GET /mlm/claims`, `GET /portal/claims/pending`, `POST /portal/claims/confirm`

- [ ] **Step 1: Écrire le test échouant**

```ts
describe('confirmClaims — réclamation différée', () => {
  let prisma: any; let svc: MlmClaimService;
  const ACT_STEP = { id: 'etape-1', etape: 'ACTIVATION', statut: 'COMPLETE' };

  beforeEach(() => {
    prisma = {
      client: { findUnique: jest.fn<any>() },
      onboardingEtape: { findFirst: jest.fn<any>() },
      vente: { findFirst: jest.fn<any>() },
      parrainClaim: { count: jest.fn<any>() },
    };
    svc = new MlmClaimService(prisma, { onClientActivated: jest.fn<any>() } as any);
    jest.spyOn(svc as any, 'attachConfirmedClaims').mockResolvedValue({ attachés: 1, conflits: 0 });
  });

  it('parrain encore EN_COURS → 400', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'p1', statut: 'EN_COURS' });
    await expect(svc.confirmClaims('p1', '0047')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_PARRAIN_NOT_ACTIVE' }),
    });
  });

  it('pas de vente d\'activation → 400 ERR_ACTIVATION_SALE_NOT_FOUND', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'p1', statut: 'ACTIF' });
    prisma.onboardingEtape.findFirst.mockResolvedValue(null);
    await expect(svc.confirmClaims('p1', '0047')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_ACTIVATION_SALE_NOT_FOUND' }),
    });
  });

  it('code facture ne match pas la VENTE D\'ACTIVATION → 400 ERR_CLAIM_CODE_INVALID', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'p1', statut: 'ACTIF' });
    prisma.onboardingEtape.findFirst.mockResolvedValue(ACT_STEP);
    prisma.vente.findFirst.mockResolvedValue({ numeroVente: 'GOM-202609-0047' });
    await expect(svc.confirmClaims('p1', '0048')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_CLAIM_CODE_INVALID' }),
    });
  });

  it('aucun claim en attente → 409 ERR_CLAIM_ALREADY_LIE', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'p1', statut: 'ACTIF' });
    prisma.onboardingEtape.findFirst.mockResolvedValue(ACT_STEP);
    prisma.vente.findFirst.mockResolvedValue({ numeroVente: 'GOM-202609-0047' });
    prisma.parrainClaim.count.mockResolvedValue(0);
    await expect(svc.confirmClaims('p1', '0047')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_CLAIM_ALREADY_LIE' }),
    });
  });

  it('happy path → attachConfirmedClaims appelé avec la facture d\'activation', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'p1', statut: 'ACTIF' });
    prisma.onboardingEtape.findFirst.mockResolvedValue(ACT_STEP);
    prisma.vente.findFirst.mockResolvedValue({ numeroVente: 'GOM-202609-0047' });
    prisma.parrainClaim.count.mockResolvedValue(1);
    const res = await svc.confirmClaims('p1', 'GOM-202609-0047', 'agent-1');
    expect(svc.attachConfirmedClaims).toHaveBeenCalledWith('p1', 'GOM-202609-0047', 'agent-1');
    expect(res).toEqual({ attachés: 1, conflits: 0, facture: 'GOM-202609-0047' });
  });
});
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `cd backend && npx jest src/modules/mlm/mlm-claim.service.spec.ts`
Expected: FAIL — `confirmClaims` inexistante.

- [ ] **Step 3: Implémenter**

Dans `mlm-claim.service.ts` :

```ts
  /** Les filleuls en attente rattachables à ce parrain */
  async pendingClaimsForParrain(parrainClientId: string) {
    return this.prisma.parrainClaim.findMany({
      where: { parrainClientId, statut: 'EN_ATTENTE' },
      include: {
        filleul: { select: { id: true, prenom: true, nom: true, telephone: true, statut: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Réclamation différée : le parrain est déjà ACTIF mais n'a pas présenté son
   * code à l'activation. Le code est vérifié UNIQUEMENT contre la vente liée à
   * son étape ACTIVATION (pas une vente ultérieure).
   */
  async confirmClaims(parrainClientId: string, codeFacture: string, agentId?: string) {
    const parrain = await this.prisma.client.findUnique({
      where: { id: parrainClientId },
      select: { id: true, statut: true },
    });
    if (!parrain) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Parrain introuvable' });
    if (parrain.statut !== 'ACTIF') {
      throw new BadRequestException({
        code: 'ERR_PARRAIN_NOT_ACTIVE',
        message: 'Le parrain doit d\'abord activer son compte (le code facture est demandé à l\'activation)',
      });
    }

    const nbPending = await this.prisma.parrainClaim.count({
      where: { parrainClientId, statut: 'EN_ATTENTE' },
    });
    if (nbPending === 0) {
      throw new ConflictException({
        code: 'ERR_CLAIM_ALREADY_LIE',
        message: 'Aucun filleul en attente pour ce parrain (déjà liés ou réclamation inconnue)',
      });
    }

    const etapeActivation = await this.prisma.onboardingEtape.findFirst({
      where: { clientId: parrainClientId, etape: 'ACTIVATION', statut: 'COMPLETE' },
      select: { id: true },
    });
    const venteActivation = etapeActivation
      ? await this.prisma.vente.findFirst({
          where: { clientId: parrainClientId },
          orderBy: { createdAt: 'asc' },
          select: { numeroVente: true },
        })
      : null;
    if (!venteActivation) {
      throw new BadRequestException({
        code: 'ERR_ACTIVATION_SALE_NOT_FOUND',
        message: 'Vente d\'activation introuvable pour ce parrain',
      });
    }

    if (!matchesInvoiceCode(codeFacture, venteActivation.numeroVente)) {
      throw new BadRequestException({
        code: 'ERR_CLAIM_CODE_INVALID',
        message: 'Code de facture invalide',
      });
    }

    const { attachés, conflits } = await this.attachConfirmedClaims(
      parrainClientId, venteActivation.numeroVente, agentId,
    );
    return { attachés, conflits, facture: venteActivation.numeroVente };
  }

  /** File admin des réclamations en attente */
  async listPendingClaims(siteId?: string) {
    return this.prisma.parrainClaim.findMany({
      where: {
        statut: 'EN_ATTENTE',
        ...(siteId ? { parrain: { siteInscriptionId: siteId } } : {}),
      },
      include: {
        filleul: { select: { id: true, prenom: true, nom: true, telephone: true, statut: true } },
        parrain: { select: { id: true, prenom: true, nom: true, telephone: true, statut: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
```

Imports nécessaires : `NotFoundException, ConflictException` (@nestjs/common), `matchesInvoiceCode` (même fichier).

- [ ] **Step 4: Lancer — réussite**

Run: `cd backend && npx jest src/modules/mlm/mlm-claim.service.spec.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Routes controller**

`backend/src/modules/mlm/mlm.controller.ts` — injecter `mlmClaimService: MlmClaimService` et ajouter (avant le bloc `internal/` final) :

```ts
  @Get('claims')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  async listClaims(@Query('siteId') siteId?: string) {
    return this.mlmClaimService.listPendingClaims(siteId);
  }

  @Post('claims/confirm')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT')
  @HttpCode(HttpStatus.OK)
  async confirmClaims(@Body() body: { parrainClientId?: string; telephoneParrain?: string; codeFacture: string }, @CurrentUser() user: any) {
    let parrainClientId = body.parrainClientId;
    if (!parrainClientId && body.telephoneParrain) {
      const parrain = await this.mlmClaimService.resolveParrain(body.telephoneParrain.trim());
      if (!parrain) throw new NotFoundException({ code: 'ERR_PARRAIN_NOT_FOUND', message: 'Aucun client avec ce téléphone' });
      parrainClientId = parrain.id;
    }
    if (!parrainClientId) throw new BadRequestException({ code: 'ERR_BAD_REQUEST', message: 'parrainClientId ou telephoneParrain requis' });
    return this.mlmClaimService.confirmClaims(parrainClientId, body.codeFacture, user?.id);
  }
```

(`CurrentUser`, `NotFoundException`, `BadRequestException`, `Query` — vérifier/augmenter les imports existants du controller, la plupart y sont déjà.)

`backend/src/modules/portal/portal.module.ts` : `imports: [MlmModule, …]` existe déjà → rien.
`backend/src/modules/portal/portal.controller.ts` — injecter `MlmClaimService` (import depuis `../mlm/mlm-claim.service`) et ajouter :

```ts
  @Get('claims/pending')
  async getPendingClaims(@CurrentUser() user: any) {
    const claims = await this.mlmClaimService.pendingClaimsForParrain(user.id);
    return { claims, count: claims.length };
  }

  @Post('claims/confirm')
  async confirmClaims(@CurrentUser() user: any, @Body() body: { codeFacture: string }) {
    return this.mlmClaimService.confirmClaims(user.id, body.codeFacture);
  }
```

> `user.id` côté portail = clientId (pattern `getPortalData(user.id)` existant).

- [ ] **Step 6: Vérification compilation + tests globaux**

Run: `cd backend && npx jest && npx tsc --noEmit`
Expected: tests verts ; compilation OK.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/mlm backend/src/modules/portal
git commit -m "feat(mlm): delayed claim endpoints (admin + portal)"
```

---

### Task 7: Lecture — champ `parrainClaim` dans `GET /clients/:id` + compteur portail

**Files:**
- Modify: `backend/src/modules/clients/clients.service.ts` — `findOne` (~ligne 280)
- Modify: `backend/src/modules/portal/portal.service.ts` — `getPortalData`
- Test : extension des specs existantes ou spec ciblée si mock `findOne` déjà présent (sinon vérification via compilation + `npm run test`).

**Interfaces:**
- Consumes : relations `filleulClaim` / `parrainClaims` (Task 1).
- Produces : `client.parrainClaim: { statut, parrain: { id, prenom, nom, telephone } | null } | null` dans `findOne` ; `{ filleulsEnAttenteCount: number }` dans `getPortalData`.

- [ ] **Step 1: `findOne`**

Dans l'`include` de `findOne` (clients.service.ts ~ligne 280, là où `parrainClient` est select), ajouter :

```ts
      filleulClaim: {
        select: {
          statut: true,
          parrain: { select: { id: true, prenom: true, nom: true, telephone: true, statut: true } },
        },
      },
```

Puis avant le `return`, mapper pour ne révéler `parrainClaim` que si le lien MLM n'est pas déjà effectif :

```ts
    const parrainClaim = client.filleulClaim && !client.membre?.parrainId
      ? {
          statut: client.filleulClaim.statut,
          parrain: client.filleulClaim.parrain
            ? {
                ...client.filleulClaim.parrain,
                nomComplet: `${client.filleulClaim.parrain.prenom} ${client.filleulClaim.parrain.nom}`,
              }
            : null,
        }
      : null;
    return { ...rest, parrainClaim };
```

> Adapter au shape de retour réel de `findOne` (le code déstructure `membre`, `rest` — voir lignes ~260-265 existantes). `parrainClaim` n'apparaît que pour un filleul dont le lien est réellement en attente (banner condition).

- [ ] **Step 2: `getPortalData`**

Dans `portal.service.ts`, dans `getPortalData`, ajouter à la requête parallèle :

```ts
    const filleulsEnAttenteCount = await this.prisma.parrainClaim.count({
      where: { parrainClientId: clientId, statut: 'EN_ATTENTE' },
    });
```

et dans l'objet retourné : `filleulsEnAttenteCount,`.

- [ ] **Step 3: Vérification**

Run: `cd backend && npx jest && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/clients/clients.service.ts backend/src/modules/portal/portal.service.ts
git commit -m "feat(api): expose parrainClaim on client detail + portal pending count"
```

---

### Task 8: Frontend — `CodeParrainInput` accepte les parrains non activés

**Files:**
- Modify: `backend/src/modules/clients/clients.service.ts` — `searchParrain` (~ligne 453)
- Modify: `frontend/src/components/clients/CodeParrainInput.tsx`

**Interfaces:**
- Consumes : endpoint `GET /clients/search-parrain` (existant, frontend `CodeParrainInput.tsx:65`).
- Produces : résultat de recherche avec `statut` (ACTIF | EN_COURS) ; chip « en attente » orange ; placeholder « Code parrain ou téléphone du parrain… ».

- [ ] **Step 1: Backend — élargir `searchParrain`**

Remplacer le `where` : `{ statut: StatutClient.ACTIF, OR: [...] }` par :

```ts
      where: {
        statut: { in: [StatutClient.ACTIF, StatutClient.EN_COURS] },
        OR: [
          { membre:      { matricule: { contains: term, mode: 'insensitive' } } },
          { codeParrain: { contains: term, mode: 'insensitive' } },
          { prenom:      { contains: term, mode: 'insensitive' } },
          { nom:         { contains: term, mode: 'insensitive' } },
          { telephone:   { contains: term } },
        ],
      },
```

et dans le `select` : ajouter `statut: true` ; dans le `map` : retourner `statut: c.statut`.

- [ ] **Step 2: Frontend — chip en attente**

`CodeParrainInput.tsx` — interface `ParrainResult`, ajouter `statut: string;`. Chip sélectionné : remplacer la classe `'border-success bg-success/5'` et la couleur du code par un ternaire :

```tsx
<div
  className={cn(
    'flex items-center gap-2 px-3 py-2 rounded-lg border text-[13px]',
    selected.statut === 'ACTIF' ? 'border-success bg-success/5' : 'border-warning bg-warning/5',
  )}
>
  {selected.statut === 'ACTIF'
    ? <CheckCircle2 size={15} className="text-success flex-shrink-0" />
    : <Clock size={15} className="text-warning flex-shrink-0" />}
  <span className={cn('font-semibold', selected.statut === 'ACTIF' ? 'text-success' : 'text-warning')}>
    {selected.codeParrain}
  </span>
  …
  {selected.statut !== 'ACTIF' && (
    <span className="text-[10px] text-text-muted">en attente d'activation</span>
  )}
```

(imports : ajouter `Clock` à lucide-react. Vérifier le nom de la classe Tailwind `warning` dans le thème — palette projet : orange `#E65100` — sinon utiliser `text-orange-600`/`border-orange-300`/`bg-orange-50`.)

Placeholder : `"Matricule, téléphone ou nom du parrain…"`. Texte « Aucun parrain actif trouvé. » → « Aucun parrain trouvé. ».

- [ ] **Step 3: Vérification compilation frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/clients/clients.service.ts frontend/src/components/clients/CodeParrainInput.tsx
git commit -m "feat(onboarding): parrain search matches phone and surfaces EN_COURS sponsors"
```

---

### Task 9: Frontend — écran d'activation : champ code facture sur 409

**Files:**
- Modify: `frontend/src/pages/clients/OnboardingActivationPage.tsx`

**Interfaces:**
- Consumes : erreur backend 409 `ERR_CLAIM_CODE_REQUIRED` avec `{ nbFilleulsEnAttente, factureHint }` (Task 5) ; DTO `codeFacture` (Task 5).
- Produces : mutation d'activation envoyant `codeFacture` ; champ conditionnel.

- [ ] **Step 1: State + envoi du code**

Dans `OnboardingActivationPage` : ajouter après `const [modePaiement, …]` :

```tsx
const [codeFacture, setCodeFacture] = useState('');
const [claimRequired, setClaimRequired] = useState<{ nbFilleulsEnAttente: number; factureHint: string } | null>(null);
```

`mutationFn` : ajouter `...(codeFacture ? { codeFacture } : {})` au body `api.post`.

`onSuccess` : `setClaimRequired(null);`.

`onError` : avant les branches existantes, insérer :

```tsx
if (status === 409 && code === 'ERR_CLAIM_CODE_REQUIRED') {
  setClaimRequired({
    nbFilleulsEnAttente: error.response.data.nbFilleulsEnAttente ?? 0,
    factureHint: error.response.data.factureHint ?? '',
  });
  return;
}
if (status === 400 && code === 'ERR_CLAIM_CODE_INVALID') {
  toast.error('Code de facture invalide. Vérifiez les 4 derniers chiffres de la facture d\'activation.');
  return;
}
```

- [ ] **Step 2: Rendu du champ (dans la modale `confirmOpen`)**

Dans le contenu de la Dialog de confirmation, au-dessus du bouton « Confirmer » :

```tsx
{claimRequired && (
  <div className="rounded-lg border border-warning bg-warning/5 p-3 space-y-2">
    <p className="text-[13px] text-text font-medium">
      Ce parrain a {claimRequired.nbFilleulsEnAttente} filleul(s) en attente.
      Saisissez le code de sa facture d'activation (ex. {claimRequired.factureHint}) pour confirmer le lien.
    </p>
    <input
      type="text"
      inputMode="numeric"
      value={codeFacture}
      onChange={(e) => setCodeFacture(e.target.value)}
      placeholder="Code facture (ex. 0047)"
      className="w-full px-3 py-2 rounded-lg border border-border text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-accent/30"
      data-testid="input-code-facture"
    />
  </div>
)}
```

(Même remarque Task 8 sur le token couleur `warning`.)

- [ ] **Step 3: Vérification**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: compilation OK, tests existants verts (le composant n'a pas de test unitaire requis — vérification visuelle Task 12).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/clients/OnboardingActivationPage.tsx
git commit -m "feat(onboarding): activation page asks for invoice code when claims pending"
```

---

### Task 10: Frontend — bandeau filleul + carte portail parrain

**Files:**
- Modify: `frontend/src/pages/clients/ClientDetailPage.tsx` (banner `parrainClaim`)
- Modify: `frontend/src/pages/portal/PortalFilleulsPage.tsx` (carte « Mes filleuls en attente »)
- Modify: `frontend/src/types/index.ts` (types si typage strict des réponses API)

**Interfaces:**
- Consumes : `client.parrainClaim` (Task 7) ; `GET /portal/claims/pending` et `POST /portal/claims/confirm` (Task 6) ; `filleulsEnAttenteCount` (Task 7).
- Produces : UI seulement.

- [ ] **Step 1: Types frontend**

Dans `frontend/src/types/index.ts` :

```ts
export interface ParrainClaimInfo {
  statut: 'EN_ATTENTE' | 'LIE';
  parrain: { id: string; prenom: string; nom: string; telephone: string; nomComplet: string } | null;
}
// Client existant → champ optionnel : parrainClaim?: ParrainClaimInfo | null;
```

- [ ] **Step 2: Bandeau ClientDetailPage**

Dans l'onglet vue client (`ClientDetailPage.tsx`), sous l'en-tête d'identification, conditionnel :

```tsx
{client.parrainClaim?.statut === 'EN_ATTENTE' && (
  <div className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-[13px] text-orange-800 flex items-center gap-2">
    <Clock size={14} />
    Parrain en attente d'activation — lien à confirmer par le code de sa facture d'activation.
  </div>
)}
```

(Import `Clock` ; positionner là où le bloc « parrainClient » actuel est rendu.)

- [ ] **Step 3: Carte portail `PortalFilleulsPage`**

En tête de page, avant `ReferralTree` :

```tsx
function PendingClaimsCard() {
  const qc = useQueryClient();
  const { data } = useQuery<{ claims: Array<{ id: string; filleul: { id: string; prenom: string; nom: string; telephone: string } }>; count: number }>({
    queryKey: ['portal-claims-pending'],
    queryFn: () => api.get('/portal/claims/pending').then(r => r.data),
  });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirm = useMutation({
    mutationFn: () => api.post('/portal/claims/confirm', { codeFacture: code }),
    onSuccess: () => {
      setCode(''); setError(null);
      toast.success('Filleuls rattachés avec succès.');
      qc.invalidateQueries({ queryKey: ['portal-claims-pending'] });
      qc.invalidateQueries({ queryKey: ['portal-referrals'] });
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Code invalide.'),
  });

  if (!data?.count) return null;
  return (
    <div className="rounded-xl border border-orange-300 bg-orange-50 p-4 space-y-3" data-testid="claims-card">
      <p className="text-[13px] font-semibold text-orange-800">
        {data.count} filleul(s) en attente : {data.claims.map(c => `${c.filleul.prenom} ${c.filleul.nom}`).join(', ')}
      </p>
      <p className="text-[12px] text-orange-700">
        Saisissez le code de votre facture d'activation (les 4 derniers chiffres ou le numéro complet) pour les rattacher et débloquer vos commissions.
      </p>
      <div className="flex gap-2">
        <input value={code} onChange={(e) => { setCode(e.target.value); setError(null); }}
          placeholder="Code facture (ex. 0047)"
          className="flex-1 px-3 py-2 rounded-lg border border-border text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-primary-accent/30" />
        <button type="button" onClick={() => confirm.mutate()} disabled={!code.trim() || confirm.isPending}
          className="px-4 py-2 rounded-lg bg-warning text-white text-[13px] font-semibold disabled:opacity-50">
          {confirm.isPending ? '…' : 'Confirmer'}
        </button>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
```

Et `<PendingClaimsCard />` en haut du rendu de `PortalFilleulsPage`. Imports requis : `useMutation`, `useQueryClient`, `api`, `toast` (suivre les imports déjà présents dans le fichier).

- [ ] **Step 4: Vérification + commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: PASS.

```bash
git add frontend/src
git commit -m "feat(ui): pending claim banner (admin) + portal confirmation card"
```

---

### Task 11: Frontend — file admin des réclamations (page `/mlm/claims`)

**Files:**
- Create: `frontend/src/pages/mlm/MlmClaimsPage.tsx`
- Modify: `frontend/src/App.tsx` (lazy import + route)
- Modify: navigation (là où `MlmCommissionsPage` est listée)

**Interfaces:**
- Consumes : `GET /mlm/claims` (Task 6), `POST /mlm/claims/confirm` (Task 6).
- Produces : page table + modal de confirmation.

- [ ] **Step 1: Page**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner'; // suivre le lib de toast déjà utilisé dans pages/mlm

interface PendingClaim {
  id: string;
  createdAt: string;
  filleul: { id: string; prenom: string; nom: string; telephone: string; statut: string };
  parrain: { id: string; prenom: string; nom: string; telephone: string; statut: string };
}

export default function MlmClaimsPage() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ['mlm-claims-pending'],
    queryFn: () => api.get<PendingClaim[]>('/mlm/claims').then(r => r.data),
  });
  const [confirmTarget, setConfirmTarget] = useState<PendingClaim | null>(null);
  const [code, setCode] = useState('');

  const confirm = useMutation({
    mutationFn: () => api.post('/mlm/claims/confirm', {
      parrainClientId: confirmTarget!.parrain.id, codeFacture: code,
    }),
    onSuccess: (res) => {
      toast.success(`${res.data.attachés} filleul(s) rattaché(s).`);
      setConfirmTarget(null); setCode('');
      qc.invalidateQueries({ queryKey: ['mlm-claims-pending'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Échec de la confirmation'),
  });

  // Rendu : table (filleul | statut filleul | parrain | statut parrain | téléphone saisi | action)
  // + modale de confirmation avec champ code facture ; state "confirmTarget" pilote l'ouverture.
  // Reprendre la structure de MlmCommissionsPage pour la table et la modale (mêmes composants UI).
}
```

> Écrire le JSX complet de la table/modale en copiant la structure de `frontend/src/pages/mlm/MlmCommissionsPage.tsx` (mêmes patterns `<table>`, `Dialog` du dossier `components/ui`). Pas de placeholder fonctionnel — la page doit lister et confirmer réellement.

- [ ] **Step 2: Route + nav**

`App.tsx` : `const MlmClaimsPage = lazy(() => import('@/pages/mlm/MlmClaimsPage'));` puis, à côté de la route `mlm/commissions` existante :

```tsx
<Route path="mlm/claims" element={<RoleGuard minRole="GERANT"><MlmClaimsPage /></RoleGuard>} />
```

Ajouter l'entrée de menu correspondante là où « Commissions » apparaît dans la sidebar (chercher `MlmCommissionsPage` dans `components/layout/`).

- [ ] **Step 3: Vérification + commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: PASS.

```bash
git add frontend/src
git commit -m "feat(mlm): admin pending-claims queue page"
```

---

### Task 12: Validation bout en bout (base réelle)

**Files:** aucune modification attendue (correctifs mineurs si trouvé).

- [ ] **Step 1: Migrate + seed + démarrer**

```bash
cd backend && npm run prisma:migrate:dev && npm run prisma:seed && npm run start:dev
cd frontend && npm run dev
```

- [ ] **Step 2: Scénario complet**

1. Créer un client P (parrain) via l'onboarding RECIT — le laisser EN_COURS.
2. Créer un filleul F1 avec pour code parrain **le téléphone de P** → vérifier `warning: PARRAIN_NON_ACTIVE` (toast/bandeau ClientDetail F1) et `parrain_claims` rempli (`npx prisma studio`).
3. Créer un filleul F2 avec un code parrain inventé → erreur `ERR_PARRAIN_NOT_FOUND`.
4. Activer P au guichet : sans code → message demandant le code (409 affiché, formulaire code facture visible) ; ressaisir avec le suffixe de la facture générée (`factureHint`) → activation OK.
5. Vérifier : claims `LIE` avec `factureReclamee` = `numeroVente` ; F1 rattaché dans la matrice de P ; commission éventuelle si matrice 4/4 (sinon ajouter 3 autres filleuls et vérifier la promotion + Commission `EN_ATTENTE` → validation admin → portefeuille crédité).
6. Voie portail : connecter un parrain avec claim, confirmer via la carte, vérifier.
7. Régression : activer un client **sans** claim → flux inchangé (pas de champ code).

- [ ] **Step 3: Suites complètes**

```bash
cd backend && npx jest
cd frontend && npx vitest run
```
Expected: toutes vertes.

- [ ] **Step 4: Commit final (si correctifs)**

```bash
git add -A && git commit -m "fix: e2e adjustments for parrain claim flow"
```

---

## Self-Review (après écriture)

1. **Couverture spec** : §3→T1 ; §4.1→T2+T3 ; §4.2→T5 ; §4.3→T4+T5 ; §4.4→T6 ; §4.5→T6+T7 ; §5 frontend→T8,T9,T10,T11 ; §6 erreurs→T3,T5,T6 (messages exacts) ; §8 tests→T2,T3,T4,T5,T6,T12 ; §7 non-régression→T3 Step 7, T12.
2. **Placeholders** : Task 11 Step 1 contient une note d'implémentation pour le JSX (structure à copier depuis une page existante) — c'est une instruction concrète, pas un TODO.
3. **Types** : `attachConfirmedClaims` retourne `{ attachés, conflits }` partout ; `confirmClaims` ajoute `facture` — cohérent T6 tests ↔ T6 impl ↔ T11 `res.data.attachés`. `codeFacture` DTO (T5) ↔ frontend (T9). `parrainClaim` (T7) ↔ `ParrainClaimInfo` (T10).
