# Rôle caissier et séparation préparation / encaissement

Date : 19 septembre 2026.

Statut : décisions métier approuvées dans la conversation ; spécification soumise à relecture avant le plan d'implémentation. Aucun changement applicatif ni opération en base n'est réalisé par ce document.

## 1. Objectif et décisions approuvées

Ajouter le rôle `CAISSIER` au système d'autorisation existant. Un agent simple prépare les dossiers mais ne peut plus encaisser le récit, la fiche ou l'activation, activer un compte, ni vendre des produits.

Le caissier peut préparer un dossier, effectuer ces encaissements et vendre des produits, uniquement pour son site d'affectation. Les gérants, directeurs régionaux et super-admins conservent leurs droits actuels. Les retours et remboursements sont réservés au gérant et aux rôles supérieurs.

Les comptes existants ne changent pas automatiquement de rôle. Seul le super-admin attribue le nouveau rôle par la gestion des utilisateurs existante. Aucun dossier, paiement, historique, compte ou lien de parrainage n'est supprimé.

## 2. Approche retenue

Étendre la hiérarchie et les contrôles existants, plutôt que créer un système parallèle de permissions administrables. Cette seconde approche serait plus flexible, mais ajouterait des modèles et une interface d'administration sans nécessité pour le besoin validé.

Hiérarchie cible :

`SUPER_ADMIN > DIRECTEUR_REGIONAL > GERANT > CAISSIER > AGENT > FORMATEUR > CLIENT`

Les contrôles de rôle et de site restent distincts : être caissier autorise une opération de caisse, mais ne donne pas accès à tous les sites. Aucun droit de gestion des utilisateurs, configuration MLM, validation des commissions ou remboursement n'est accordé au caissier par cet ajout.

Les droits personnels MLM déjà accessibles à l'agent ne sont pas assimilés à des opérations de caisse et ne sont pas supprimés. Le portail client et le rôle formateur restent inchangés.

## 3. Constats sur l'application existante

- Le rôle est stocké dans l'enum Prisma `Role`. `RolesGuard` applique actuellement une hiérarchie numérique côté backend.
- Le frontend répète cette hiérarchie dans le store d'authentification, `useAuth` et `RoleGuard`. Les plafonds du portail client doivent rester cohérents après ajout du rôle.
- Le récit actuel crée le client et marque simultanément le récit comme payé/complet. Interdire seulement ce bouton empêcherait donc un agent de préparer un dossier.
- `Client.statut = EN_COURS` et `OnboardingEtape.statut = EN_ATTENTE` existent déjà. Les champs financiers de l'étape sont facultatifs : aucun nouveau système de dossiers n'est nécessaire.
- La file d'onboarding sait déjà reprendre un récit non terminé. Elle peut servir au passage de relais agent → caissier.
- Les routes d'onboarding ne sont pas toutes protégées par un seuil de rôle explicite ; la vente et les retours utilisent actuellement le seuil agent.
- Plusieurs services reçoivent un identifiant d'acteur mais pas une politique de site. Les contrôles ne peuvent pas reposer uniquement sur le sélecteur de site du frontend.
- La synchronisation des ventes hors ligne s'exécute dans le layout avec la session courante. Elle doit être protégée contre une soumission sous un autre compte.

## 4. Parcours cible

### 4.1 Préparation par l'agent

Adapter l'écran existant de nouveau client selon le rôle. L'agent saisit l'identité, les coordonnées et le parrainage, puis utilise « Enregistrer le dossier ». Il ne saisit pas de paiement et n'obtient pas de reçu attestant un encaissement.

Ajouter une entrée dédiée `POST /clients/onboarding/draft` dans le module clients existant, avec un DTO limité aux données du dossier. Le site et l'acteur sont contrôlés depuis l'utilisateur authentifié. Les champs de montant, mode de paiement, état actif ou étape complète ne font pas partie de ce contrat et doivent être refusés s'ils sont injectés.

Une transaction crée :

