# Evolution du MLM existant : matrice 4 x N, commissions et remise a zero

Date : 17 septembre 2026.
Statut : conception approuvee par l'utilisateur le 17 septembre 2026 ; implementation autorisee.
Methode : Superpowers, parcours architectural : audit, conception, plan, implementation testee.

## 1. Decisions confirmees

- Modifier le module MLM existant, sans moteur parallele ; distinguer recruteur personnel et parent matriciel.
- Quatre enfants matriciels maximum par membre, sans plafond de quatre recrutements personnels. Placement supplementaire par spillover deterministe.
- Builder acquis a generation 1 complete (4/4), Sapphire a generation 2 complete (16/16), puis chaque rang de meme ordre jusqu'a Crown Ambassadeur a generation 8 (65 536/65 536). Avant 4/4 : « Builder en cours ».
- Une commission remunere l'accomplissement d'une generation/niveau, et non plus chaque recrutement individuellement.
- Retenue de 30 jours ouvrables a compter de la validation : lundi a samedi, hors dimanches et jours feries de RDC.
- Purge autorisee de la base Supabase actuellement configuree, apres sauvegarde et validation du moteur ; conserver les deux comptes super-admin existants et les parametres techniques, reinitialiser les huit niveaux. Precision utilisateur du 17 septembre 2026 : conserver Peter AKILIMALI et Seraphin Bagalwa, sans selection automatique d'autres comptes.
- Ne pas toucher aux tables internes de Supabase.

La purge autorisee remplace la conservation initialement demandee des anciennes donnees dans la base active. Leur sauvegarde reste obligatoire. La purge n'est pas une migration automatique.

## 2. Audit et fichiers concernes

### Modeles

`backend/prisma/schema.prisma` : Membre, MlmLevel, Matrix, Position, Promotion, Commission, Portefeuille, TransactionPortefeuille, ReinvestLote et relations de ParrainClaim.

- Membre.parrainId et Client.parrainClientId designent le recruteur ; conserver cette signification.
- Matrix est unique par membre/niveau. Actuellement, chaque promotion ouvre une autre matrice de quatre positions.
- Position.filleulId n'est pas une relation Prisma ; une personne peut etre referencee par plusieurs positions historiques.
- Aucun mecanisme de spillover, de deplacement/echange ou d'historique de placement n'a ete trouve dans le moteur inspecte.
- Commission.referenceId est unique mais identifie actuellement parrain/filleul/niveau, pas une generation accomplie.
- ReinvestLote.releasedAt designe actuellement l'echeance future. Le cron credite automatiquement le disponible a cette echeance.

### Backend

- `backend/src/modules/mlm/mlm-matrix.service.ts` : placement, promotion, arbre, creation/cycle des commissions.
- `backend/src/modules/mlm/mlm.service.ts` : progression, statistiques, configuration et historique.
- `backend/src/modules/mlm/mlm-wallet.service.ts` : precision decimale, credit, retenue, restitution et lectures.
- `backend/src/modules/mlm/reinvest-release.service.ts` : rendre les lots restituables sans deplacement automatique de fonds.
- `backend/src/modules/mlm/mlm-claim.service.ts` : rattacher le recruteur puis effectuer le placement sans les confondre.
- `backend/src/modules/mlm/mlm.controller.ts` et `backend/src/modules/mlm/mlm.module.ts` : conserver les endpoints et completer les operations dans le meme module.
- `backend/src/modules/portal/portal.service.ts` et `backend/src/modules/portal/portal.controller.ts` : projections des nouvelles donnees pour le membre.
- `backend/src/modules/clients/clients.service.ts` : conserver les points d'appel onClientActivated ; adapter seulement leur contrat si necessaire.
- `backend/prisma/seed.ts`, migrations et scripts de maintenance : nouveaux parametres, sans reinitialiser le mot de passe administrateur.

### Frontend

