# Commissions MLM progressives — évolution du moteur existant

Date : 21 septembre 2026.
Statut : conception approuvée dans la conversation (« vas y implemente »), implémentation locale ; aucune mise en production autorisée par ce document.
Référence de l’audit : commit `2b6b9ee`.
Parcours : évolution de l’architecture financière du module MLM existant, sans module parallèle.

## 1. Résumé métier approuvé

Un membre n’attend plus de compléter une génération pour commencer à gagner sa commission. La commission du niveau est répartie progressivement selon les positions matricielles valides de cette génération.

- Builder : quatre tranches de 10 USD, chacune composée de 6 USD disponibles après validation et de 4 USD retenus.
- Le bénéficiaire est le membre dont la génération matricielle progresse. Le recruteur personnel reste inchangé et traçable.
- Les huit générations rapportent indépendamment. Un membre peut commencer à gagner sur Sapphire avant d’avoir terminé Builder.
- Les totaux financiers existants de chaque niveau restent les plafonds ; aucune commission complète supplémentaire n’est générée à la fin.
- Le rang, les bonus physiques, les salaires et le bonus de retraite restent soumis aux conditions de complétion existantes.
- Les nouveaux gains restent soumis à la validation de commission et aux règles de retrait actuelles.
- Les retenues deviennent restituables après 30 jours ouvrables, du lundi au samedi, hors jours fériés RDC. Le délai commence à la validation de chaque commission, pas à l’inscription du filleul.
- Un rattrapage des réseaux déjà présents est prévu, avec aperçu préalable et sans réécriture des paiements historiques.

Exemple : P0 recrute X, placé sous P1, enfant matriciel de P0. P1 progresse en génération 1 ; P0 progresse en génération 2. Chaque membre peut recevoir la tranche de sa génération concernée, dans la limite du budget de ce niveau. X conserve P0 comme recruteur.

## 2. Approche retenue

Étendre `Commission`, `Matrix` et les services MLM existants. Chaque nouvelle progression rémunérée produit une commission immuable quant à ses montants, puis utilise le cycle financier actuel.

Approches écartées :

- Augmenter une commission unique au fur et à mesure : sa validation antérieure, ses retenues et son historique deviendraient ambigus.
- Créditer directement le portefeuille sans commission : cela contournerait la validation et casserait la traçabilité des retenues et annulations.

Pour une activation normale, une progression d’une position produit une tranche. Lorsqu’une opération apporte plusieurs positions à la fois, notamment un déplacement ou un rattrapage, une commission peut couvrir une plage explicite de progression. Cette agrégation conserve le détail du calcul sans créer des dizaines de milliers de lignes pour un seul rattrapage.

## 3. Audit du fonctionnement actuel

### Modèles

Dans `backend/prisma/schema.prisma` :

- `Membre.parrainId` désigne le recruteur personnel.
- `Position` relie un membre à son parent matriciel ; les positions physiques appartiennent à la matrice de génération 1.
- `Matrix` est unique par membre et niveau. `filleulsValides` représente le compteur de la génération ; `occupiedPositions` inclut les positions occupées non nécessairement valides.
- `Commission` contient déjà bénéficiaire, filleul déclencheur, niveau, matrice, position, total, disponible immédiat, retenue, statut et référence unique.
- Les noms historiques `montantSysteme` et `montantRetour` correspondent respectivement à la part immédiatement créditée au membre et à sa retenue. Leur sens actuel est conservé ; pas de renommage destructif.
- `ReinvestLote.commissionId` est unique. Chaque commission validée possède son échéance propre.
- `Promotion` et les bonus existent ; leur génération est actuellement couplée à la création de la commission complète.

### Services

- `mlm-placement.service.ts` recalcule les générations des ancêtres et appelle `completeGeneration` uniquement lorsqu’une génération est complète. La référence `generation:<membreId>:<levelId>` empêche actuellement de créer plusieurs commissions et sert indirectement de garde aux promotions/bonus.
- Placement, spillover, déplacements et remontées utilisent le verrou transactionnel matriciel existant `pg_advisory_xact_lock(604008)`.
- `mlm-matrix.service.ts` crée les profils à l’activation, expose les commissions et gère validation, marquage payé et annulation.
- `validateCommission` crédite la part immédiate et crée la retenue dans la même transaction. Une commission déjà validée ou payée n’est pas recréditée.
- `mlm-wallet.service.ts` fournit les soldes, journaux, retraits et restitutions. La libération d’une retenue est atomique et distincte du paiement externe.
- `mlm-calendar.service.ts` calcule les échéances avec le calendrier RDC versionné ; un calendrier manquant bloque la validation plutôt que d’inventer une date.
- `reinvest-release.service.ts` rend les retenues échues restituables ; ce traitement sera réutilisé.
- `mlm-finance.ts` utilise `Prisma.Decimal`. `commissionAmounts` calcule le budget complet à partir des 60 % configurés ; cette fonction ne doit pas être réappliquée indépendamment à chaque petite tranche.

