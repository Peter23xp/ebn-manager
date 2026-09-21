# Rapports opérationnels et impression des clients

## Parcours utilisateur

- `/reports` conserve les graphiques et tableaux existants et ajoute une synthèse des remboursements, ventes en attente, remises, panier moyen, récits/fiches, activations, statuts clients et stock actuel.
- Les responsables régionaux peuvent filtrer par site réel et accéder aux détails des ventes et des stocks. Le gérant conserve un rapport limité à son site attribué.
- Les filtres et tris des rapports détaillés sont appliqués et transmis aux exports. Les erreurs de chargement, estimation et téléchargement sont visibles.
- `/clients` propose **Imprimer** : choisir la page courante ou tous les résultats filtrés, préparer l'aperçu, puis **Imprimer / Enregistrer en PDF**. Le document contient le logo, la date, les filtres, le matricule, le nom, le téléphone, le site et le statut.
- L'impression complète charge les pages successives, dans une limite affichée de 1 000 clients. Aucun fichier partiel n'est proposé après un échec, un changement de session ou une incohérence de pagination. L'aperçu peut être annulé.

## Définition des chiffres

Les dates calendaires des rapports couvrent les journées complètes en UTC. Les ventes en attente et annulées sont exclues du chiffre d'affaires des ventes réglées. Les remboursements sont affichés séparément et déduits de la synthèse nette de période : un remboursement peut concerner une vente d'une période antérieure. Les remboursements différés utilisent la date de règlement de leur transaction KPay, ou la date de traitement de l'événement terminal si cette date manque ; les remboursements immédiats utilisent leur date de création.

Les récits et fiches sont en CDF, les ventes et activations en USD. Une activation est déjà une vente : son montant est indiqué, mais jamais additionné une seconde fois. Les montants affichés conservent leurs décimales. Les statuts des clients et le stock représentent la situation actuelle, et non un état historique à la date de fin. La valorisation utilise le prix d'achat actuel.

## Exports

Les anciens liens simulés sont remplacés par des fichiers CSV UTF-8 et XLSX réellement générés : ventes, lignes de vente, stocks et clients. Les formats et rapports sans implémentation n'apparaissent plus comme disponibles. Le PDF de la liste des clients reste accessible par l'impression navigateur.

Les fichiers sont privés, limités à leur créateur et à son rôle/site au moment de la demande. Le téléchargement utilise l'API authentifiée, pas une URL publique. Les valeurs textuelles sont échappées contre l'injection de formules CSV. La liste des clients exporte le matricule applicatif ou, avant activation, le code de parrainage, plutôt que l'ancien matricule externe facultatif.

Limites : 10 000 lignes, 5 Mio par fichier, disponibilité pendant une heure après génération, expiration d'une génération inachevée après dix minutes. Le suivi interactif s'arrête après deux minutes. Une tâche périodique efface les octets expirés mais conserve la trace du job. Le nombre d'exports temporaires simultanés est borné.

## Migration et déploiement

Migration additive : `techshop-manager/backend/prisma/migrations/20260921170000_private_report_exports/migration.sql`.

Elle ajoute au modèle `ExportJob` le propriétaire, le périmètre, les octets temporaires et les métadonnées du fichier. Elle ne supprime aucune relation ni donnée métier. Les anciens jobs dépourvus de propriétaire ne sont pas accessibles via le nouveau téléchargement.

La migration doit être appliquée au déploiement backend, avant de servir le nouveau frontend. Le script de démarrage de production existant exécute déjà `prisma migrate deploy`. Aucun déploiement, migration distante, purge ou changement financier métier n'a été exécuté dans cette tâche.

## Vérification

421 tests ciblés passent : 181 backend (rapports/exports/autorisations), 95 frontend (rapports/impression), 145 régressions client/agent/caissier/cache privé. Builds frontend/backend et validation/génération Prisma réussis. Les avertissements existants de taille du bundle PDF et du canvas jsdom ne bloquent pas ces vérifications.

Vérification navigateur isolée, sans données réelles : filtres de site, génération/téléchargement CSV, impression de 126 clients répartis sur plusieurs réponses API, écrans de 320, 375, 390 et 1440 pixels. Le PDF A4 obtenu contient six pages, avec les en-têtes de colonnes répétés et le dernier client présent. Les appels API sont simulés ; les nouvelles requêtes SQL n'ont pas été exécutées sur une base distante.