- `frontend/src/pages/mlm/MlmTreePage.tsx`, `frontend/src/pages/mlm/MemberProgressPage.tsx` et `frontend/src/pages/mlm/MlmMembersPage.tsx`.
- `frontend/src/pages/mlm/MlmDashboardPage.tsx`, `frontend/src/pages/mlm/MlmLevelsPage.tsx` et `frontend/src/pages/mlm/MlmConfigPage.tsx`.
- `frontend/src/pages/mlm/MlmCommissionsPage.tsx`, `frontend/src/pages/mlm/WalletPage.tsx` et affichages dependants de MlmClaimsPage.
- `frontend/src/components/mlm/MatrixGrid.tsx`, CareerProgressBar, NetworkStatsCards et composants de rang/statistiques dependants.
- `frontend/src/lib/mlm.api.ts`, `frontend/src/types/mlm.ts`, useMlm et hooks de reseau/portail concernes.
- ReferralTree, WalletCard et pages du portail consommant progression et retenues : PortalHomePage, PortalPointsPage, PortalFilleulsPage notamment.
- Aucun changement fonctionnel sans rapport dans les ventes, stocks, support, utilisateurs ou KPay. Les ecrans existants sont adaptes, pas remplaces.

## 3. Approches comparees

1. **Recommandee : reutiliser Matrix/Position comme arbre normalise**, completer les relations et conserver les agregats de generation dans les matrices existantes. Une seule source de verite.
2. Recalcul integral du sous-arbre a chaque lecture : simple mais trop couteux aux profondeurs elevees ; rejete.
3. Deuxieme arbre/moteur synchronise avec le premier : duplication et risque de divergence ; rejete.

Les helpers de calendrier, montants et requetes restent internes au module MLM, sans creer un autre domaine metier.

## 4. Source de verite et placement

- Les quatre Position de la Matrix de generation 1 d'un membre sont ses emplacements permanents, quel que soit son rang. Les liens physiques sont autorises seulement sur ces matrices.
- Position reference son occupant par une vraie relation Prisma, unique et facultative. Le membre expose la relation inverse ; une racine n'a pas de position entrante.
- Le parent matriciel se deduit de position.matrix.membreId. Ne pas copier le parent dans une autre arborescence independante.
- Les matrices des generations 2 a 8 portent des agregats, pas des milliers de cases vides precreees.
- Contraintes : un occupant unique, unicite matrixId/numeroPosition, numero entre 1 et 4, pas d'auto-placement, pas de cycle ni de membre inexistant. Verifier aussi la generation de la matrice dans les mutations et contraintes appropriees.
- Une personne suspendue/en attente conserve sa place. Seules les positions valides avec une chaine de membres actifs depuis l'ancetre comptent pour l'accomplissement.
- Rechercher d'abord chez le recruteur, puis en largeur dans sa descendance, par positions 1, 2, 3, 4 creees dans cet ordre. Un identifiant est le dernier critere stable.
- Revendiquer la premiere place libre d'un parent actif par mutation conditionnelle transactionnelle. Les conflits ont des reprises bornees et un ordre de verrous documente.
- Placement, journal et mises a jour des agregats appartiennent a la meme transaction. Ne pas limiter la recherche au rang du recruteur.
- Recruteur et parent peuvent differer. Un descendant progresse sur sa propre structure, sans condition sur le rang de son parent.

## 5. Progression et rangs

- Profondeur = MlmLevel.ordre ; facteur de branchement = quatre. Calculer requiredPositions = branchingFactor ** generation dans le backend.
- Compter exactement les positions valides de chaque generation, avec la chaine requise ; jamais comparer le total melange des descendants au seuil d'un rang.
- Le total des descendants est une somme distincte. Les places occupees, valides et restantes sont distinguees.
- Les agregats sont des projections transactionnelles verifiables par une commande de recalcul en lecture seule ; une reparation exige une action explicite.
- Le rang courant correspond a la derniere generation complete dans la structure actuelle. L'historique conserve le plus haut rang acquis ; perdre/reconstituer une generation ne la remunere pas deux fois.
- Contrat serveur : currentLevel, nextLevel, currentGeneration, completedPositions, requiredPositions, remainingPositions, progressPercentage, directMatrixChildrenCount, personalRecruitCount, totalDescendants, highestLevelAchieved.
- Avant 4/4 : currentLevel null, cible Builder, generation 1. Le champ historique mlmLevelId peut garder Builder comme valeur technique de compatibilite ; ce champ seul n'est plus une preuve de rang acquis.
- Apres 4/4 : Builder acquis, objectif suivant generation 2 a 16 places. Apres 16/16 : Sapphire acquis, objectif generation 3 a 64 places.
- Generation 8 complete : nextLevel null, 65 536/65 536 ; aucune generation 9 remunerable.

