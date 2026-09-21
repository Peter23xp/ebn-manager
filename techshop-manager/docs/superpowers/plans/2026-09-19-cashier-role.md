# Cashier Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Séparer la préparation des dossiers par les agents des encaissements et ventes par les caissiers, avec isolation par site et remboursements réservés aux responsables.

**Architecture:** Étendre les rôles et les modules clients/ventes existants. Une politique commune contrôle le rôle et le site avant les appels métier, tandis qu'un point d'entrée non financier crée les dossiers en attente. Les autorisations frontend, les DTO et les ventes hors ligne respectent les mêmes limites sans modifier les calculs MLM.

**Tech Stack:** NestJS 10, Prisma 5 / PostgreSQL, TypeScript, React 18, React Router 6, Zustand, React Query, React Hook Form/Zod, IndexedDB/idb, Jest, Vitest, Testing Library, Playwright pour la vérification locale.

**Spec:** `docs/superpowers/specs/2026-09-19-cashier-role-design.md`, approuvée dans la conversation avant ce plan.

## Exécution locale du 20 septembre 2026

Branche autorisée : `codex/cashier-role`, worktree `D:/PETER/EBN/.worktrees/cashier-role`, base `f371bd6`. Tâches 1 à 7 implémentées avec sous-agents et revues par étape ; les quatre constats de la revue finale sont corrigés et leur fermeture revue. Aucun commit, push, déploiement, changement de compte réel ni écriture distante.

Vérifications finales : backend 1 156 réussis / un timeout préexistant du sous-processus de maintenance / 183 ignorés ; relance inchangée de maintenance 9/9 réussis. Suite PostgreSQL dédiée étendue : 41/41 réussis séparément, sans handle ouvert. Dernière suite frontend large : 619 réussis / les mêmes 21 échecs préexistants dans `PortalPointsPage` et `NotFoundPage`. Après fermeture du dernier cas PDF : 91/91 tests de cache privé et PDF réussis, build frontend relancé avec succès. Build backend, validation Prisma et statut des neuf migrations locales réussis. Essais navigateur synthétiques desktop/mobile, menus, clavier, conflits, isolation des reçus/dossiers et IndexedDB natif réussis. Le frontend complet n'est pas déclaré entièrement vert.

Les décisions de revue précisent le plan sans modifier les règles financières : conserver l'accès FORMATEUR au détail/formation ; filtrer les ventes historiques liées à un client d'un autre site pour les rôles limités ; acquitter un envoi hors ligne confirmé même après changement de session ; conserver sans rejeu automatique les envois incertains avec un marqueur persistant. Limites et procédure opérateur : `docs/cashier-role.md`.

## Global Constraints

- Hiérarchie cible : `SUPER_ADMIN > DIRECTEUR_REGIONAL > GERANT > CAISSIER > AGENT > FORMATEUR > CLIENT`.
- « Les comptes existants ne changent pas automatiquement de rôle. »
- « Les retours et remboursements sont réservés au gérant et aux rôles supérieurs. »
- « Aucun dossier, paiement, historique, compte ou lien de parrainage n'est supprimé. »
- « Les droits personnels MLM déjà accessibles à l'agent ne sont pas assimilés à des opérations de caisse et ne sont pas supprimés. »
- Le caissier prépare, encaisse et vend uniquement sur son site ; les droits des responsables, du portail client et du formateur ne sont pas élargis ou supprimés arbitrairement.
- Pas de purge, seed global, attribution automatique de rôle, paiement réel, modification du calendrier RDC ou accès en écriture à la base distante.
- Pas de commit, nouvelle branche ou push sans demande explicite, même si un workflow générique suggère des commits intermédiaires.
- Modifier les fichiers avec `apply_patch`. Pas de commentaires de code ajoutés, ni de refonte visuelle ou financière hors périmètre.
- Les étapes de tests utilisent des fixtures synthétiques. Ne jamais lancer les migrations ou les suites d'intégration en héritant implicitement de `backend/.env`, qui cible la base distante.
- L'exécuteur lit la spécification et ce plan. Les extraits de code sont les contrats à implémenter ; les comportements existants non ciblés restent conservés.

## État de départ et organisation

Répertoire de travail : `D:/PETER/EBN/techshop-manager`, dépôt Git dans `D:/PETER/EBN`. Base observée : `f371bd6` ; revérifier au démarrage et conserver toute modification utilisateur. La spécification est un fichier local non commité.

Les tâches 1 à 7 sont séquentielles parce qu'elles partagent le modèle de rôles et certaines frontières clients/ventes. Ne pas déléguer simultanément des modifications du même contrôleur, du même fichier de routes ou de la file hors ligne. Une revue peut fonctionner en parallèle des tests une fois les changements d'une tâche stabilisés.

Responsabilités des nouveaux fichiers :

- `backend/src/common/access/staff-access.ts` : types d'acteur et fonctions pures de rôle/site.
- `backend/src/common/access/staff-scope.service.ts` : vérification d'appartenance des objets par lectures Prisma minimales, sans effet métier.
- `backend/src/modules/clients/dto/client-draft.dto.ts` : uniquement les données personnelles et de parrainage d'un dossier non payé.
- `frontend/src/lib/roles.ts` : hiérarchie partagée par les consommateurs frontend existants.
- `frontend/src/components/clients/ClientDraftForm.tsx` : préparation du dossier sans paiement, dans la page existante.
- `frontend/src/lib/client-draft.ts` : schéma et contrat de requête de préparation.
- `frontend/src/lib/offline-sales-sync.ts` : décision de synchronisation et exécution de la file avec propriétaire/site/session.
- Les fichiers `.spec.ts` / `.test.tsx` cités ci-dessous portent les régressions ; aucune classe de production n'acquiert de méthode réservée aux tests.

---

### Task 1: Rôle caissier cohérent dans l'identité et la gestion des utilisateurs