- le client `EN_COURS`, avec son `createdById` réel et son site ;
- son étape `RECIT / EN_ATTENTE`, avec les champs de paiement et la date de complétion vides ;
- les relations de parrainage et éventuels claims nécessaires, en réutilisant la résolution existante.

Cette opération ne crée aucune vente, facture d'activation, transaction de paiement, position MLM ou commission et ne modifie aucun stock. Les contraintes d'unicité téléphone, email et matricule restent applicables. Un renvoi ou un doublon ne doit ni créer un second client, ni écraser le dossier d'un autre membre ; l'interface permet d'ouvrir le dossier existant lorsqu'il est accessible à l'acteur.

Le parrain reste conservé lorsque le caissier reprend le dossier. L'ajout d'un parrain à un client déjà enregistré continue de respecter le mécanisme et les droits existants : aucun droit de réattribution supplémentaire n'est accordé à l'agent ou au caissier.

### 4.2 Reprise par le caissier

Le même client apparaît dans la file d'attente de son site avec l'indication « Récit à encaisser ». Le caissier ouvre le dossier et utilise les opérations existantes de récit, fiche et activation.

Chaque étape payante conserve ses règles métier et ne passe à `COMPLETE` qu'après l'opération autorisée. Les prérequis actuels de formation, fiche et activation restent inchangés ; cette évolution ne redéfinit pas leur ordre métier.

Le créateur du dossier reste dans `Client.createdById`. L'acteur de l'encaissement est enregistré dans l'étape concernée et les écritures existantes. Ne pas remplacer le créateur initial par le caissier.

Un caissier ou un responsable peut également créer et encaisser directement un nouveau récit via le parcours existant. La préparation préalable par un agent n'est pas obligatoire.

### 4.3 Vente, retours et remboursements

La création de vente, le POS et les chemins d'initiation de paiement associés demandent au minimum le rôle caissier. Un agent ne peut ni finaliser une vente ni la mettre en file hors ligne pour contourner le refus serveur.

Les retours, remboursements en espèces et initiations de remboursement mobile demandent au minimum le rôle gérant. Le caissier ne reçoit pas ces droits en héritant de l'ancien périmètre agent.

Les responsables gardent les possibilités actuellement autorisées sur les sites. Les règles de prix, stock, commissions et fidélité ne sont pas modifiées.

## 5. Autorisations et périmètre du site

### 5.1 Contrôles côté serveur

Utiliser les gardes existants pour les seuils de rôle et une politique commune de périmètre dans les services concernés, afin de ne pas dupliquer des contrôles différents entre les chemins cash et mobile.

Pour les agents et caissiers, le site authentifié est obligatoire. Un filtre, un identifiant de client ou de vente, ou un `siteId` falsifié ne permet pas d'accéder à un autre site. Vérifier le site réel de l'objet chargé avant d'appeler une opération susceptible d'encaisser, d'activer, de vendre, de modifier un stock ou d'effectuer une écriture MLM.

Appliquer ce périmètre aux listes et détails clients, à la file d'onboarding, à la préparation/modification des dossiers, aux étapes d'onboarding et aux consultations et opérations de vente accessibles à ces rôles. Pour une vente liée à un client, contrôler aussi le site du client. Conserver les recherches minimales de parrainage nécessaires au réseau sans ouvrir l'accès au dossier privé complet d'un client d'un autre site.

Auditer les imports et mises à jour génériques utilisés par ces rôles : ils ne doivent pas permettre d'injecter un compte actif, une étape payée ou un autre site. L'import existant ne crée que des clients `EN_COURS` ; conserver ce comportement non financier et attribuer toute préparation accessible à l'agent/caissier à l'acteur et au site authentifiés.

Une opération interdite retourne `403` sans effets métier. Un objet inaccessible ne doit pas révéler son contenu. Les préconditions métier légitimes continuent à produire les erreurs existantes, distinctes d'un manque de droits.