## 6. Deplacements, echanges et historique

La règle initiale ci-dessous est complétée par la remontée automatique approuvée dans `2026-09-17-mlm-automatic-ascent-design.md` : branche à 4/4, parent incomplet, place libre chez le grand-parent ; aucune permutation ancêtre/enfant. Les garde-fous et les opérations administratives restent applicables.

- Spillover automatique, mais deplacements/echanges administratifs explicites. Pas de rearrangement automatique fonde sur une regle de « branche avancee » non definie.
- Autorisation proposee : SUPER_ADMIN et DIRECTEUR_REGIONAL. L'acteur vient du JWT, pas d'un identifiant libre du navigateur.
- Motif, cle d'idempotence et placement attendu obligatoires. Un deplacement conserve le sous-arbre ; un echange est refuse entre ancetre et descendant.
- Verifier les cycles dans la structure cible, les quatre places, les autorisations et les conflits ; appliquer toute l'operation dans une transaction.
- Ajouter un historique append-only : membre, recruteur capture, ancien/nouveau parent, ancienne/nouvelle place, motif, date, acteur, type et identifiant d'operation.
- Un echange produit deux lignes liees. Ne jamais ecraser ou supprimer l'historique lors d'une operation ulterieure.
- Recalculer les agregats/rangs affectes. Une generation nouvellement complete cree au plus une commission en attente, sans validation financiere implicite.
- Ne pas annuler automatiquement les commissions deja validees apres un mouvement ; ne jamais les recreer a la reconstitution d'une generation.

## 7. Commissions : evenement, montants et validation

- Remplacer le credit par filleul par une commission par membre et generation accomplie. Cle stable unique, par exemple generation:<membreId>:<levelId>.
- Reutiliser Commission, ses montants et referenceId ; completer les liens vers matrice, placement declencheur et evenement/acteur.
- Capturer les montants du niveau a la creation : une modification de configuration ne reecrit pas l'historique financier.
- Les champs de niveau commissionSysteme, commissionRetour et commissionTotale representent desormais les montants immediate, retenu et total du niveau entier. commissionParFilleul reste un champ historique sans effet sur le nouveau moteur ; il n'est plus editable comme regle de remuneration.
- Proposition : creation EN_ATTENTE ; la validation administrative existante passe a VALIDEE, fixe validatedAt et credite les 60 % tout en constituant les 40 % retenus dans une transaction.
- Le marquage PAYEE existant, s'il est utilise, ne declenche pas de second credit et ne masque pas l'etat de la retenue.

Montants cibles en USD, dans l'ordre immediat / retenu / total :

- Builder : 24.00 / 16.00 / 40.00.
- Sapphire : 50.00 / 33.33 / 83.33.
- Ruby : 80.00 / 53.33 / 133.33.
- Emerald : 200.00 / 133.33 / 333.33.
- Diamond : 1000.00 / 666.67 / 1666.67.
- Crown Diamond : 2000.00 / 1333.33 / 3333.33.
- Ambassadeur : 20000.00 / 13333.33 / 33333.33.
- Crown Ambassadeur : 50000.00 / 33333.33 / 83333.33.

Un seul helper serveur utilise Prisma.Decimal : total arrondi au centime = immediat / 0.60 ; retenu = total - immediat. Le ratio apres arrondi peut differer de fractions de centime, mais immediat + retenu = total reste exact. Ne pas appliquer +60 %, sommer quatre montants unitaires arrondis, ou dupliquer ce calcul dans le frontend.

## 8. Retenue, calendrier et restitution