**Files:**
- Create: `backend/src/common/access/staff-access.ts`, `backend/src/common/access/staff-access.spec.ts`.
- Create: `backend/prisma/migrations/20260919000000_cashier_role/migration.sql`.
- Modify: `backend/prisma/schema.prisma`, `backend/src/common/guards/roles.guard.ts`.
- Modify: `backend/src/modules/users/dto/user.dto.ts`, `backend/src/modules/users/users.service.ts`, `backend/src/modules/auth/auth.service.ts`.
- Modify: `backend/src/modules/dashboard/dashboard.service.ts` uniquement pour éviter que le nouveau rôle tombe dans la branche « tous les sites ».
- Create: `frontend/src/lib/roles.ts`, `frontend/src/lib/roles.test.ts`, `backend/src/modules/users/users-cashier.spec.ts`.
- Modify: `frontend/src/types/index.ts`, `frontend/src/store/auth.store.ts`, `frontend/src/hooks/useAuth.ts`, `frontend/src/components/layout/RoleGuard.tsx`, `frontend/src/pages/parametres/UsersPage.tsx`, `frontend/src/pages/auth/LoginPage.tsx`.
- Test: `frontend/src/components/layout/Guards.test.tsx`, `frontend/src/components/layout/LogoutRedirect.test.tsx`, `backend/src/modules/auth/auth.service.spec.ts`.

**Interfaces:**
- Backend exports `StaffActor = { id: string; role: Role; siteId?: string | null }`.
- Backend/frontend export `ROLE_LEVEL`, `hasMinimumRole(role: Role | undefined, minimum: Role): boolean`, `isSiteScopedStaff(role: Role): boolean` et `requiresAssignedSite(role: Role): boolean`.
- `isSiteScopedStaff` vise uniquement `AGENT` et `CAISSIER`. Ne pas s'en servir pour remplacer les règles propres aux responsables/formateurs dans le dashboard.
- `requiresAssignedSite` inclut `GERANT`, `CAISSIER`, `AGENT`, `FORMATEUR`.

- [x] **Step 1: Écrire les tests de hiérarchie et les cas d'utilisateur sans site.** Les premiers tests utilisent `'CAISSIER' as Role` pour échouer par assertion avant modification du client Prisma généré, et non par absence d'un membre d'enum à la compilation.

```ts
function guardAllows(role: Role, minimum: Role): boolean {
  const reflector = { getAllAndOverride: () => [minimum] } as unknown as Reflector;
  const context = {
    getHandler: () => guardAllows,
    getClass: () => RolesGuard,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
  try {
    return new RolesGuard(reflector).canActivate(context);
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

it('places the cashier below a manager and above an agent', () => {
  expect(guardAllows('CAISSIER' as Role, 'AGENT' as Role)).toBe(true);
  expect(guardAllows('CAISSIER' as Role, 'GERANT' as Role)).toBe(false);
  expect(guardAllows('AGENT' as Role, 'CAISSIER' as Role)).toBe(false);
  expect(guardAllows('SUPER_ADMIN' as Role, 'CAISSIER' as Role)).toBe(true);
});
```

Ce test importe `RolesGuard` existant, `Reflector`, `ExecutionContext` et `ForbiddenException`, pas une fonction encore inexistante. Côté frontend, monter de la même manière le `RoleGuard` existant avec un utilisateur `'CAISSIER' as Role` et vérifier l'accès à une route agent avant extraction du helper. Ajouter ensuite les tests unitaires du contrat exporté, notamment le refus d'un rôle absent/inconnu.

Ajouter des tests réels de `UsersService.createUser` et `updateUser` avec le nouveau rôle : site omis, vide, nul après modification, identifiant inexistant, site valide. Vérifier le rejet avant écriture ; les tests positifs vérifient le rôle/site du résultat. Conserver les cas existants d'agent/gérant/formateur. Le DTO `IsOptional` ne remplace pas cette vérification métier.

- [x] **Step 2: Observer RED.** Depuis `backend`, lancer `npm test -- --runInBand staff-access.spec.ts users-cashier.spec.ts`. Depuis `frontend`, lancer `npm test -- src/lib/roles.test.ts --maxWorkers=1`. Résultat attendu : assertions caissier actuellement refusées ou absent du choix de rôle. Les erreurs de montage des fixtures ne valent pas preuve RED.

- [x] **Step 3: Ajouter l'enum et les fonctions de rôle.** La migration contient uniquement :

```sql
ALTER TYPE "Role" ADD VALUE 'CAISSIER' AFTER 'GERANT';
```

```ts
export const ROLE_LEVEL: Record<Role, number> = {
  SUPER_ADMIN: 7,
  DIRECTEUR_REGIONAL: 6,
  GERANT: 5,
  CAISSIER: 4,
  AGENT: 3,
  FORMATEUR: 2,
  CLIENT: 1,
};

export function hasMinimumRole(role: Role | undefined, minimum: Role): boolean {
  return role !== undefined && ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];
}

export function isSiteScopedStaff(role: Role): boolean {
  return role === 'AGENT' || role === 'CAISSIER';
}

export function requiresAssignedSite(role: Role): boolean {
  return ['GERANT', 'CAISSIER', 'AGENT', 'FORMATEUR'].includes(role);
}
```

Exécuter `npx prisma generate` après modification du schéma. Faire importer ce contrat par `RolesGuard` et les trois consommateurs frontend. Dans `RoleGuard`, remplacer aussi le plafond implicite numérique par `ROLE_LEVEL.SUPER_ADMIN` pour ne pas exclure le super-admin. Ajouter `CAISSIER` aux listes, libellés et schémas Zod des utilisateurs. L'agent se connecte vers `/dashboard`, le caissier vers `/sales/pos` ; les autres redirections restent inchangées. Le backend de connexion et le dashboard reconnaissent le site obligatoire du caissier.

