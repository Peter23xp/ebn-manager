# Rapports opérationnels et impression des clients

## Objectif et spécification approuvée

Compléter la page Rapports existante et permettre l'impression de la liste des clients. L'utilisateur a approuvé une synthèse ventes/retours/encaissements/clients/stocks, les filtres période/site, les exports réels et l'impression A4 de la page courante ou de tous les résultats filtrés.

## Architecture

Conserver le module NestJS `rapports`, ses routes, les modèles métier et les pages React existantes. Étendre la réponse du tableau de bord avec des agrégats calculés côté serveur. Remplacer les exports simulés par des fichiers CSV/XLSX téléchargeables sous authentification. Réutiliser `ExportJob` avec une migration additive pour la propriété et le fichier temporaire. Imprimer les clients dans un document React isolé avec pagination API, sans modifier les données métier.

Technologies : NestJS, Prisma/PostgreSQL, ExcelJS, React, TanStack Query, Tailwind, Jest/Vitest et Playwright local.

## Contraintes globales

- Pas de migration, de serveur backend, de purge ou de requête métier sur la base de production depuis cet environnement.
- Pas de commit/push/déploiement dans cette tâche sans nouvelle demande.
- Conserver les restrictions de rôle et de site ; isoler les caches, téléchargements et impressions par session.
- Ne pas inventer des montants : distinguer ventes payées, ventes en attente et remboursements ; séparer les encaissements d'onboarding et les devises, sans double compter l'activation.
- Les états vides, les erreurs et les chargements doivent être compréhensibles sur mobile.
- Les exports non implémentés ne doivent plus promettre un fichier inexistant. PDF via impression navigateur pour les clients ; CSV/XLSX pour les exports de données.
- Limiter les volumes ; refuser clairement un résultat trop volumineux plutôt que tronquer silencieusement.

## Tâche 1 — Impression des clients

Fichiers : `frontend/src/pages/clients/ClientsListPage.tsx`, composants/utilitaires/tests dédiés d'impression.

1. Tests : page courante, toutes les pages filtrées, filtres figés, erreur intermédiaire, session changée, aucun résultat.
2. Bouton Imprimer, sélection du périmètre, aperçu A4 avec logo/date/filtres et colonnes matricule/nom/téléphone/site/statut.
3. Chargement paginé, borne explicite, annulation et autorisation vérifiée avant l'impression.
4. Vérifications Vitest et aperçu navigateur mobile/print.

## Tâche 2 — Exports serveur réels et privés

Fichiers : nouveaux service/contrôleur d'export dans `backend/src/modules/rapports`, `rapports.module.ts`, `schema.prisma`, migration additive et tests.

1. Tests : formats/types/filtres, portée gérant, absence de site, propriétaire du job, expiration, contenu réel, échappement CSV/formules.
2. Types supportés : VENTES, VENTES_DETAIL, STOCKS, CLIENTS ; formats CSV et XLSX.
3. Contrat conservé : POST `/rapports/export` → jobId ; GET `/rapports/export/estimate` → estimatedRows ; GET `/rapports/export/:jobId` → statut et métadonnées ; ajouter GET `/rapports/export/:jobId/download` → fichier authentifié.
4. Réutiliser ExportJob, conserver les anciens enregistrements mais ne pas exposer les anciens jobs sans propriétaire. Fichiers temporaires bornés, expiration, aucun lien public.
5. Génération Prisma/validation locale, tests sans connexion DB, compilation.

## Tâche 3 — Parcours rapports et exports frontend

Fichiers : `ExportPage.tsx`, `RapportVentesPage.tsx`, `RapportStocksPage.tsx`, hooks rapports/exports, `reports.api.ts`, composants de filtre et tests.

1. Remplacer les sites codés en dur par les sites réels ; préserver les restrictions de rôle.
2. Exports CSV/XLSX réellement téléchargés via Axios authentifié, pas de window.open sur URL publique ; bornes et erreurs visibles.
3. Préserver les filtres dans le parcours et supprimer les commandes visuellement actives sans effet.
4. Partitionner les requêtes privées et annuler/ignorer les résultats d'une autre session.
5. Tests ciblés et compilation TypeScript.

## Tâche 4 — Synthèse opérationnelle

Fichiers : `rapports.service.ts`, `rapports.controller.ts`, `RapportsDashboardPage.tsx`, `useReportsDashboard.ts`, composant de synthèse et tests.

1. Tests backend des statuts et périodes, agrégats financiers, clients/onboarding/stocks, accès gérant.
2. Enrichir le dashboard, corriger les bornes de date et les séries temporelles incomplètes, conserver les graphiques et tableaux existants.
3. Ajouter navigation vers ventes/stocks/exports selon les droits et un filtre de sites réels.
4. Afficher montants exacts, retours, encaissements séparés, statuts clients et alertes stock sans calcul financier dupliqué dans le frontend.

## Tâche 5 — Revue et validation

Revue sécurité/fonctionnelle des changements, tests ciblés puis régressions pertinentes, builds front/back, validation Prisma, aperçu local sur mobile et A4. Documenter la migration à appliquer lors d'un futur déploiement et les limites connues.