### Surfaces existantes à adapter

- Administration : `MlmCommissionsPage`, `MemberProgressPage`, `WalletPage` et les informations financières de configuration MLM.
- Portail client : les lectures du portefeuille et de progression ainsi que leurs composants consommateurs.
- Contrats existants : `frontend/src/lib/mlm.api.ts`, `frontend/src/lib/portal.api.ts`, contrôleurs MLM et portail.
- Outils existants : `backend/scripts/mlm-audit.ts` et fonctions sûres d’inspection/sauvegarde de `backend/scripts/maintenance.ts`.

## 4. Progression rémunérable et limite par niveau

Pour un membre et une génération N :

- `capacity = generationCapacity(N) = 4^N`.
- `currentValidPositions` est calculé à partir de la structure matricielle et des membres actifs, selon les critères existants. Ni le nombre de recrutements personnels ni le total des descendants ne remplacent ce compteur.
- `accountedPositions` mémorise le plus haut nombre de positions déjà comptabilisées financièrement, y compris les commissions encore en attente ou annulées.
- Une nouvelle tranche existe seulement lorsque `currentValidPositions > accountedPositions`.
- Sa plage est `(accountedPositions, currentValidPositions]`, limitée à `capacity`.
- Une baisse de progression ne retire pas automatiquement de fonds et ne diminue jamais `accountedPositions`.
- Une remontée ultérieure au même nombre ne rapporte donc pas une seconde fois. Seul le dépassement de la progression déjà comptabilisée crée un complément.

Exemple Builder : 3 positions rémunérées, puis baisse à 2, puis retour à 3 : aucune nouvelle tranche. Le passage à 4 produit uniquement la quatrième tranche.

Le niveau inactif conserve son comportement de suspension financière : pas de nouvelle commission pendant sa désactivation. Son avancement structurel reste calculé. À la réactivation, le prochain traitement ou rattrapage peut comptabiliser les positions encore non rémunérées.

## 5. Calcul monétaire exact

Le budget de chaque membre/niveau est figé au début de sa comptabilisation progressive : total T, immédiat I, retenue H, avec `T = I + H`. Les trois valeurs proviennent de la configuration backend valide. Pour les commissions complètes historiques, les montants historiques font foi.

Une modification ultérieure de configuration ne réécrit pas un budget déjà commencé. L’interface de configuration devra expliquer que les nouveaux montants s’appliquent aux budgets non encore commencés. Un réajustement rétroactif de budgets n’appartient pas à cette modification.

Pour une progression p comprise entre 0 et capacity :

```text
immediateCumulative(p) = roundHalfUp(I × p / capacity, 2)
heldCumulative(p)      = roundHalfUp(H × p / capacity, 2)
totalCumulative(p)     = immediateCumulative(p) + heldCumulative(p)

immediateTranche = immediateCumulative(to) - immediateCumulative(from)
heldTranche      = heldCumulative(to) - heldCumulative(from)
totalTranche     = immediateTranche + heldTranche
```

Les parts sont calculées séparément par différence de cumuls pour éviter des fractions de centime, des retenues négatives et une dérive du total. Il ne faut ni multiplier un montant arrondi identique par toutes les positions ni reconstruire le total d’une tranche par division de son seul montant immédiat.

- Builder : quatre fois `6.00 + 4.00 = 10.00`.
- Sapphire : les parts immédiates peuvent varier d’un centime ; leur somme finale est exactement 50.00 USD, et la somme des retenues exactement 33.33 USD.
- À la complétion, toutes les tranches cumulées atteignent exactement le budget figé.
- Les écarts de proportion au centime près dans une petite tranche sont des arrondis ; le budget 60/40 du niveau reste la référence.
- Si les deux différences valent zéro, avancer la progression comptabilisée sans créer un crédit nul ni un lot nul. La progression est traçable par la matrice et son événement structurel.
- Si seule la retenue vaut zéro, valider l’immédiat sans créer de lot nul. Si seul l’immédiat vaut zéro, créer uniquement la retenue positive.
- Rejeter les montants non finis, négatifs, hors précision ou hors capacité des champs décimaux.