- [x] **Step 4: Observer GREEN et vérifier les consommateurs exhaustifs.** Lancer les tests précédents, les gardes/logout frontend, `auth.service.spec.ts`, `npx prisma validate` et les vérifications TypeScript. Rechercher `Record<Role`, `ROLE_LEVEL`, `ROLE_HIERARCHY`, comparaisons explicites à `AGENT` et valeurs plafonds : ajouter le cas caissier seulement là où son absence donnerait un droit global ou casserait le parcours. Aucun rôle de compte réel n'est changé.

- [x] **Step 5: Revue de la tâche.** Vérifier la migration additive, le maintien de la frontière portail/client et l'absence d'élévation vers gérant. Ne pas commiter automatiquement.

### Task 2: Périmètre serveur des dossiers et des lectures de caisse

**Files:**
- Create: `backend/src/common/access/staff-scope.service.ts`, `backend/src/common/access/staff-scope.service.spec.ts`.
- Modify: `backend/src/common/access/staff-access.ts`.
- Modify: `backend/src/modules/clients/clients.module.ts`, `clients.controller.ts`, `clients.service.ts`.
- Modify: `backend/src/modules/ventes/ventes.module.ts`, `ventes.controller.ts`.
- Create: `backend/src/modules/clients/clients-access.spec.ts`, `backend/src/modules/ventes/ventes-access.spec.ts`.

**Interfaces:**
- Consumes: `StaffActor`, `hasMinimumRole`, `isSiteScopedStaff` de la tâche 1.
- Exports `effectiveStaffSite(actor: StaffActor, requestedSiteId?: string | null): string | undefined` et `assertStaffSite(actor: StaffActor, objectSiteId: string): void`.
- `StaffScopeService.requireClient(actor: StaffActor, clientId: string, minimum: Role = Role.AGENT): Promise<void>` lit uniquement `id` et `siteInscriptionId`.
- `StaffScopeService.requireSale(actor: StaffActor, saleId: string, minimum: Role = Role.AGENT): Promise<void>` lit le site de la vente et, si présent, celui du client.
- `StaffScopeService.requireExistingPhone(actor: StaffActor, telephone: string): Promise<void>` contrôle le site si le téléphone existe ; ne divulgue pas son dossier si le site est interdit.
- Les listes obtiennent leur site effectif avant requête ; les contrôleurs vérifient les objets avant d'appeler `findOne`, qui peut déclencher une réparation MLM.

- [x] **Step 1: Écrire les refus de site en priorité.** Couvrir agent/caissier sans site, `siteId` falsifié, client/vente d'un autre site, recherche et téléphone d'un autre site, filtres omis et accès direct. Un responsable conserve son fonctionnement actuel.

```ts
it('rejects a cashier selecting a different site', () => {
  const actor: StaffActor = { id: 'cashier', role: 'CAISSIER' as Role, siteId: 'site-a' };
  expect(() => effectiveStaffSite(actor, 'site-b')).toThrow(ForbiddenException);
  expect(effectiveStaffSite(actor)).toBe('site-a');
});
```

Les tests HTTP montent les contrôleurs et `RolesGuard` réels via `Test.createTestingModule`; seule la frontière JWT est remplacée par une identité synthétique contrôlée. Les tests de service utilisent un adaptateur Prisma de lecture minimal. Vérifier absence d'appel au service métier sur refus, puis vérifier les réponses et filtres effectifs sur autorisation.

- [x] **Step 2: Observer RED.** `npm test -- --runInBand staff-scope.service.spec.ts clients-access.spec.ts ventes-access.spec.ts`. Résultat attendu : un accès intersite actuellement accepté ou un site absent actuellement interprété comme « tous ».

- [x] **Step 3: Implémenter les fonctions pures et le service de lecture.**

```ts
export function effectiveStaffSite(actor: StaffActor, requestedSiteId?: string | null): string | undefined {
  if (!isSiteScopedStaff(actor.role)) return requestedSiteId ?? undefined;
  if (!actor.siteId) throw new ForbiddenException({ code: 'ERR_SITE_REQUIRED', message: 'Un site doit être attribué à votre compte.' });
  if (requestedSiteId && requestedSiteId !== actor.siteId) {
    throw new ForbiddenException({ code: 'ERR_SITE_FORBIDDEN', message: 'Opération réservée à votre site.' });
  }
  return actor.siteId;
}

export function assertStaffSite(actor: StaffActor, objectSiteId: string): void {
  effectiveStaffSite(actor, objectSiteId);
}
```

```ts
async requireClient(actor: StaffActor, clientId: string, minimum: Role = Role.AGENT): Promise<void> {
  if (!hasMinimumRole(actor.role, minimum)) throw new ForbiddenException('Rôle insuffisant');
  const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true, siteInscriptionId: true } });
  if (!client) throw new NotFoundException('Client introuvable');
  assertStaffSite(actor, client.siteInscriptionId);
}
```

Déclarer `StaffScopeService` dans les providers des modules clients et ventes ; il dépend seulement de `PrismaService`, déjà global. `requireSale` applique la même logique à `vente.siteId` et au client éventuel. `requireExistingPhone` n'appelle pas `ClientsService.findOne` et ne modifie rien.

- [x] **Step 4: Brancher exhaustivement les lectures concernées.** Passer l'acteur authentifié aux recherches clients, `checkPhone`, listes, détails, file, paiements d'onboarding, mise à jour et formation. Ne pas modifier la recherche minimale globale de parrainage. Pour un téléphone d'un autre site, retourner un conflit générique sans identifiant ni données privées. Ne pas transmettre un site non contrôlé aux services de listes.