- Reutiliser ReinvestLote, avec un lot unique par nouvelle commission et une relation explicite.
- Distinguer releaseDate (echeance) et releasedAt (restitution effective). Renommer proprement l'ancien champ d'echeance.
- Etat de retenue : HOLD_PERIOD, RELEASABLE, RELEASED, CANCELLED. Les etats generaux de commission restent reutilises quand ils conviennent.
- Le cron existant traite les lots par pages et les rend seulement RELEASABLE a echeance : aucun mouvement de portefeuille ni appel KPay.
- Une action administrative du meme module restitue un lot eligible : transfert retenu vers disponible et journal, une seule fois. Un paiement effectif passe ensuite par les retraits existants.
- totalGagne augmente du total a la validation initiale ; le transfert entre poches ne constitue pas un deuxieme gain.
- Les annulations conservent les lots et journaux, marquent les retenues annulees et enregistrent des contre-ecritures compatibles avec les reserves et retraits.

Calendrier :

- Compter a partir du lendemain de la date locale de validation ; le jour de validation n'est pas un jour ecoule.
- Compter lundi a samedi, exclure dimanche et jours feries RDC ; conserver l'heure locale de validation au trentieme jour ouvrable.
- Proposition de fuseau metier explicite : Africa/Lubumbashi. Stocker les horodatages en UTC et tester les conversions de date.
- Calendrier annuel versionne avec dates feriees, observees/reportees et fermetures exceptionnelles documentees. Ne pas supposer un report generique au lundi.
- Verifier les dates nationales initiales et leurs reports a partir des textes/communiques officiels avant activation en production. Aucune requete Internet pendant un calcul de commission.
- Capturer echeance, fuseau et version du calendrier sur le lot ; ne pas changer silencieusement une echeance existante apres modification du calendrier.
- Si une annee traversee n'est pas couverte, refuser la validation avec une erreur exploitable, plutot que calculer une date approximative.
- Maintenir ce calendrier dans la configuration MLM existante, sans nouveau module administratif.

## 9. Endpoints, affichage et performances

- Conserver les routes de progression, arbre, matrice, commissions et portefeuille ; enrichir leurs contrats types. Ajouter seulement deplacement/echange, historique, calendrier et restitution.
- Arbre existant : distinguer recruteur, parent, generation relative a la racine affichee, position, etat, rang et places libres.
- Panneau membre : identite, recruteur, parent, rang acquis/cible, progression, enfants matriciels, recrutements personnels et places restantes.
- Commissions/portefeuille : total genere et valide, immediat historiquement credite, disponible courant, retenu non echu, restituable, deja restitue et echeance par lot.
- Charger les enfants a la demande, avec pagination et filtres ancetre/generation. Limites imposees par l'API ; aucune materialisation de 65 536 cases vides dans le navigateur.
- Une activation met a jour les ancetres utiles jusqu'a huit generations par requetes ciblees, sans charger tous leurs descendants.
- Spillover par frontieres ordonnees bornees en memoire ; controles de cycle/mouvement en base et limites de temps explicites.
- Indexer occupant matriciel, matrices membre/niveau, historique membre/date et lots statut/echeance. Aucun cache externe nouveau requis.

## 10. Purge : cible, sauvegarde et garde-fous

- Cible : base Supabase de backend/.env, schema applicatif public. Le libelle NODE_ENV=development ne suffit pas a la classifier.
- Afficher une cible sans secrets et verifier son empreinte avant ecriture ; aucune operation sur un autre projet Supabase.
- Preserver exactement les deux super-admins cibles, leurs identifiants, attributs et mots de passe haches ; retirer seulement leurs rattachements aux sites supprimes. L'ensemble explicite des identifiants doit etre lie a la sauvegarde et rester identique a la verification et a la purge. Si l'identite est ambigue ou change, arreter.
- Preserver les parametres techniques, reinitialiser les huit niveaux et initialiser le calendrier valide.
- Purger les donnees metier autorisees : clients/onboarding, ventes/retours, produits/stocks/transferts, sites, autres comptes, reseau/claims, commissions/bonus, portefeuilles/retraits/transactions, tickets/candidatures et exports applicatifs.
- Ne pas toucher aux schemas auth/storage, extensions, tables inconnues ou _prisma_migrations. Les objets Storage, fichiers externes, comptes et paiements chez KPay ne sont pas inclus dans cette purge de base.