Tous les calculs sont backend en décimaux. Les nouveaux champs financiers d’API utilisent des chaînes décimales à deux chiffres. Le frontend affiche les résultats sans recalculer les parts.

## 6. Évolution additive du schéma

Étendre les modèles existants, sans nouveau portefeuille ni second système de commissions.

### Matrix

Champs proposés :

- `commissionAccountedPositions` : entier, défaut 0, jamais décroissant.
- `commissionBudgetTotal`, `commissionBudgetImmediate`, `commissionBudgetHeld` : décimaux nullable pour permettre la transition des lignes historiques.
- `commissionPolicyVersion` : version de la méthode de calcul et indicateur d’initialisation.
- `commissionAccountedAt` : date du dernier avancement financier.
- `generationRewardedAt` : marqueur indépendant de traitement de la complétion et de ses avantages.

Contraintes : progression non négative ; budgets soit tous absents, soit tous présents et cohérents ; contrôle applicatif de la limite `4^N` sous verrou.

### Commission

Champs additionnels nullable pour les anciennes lignes :

- `progressFrom`, `progressTo` : plage de positions comptabilisées.
- `calculationVersion` : politique de calcul.
- `generationEventId` : événement de placement, déplacement ou rattrapage.
- `generationActorId` : acteur de l’événement lorsqu’il est disponible ; distinct du validateur.
- `origin` : progression normale, rattrapage ou génération historique, représenté sans changer les statuts de paiement.

Conserver `referenceId` unique et ajouter une contrainte d’unicité sur le couple matrice/borne finale pour les nouvelles tranches. Les anciennes lignes sans plage restent compatibles.

Exemple de référence : `generation-progress:<matrixId>:<progressTo>:v1`.

`filleulId` et `positionId` continuent d’identifier le déclencheur quand un événement normal le fournit. Pour un rattrapage agrégé, ne pas inventer un filleul responsable : rendre `filleulId` nullable et afficher explicitement « Rattrapage de génération ». Adapter les consommateurs qui supposaient cette relation obligatoire, sans retirer les liens des anciennes commissions.

La migration est additive, sans suppression de données ni modification des soldes. Toute anomalie historique empêche l’initialisation du cas concerné et apparaît dans le rapport de contrôle.

## 7. Intégration au placement et aux promotions

Conserver le moteur de placement, la limite de quatre enfants, les relations de recrutement, les remontées et leur historique.

Séparer trois responsabilités dans les services existants :

1. Recalcul des compteurs structurels et de la progression.
2. Traitement idempotent d’une génération complète : promotion et avantages existants, sans commission complète supplémentaire.
3. Comptabilisation financière progressive à partir des compteurs définitifs.

Une activation peut provoquer plusieurs remontées dans une même transaction. Collecter les matrices affectées pendant ces recalculs, puis émettre les tranches sur l’état final de l’opération, pas sur des configurations transitoires successives. Les contrôles de remontée continuent à utiliser les compteurs structurels existants.

Création de la commission et avancement de `commissionAccountedPositions` appartiennent à la même transaction sous le verrou matriciel actuel. La contrainte unique constitue une protection supplémentaire, pas un remplacement de la transaction.

Lors d’une complétion, `generationRewardedAt` remplace le rôle de garde auparavant assuré par l’existence de la commission complète. Il est vérifié et écrit dans la transaction qui crée les promotions et avantages. Pour l’historique, l’initialiser après rapprochement des promotions et commissions existantes ; ne jamais redonner un bonus parce que la nouvelle comptabilité démarre.

## 8. Validation, retenues, retraits et annulations

- Chaque nouvelle tranche est créée `EN_ATTENTE`.
- Réutiliser `validateCommission` : transition atomique vers `VALIDEE`, date et acteur, crédit de l’immédiat et constitution de la retenue positive.
- Réutiliser le calendrier RDC et le lot unique par commission. Ne pas faire partir le délai d’un rattrapage d’une ancienne date d’activation : il commence à sa validation effective.
- Conserver le rôle de `PAYEE` et les procédures existantes de retrait. Ne pas remplacer une demande de retrait par un transfert automatique.
- Les traitements d’échéance continuent de rendre le lot `RELEASABLE` ; la restitution et son journal restent idempotents.
- Une annulation suit la procédure actuelle et ne remet pas la plage à disposition d’un futur recalcul. Sinon une commission annulée serait recréée automatiquement. Toute correction explicite reste une opération distincte, hors du rattrapage automatique.
- Ne pas retrancher les montants retirés du calcul des droits déjà comptabilisés : un retrait n’ouvre pas de nouveaux droits de commission.