Les objets ventes sont vérifiés avant détails, reçu, SMS de reçu, avoir et statut KPay associé. Pour un avoir, vérifier le site de sa vente d'origine ; pour un identifiant KPay, vérifier la vente persistée, jamais un identifiant de client fourni par l'appelant. Pas de changement du webhook signé.

Les imports restent des créations `EN_COURS` sans paiement. Pour agent/caissier, chaque ligne utilise leur site et leur `id`, refuse un autre site et n'accepte pas d'état actif/étape complète. Le frontend garde l'accès import réservé au gérant comme aujourd'hui. Les cas clients ordinaires utilisent explicitement le seuil agent ; la formation garde son seuil formateur existant et les recherches nécessaires, sans ouvrir le reste du back-office à ce rôle.

- [x] **Step 5: Observer GREEN et revoir.** Relancer les tests ciblés, `clients-detail.spec.ts`, `clients-recit-resume.spec.ts`, `clients-claim.spec.ts`. Confirmer qu'aucune lecture refusée n'a déclenché de réparation MLM, ni renvoyé un dossier privé. Vérifier l'absence de nouveau service d'autorisation dynamique ou de contournement `skipChecks` dans les entrées HTTP.

### Task 3: Création d'un dossier sans encaissement

**Files:**
- Create: `backend/src/modules/clients/dto/client-draft.dto.ts`, `backend/src/modules/clients/clients-draft.spec.ts`.
- Modify: `backend/src/modules/clients/clients.controller.ts`, `clients.service.ts`.
- Test: `backend/src/modules/clients/clients-access.spec.ts`.

**Interfaces:**
- `CreateClientDraftDto` contient `prenom`, `nom`, `telephone`, `siteId`, et les facultatifs `email`, `codeParrain`, `matriculeExterne`. Reprendre les validations d'identité de `CreateClientDto`, sans hériter de ses champs financiers.
- `ClientsService.createDraft(dto: CreateClientDraftDto, actor: StaffActor): Promise<{ client: { id: string; prenom: string; nom: string; telephone: string; statut: StatutClient; createdById: string | null }; etapeId: string }>`.
- `POST /clients/onboarding/draft`, seuil agent, consomme le DTO strict et l'acteur réel. Le frontend utilise le `client.id` renvoyé pour consulter le dossier.
- Un doublon accessible produit `409 / ERR_DUPLICATE_CLIENT` avec `clientId`; un doublon hors site produit un message générique sans identifiant. Ne pas modifier le client existant.

- [x] **Step 1: Tester le DTO et les effets du service.**

```ts
it('rejects financial fields in a draft', async () => {
  const dto = plainToInstance(CreateClientDraftDto, {
    prenom: 'Client', nom: 'Test', telephone: '+243999000101', siteId: 'site-a',
    montantRecit: 10, modePaiement: 'CASH', statut: 'ACTIF',
  });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  expect(errors.map(error => error.property)).toEqual(expect.arrayContaining(['montantRecit', 'modePaiement', 'statut']));
});
```

Le test du service reprend le montage réel de `ClientsService` dans `clients-recit-resume.spec.ts`, sans mocker `createDraft`. Le faux adaptateur de stockage enregistre les données passées à `client.create` et `onboardingEtape.create`, renvoie les mêmes données avec identifiants synthétiques, et exécute le callback de transaction. Vérifier les objets créés, pas seulement le nombre d'appels. Pour une référence de parrain, remplacer uniquement la recherche parrain externe par un résultat complet ; exercer les écritures de claim du service réel. Tester auto-parrainage, inconnu, actif, en cours, doublon, échec d'écriture. La réalité transactionnelle est vérifiée en PostgreSQL dans la tâche 7.

- [x] **Step 2: Observer RED.** `npm test -- --runInBand clients-draft.spec.ts clients-access.spec.ts`. Une route absente ou le récit marqué `COMPLETE` au lieu de `EN_ATTENTE` est le défaut attendu ; corriger tout problème de fixture avant d'implémenter.

- [x] **Step 3: Ajouter l'entrée non financière.**

```ts
@Post('onboarding/draft')
@Roles(Role.AGENT)
createDraft(@Body() dto: CreateClientDraftDto, @CurrentUser() actor: StaffActor) {
  return this.clientsService.createDraft(dto, actor);
}
```

Dans `createDraft`, vérifier le rôle, obtenir `effectiveStaffSite(actor, dto.siteId)`, vérifier l'existence du site et résoudre le parrain via `MlmClaimService.resolveParrain`. Conserver les protections d'unicité email/téléphone/matricule et d'auto-parrainage. Construire explicitement les champs de création, sans spread aveugle du DTO.

```ts
const result = await this.prisma.$transaction(async tx => {
  const client = await tx.client.create({ data: {
    prenom: dto.prenom, nom: dto.nom, telephone: dto.telephone,
    email: dto.email || undefined, matriculeExterne: dto.matriculeExterne || undefined,
    siteInscriptionId: siteId, createdById: actor.id,
    parrainClientId: recruiter?.id, statut: StatutClient.EN_COURS,
  } });
  const step = await tx.onboardingEtape.create({ data: {
    clientId: client.id, agentId: actor.id, siteId,
    etape: EtapeOnboarding.RECIT, statut: StatutEtape.EN_ATTENTE,
  } });
  if (recruiter && recruiter.statut !== StatutClient.ACTIF) {
    await tx.parrainClaim.upsert({
      where: { filleulClientId: client.id },
      create: { filleulClientId: client.id, parrainClientId: recruiter.id, statut: 'EN_ATTENTE', telephoneParrainSaisi: dto.codeParrain! },
      update: {},
    });
  }
  return { client: { id: client.id, prenom: client.prenom, nom: client.nom, telephone: client.telephone, statut: client.statut, createdById: client.createdById }, etapeId: step.id };
});
```

