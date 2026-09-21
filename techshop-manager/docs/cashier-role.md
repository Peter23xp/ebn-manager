# Rôle caissier : préparation, encaissement et reprise

## Séparation des tâches

- **AGENT** : prépare le dossier (identité, téléphone, site, parrain éventuel), consulte les dossiers et la file de son site. La préparation crée un client `EN_COURS` et une étape `RECIT / EN_ATTENTE`, sans montant, mode de paiement, référence de transaction ni date de paiement. Elle ne crée ni vente, ni membre MLM, ni commission.
- **CAISSIER** : reprend ce dossier existant, encaisse le récit et la fiche, réalise l'activation et les ventes POS. L'agent ne peut effectuer aucune de ces opérations financières, ni par lien direct, ni par appel API cash ou mobile.
- **FORMATEUR** : conserve l'exception existante de consultation du détail client et de validation de la formation. Cette exception n'autorise pas les encaissements. La formation conserve le formateur sélectionné comme intervenant ; les écritures financières portent le caissier authentifié.
- **GÉRANT** : traite les retours/remboursements et leurs avoirs. Le caissier et l'agent ne sont pas autorisés à rembourser. Les droits des rôles supérieurs restent soumis au contrat existant.

Les agents et caissiers sont limités à leur site affecté : modifier un site dans une URL ou une requête ne donne pas accès à un autre site. Un caissier sans site est refusé. Les règles historiques des rôles supérieurs et l'exception FORMATEUR ne sont pas remplacées par une nouvelle règle globale de site.

## Affectation des comptes

L'affectation est **manuelle par le super-administrateur**, après publication coordonnée autorisée. Choisir explicitement le rôle `CAISSIER` et un site valide. Les comptes agent, caissier, gérant et formateur nécessitent un site lors de leur gestion. Aucun utilisateur existant ne devient caissier automatiquement : la migration ajoute le rôle, elle ne promeut pas les comptes.

Le serveur relit le rôle, le site et l'état actif du compte à chaque authentification JWT. Un ancien token ne conserve donc pas les anciens privilèges après une modification du compte. Après changement de rôle/site, reconnecter la session pour actualiser également l'interface et ses données locales.

## Parcours du dossier

1. L'agent prépare un dossier et vérifie son téléphone et son parrain. Un parrain non encore actif produit une réclamation `EN_ATTENTE`, sans activation financière. Un téléphone déjà enregistré doit conduire à reprendre le dossier autorisé, pas à recréer une identité.
2. Le caissier ouvre la file de son site et reprend le client par son identifiant. Il ne remplace ni le créateur `createdById`, ni le parrain déjà enregistré.
3. Il confirme le paiement du récit, puis la formation selon le parcours existant et le paiement de la fiche. La formation reste également accessible au formateur ; elle n'est pas un encaissement et n'ajoute pas une nouvelle condition obligatoire à l'activation existante.
4. L'activation utilise le produit et le stock du site du client. Le serveur enregistre la vente/facture, l'étape et le mouvement de stock sous l'identité du caissier ; le prix vient du catalogue, pas d'un prix imposé par le navigateur. Le profil MLM, le parrainage, les générations et les commissions suivent les services existants, sans reconfiguration du MLM.
5. Pour une vente POS, vérifier le client, le site, les quantités et le montant reçu. En cas de retour, solliciter un gérant : son identité apparaît sur le retour et le mouvement de remise en stock, avec un avoir.

Les champs d'acteur et de confiance envoyés par le navigateur ne donnent aucun droit : les DTO stricts rejettent les champs supplémentaires et les chemins récit imposent l'acteur authentifié. Une répétition séquentielle d'une étape déjà payée/activée est refusée sans nouvelle écriture. Cela ne constitue pas une garantie générale d'exécution exactement une fois pour les ventes POS.

### Précisions de périmètre après revue finale

- Pour l'agent et le caissier, les statistiques, transactions récentes et graphiques du dashboard ainsi que `GET /rapports/ventes` appliquent le même filtre serveur que la liste des ventes : site authentifié et client lié appartenant à ce site, ou vente anonyme. Ce filtre précède les limites et agrégations ; les droits existants des responsables et formateurs restent inchangés.
- La réinitialisation staff du PIN vérifie le site du client persisté avant tout hachage ou changement des tentatives/blocages. Le support de son propre site reste accessible à l'agent et au caissier ; les exceptions des responsables sont conservées. Le login portail et l'initialisation interne du PIN ne changent pas.
- Les réponses HTTP du récit, de sa reprise par téléphone ou identifiant et de l'activation filtrent aussi les ventes historiques imbriquées selon l'acteur. Les ventes historiques ne sont pas supprimées ; les lectures internes de confiance et les finalisations KPay restent inchangées.
- Les caches privés clients, listes, onboarding, reçus et avoirs sont séparés par identité, session, rôle et site. L'absence du site d'un agent/caissier désactive les requêtes automatiques ; un placeholder de liste ne traverse pas cette séparation. Les reçus/avoirs restent consultables par l'agent autorisé, et les consultations/formation du formateur sont préservées. Un changement de session/périmètre annule l'impression différée du reçu et empêche le téléchargement d'une fiche PDF préparée sous l'ancien périmètre.