Ordre obligatoire :

1. Implementer et tester sur une base isolee ; jamais de tests destructifs sur Supabase.
2. Verifier migrations sur base vide, contraintes, relations historiques et dependances externes aux tables applicatives.
3. Mettre en maintenance ecritures, taches et consommateurs de webhooks. Un paiement prestataire encore en traitement impose l'arret de la purge jusqu'a reconciliation explicite.
4. Produire une sauvegarde logique coherente : donnees, schema/migrations, compteurs et manifeste de controle ; stockage hors depot, acces restreint, pas de secrets dans les logs.
5. Verifier l'integrite et une restauration sur une base isolee. Aucun pg_dump, pg_restore ou serveur PostgreSQL local n'a ete trouve dans le PATH lors du cadrage : preparer l'outillage ou un export/restauration logique transactionnel verifie avant destruction.
6. Simuler les suppressions et afficher les tables/compteurs affectes et preserves ; confirmer automatiquement que la cible correspond a celle autorisee.
7. Purger les tables applicatives autorisees dans une transaction, dans l'ordre des dependances. Pas de DROP SCHEMA, reset global ou TRUNCATE CASCADE non borne.
8. Appliquer les migrations explicites, initialiser les niveaux/calendrier sans lancer le seed existant qui reecrit le mot de passe administrateur.
9. Verifier les deux super-admins, configuration, zeros attendus et huit niveaux ; controles fonctionnels non destructifs avant remise en service.

Sans sauvegarde restaurable, si la cible change, si une dependance est inconnue ou si un paiement n'est pas reconcilie : aucune purge. En cas d'echec apres remise a zero, maintenir la maintenance et restaurer ensemble version, schema et donnees verifies.

La purge reste hors des migrations SQL. Les contraintes matricielles nouvelles peuvent refuser une base historique non convertie ; elles ne suppriment pas silencieusement ces lignes. Sur la cible autorisee, les contraintes sont appliquees apres purge sauvegardee.

## 11. Validation attendue

- Quatre enfants donnent Builder, pas Sapphire ; un seul enfant complet laisse generation 2 incomplete ; quatre branches completes donnent 16/16 et Sapphire.
- Spillover BFS, recruteur conserve, parent distinct ; pas de surcharge ni double occupant en concurrence.
- Progression individuelle, distinction generation/total et structure simulee jusqu'a generation 8.
- Deplacements/echanges sans cycles, descendants conserves, acteur fiable, historique append-only, atomicite et idempotence.
- Perte/reconstitution d'une generation sans double commission.
- Montants exacts des huit niveaux, arrondis, immediat + retenu = total ; aucun credit par simple recrutement, aucune double validation.
- Calendrier : samedi, dimanche, ferie en semaine/samedi, doublons, report explicite, annee bissextile, changement d'annee, couverture absente et fuseau.
- Cron : eligibilite seulement ; restitution administrative unique, pas de double gain ni appel KPay implicite ; concurrence avec annulation/retrait et historiques conserves.
- Tests frontend de l'arbre et des montants serveur ; roles, activation, claims et portails preserves.
- Prisma valide, compilations backend/frontend, suites Jest/Vitest et tests d'integration des endpoints/transactions. Declarer toute limite de validation.
- Simulation de purge, protection des schemas Supabase, preservation du mot de passe et restauration testee avant destruction.

## 12. Suite du travail

Apres validation de cette conception : plan detaille, tests rouges puis verts pour placement/progression, commissions/calendrier/restitution, adaptation ciblee des interfaces, puis sauvegarde et remise a zero autorisee en maintenance.

Aucun code applicatif, migration appliquee, seed, ecriture sur Supabase ou purge n'a ete execute pendant la redaction de cette proposition.