`siteId` et `recruiter` désignent les résultats des contrôles décrits immédiatement avant cet extrait. Intercepter `P2002` en conflit, puis refaire uniquement la lecture nécessaire pour le lien vers un doublon accessible. Ne jamais appeler `onboardingRecit`, `onboardingActivate`, `findOne` avec réparation, un fournisseur de paiement ou le moteur MLM pour préparer ce dossier.

- [x] **Step 4: Observer GREEN et revoir.** Vérifier que `completeeAt`, `montant`, `modePaiement` et `referenceTransaction` restent nuls, que le dossier est visible dans la file existante et qu'une reprise caissier garde `createdById` et `parrainClientId`. Lancer `npm test -- --runInBand clients-draft.spec.ts clients-claim.spec.ts clients-recit-resume.spec.ts`.

### Task 4: Verrouillage des encaissements, ventes et remboursements

**Files:**
- Modify: `backend/src/modules/clients/clients.controller.ts`, `backend/src/modules/ventes/ventes.controller.ts`.
- Modify: `backend/src/common/access/staff-scope.service.ts` pour l'autorisation minimale des reprises par téléphone et des ventes liées à un client.
- Test: `backend/src/modules/clients/clients-access.spec.ts`, `backend/src/modules/ventes/ventes-access.spec.ts`.
- Regression: `backend/src/modules/clients/clients-claim.spec.ts`, `clients-kpay-recruiter-concurrency.spec.ts`, les tests existants KPay et MLM.

**Interfaces:**
- Consumes: `requireClient`, `requireSale`, `requireExistingPhone`, `effectiveStaffSite`.
- Les signatures métier actuellement appelées par les callbacks restent inchangées. L'autorisation interactive est appliquée avant chaque délégation contrôleur → métier, sans paramètre venant du navigateur pour l'omettre.

- [x] **Step 1: Écrire les tests HTTP matriciels des refus.** Gardes réels, JWT synthétique de test, fournisseur de paiement factice ; aucun appel réel. Liste complète des créations de paiements refusées à l'agent :

```ts
const cashierPosts = [
  '/clients/onboarding/recit',
  '/clients/client-a/onboarding/recit',
  '/clients/onboarding/recit/kpay/init',
  '/clients/client-a/onboarding/recit/kpay/init',
  '/clients/client-a/onboarding/fiche',
  '/clients/client-a/onboarding/fiche/kpay/init',
  '/clients/client-a/onboarding/activate',
  '/clients/client-a/onboarding/activate/kpay/init',
  '/ventes',
  '/ventes/kpay/init',
];
```

Pour chaque route, un agent obtient `403` même si le corps est autrement valide. Un caissier sur le bon site atteint le traitement cash, mais le mobile reste bloqué par la politique existante. Un caissier d'un autre site reçoit un refus avant tout effet. Sur `/ventes/:id/retour` et `/ventes/:id/retour/kpay-refund`, tester le refus agent et caissier et l'autorisation du gérant.

- [x] **Step 2: Observer RED.** `npm test -- --runInBand clients-access.spec.ts ventes-access.spec.ts`. La preuve attendue est un agent qui atteint actuellement l'opération financière ou un caissier qui n'est pas limité à son site.

- [x] **Step 3: Poser les seuils et les contrôles d'objet.**

```ts
@Post(':id/onboarding/activate')
@Roles(Role.CAISSIER)
@CheckMobileMoney('modePaiement')
async onboardingActivate(@Param('id') clientId: string, @Body() dto: OnboardingActivateDto, @CurrentUser() actor: StaffActor) {
  await this.staffScope.requireClient(actor, clientId, Role.CAISSIER);
  return this.clientsService.onboardingActivate(clientId, dto, actor.id);
}
```

Appliquer exactement le seuil caissier aux dix routes listées, et gérant aux deux routes de retour. Pour un nouveau récit, vérifier à la fois le site demandé et l'ancien client trouvé par téléphone : le chemin de reprise ne doit pas contourner le site. Pour une vente : vérifier le site de `dto.siteId` et, si `clientId` est présent, son site avant la délégation. Le contrôle d'objet ne consulte pas `ClientsService.findOne` pour éviter ses effets de réparation.

Les routes d'initiation KPay gardent `CheckMobileMoney`. Ne pas changer `finalizeKpayOnboarding`, les finalizers enregistrés ni la validation des webhooks. Aucun client ne peut injecter `actorId`, un rôle, une marque de confiance ou une demande de finalisation via le corps.

- [x] **Step 4: Observer GREEN et vérifier la conservation des effets autorisés.** Les tests positifs de la tâche 7 vérifient le reçu, le stock, les étapes, l'acteur et les liens MLM produits par une vraie opération locale autorisée. Un rejeu d'une étape déjà terminée conserve les protections existantes contre le double traitement. Aucun nouvel algorithme de prix/commission/remise n'est introduit. Rejouer les tests KPay existants qui finalisent des opérations anciennement autorisées sans dépendre du rôle interactif courant.

### Task 5: Parcours frontend agent/caissier, sans faux statut payé

**Files:**
- Create: `frontend/src/lib/client-draft.ts`, `frontend/src/components/clients/ClientDraftForm.tsx`, `frontend/src/components/clients/ClientDraftForm.test.tsx`.
- Modify: `frontend/src/pages/clients/OnboardingRecitPage.tsx`, `OnboardingRecitPage.test.tsx`, `OnboardingQueuePage.tsx`, `ClientDetailPage.tsx`, `OnboardingRecitResumePage.tsx`, `OnboardingFichePage.tsx`, `OnboardingActivationPage.tsx`, `PaiementsOnboardingPage.tsx`, `ClientsListPage.tsx`.
- Modify: `frontend/src/App.tsx`, `frontend/src/components/layout/AppLayout.tsx`, `frontend/src/pages/dashboard/DashboardPage.tsx`, `frontend/src/pages/ventes/POSPage.tsx`, `VenteDetailPage.tsx`.
- Create: `frontend/src/pages/clients/CashierAccess.test.tsx`; adapt `frontend/src/components/layout/AppLayout.test.tsx` and `Guards.test.tsx`.

