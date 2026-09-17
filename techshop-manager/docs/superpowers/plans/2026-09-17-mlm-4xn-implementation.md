# MLM 4 x N Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Adapter le MLM existant aux generations completes, aux commissions 60/40 et a une remise a zero sauvegardee.

**Architecture:** Matrix/Position reste l'unique arbre. Des agregats par generation evitent de charger le reseau entier ; un verrou transactionnel de mutation matricielle serialise placements et mouvements. Les commissions sont des evenements uniques, la restitution une operation administrative distincte.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, TypeScript, React 18, Jest, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-mlm-4xn-commissions-design.md`, approuvee le 17 septembre 2026.

## Etat d'execution au 17 septembre 2026

Implementation presente dans le checkout ; publication sur main demandee explicitement par l'utilisateur le 17 septembre 2026. Les revues core, finance, portefeuille, frontend et maintenance sont closes apres corrections ; la revue finale des interfaces ne signale aucun nouveau blocage. La verification locale ne constitue pas un deploiement ni une purge. Resultats detailles : `docs/superpowers/changes/2026-09-17-mlm-verification.md`.

- Backend avant publication : 302 tests passes, dont 12 scenarios PostgreSQL ; 15 tests natifs optionnels ignores dans cette execution et verifies separement selon le bilan detaille.
- Build backend et schema valides ; sept migrations appliquees et comparees sans difference uniquement sur PostgreSQL local isole.
- Finance/calendrier : 110 tests passes et re-revue du fingerprint de calendrier acceptee.
- Maintenance : 14 tests natifs passes avant le dernier durcissement du controle de proprietaire Windows ; ensuite huit tests unitaires et une nouvelle sauvegarde/restauration native passes. Aucun de ces essais n'utilise les donnees distantes.
- Precision deux comptes : selection explicite multiple, manifeste lie a l'ensemble exact et compatibilite des anciens choix uniques ; neuf tests unitaires et deux tests natifs cibles passes apres cette adaptation.
- Frontend : 44 tests nouveaux passes, build passe ; suite complete 150 passes / 21 echecs preexistants hors perimetre.
- Aucun calendrier de production active, aucune migration distante, aucune sauvegarde distante et aucune purge distante. La validation financiere refuse une annee de calendrier absente.
- L'utilisateur confirme la conservation des deux super-admins existants. Gates restantes pour la purge : connexion directe verifiee, maintenance attestee, sauvegarde distante restauree et controlee. Le schema interne Supabase reste hors perimetre.

## Global Constraints

- Modifier le module MLM existant, sans moteur parallele ; distinguer recruteur personnel et parent matriciel.
- Quatre enfants matriciels maximum par membre, sans plafond de quatre recrutements personnels.
- Builder acquis a 4/4, Sapphire a 16/16, puis 4 puissance generation jusqu'a 8.
- Retenue de 30 jours ouvrables : lundi a samedi, hors dimanches et jours feries de RDC.
- Aucun appel KPay lors de la validation ou de la restitution d'une commission.
- Pas de suppression des historiques financiers ou de placement.
- Commit et push sur main autorises par la demande utilisateur du 17 septembre 2026 ; aucune nouvelle branche ni push force. Conserver les modifications utilisateur existantes hors perimetre.
- Aucun test destructif sur la base configuree ; purge seulement apres sauvegarde restauree et verification de la maintenance.
- Ne pas toucher aux tables internes de Supabase.

## Task 1: Contrats Prisma et contraintes