La stratégie JWT recharge déjà le rôle et le site du compte staff depuis la base : conserver ce mécanisme pour que les anciens tokens ne maintiennent pas artificiellement les anciens droits d'un utilisateur.

### 5.2 Paiements mobiles et callbacks

Protéger également les routes d'initiation mobile, même si elles sont actuellement désactivées. Maintenir intégralement l'avis « en cours de développement » et le blocage mobile existants.

Ne pas appliquer aveuglément une vérification de rôle interactive aux callbacks serveur authentifiés. Un événement de paiement valide pour une opération déjà autorisée suit le traitement sécurisé et idempotent existant. Aucun client HTTP non autorisé ne peut fabriquer cette opération ou appeler sa finalisation.

### 5.3 Ventes hors ligne

Bloquer l'accès au POS et la création de ventes locales pour l'agent. Une reconnexion réseau ne doit pas soumettre une vente refusée, ni réattribuer silencieusement la vente d'un ancien utilisateur au caissier nouvellement connecté.

Associer les nouvelles entrées locales à leur propriétaire et leur site. Seule une session autorisée, correspondant au propriétaire et au site, peut les synchroniser ; le backend vérifie toujours les droits courants. Les métadonnées locales ne remplacent jamais l'identité authentifiée.

Les anciennes entrées sans propriétaire fiable, celles d'un autre compte ou d'un utilisateur ayant perdu ses droits sont conservées sans synchronisation automatique. Afficher un message explicite et orienter vers un responsable ; ne pas supprimer ces entrées ni créer un outil de réattribution financière dans cette évolution.

## 6. Interface et gestion des utilisateurs

- Ajouter « Caissier » aux formulaires de création/modification, filtres et libellés de rôle existants. Un site valide est obligatoire à la création et après toute modification de ce rôle.
- Réunir la hiérarchie frontend dans un utilitaire partagé utilisé par les contrôles existants, sans réécrire le système d'authentification.
- Adapter menus, raccourcis du dashboard, boutons de fiche client, file d'attente et routes directes. Masquer les actions interdites et conserver les pages utiles à la préparation et au suivi.
- Distinguer la présence d'une étape de son statut `COMPLETE` : un récit en attente ne doit pas apparaître payé dans les indicateurs.
- Pour l'agent, afficher « En attente de passage en caisse » et une action de consultation du dossier au lieu d'un lien d'encaissement.
- Pour le caissier, présenter la file, les encaissements d'onboarding et le POS de son site, sans choix arbitraire d'un autre site.
- Pour les responsables, garder les opérations précédemment disponibles, y compris les retours et remboursements.
- Maintenir le comportement sur ordinateur et mobile et les redirections de déconnexion déjà corrigées.

## 7. Données et migration

Une migration additive ajoute `CAISSIER` à l'enum Prisma `Role`. Réutiliser `Client`, `OnboardingEtape`, `Utilisateur.siteId`, les paiements, les ventes et les relations MLM existants. Aucun changement de modèle métier n'est nécessaire pour représenter un dossier en attente.

Ne pas exécuter de purge, de seed global, de conversion automatique d'agent en caissier ou de réécriture des historiques. Les anciennes étapes complètes et les anciens paiements restent inchangés. Les agents déjà connectés perdent les droits retirés une fois le nouveau backend déployé ; leur session ne doit pas contourner le contrôle serveur.

Déployer de façon coordonnée la migration, le backend puis le frontend afin de ne pas attribuer un rôle inconnu à une version encore ancienne. Ne pas assigner de compte réel au rôle caissier ni modifier la base distante pendant les tests. Toute publication ou opération distante doit être explicitement demandée.

## 8. Fichiers et composants concernés

Backend, dans `backend/` :

- `prisma/schema.prisma` et une nouvelle migration additive ;
- `src/common/guards/roles.guard.ts`, les utilitaires de rôle/site nécessaires et leurs tests ;
- `src/modules/users/dto/user.dto.ts` et `users.service.ts` ;
- `src/modules/clients/clients.controller.ts`, `clients.service.ts`, `dto/client.dto.ts` et tests associés ;
- `src/modules/ventes/ventes.controller.ts`, `ventes.service.ts` et tests associés ;
- les consommateurs de l'enum et les chemins de paiement concernés par ces opérations, sans modifier les règles financières.