**Interfaces:**
- `clientDraftSchema` et `ClientDraftValues` dans `lib/client-draft.ts` reprennent uniquement les sept champs du DTO serveur.
- `createClientDraft(values: ClientDraftValues)` appelle `api.post('/clients/onboarding/draft', values)` et retourne son corps `{ client, etapeId }`.
- `ClientDraftForm` réutilise `PhoneInput` et `CodeParrainInput`, le site authentifié et les styles de formulaires existants.
- `OnboardingRecitPage` reste la route publique du module staff et sélectionne le formulaire sans paiement pour l'agent, le formulaire cash existant pour caissier et responsables.

- [x] **Step 1: Écrire les tests visibles.** Monter les vrais formulaires avec React Query, Router et le store. Remplacer seulement la frontière réseau et les dépendances externes ; utiliser un agent local. Vérifier l'absence de champs et actions d'encaissement, le bouton « Enregistrer le dossier », le parrain conservé dans la requête non financière et le lien vers le dossier créé. Les tests de l'ancien récit payant utilisent maintenant un caissier.

```tsx
expect(screen.queryByLabelText(/mode de paiement/i)).not.toBeInTheDocument();
expect(screen.queryByRole('button', { name: /encaisser/i })).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Enregistrer le dossier' })).toBeEnabled();
```

Monter aussi les routes réelles : l'agent est refusé sur reprise/récit payant, fiche, activation et POS ; le caissier n'est pas refusé sur ces routes. Ne pas se contenter d'un test de présence de lien. Vérifier qu'un récit `EN_ATTENTE` n'a pas l'indicateur payé.

- [x] **Step 2: Observer RED.** Depuis `frontend`, lancer `npm test -- src/components/clients/ClientDraftForm.test.tsx src/pages/clients/CashierAccess.test.tsx src/components/layout/AppLayout.test.tsx --maxWorkers=1`.

- [x] **Step 3: Séparer les formulaires et protéger les routes.** Transformer l'ancienne fonction de page en composant local `PaidRecitForm`, sans changer son comportement de paiement. Le composant exporté ne conditionne pas l'appel de ses propres hooks :

```tsx
export default function OnboardingRecitPage() {
  const role = useAuthStore(state => state.user?.role);
  return role === 'AGENT' ? <ClientDraftForm /> : <PaidRecitForm />;
}
```

Le schéma de préparation est distinct du schéma financier. Ne pas envoyer `montantRecit: 0` ou un faux paiement cash pour contourner l'ancien formulaire. Après succès, vider les champs d'identité et parrainage comme dans le récit existant et proposer la consultation du dossier. Sur erreur, conserver les saisies ; sur doublon accessible, proposer « Ouvrir le dossier », sans paiement ni réécriture implicite.

Dans `App.tsx`, seuil caissier sur `clients/:id/recit`, `clients/:id/fiche`, `clients/:id/activate` et `sales/pos`. Garder la préparation, la liste, la file, le détail client et la formation selon leurs droits existants. Abaisser uniquement les consultations nécessaires de `clients/paiements`, `sales` et `sales/:id` de gérant à caissier, avec résultats serveur limités au site. Les pages/actions de retours et remboursements restent gérant.

Dans le menu et les raccourcis, utiliser `hasMinimumRole(role, 'CAISSIER')` pour la caisse/encaissement et `hasMinimumRole(role, 'GERANT')` pour le remboursement. Dans la file et le détail, l'agent ouvre le dossier au lieu de suivre `prochainRoute` vers un paiement. Le libellé est « En attente de passage en caisse ». Pour les indicateurs, calculer `etape?.statut === 'COMPLETE'`, pas `!!etape`.

Étendre les restrictions de sélecteur de site de l'agent au caissier avec `isSiteScopedStaff`. Ne pas ouvrir `/sites` uniquement pour permettre au caissier de choisir un autre site. Le caissier conserve le site obligatoire de sa session. Les détails de vente masquent les retours s'il n'est pas gérant.

- [x] **Step 4: Observer GREEN et vérifier les parcours existants.** Lancer les tests ciblés et `npm test -- src/pages/clients src/components/layout --maxWorkers=2`. Vérifier création successive de dossiers, choix du parrain, annulation d'une saisie, erreurs réseau et montée de rôle après nouvelle authentification. Aucun lien ne doit renvoyer l'agent en boucle vers le POS après connexion.

### Task 6: File hors ligne liée au propriétaire, au site et à la session

**Files:**
- Create: `frontend/src/lib/offline-sales-sync.ts`, `frontend/src/lib/offline-sales-sync.test.ts`.
- Modify: `frontend/src/lib/offline.ts`, `frontend/src/hooks/useOnlineSync.ts`, `frontend/src/pages/ventes/POSPage.tsx`, `frontend/src/lib/ventes.api.ts`.
- Create: `frontend/src/lib/offline.test.ts`, `frontend/src/hooks/useOnlineSync.test.tsx`.
- Reference: `frontend/src/lib/api.ts` possède déjà le contrôle `_sessionVersion`; préserver ce comportement.