**Mobile Money reste désactivé.** Les initialisations KPay et les modes mobiles sont refusés ; utiliser le mode espèces disponible. Cette livraison n'autorise aucun appel réel de paiement, remboursement mobile ou transfert automatique.

## Hors ligne et incertitude réseau — politique Task 6 revue

La file locale appartient à une identité et à un site ; la synchronisation vérifie le rôle courant et la session. Un changement de compte ou de site ne transfère pas la propriété des ventes en attente.

- Un marqueur persistant `reviewRequired` est enregistré **avant l'envoi** d'une vente au serveur.
- Un succès confirmé supprime l'entrée, **même si la session a changé pendant l'envoi**.
- Une réponse incertaine, une entrée historique/legacy ou une entrée d'un autre propriétaire reste conservée, sans rejeu automatique. Ne pas supprimer ces éléments pour « débloquer » la file ni réencaisser aveuglément.
- Vérifier avec le responsable les ventes déjà enregistrées et les justificatifs avant toute action manuelle. Cette livraison n'inclut **ni interface de rapprochement, ni garantie exactement une fois entre onglets ou côté serveur**.

Les refus de rôle/site et les exceptions hors ligne ne doivent pas être contournés par une promotion improvisée ou une nouvelle identité client.

## Validation native locale

La suite `backend/src/modules/clients/cashier-workflow.integration.spec.ts` est optionnelle. Sans `CASHIER_TEST_DATABASE_URL`, elle est ignorée. Une autre URL est refusée avant la connexion ; seule cette valeur est autorisée :

```text
postgresql://postgres@127.0.0.1:55432/cashier_integration
```

Préconditions : PostgreSQL 17 local vérifié sur ce port, base dédiée déjà créée et migrations applicables déjà déployées par l'opérateur autorisé. Ne jamais utiliser la base distante, copier le `.env` d'origine, démarrer `AppModule`, effacer un cluster ou purger l'historique immuable pour ces essais.

