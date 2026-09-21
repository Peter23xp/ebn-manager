# Progressive MLM Commissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Rémunérer chaque progression matricielle valide, avec validation et retenues existantes, sans double commission.

**Architecture:** Étendre Matrix et Commission, calculer les tranches en Decimal par différence de cumuls, comptabiliser uniquement l'état final des placements. Partager une initialisation historique entre événements normaux et rattrapage contrôlé. Conserver les routes, portefeuilles et rangs existants.

**Tech Stack:** NestJS, Prisma 5 / PostgreSQL, Jest, React / TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-mlm-progressive-commissions-design.md`

## Global Constraints

- Builder : quatre tranches de 10 USD, chacune composée de 6 USD disponibles après validation et de 4 USD retenus.
- Les huit générations rapportent indépendamment.
- Les retenues deviennent restituables après 30 jours ouvrables, du lundi au samedi, hors jours fériés RDC.
- Aucun accès métier à la base de production ; aucune purge, migration distante, modification de portefeuille réel, publication ou commit.
- Réutiliser les services existants ; montants d'API en chaînes décimales, aucun calcul financier frontend.
- Tests rouges avant implémentation, tests verts puis revue. Utiliser apply_patch pour éditer les fichiers.
- Travail dans le checkout demandé, sans créer de branche ni changer HEAD ; les modifications restent non commitées.

### Task 1: Schéma et comptabilisation exacte

**Files:** `backend/prisma/schema.prisma`, nouvelle migration additive ; créer `backend/src/modules/mlm/mlm-progressive.ts`, `mlm-progressive.spec.ts`, `mlm-progressive.service.ts`, `mlm-progressive.service.spec.ts`.

**Interfaces:** `progressiveAmounts(budget: { total, immediate, held }, capacity: number, from: number, to: number)` retourne trois Decimal. `MlmProgressiveService.preview(tx, matrixId)` retourne l'état rapproché, la plage proposée et ses montants sans écriture ; `account(tx, matrixId, event)` écrit une commission EN_ATTENTE et la borne dans la même transaction. Event contient `id`, `actorId?`, `triggerId?`, `positionId?`, `origin`.

- [x] Écrire puis exécuter les tests monétaires : Builder 0→1 = 10/6/4 ; Sapphire cumuls = 83.33/50/33.33 ; toutes capacités 4^1..4^8 ; plages groupées, budgets faibles/nuls et entrées invalides.
```ts
expect(progressiveAmounts({ total: '40', immediate: '24', held: '16' }, 4, 0, 1).total.toFixed(2)).toBe('10.00');
```
- [x] Ajouter les champs Matrix du spec et les métadonnées Commission, filleul nullable, unicité matrixId/progressTo, CHECK budgets et plages. Ne pas réécrire les données historiques.
- [x] Implémenter les différences de cumuls Decimal, validation finitude/2 décimales/non-négativité/cohérence/capacité.
```ts
const cumulative = (amount: Prisma.Decimal, position: number) => amount.mul(position).div(capacity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
```
- [x] Tester puis implémenter preview/account : références historiques reconnues, tous statuts consommés, gel du budget, marqueur indépendant des bonus, plages progressives cohérentes, anomalies bloquantes, haut compteur jamais diminué, niveaux inactifs suspendus. Pas de ligne financière nulle.
- [x] Exécuter `npx prisma validate`, `npx prisma generate` et `npm test -- --runInBand mlm-progressive` avec des URL locales factices. Revue du diff et des tests.

### Task 2: État final de placement et cycle financier

**Files:** `backend/src/modules/mlm/mlm-placement.service.ts`, `mlm-matrix.service.ts`, tests placement/ascent/matrix/wallet et tests intégration existants.

**Interfaces:** réutiliser `MlmProgressiveService.account`; transmettre un Set de matrices affectées pendant les recalculs ; finaliser après settleAscents dans place/move/swap/reconcileAscents. La garde des avantages devient generationRewardedAt.

- [x] Adapter les tests pour vérifier premier enfant = tranche, génération 2 avant Builder complet, dernier enfant = dernière tranche sans commission complète supplémentaire.
```ts
expect(commissions.map(row => row.montant.toFixed(2))).toEqual(['10.00', '10.00', '10.00', '10.00']);
```
- [x] Séparer le recalcul structurel des émissions financières ; collecter matrices et traiter les commissions après toutes les remontées, sous le verrou 604008. Garder une finalisation immédiate pour les appels directs de recalcul existants.
- [x] Tester les relectures, le spillover, les déplacements 3→2→3→4, les remontées et l'absence d'avantages transitoires. Conserver les recruteurs et historiques.
- [x] Valider les parts strictement positives seulement ; ne pas créer de journal/lot nul. Tester retenue seule, immédiat seul, double validation/restitution et calendriers.
- [x] Exécuter `npm test -- --runInBand mlm-placement mlm-ascent mlm-matrix mlm-wallet mlm-calendar reinvest` et revue ciblée.

### Task 3: API et interfaces administration/portail

**Files:** `backend/src/modules/mlm/mlm.service.ts`, `mlm-wallet.service.ts`, contrats/contrôleurs portail si nécessaire ; `frontend/src/lib/mlm.api.ts`, `portal.api.ts`, pages MLM Commissions/Progress/Wallet/Config et composants portail consommateurs ; tests voisins.

**Interfaces:** ajouter une liste `progressiveCommissions` aux réponses de progression et de portefeuille (staff et portail). Conserver la réponse tableau existante des revenus par niveau. Chaque ligne : matrixId, generation, levelName, capacity, currentValidPositions, accountedPositions, budgetTotal/budgetImmediate/budgetHeld, generatedTotal/pendingTotal/validatedTotal/cancelledTotal, immediateCredited/heldAmount/releasableAmount/releasedAmount, remainingTotal, suspendedReason. Montants chaînes 2 décimales ; budget, droits comptabilisés et reste null lorsqu'une incohérence historique interdit de les confirmer. Commission expose ses progressFrom/progressTo/origin et déclencheur nullable.

- [x] Écrire tests d'affichage de tranches, rattrapage sans faux filleul, ancien historique, montants backend, absence de confusion rang/solde et erreur lisible.
```tsx
expect(screen.getByText(/Rattrapage de génération/i)).toBeInTheDocument();
```
- [x] Implémenter agrégats backend ciblés par membre/niveau ; conserver protections rôle/site/propriétaire et pagination.
- [x] Réutiliser le style des pages existantes, ajouter tableau/cartes de progression financière huit générations dans staff et portail, historique de plage et avertissement budget figé en configuration.
- [x] Exécuter tests ciblés Vitest et Jest, build frontend/backend ; vérifier mobile avec données synthétiques et API interceptées, sans backend réel.

### Task 4: Rattrapage sécurisé et migration isolée

**Files:** créer `backend/scripts/mlm-progressive-catchup.ts`, tests `backend/src/modules/mlm/mlm-progressive-catchup.spec.ts`, documentation d'exploitation dédiée. Réutiliser maintenance.ts pour inspectTarget/createBackup/verifyBackup, jamais purge.

**Interfaces:** mêmes preview/account que Task 1 ; aperçu JSON privé avec operationId/version/targetFingerprint/stateHash/entrées bornées. Exécution explicite avec aperçu et sauvegarde vérifiée, aucune validation automatique.

- [x] Tester dry-run sans écritures, anomalie historique, cible incorrecte, sauvegarde absente, aperçu périmé, reprise identique sans doublon.
```ts
expect(result.entries[0].proposed.total).toBe('10.00');
expect(afterWalletBalance).toEqual(beforeWalletBalance);
```
- [x] Implémenter lecture paginée en transaction read-only, empreintes stables sans secrets, comparaison sous verrou et transaction par lot, reprise idempotente, fichier de résultat privé. Rejeter les entrées divergentes plutôt que recalculer silencieusement.
- [x] Documenter les commandes d'aperçu et d'application, la sauvegarde, les critères de blocage, le calendrier nécessaire et le fait que les nouvelles commissions attendent validation.
- [x] Tester la migration sur PostgreSQL isolé synthétique si disponible, sinon signaler explicitement la vérification non réalisée. Ne jamais utiliser .env réel.

### Task 5: Revue et régressions

**Files:** fichiers modifiés et tests existants concernés ; mettre à jour ce plan avec preuves.

- [x] Revue indépendante du diff complet : limites des générations, exactitude décimale, atomicité/concurrence, bootstrap historique, annulation, montants nuls, bonus une fois, autorisations et écritures distantes.
- [x] Exécuter tests ciblés puis suites backend/frontend sans base distante ; valider/générer Prisma, compiler les deux applications et `git diff --check`.
- [x] Corriger les défauts liés à cette fonctionnalité avec tests de régression. Documenter séparément les échecs préexistants/non liés sans les masquer.
- [x] Livrer un résumé des fonctionnalités et preuves, plus opérations production volontairement non exécutées. Aucun commit/push/déploiement sans demande.

## Clôture locale

Les cinq tâches sont implémentées. Voir `docs/superpowers/mlm-progressive-verification.md` et `docs/superpowers/mlm-progressive-catchup-runbook.md` pour les preuves et l'exploitation.

- Backend final : 1 381 tests réussis, 199 cas conditionnels ignorés ; 61 intégrations PostgreSQL réussies et 63 tests de rattrapage/maintenance réussis avec restauration native.
- Frontend : 862 tests réussis ; 21 échecs déjà reproduits sur le commit de base, documentés sans modification hors périmètre.
- Builds des deux applications, validation/génération Prisma, 11 migrations locales et huit scénarios navigateur synthétiques : réussis.
- Revues indépendantes initiales réalisées sur moteur, API/UI et rattrapage. Les corrections moteur/API/UI ont une seconde revue ; le contrôleur a clôturé les trois corrections de rattrapage par inspection et tests natifs, la seconde revue indépendante étant indisponible à cause d'une limite du fournisseur.
- Services locaux de test arrêtés ; données préexistantes préservées. Aucun commit, push, déploiement, migration distante ou rattrapage de production.