**Interfaces:**
- `PendingVente = { localId: string; ownerUserId: string; ownerSiteId: string; createdAt: string; payload: CreateVenteDto }`, avec le `CreateVenteDto` existant de `lib/ventes.api.ts`.
- `PendingQueueRecord = PendingVente | { localId: string; [key: string]: unknown }` permet de conserver les anciennes entrées sans les convertir.
- `OfflineSyncSession = { user: AuthUser | null; isAuthenticated: boolean; sessionVersion: number; effectiveSiteId: string | null }`.
- `canSyncPendingVente(record: PendingQueueRecord, session: OfflineSyncSession): boolean` est une fonction pure exportée.
- `syncPendingVentes(dependencies: { load: () => Promise<PendingQueueRecord[]>; remove: (localId: string) => Promise<void>; send: (payload: CreateVenteDto, sessionVersion: number) => Promise<unknown>; getSession: () => OfflineSyncSession }): Promise<{ synced: number; blocked: number; failed: number }>`.
- `savePendingVente(payload: CreateVenteDto, session: OfflineSyncSession): Promise<string>` valide l'autorisation et enregistre l'enveloppe, sans modifier le schéma IndexedDB ni détruire les anciennes données.

- [x] **Step 1: Écrire les tests d'appartenance et de changement de session.** Cas : agent, caissier propriétaire/site identique, autre utilisateur, autre site, ancien format, rôle rétrogradé, session expirée pendant un `load` retardé, session changée juste avant l'envoi, puis succès autorisé. Le test emploie un dépôt mémoire et une fonction d'envoi différable, sans remplacer la fonction de synchronisation réelle.

```ts
it('keeps legacy and foreign records without sending them', async () => {
  const payload: CreateVenteDto = { siteId: 'site-a', lignes: [{ produitId: 'product-a', quantite: 1, prixUnitaire: 10 }], modePaiement: 'CASH' };
  const records: PendingQueueRecord[] = [
    { localId: 'legacy', siteId: 'site-a' },
    { localId: 'foreign', ownerUserId: 'other', ownerSiteId: 'site-a', createdAt: '2026-09-19T10:00:00.000Z', payload },
  ];
  const before = structuredClone(records);
  const result = await syncPendingVentes({
    load: async () => records,
    remove: async id => { records.splice(records.findIndex(record => record.localId === id), 1); },
    send: async () => { throw new Error('Aucune vente ne doit être envoyée'); },
    getSession: () => ({ user: { id: 'cashier', name: 'Caisse', role: 'CAISSIER', siteId: 'site-a' }, isAuthenticated: true, sessionVersion: 1, effectiveSiteId: 'site-a' }),
  });
  expect(result).toEqual({ synced: 0, blocked: 2, failed: 0 });
  expect(records).toEqual(before);
});
```

- [x] **Step 2: Observer RED.** `npm test -- src/lib/offline-sales-sync.test.ts src/lib/offline.test.ts src/hooks/useOnlineSync.test.tsx --maxWorkers=1`. Le défaut attendu est la soumission avec la session courante d'une vente qui ne lui appartient pas.

- [x] **Step 3: Implémenter les contrôles et l'enveloppe locale.** Une entrée n'est synchronisable que si le rôle est au moins caissier, l'utilisateur est authentifié et correspond au propriétaire, les sites de l'enveloppe/payload/session effective concordent, et toutes les métadonnées nécessaires sont présentes. Pour agent/caissier, le site de l'utilisateur doit aussi correspondre. Un responsable peut choisir un site comme aujourd'hui, mais une file d'un autre utilisateur n'est jamais reprise implicitement.

Avant chaque envoi, relire la session après tout `await` et revalider l'entrée. Capturer sa `sessionVersion` et passer cette valeur à l'intercepteur existant :

```ts
const options: AxiosRequestConfig & { _sessionVersion: number } = { _sessionVersion: sessionVersion };
return api.post('/ventes', payload, options);
```

Ne transmettre au serveur que `payload`, jamais l'enveloppe IndexedDB. Une entrée n'est retirée qu'après succès du serveur. Les refus, changements de session, erreurs réseau et anciennes entrées restent conservés. Les ventes sans propriétaire ne reçoivent pas le propriétaire de la session courante.

`useOnlineSync` appelle cette fonction et réagit aussi au changement de session/site. Il garde son verrou contre les drains simultanés. Un résultat `blocked > 0` affiche « Des ventes hors ligne nécessitent une vérification par un responsable ; elles n'ont pas été envoyées. » sans toast en boucle à chaque rendu.

Le POS vérifie le droit de caisse au moment de la soumission et avant toute mise en file, pas seulement lors du rendu. Dans son traitement d'erreur, une erreur `403`, une annulation Axios ou un changement de session n'est pas classé comme une panne réseau à mettre en file. Pour un vrai échec réseau, enregistrer uniquement avec la session autorisée capturée et encore courante. Ne pas inventer une idempotence serveur qui n'existe pas : conserver le comportement de vente actuel, sans nouvelle répétition automatique après un résultat ambigu.

- [x] **Step 4: Observer GREEN et vérifier IndexedDB réel.** Tests unitaires au niveau de l'adaptateur `idb`, puis navigateur local isolé avec IndexedDB réel : insérer une entrée ancienne, une étrangère et une autorisée, reconnecter et vérifier que seule l'autorisée part et disparaît après réponse simulée. Toutes les requêtes API du navigateur sont interceptées ; pas de vente réelle. Garder DB version 3 si aucun index/store ne change.

### Task 7: Validation intégrée locale, documentation et revue finale

**Files:**
- Create: `backend/src/modules/clients/cashier-workflow.integration.spec.ts`.
- Create: `docs/cashier-role.md` pour le mode d'emploi agent/caissier et les opérations de déploiement autorisées séparément.
- Modify: les tests de régression existants uniquement lorsque leurs anciennes attentes encaissement-agent sont remplacées par le nouveau contrat approuvé.
- Update: les cases de ce plan avec les résultats réels.

**Interfaces:**
- La suite native n'accepte que `CASHIER_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/cashier_integration`.
- Toutes les identités, sites, produits, niveaux, dossiers, calendriers et paiements de cette suite sont synthétiques et limités à cette base locale.
- Le montage Nest garde les gardes et contrôleurs réels, un adaptateur Prisma local et des services métier réels. Seuls l'authentification de test, l'envoi externe de messages/paiements et les tâches de démarrage automatiques sont isolés. Ne pas démarrer l'AppModule complet avec l'environnement de production.