Depuis `techshop-manager/backend`, définir uniquement l'environnement du processus :

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
$previousDirectUrl = $env:DIRECT_URL
$previousTestUrl = $env:CASHIER_TEST_DATABASE_URL
try {
  $env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/cashier_integration'
  $env:DIRECT_URL = $env:DATABASE_URL
  $env:CASHIER_TEST_DATABASE_URL = $env:DATABASE_URL
  npm test -- --runInBand cashier-workflow.integration.spec.ts
  if ($LASTEXITCODE -ne 0) { throw 'Cashier integration failed' }
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
  $env:DIRECT_URL = $previousDirectUrl
  $env:CASHIER_TEST_DATABASE_URL = $previousTestUrl
}
```

Le montage utilise les vrais contrôleurs Nest, gardes JWT/rôles/mobile, `JwtStrategy`, Prisma avec `PrismaPg`/`pg.Pool`, services clients/ventes/portail et services MLM. Seuls les secrets de test, appels externes et hooks automatiques sont isolés. Les niveaux standard ne sont initialisés que si la base locale n'en contient aucun ; les calendriers synthétiques manquants sont ajoutés uniquement dans cette base. Les autres niveaux/calendriers ne sont pas remplacés.

Chaque exécution ajoute des sites, comptes, produits, stocks et dossiers synthétiques identifiés par UUID. Les données sont conservées, sans purge, afin de respecter l'historique immuable. Les comparaisons avant/après couvrent les compteurs natifs et les dossiers, étapes, ventes et stocks de la fixture. Ne pas lancer simultanément plusieurs suites qui écrivent dans cette même base.

La suite couvre les refus financiers agent, les sites étrangers, les champs de confiance forgés par un caissier autorisé, le dossier non payé, la reprise complète et ses doublons, les ventes/retours, deux insertions concurrentes, le rollback réel après erreur de clé étrangère sur l'étape et la relecture d'un ancien JWT après modification locale du rôle/site/état actif. Elle ne remplace pas les tests larges backend/frontend, la validation du schéma, les essais navigateur ou la revue finale.

### Résultats locaux du 20 septembre 2026

- Suite native exécutée : **25 tests réussis**, puis **25 réussis** lors d'une nouvelle exécution avec `--detectOpenHandles`, sans signalement de handle ouvert. Base vérifiée : PostgreSQL **17.10**, neuf migrations déjà appliquées. Aucune migration supplémentaire exécutée par cette suite.
- Variable dédiée absente : **25 tests ignorés**. URL locale différente : rejet attendu avant le montage natif, zéro test exécuté. Les traces HTTP 503 Mobile Money et l'erreur injectée `P2003`/HTTP 500 sont attendues, pas des échecs de validation.
- Résultats larges **communiqués par le contrôleur**, non réexécutés ici : backend **1 147 réussis / 142 ignorés**, 39 suites, aucun échec ; build backend et validation Prisma réussis. Frontend **537 réussis / 21 échecs préexistants** (`PortalPointsPage` : 19 ; `NotFoundPage` : 2), build réussi. Ces résultats ne sont pas présentés comme un frontend entièrement vert.
- Le contrôleur rapporte également la réussite des essais navigateur IndexedDB natif (base, succès confirmé tardif et reprise ambiguë), des six cas rôle/viewport, des menus mobiles, du clavier, de l'attente et de la conservation après conflit 409. Ces essais UI ne constituent pas une garantie d'exécution exactement une fois ni un déploiement.

## Publication — autorisation distincte obligatoire

### Validation après revue finale

Les quatre constats de revue sont corrigés et revus : lectures de ventes via dashboard/rapports, réinitialisation du PIN staff limitée au site, caches/documents privés séparés par session, et réponses d'onboarding filtrées. Le générateur PDF de l'écran de succès d'activation vérifie aussi la session avant génération et avant téléchargement ; aucun paiement n'a été modifié pour cette protection.

- Backend large : **1 156 réussis**, un timeout préexistant du sous-processus Windows de maintenance, **183 ignorés**. Relance inchangée de maintenance : **9/9 réussis**.
- PostgreSQL dédié : **41/41 réussis** avec `--detectOpenHandles`, aucune alerte de handle ouvert. Les migrations sont uniquement appliquées/testées localement.
- Frontend large avant le dernier correctif PDF : **619 réussis / 21 échecs préexistants**. Après ce correctif : **91/91 tests cache/PDF réussis**, dont neuf nouveaux cas sur le vrai écran de succès. Ce résultat ciblé ne remplace pas une nouvelle exécution de toute la suite.
- Builds backend/frontend et validation Prisma réussis. Essais navigateur des trois rôles à deux tailles, IndexedDB, changements de session et masquage des dossiers/reçus/avoirs réussis, avec API synthétiques interceptées.

Le cluster PostgreSQL et le serveur Vite créés pour ces essais sont arrêtés. Leur worktree, leurs données synthétiques et les modifications non commitées sont conservés ; le serveur utilisateur préexistant et la base distante ne sont pas touchés.

### Décisions de compatibilité prises pendant la revue

1. Conserver l'accès FORMATEUR existant au détail/formation. Conséquence : sa visibilité historique reste inchangée ; un durcissement supplémentaire demanderait un autre contrat de lecture.
2. Masquer aux agents/caissiers les ventes historiquement liées à un client d'un autre site, avant calcul des totaux. Conséquence : ces incohérences restent consultables par les responsables, sans réparation ni suppression des données.
3. Retirer de la file locale un envoi confirmé, même après changement de session. Conséquence : l'entrée acquittée disparaît du terminal ; l'historique serveur reste conservé.
4. Bloquer le rejeu automatique des résultats incertains avec un marqueur persistant. Conséquence : un responsable doit vérifier ces cas manuellement ; aucune interface de rapprochement n'est ajoutée.
5. Étendre la même restriction de site aux lectures héritées dashboard/rapports et à la réinitialisation de PIN staff. Conséquence : l'assistance intersites nécessite un rôle supérieur déjà autorisé.
6. Fermer le cas résiduel du PDF d'activation malgré la limite procédurale de revue, sans rouvrir un audit général. Conséquence : un PDF interrompu par un changement de session doit être régénéré ; les documents déjà téléchargés ne sont pas effacés.

### Ordre de publication

Ordre à respecter, uniquement sur demande explicite de déploiement :

1. **Migration additive** : publier/appliquer la migration ajoutant `CAISSIER` sur l'environnement autorisé, selon la procédure de sauvegarde et de contrôle habituelle. Ne changer aucun rôle réel à ce stade.
2. **Backend** : publier le client Prisma régénéré et les contrôles serveur de rôle/site, de préparation et d'encaissement. Vérifier les contrôles avant d'exposer les nouveaux écrans.
3. **Frontend** : publier menus, formulaires, reprise, POS et politique de file locale coordonnés avec ce backend.
4. Après vérification coordonnée, le super-administrateur peut affecter manuellement les caissiers et leurs sites autorisés.

Une exécution native locale ne vaut ni autorisation de déployer ni preuve de publication. Aucun commit, push, changement de rôle réel, migration distante ou paiement réel ne fait partie de cette validation.