## 9. Compatibilité et rattrapage

Le rattrapage porte sur la structure valide actuelle. Il ne prétend pas reconstituer des progressions historiques intermédiaires non rémunérées et absentes de l’état actuel.

### Initialisation d’un membre/niveau

- Une commission historique de génération complète existe, quel que soit son statut : considérer le budget de cette génération comme déjà comptabilisé, préserver ses montants et ne créer aucune tranche supplémentaire.
- Des tranches progressives existent : rapprocher plages, références, budgets et progression comptabilisée. Une discordance est une anomalie, pas une invitation à recalculer les soldes.
- Aucune commission n’existe : initialiser le budget à partir du niveau et calculer la tranche manquante entre 0 et la progression actuelle.
- Une référence ancienne inconnue, un doublon historique, des montants incohérents ou des promotions ambiguës imposent une revue manuelle du cas concerné.

La même initialisation est utilisée au premier événement normal et par le rattrapage, pour éviter qu’une activation concurrente ne crée un doublon avant le passage du traitement par lots.

### Outil opérationnel

Ajouter un outil de rattrapage dédié au sein des scripts MLM existants, avec réutilisation des contrôles de cible, d’audit et de sauvegarde disponibles. Ne pas utiliser le mode purge.

1. Mode par défaut : aperçu en lecture seule, paginé et borné, sans créer de commissions ni changer de soldes.
2. Rapporter par membre/génération : progression actuelle, budget, droits déjà comptabilisés, complément proposé, anomalies et motifs de blocage.
3. Produire un fichier privé avec identifiant d’opération, cible non secrète, date, version et empreinte de l’état analysé. Ne jamais y inclure de mot de passe, URL de connexion complète ou jeton.
4. Avant exécution : sauvegarde logique vérifiée, revue de l’aperçu et sélection explicite de la cible. L’exécution réelle n’est pas déclenchée par une migration, un démarrage serveur ou une consultation d’écran.
5. Exécuter par lots limités, chaque lot sous transaction et verrou matriciel. Recontrôler les données comparées à l’aperçu ; refuser un cas modifié plutôt que payer sur un aperçu périmé.
6. Créer seulement des commissions `EN_ATTENTE`. Aucun crédit immédiat au portefeuille avant la validation financière habituelle.
7. Journaliser les plages réellement créées et permettre la reprise après interruption. Rejouer les mêmes plages est sans effet financier ; une divergence exige un nouvel aperçu.

La base de production n’est pas utilisée pour les tests, migrations de développement ou simulations d’écriture. Cette conception n’autorise ni purge, ni modification des comptes conservés, ni transfert externe.

## 10. API et affichage

Conserver les routes de liste, validation, annulation, paiement, portefeuille et progression. Les ajouts de réponse sont compatibles avec les données historiques.

Ajouter aux informations financières par génération :

- capacité, positions valides actuelles et positions déjà comptabilisées ;
- budget total, immédiat et retenu ;
- commissions générées, en attente de validation, validées et annulées ;
- retenues en cours, restituables et déjà libérées ;
- budget restant à comptabiliser et motif de suspension éventuelle.

Les montants annulés doivent être visibles séparément et ne pas apparaître comme de nouveaux gains disponibles. Le total historiquement comptabilisé n’est pas identique au solde retirable.

La liste des commissions affiche le niveau, la plage de progression, le déclencheur ou la mention de rattrapage, le total, les deux parts, le statut et l’échéance de la retenue si elle existe.

Exemple Builder après deux tranches validées : progression financière `2 / 4`, commissions validées `20.00 USD`, part immédiate créditée `12.00 USD`, retenues constituées `8.00 USD`, reste à comptabiliser `20.00 USD`. Le solde disponible réel reste fourni par le portefeuille et peut être inférieur si un retrait a déjà eu lieu.

Les nouvelles lectures restent protégées par les règles actuelles de rôle, de site et de propriétaire du portail. Aucun détail financier d’un autre membre n’est exposé par le simple ajout d’un champ de progression.

## 11. Performance

- Réutiliser les compteurs de génération calculés par le moteur matriciel ; ne pas charger 65 536 descendants dans le frontend.
- Pour une activation ordinaire, comptabiliser au maximum les huit générations pertinentes de chaque ancêtre concerné par l’opération finale.
- Dédupliquer les matrices affectées par plusieurs remontées dans la même transaction.
- Utiliser les indices membre/niveau/matrice et référence unique pour rapprocher les commissions.
- Rattraper par lots et plages agrégées, sans construire une requête géante ni une transaction globale sur toute la base.
- Les lectures de portefeuille et listes restent paginées ; les agrégats financiers sont calculés côté base/backend.