- [x] **Step 1: Écrire les scénarios natifs et observer les échecs avant correction des écarts.** Comparer les données réelles avant/après, pas seulement les mocks :

```ts
const safeUrl = 'postgresql://postgres@127.0.0.1:55432/cashier_integration';
const configuredUrl = process.env.CASHIER_TEST_DATABASE_URL;
if (configuredUrl && new URL(configuredUrl).href !== safeUrl) {
  throw new Error('Cashier integration tests require the dedicated local database');
}
const integration = configuredUrl ? describe : describe.skip;
```

Le test du parcours crée deux sites, un agent, un caissier et un gérant, puis des produits/stock locaux. Il prépare un dossier avec parrain, vérifie `RECIT/EN_ATTENTE`, les champs financiers nuls et l'absence de nouvelle vente/membre/commission. Il tente chaque action interdite et vérifie que les compteurs et stocks n'ont pas changé. Le caissier du bon site paie ensuite récit/fiche et active ; le client garde son créateur et son parrain et les écritures portent le caissier. La génération MLM existante n'est pas reconfigurée.

Ajouter deux créations concurrentes du même téléphone et une erreur injectée lors de la création d'étape : vérifier une seule identité/claim dans le premier cas et aucun client partiel dans le second. Le test d'ancien token relit le compte après modification locale du rôle/site et confirme le refus courant. Le test de remboursement vérifie refus caissier puis succès gérant.

- [x] **Step 2: Préparer et migrer uniquement la base de test vérifiée.** Lancer ces commandes depuis `backend` uniquement après avoir vérifié qu'un PostgreSQL local de test écoute sur `127.0.0.1:55432` et que la base dédiée `cashier_integration` a été créée pour cette suite. Réutiliser les outils natifs locaux déjà employés par les tests MLM ; ne pas copier des données distantes.

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
$previousDirectUrl = $env:DIRECT_URL
$previousTestUrl = $env:CASHIER_TEST_DATABASE_URL
try {
  $env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/cashier_integration'
  $env:DIRECT_URL = $env:DATABASE_URL
  $env:CASHIER_TEST_DATABASE_URL = $env:DATABASE_URL
  npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw 'Local migration failed' }
  npx prisma migrate status
  if ($LASTEXITCODE -ne 0) { throw 'Local migration status failed' }
  npm test -- --runInBand cashier-workflow.integration.spec.ts
  if ($LASTEXITCODE -ne 0) { throw 'Cashier integration failed' }
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
  $env:DIRECT_URL = $previousDirectUrl
  $env:CASHIER_TEST_DATABASE_URL = $previousTestUrl
}
```

Ne pas effacer ou recréer un cluster existant de l'utilisateur. Si le runtime local n'est pas disponible, rapporter la vérification native non exécutée et ne pas substituer la base distante.

- [x] **Step 3: Exécuter les vérifications larges.** Depuis `backend` : `npm test -- --runInBand`, `npm run build`, `npx prisma validate`. Depuis `frontend` : `npm test -- --maxWorkers=2`, `npm run build`. Relancer les suites MLM/activation/claims pertinentes, les gardes, le logout et les parcours parrain de récit. Comparer les résultats aux 21 échecs préexistants connus de `PortalPointsPage.test.tsx` et `NotFoundPage.test.tsx` et signaler leur état réel, sans correction hors périmètre. Distinguer tests natifs exécutés et tests ignorés faute de variable dédiée.

- [x] **Step 4: Vérifier le navigateur et le déploiement prévu.** Utiliser des sessions synthétiques isolées à 1440 px et 390 px, sans session de l'utilisateur : agent prépare un dossier sans paiement, caissier reprend la file et accède au POS, gérant voit les retours, agent/caissier n'accèdent pas aux autres sites. Intercepter toutes les API pour les essais UI. Contrôler les textes, états d'attente, erreurs, navigation clavier, menu mobile et absence de débordement.

Documenter dans `docs/cashier-role.md` : séparation des tâches, affectation manuelle par super-admin, rôle/site obligatoires, reprise du dossier existant, exceptions hors ligne conservées, remboursements gérant, et ordre de publication migration/backend/frontend. Ne pas attribuer de rôle réel avant publication coordonnée ; ne pas prétendre avoir publié ce qui reste local.

- [x] **Step 5: Revue finale et remise.** Utiliser `requesting-code-review` pour les accès directs, doubles chemins cash/mobile, site falsifié, callbacks et propriété de file. Résoudre les constats importants, relancer les tests concernés, puis `git -c core.safecrlf=false diff --check`. Rapporter les résultats et limites exacts, les migrations uniquement testées localement et l'absence de paiement distant. Attendre une demande distincte avant commit/push/déploiement.

## Couverture de la spécification et ordre de remise

- Rôles, utilisateurs, sessions et plafonds portail : tâche 1, puis régression native 7.
- Périmètre par site, recherches minimales, import et DTO génériques : tâche 2, puis attaque HTTP/native 7.
- Dossier non payé, identité, parrain et claim conservés : tâche 3, interface 5, transactions 7.
- Encaissements/activation/vente, retours et callbacks : tâche 4, interface 5, parcours métier 7.
- Menus, liens directs, indicateurs exacts, mobile et responsables : tâche 5 et vérification visuelle 7.
- Propriété de file, rôle courant, changement de session, anciennes entrées préservées : tâche 6.
- Migration additive, aucune promotion automatique, aucune écriture distante, documentation et non-régression MLM : contraintes globales et tâche 7.

La remise de ce plan n'est pas une implémentation. Le choix suivant porte sur l'exécution tâche par tâche avec sous-agents et revues, ou directement dans la même session avec points de contrôle.