Frontend, dans `frontend/src/` :

- `types/index.ts`, `store/auth.store.ts`, `hooks/useAuth.ts`, `components/layout/RoleGuard.tsx` et l'utilitaire partagé de rôles ;
- `App.tsx`, `components/layout/AppLayout.tsx` et les liens contextuels concernés ;
- `pages/parametres/UsersPage.tsx` ;
- les écrans clients de récit, reprise, file d'attente, fiche, activation et détail ;
- les écrans ventes POS/retours et leurs actions associées ;
- `hooks/useOnlineSync.ts`, `lib/offline.ts` et leurs consommateurs ;
- les tests de composants et de routes correspondants.

Cette liste délimite les surfaces à vérifier, pas une autorisation de refactoriser tout le projet. La matrice MLM, sa progression, les déplacements, les commissions et leurs montants restent hors modification.

## 9. Vérifications obligatoires

1. Un agent prépare un dossier sur son site : client en cours, récit en attente, parrain conservé, aucune écriture financière ni activation.
2. Un doublon de dossier ne crée ni second client ni second claim et ne divulgue pas le dossier d'un autre site.
3. L'agent reçoit un refus sur récit cash/mobile, reprise cash/mobile, fiche cash/mobile, activation cash/mobile et vente cash/mobile, y compris par appel direct.
4. Les données financières ou d'activation injectées dans le DTO de préparation sont rejetées sans effets métier.
5. Un caissier encaisse le dossier préparé, puis poursuit les étapes autorisées sans perdre le créateur ni le parrain ; les prérequis existants restent requis.
6. Un caissier ne peut pas consulter ou traiter les dossiers et ventes d'un autre site en falsifiant filtres, URLs ou corps de requête.
7. Agent et caissier ne peuvent ni retourner un produit ni rembourser une vente ; les responsables le peuvent dans leur périmètre existant.
8. Un gérant, directeur régional ou super-admin conserve les opérations d'encaissement, vente et activation attendues.
9. La création ou modification d'un caissier sans site valide échoue ; aucun compte existant n'est promu automatiquement.
10. Un changement de rôle/site est pris en compte côté serveur même avec un ancien token ; les limites du portail client restent intactes.
11. Les menus, liens directs, formulaires et libellés d'attente respectent les rôles sur ordinateur et mobile.
12. Une file hors ligne d'agent, d'un autre compte/site ou sans propriétaire fiable n'est pas soumise automatiquement ; ses entrées ne sont pas perdues.
13. Une vente hors ligne appartenant au caissier autorisé conserve son parcours de synchronisation et ses protections existantes contre les doublons.
14. Le blocage mobile-money reste actif. Les traitements authentifiés d'événements existants ne sont pas cassés.
15. Les parcours de parrainage/claim et d'activation autorisée restent compatibles avec le MLM et ne génèrent pas de commissions en double.

Exécuter les tests ciblés en TDD, puis les suites de régression utiles, les builds frontend/backend et la validation Prisma. Vérifier la migration sur une base locale de test, jamais sur la production pour reproduire un paiement. Signaler les échecs préexistants sans corriger des modules hors périmètre.

## 10. Critère de fin

Un agent peut préparer et suivre un dossier, sans qu'aucune voie de l'application lui permette d'encaisser, de vendre, d'activer ou de rembourser. Un caissier reprend ce dossier et réalise les opérations autorisées uniquement sur son site. Les responsables gardent leurs droits, les données historiques sont conservées et l'ensemble est couvert par les tests de rôle, de site et de non-régression.

La prochaine étape, après relecture de ce document, est un plan d'implémentation détaillé ; elle ne constitue pas une autorisation implicite de migration distante, de paiement, de commit ou de push.
