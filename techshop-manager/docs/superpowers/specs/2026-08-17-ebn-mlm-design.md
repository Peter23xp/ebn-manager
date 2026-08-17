# EBN Manager — module MLM à huit niveaux

## Objectif

Remplacer entièrement les modules Parrainage et Fidélité de TechShop Manager par un système MLM à huit niveaux. Le MLM utilise le client existant comme identité métier, sans introduire un nouveau rôle d'authentification : chaque client activé reçoit automatiquement un profil `Membre`, un portefeuille USD et une première matrice.

Les ventes restent dans leur devise commerciale existante. Les commissions, promotions, salaires et bonus retraite sont exprimés et stockés en USD.

## Architecture

Le frontend reste dans `frontend/` et le backend dans `backend/`. Le nouveau backend est un module NestJS `modules/mlm` :

- `MlmController` expose les routes `/api/v1/mlm/*`.
- `MlmService` gère la liste, les statistiques et la configuration.
- `MlmMatrixService` valide les filleuls, remplit les matrices et effectue les promotions.
- `MlmWalletService` construit les vues portefeuille et son historique.
- `MlmSalaryService` calcule et verse les salaires mensuels.

Le frontend ajoute `pages/mlm`, `components/mlm`, les hooks TanStack Query et `lib/mlm.api.ts`. Les routes sont protégées avec les gardes de rôles déjà utilisées par l'application.

## Modèle de données

La migration retire les tables et modèles historiques de parrainage et fidélité : `Parrainage`, `RegleParrainage`, `MouvementPoints`, `ConfigFidelite`, `NiveauConfig` et leurs enums. Le code de vente ne calculera plus de points ou remises de fidélité.

Les nouvelles entités sont :

- `MlmLevel` : les huit rangs, leurs quatre filleuls requis, commission, bonus, salaire et apparence.
- `Membre` : relation unique avec `Client`, matricule numérique, parrain, rang et statut.
- `Matrix` et `Position` : une matrice de quatre positions par membre et par rang.
- `Portefeuille` et `TransactionPortefeuille` : solde USD et journal immuable.
- `Promotion`, `BonusAttribue`, `SalaireVerse` et `BonusRetraite` : événements métier et preuves de paiement/livraison.

Tous les montants monétaires MLM utilisent `Decimal(12,2)`, jamais `Float`. Les contraintes uniques garantissent notamment un membre par client, un portefeuille par membre, quatre positions uniques par matrice, et un salaire par membre et mois.

## Cycle de vie membre et matrice

Lors de `onboardingActivate`, une transaction Prisma crée le profil MLM si absent : matricule `AAAAMMJJXXXX`, portefeuille vide, membre actif, matrice niveau 1 et quatre positions libres. Le matricule est généré via un compteur atomique par date ; PostgreSQL sert de repli tant que Redis n'est pas configuré.

La validation d'un filleul est réservée à `GERANT+`. Elle vérifie le même site pour un gérant, l'activation des deux membres, le parrain direct et une position disponible. Une seule transaction : attribue la position, incrémente la matrice, crédite la commission, crée la transaction de portefeuille, puis, au quatrième filleul, marque la matrice complète, crée la promotion et le bonus, met à niveau le membre et crée sa matrice suivante. Toute erreur annule l'ensemble.

Lorsqu'un membre atteint le niveau Crown Ambassadeur, son parrain direct reçoit une seule fois le bonus retraite. La contrainte unique `(membreId, filleulCrownId)` assure l'idempotence.

## Droits et confidentialité

- `CLIENT` : son portefeuille, ses transactions et sa progression uniquement.
- `AGENT` : lecture de membres de son site, sans validation ni configuration.
- `GERANT` : lecture/validation des membres de son site et gestion des bonus.
- `DIRECTEUR_REGIONAL` : lecture multi-sites de sa région selon les conventions existantes.
- `SUPER_ADMIN` : configuration, versements mensuels et toutes les consultations.

Le serveur détermine le membre du client connecté et force les filtres `siteId`; aucun identifiant de membre fourni par le navigateur ne contourne ces règles.

## Écrans et API

Les sept écrans demandés sont conservés : tableau de bord MLM, progression membre, matrice/arbre, portefeuille, configuration, bonus et salaires/retraite. Les routes seront `/mlm`, `/mlm/member/:id`, `/mlm/matrix/:id`, `/mlm/wallet`, `/mlm/wallet/:id`, `/mlm/config`, `/mlm/bonuses` et `/mlm/salary`.

Les opérations mutantes utilisent les routes `POST /mlm/members/:id/validate-filleul`, `PATCH /mlm/config/levels/:id`, `PATCH /mlm/bonuses/:id`, `POST /mlm/salaries/:month/process` et `PATCH /mlm/retirement-bonuses/:id/mark-paid`.

## Salaires et notifications

`MlmSalaryService.processMonthlySalaries(month)` ne peut produire qu'un versement par mois. Il valide l'absence de versements existants, sélectionne les membres actifs dont le rang a un salaire actif, et crée en transaction les crédits portefeuille, transactions et lignes `SalaireVerse`. Le traitement manuel et le cron mensuel appellent exactement la même fonction.

Les notifications email/SMS sont déclenchées après la transaction et n'annulent jamais une opération financière déjà validée.

## Migration et compatibilité

La migration Prisma doit être explicitement destructive pour les anciennes données de fidélité/parrainage : elle sera appliquée uniquement après sauvegarde de PostgreSQL. Les imports, le module NestJS, la sidebar, les routes et les pages de ces deux domaines seront supprimés ensemble afin d'éviter tout code orphelin.

Les rapports qui dépendent du parrainage seront remplacés par leurs vues MLM ou retirés. Les données de ventes restent intactes; les champs historiques de remise/points sont conservés seulement si requis par la lecture des anciennes ventes, mais ne sont plus alimentés.

## Tests et critères d'acceptation

- Tests Jest : validation matricielle atomique, cloisonnement par rôle/site, promotion, bonus retraite unique et idempotence des salaires.
- Tests Vitest : rôles des pages, navigation, tableaux, filtres, dialogues et appels API des sept écrans.
- Vérifications : génération Prisma, compilation backend/frontend, tests concernés et migration sur une base de test.

La livraison est découpée en socle de migration + API, puis en sept écrans dans l'ordre du document fourni. Chaque lot doit conserver le projet compilable et testé.