## 12. Périmètre de fichiers prévu

- `backend/prisma/schema.prisma` et une migration additive.
- `backend/src/modules/mlm/mlm-finance.ts` et ses tests : calcul cumulatif des tranches.
- `backend/src/modules/mlm/mlm-placement.service.ts` et tests placement/remontée : séparation structure, complétion et émission finale des tranches.
- `backend/src/modules/mlm/mlm-matrix.service.ts` et tests : validation compatible, listes et événements historiques.
- Un service financier interne au module MLM pour centraliser initialisation, rapprochement et comptabilisation, partagé par les événements normaux et le rattrapage ; pas de second moteur matriciel.
- `backend/src/modules/mlm/mlm.module.ts`, `mlm.service.ts`, `mlm-wallet.service.ts` : injection et lectures progressives, adaptations strictement nécessaires aux montants nuls et budgets figés.
- Contrôleurs/types/DTO MLM et portail seulement pour les réponses concernées.
- Scripts d’audit/rattrapage et leurs tests, réutilisant les utilitaires de maintenance existants sans toucher à la purge.
- Pages et composants frontend MLM/portail concernés par les commissions, la progression financière et l’explication des budgets.

Hors périmètre : refonte visuelle générale, rapports, rôles, ventes, règles d’activation, recherche de placement, règles de remontée, paiement mobile en développement et calendrier férié lui-même.

## 13. Validation obligatoire

Tests unitaires monétaires :

- Builder : 1/4, 2/4, 3/4, 4/4 ; totaux exacts 40/24/16.
- Sapphire, Ruby, Diamond et Crown Ambassadeur : somme des tranches exactement égale aux budgets configurés, sans dérive de centimes.
- Profondeurs 1 à 8 ; fractions arrondies et budgets faibles, parts nulles et budgets nuls.
- Plages groupées équivalentes à la somme des tranches élémentaires.
- Rejet des montants et positions invalides ; aucune part négative.

Tests moteur et concurrence :

- Premier enfant actif génère une tranche Builder, sans promotion prématurée.
- Enfant en attente ne génère rien.
- Première position de génération 2 peut rémunérer Sapphire alors que Builder est incomplet.
- Spillover : bénéficiaire matriciel correct, recruteur inchangé.
- Complétion : dernière tranche seulement, promotion et bonus une seule fois.
- Déplacements et remontées : conservation des descendants, aucun paiement d’état transitoire, pas de seconde rémunération après baisse puis retour au même compteur.
- Transactions rejouées et activations concurrentes : références uniques, progression et commission atomiques.
- Niveau désactivé et changement de configuration après début : comportement conforme au budget figé.

Tests financiers et historiques :

- Validation répétée sans double crédit ; retenue unique et échéance propre à chaque validation.
- Trente jours ouvrables RDC, dimanches et jours fériés exclus, années croisées et calendrier manquant.
- Restitution et retrait idempotents, soldes cohérents, frais/règles de retrait inchangés.
- Annulation sans recréation automatique ; prise en compte des commissions historiques en attente, validées, payées et annulées.
- Rattrapage simulé sans écritures, application contrôlée, reprise, aperçu périmé et anomalies bloquantes.
- Migration sur copie isolée : conservation des données, soldes, promotions, bonus, références et échéances historiques.

Tests frontend et contrôles finaux :

- Affichage des tranches et rattrapages sans faux filleul déclencheur.
- Cohérence génération/rang/solde/retirable ; montants exclusivement issus du backend.
- Contrôle d’accès et masquage des données interdites conservés.
- Affichage mobile, clavier, chargement, erreur et historique ancien/nouveau.
- Validation du schéma Prisma, génération du client, tests ciblés puis régressions, compilation backend et frontend.

## 14. Séquence de livraison

1. Faire valider ce document détaillé.
2. Écrire le plan d’implémentation et suivre le cycle tests rouges, code, tests verts.
3. Vérifier les migrations et le moteur sur une base isolée et des données synthétiques.
4. Réaliser la revue de code et les contrôles UI sans requête métier réelle.
5. Présenter les résultats et l’aperçu du rattrapage avant toute application sur la base visée.

Aucun commit, push, déploiement, migration distante ou rattrapage réel n’est effectué pendant cette phase de conception.