**Files:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260917000000_mlm_generations/migration.sql`, `backend/src/modules/mlm/mlm-schema.spec.ts`.

**Interfaces:** Position.filleulId unique FK, Membre.matrixPosition inverse, Matrix.occupiedPositions agrege ; Membre.highestLevelAchieved Int. PlacementHistory porte memberId, recruiterId, oldParentId, newParentId, oldPosition, newPosition, actorId, reason, operationId, operationType, createdAt. Commission.matrixId/positionId/validatedById/reinvestLot. ReinvestLote.releaseDate, releasedAt nullable, status HOLD_PERIOD|RELEASABLE|RELEASED|CANCELLED, calendarVersion, timezone, releasedById ; commissionId unique FK. MlmCalendarYear(year unique, holidays Json, version, source, timezone, updatedAt).

- [x] Ecrire et observer le test rouge de presence des FK/contraintes/index et de migration non destructive.
```typescript
expect(schema).toMatch(/filleulId\s+String\?\s+@unique/);
expect(migration).toContain('RENAME COLUMN "releasedAt" TO "releaseDate"');
expect(migration).not.toMatch(/TRUNCATE|DROP TABLE/);
```
- [x] Ajouter champs et relations, contraintes SQL sur slots et matrice generation 1, historique append-only et montants coherents. Refuser les donnees historiques incompatibles, ne pas les effacer.
- [x] Executer `npx prisma validate`, `npx prisma generate` et `npm test -- --runInBand mlm-schema` dans backend.

## Task 2: Montants et calendrier

**Files:** creer `backend/src/modules/mlm/mlm-finance.ts`, `mlm-finance.spec.ts`, `mlm-calendar.service.ts`, `mlm-calendar.service.spec.ts` ; documentation calendrier sous `docs/superpowers`.

**Interfaces:** `commissionAmounts(immediate: Prisma.Decimal.Value): { total: Prisma.Decimal; immediate: Prisma.Decimal; held: Prisma.Decimal }`. `MlmCalendarService.getReleaseSchedule(validatedAt: Date, tx?: Prisma.TransactionClient): Promise<{releaseDate: Date; calendarVersion: string; timezone: string}>`. `listYears()` et `saveYear(year, input)` pour configuration. Donnees calendrier chargees en base, annee absente refusee.

- [x] Ecrire les tests des huit triples et des dates ouvrables avant implementation.
```typescript
expect(commissionAmounts('24').total.toFixed(2)).toBe('40.00');
expect(commissionAmounts('50').held.toFixed(2)).toBe('33.33');
expect(commissionAmounts('50000').total.toFixed(2)).toBe('83333.33');
```
- [x] Executer `npm test -- --runInBand mlm-finance mlm-calendar`, constater les fonctions manquantes.
- [x] Implementer Decimal arrondi HALF_UP et difference exacte ; refuser negatif/non fini. Compter apres la validation, samedi inclus, dimanche/feries exclus, dates locales Africa/Lubumbashi, couverture annuelle obligatoire, dates dupliquees sans double exclusion.
```typescript
const total = immediate.div('0.60').toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const held = total.minus(immediate);
```
- [x] Tester samedi, dimanche, ferie samedi, report explicite, bissextile, changement d'annee, heure UTC et calendrier absent. Documenter les sources juridiques verifiees, sans inventer de report ni activer un calendrier incertain.

## Task 3: Placement, generations et historique

**Files:** `backend/src/modules/mlm/mlm-matrix.service.ts`, creer `mlm-generation.ts`, `mlm-generation.spec.ts`, `mlm-placement.service.ts`, `mlm-placement.service.spec.ts`, adapter `mlm-matrix.service.spec.ts` et `mlm-parrain-link.spec.ts`.

**Interfaces:** `generationProgress(levels, matrices, highestLevelAchieved)` retourne currentLevel,nextLevel,currentGeneration,completedPositions,requiredPositions,remainingPositions,progressPercentage. `MlmPlacementService.place(tx, memberId, recruiterId, actorId?)`, `move(input, actorId)`, `swap(input, actorId)`, `history(memberId, page, limit)`, `recalculateAncestors(tx, memberIds, triggeringMemberId, positionId?)` dans le meme module. Les dependances financieres utilisent les champs captures de Commission.

- [x] Ecrire tests 4, 4+4, 4+16, generation 8 simulee, parent lent, 100 descendants inegaux.
```typescript
expect(generationProgress(levels, [{ordre: 1, count: 4}, {ordre: 2, count: 4}], 1).currentLevel.ordre).toBe(1);
expect(generationProgress(levels, [{ordre: 1, count: 4}, {ordre: 2, count: 16}], 2).currentLevel.ordre).toBe(2);
```
- [x] Observer les tests rouges, implementer arbre permanent de quatre slots, spillover BFS deterministe, membre actif, parrain conserve, occupant unique, reprise transactionnelle bornee.
- [x] Sur activation, recalculer chaque ancetre utile a partir des quatre enfants et de leurs agregats (8 maximum), pas des descendants charges. Sur mouvement, mettre a jour anciennes/nouvelles chaines du bas vers le haut.
- [x] Creer une Commission EN_ATTENTE avec reference `generation:<memberId>:<levelId>` pour chaque generation complete jamais remuneree, capturer montants, matrice et position declencheuse ; conserver bonus/salaires/retraite sans doublons.
- [x] Tester deplacement, echange, cycles, slot occupe, idempotence, acteur, descendants et recruteur conserves, perte/reacquisition sans nouvelle commission.
- [x] Executer tests ciblant `mlm-generation|mlm-placement|mlm-matrix|mlm-parrain|mlm-claim`.

## Task 4: Cycle financier transactionnel

**Files:** `backend/src/modules/mlm/mlm-matrix.service.ts`, `mlm-wallet.service.ts`, `reinvest-release.service.ts` et leurs tests ; `backend/src/modules/portal/portal.service.ts` et test.

**Interfaces:** Validation existante accepte actorId ; `MlmWalletService.releaseHeldLot(lotId: string, actorId: string)` restitue un lot eligible. Les lectures ajoutent financialSummary et reinvestLots avec echeance, statut et montants du serveur.

- [x] Tester EN_ATTENTE sans credit, validation unique avec 24 disponible/16 retenu/40 gagne, lot unique et calendrier capture.
- [x] Verrouiller portefeuille avant transitions financieres ; utiliser mutation conditionnelle et Decimal. Validation fixe valideeAt et constitue les deux poches dans la meme transaction.
- [x] Tester et remplacer cron par `updateMany({where:{status:'HOLD_PERIOD',releaseDate:{lte:now}},data:{status:'RELEASABLE'}})` sur pages bornees ; aucun credit ni KPay.
- [x] Tester restitution administrative une seule fois, journal reference unique, maintien totalGagne ; annulation avec contre-ecriture et statut CANCELLED sans delete des lots.
- [x] Adapter portail/lectures a releaseDate distinct de releasedAt et aux soldes agregees serveur, conserver circuits retraits existants.
- [x] Executer `npm test -- --runInBand mlm-wallet mlm-matrix reinvest-release portal.service`.

## Task 5: Endpoints et projections

**Files:** `backend/src/modules/mlm/mlm.service.ts`, `mlm.controller.ts`, `mlm.module.ts`, creer `dto/matrix-placement.dto.ts`, `mlm-api.spec.ts`.

**Interfaces:** GET matrix/:memberId/tree (depth 0..3, nodes <=85), GET matrix/:memberId/generation/:generation (page/limit <=100), POST matrix/move, POST matrix/swap, GET matrix/:memberId/history, GET/PUT config/calendar/:year, POST reinvest/:lotId/release. JWT actor, SUPER_ADMIN ou DIRECTEUR_REGIONAL pour mutations.

- [x] Ecrire tests de validation des DTO, roles, borne des lectures, recruteur distinct du parent, generation courante et rang acquis.
- [x] Reutiliser getMemberProgress avec nouveaux champs et projections legacy compatibles ; config calcule les trois montants a partir du seul immediateAmount et ne permet plus commissionParFilleul comme remuneration.
- [x] Arbre lit Position et non Membre.filleuls ; retourner children, emptyPositions, hasMore, generation, position, recruiter, matrixParent, progression et statut. Expansion a la demande conserve l'ecran existant.
- [x] Executer tests endpoints et compilation backend `npm run build`.

## Task 6: Interfaces existantes

**Files:** types/mlm, lib/mlm.api, pages/mlm (Tree,Progress,Levels,Config,Commissions,Wallet,Members,Dashboard), components/mlm/MatrixGrid et composants portail consommateurs ; nouveaux tests proches des pages.

**Interfaces:** Consommer strictement les montants et generationProgress serveur, sans calcul financier frontend. Conserver anciennes routes et styles.

- [x] Lire Impeccable et executer son script de contexte avant changements UI.
- [x] Tests rouges : afficher Builder en cours avant 4/4 ; 4/4 donne objectif16, parent et recruteur differents en spillover ; montants 40/24/16 et date de restitution serveur.
- [x] Adapter arbre existant avec expansion, details accessibles, places libres et generation, pas de milliers de cases ; exposer mouvement/historique admin et calendrier dans config MLM.
- [x] Adapter progression et fin du rang8 ; separer historique immediate, disponible courant, retenue, restituable et restitue ; retirer labels par-filleul/30jours calendaires.
- [x] Executer `npm test` et `npm run build` dans frontend.

## Task 7: Integration PostgreSQL et remise a zero sure

**Files:** creer scripts maintenance/sauvegarde/restauration/purge sous `backend/scripts`, tests sous `backend/src/modules/mlm`; adapter `backend/prisma/seed.ts` pour montants sans execution sur cible.

**Interfaces:** Inspection et dry-run par defaut. Purge exige empreinte cible, sauvegarde verifiee, maintenance attestee et ensemble explicite des super-admins preserves ; pas de seed qui change leurs hashes. Table allowlist issue du schema, pas de cascade inconnue.

- [x] Preparer PostgreSQL isole ; appliquer migrations historiques et nouvelle migration, tester en SQL contraintes et concurrence placement/validation/restitution.
- [x] Tests de backup/restauration avec objets JSON/Decimal/dates, verifications compteurs/hashes/relations/sequences. Tests purge preserving admin ID/hash, configuration et tables inconnues.
- [ ] Inspecter uniquement metadonnees/compteurs de la cible sans secrets ; verifier historique de migration et absence de paiements en cours.
- [ ] En maintenance verifiee, sauvegarder hors depot avec ACL restreinte, restaurer sur base isolee, verifier schema/donnees, executer dry-run puis purge transactionnelle allowlist approuvee.
- [ ] Appliquer migration et niveaux/calendrier confirme, verifier zeros/huit niveaux/admin inchange, puis remettre service. Si gate non satisfaite, ne pas purger et documenter le blocage exact.

## Task 8: Verification finale et revue

- [x] Executer `npx prisma validate`, `npm run build`, `npm test -- --runInBand` dans backend ; `npm test -- --maxWorkers=1`, `npm run build` dans frontend. Les 21 echecs frontend preexistants sont documentes, pas declares corriges.
- [x] Revue independante diff complet : exigences, relations, idempotence, concurrence, calendrier, protection donnees et regression.
- [x] Corriger findings dans tests cibles et relancer verification impactee ; aucune affirmation de purge ou de succes non observee.
- [x] Mettre a jour ce plan et le journal d'execution avec commandes/resultats et limites restantes.
