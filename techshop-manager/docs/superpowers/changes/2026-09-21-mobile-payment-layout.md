# Affichage mobile autour des paiements

## Périmètre

Correction frontend uniquement. Aucun changement des montants, droits, API,
comptes, paiements ou données. Mobile Money reste désactivé ; le message invitant
à utiliser les espèces et le suivi des anciens paiements sont conservés.

## Constats et correction

- Les champs de saisie et listes étaient calculés à 14 px, y compris le numéro
  et l'opérateur Mobile Money. Sur iOS, une police inférieure à 16 px peut
  déclencher un zoom lors de la prise de focus. Sur les appareils tactiles
  sans survol, les contrôles utilisent désormais au moins 16 px. Le zoom manuel
  reste autorisé et la présentation avec souris reste inchangée.
- La caisse occupait `100dvh` à l'intérieur d'une zone déjà réduite par le
  bandeau de l'application et ses marges. À 320 × 844, son parent défilait sur
  892 px pour 788 px disponibles : atteindre un bouton décalait toute la caisse.
  Sa hauteur suit désormais celle de son parent. Après correction, les deux
  mesures sont de 788 px ; les panneaux internes conservent leur défilement.

Les interactions testées n'ont pas reproduit de crash JavaScript global.
La vérification de la taille calculée des champs couvre la prévention du zoom,
mais ne remplace pas un essai du clavier et de Safari sur un iPhone physique.

## Régression navigateur

`frontend/scripts/check-mobile-payments.cjs` lance un navigateur isolé avec des
sessions fictives. Il refuse une URL non locale, intercepte toutes les requêtes
API, bloque les écritures et coupe les ressources externes. Aucun backend ni
compte réel n'est nécessaire.

Couverture : récit initial, reprise du récit, fiche client, caisse, retraits et
historique du portail. Vérification du passage Mobile Money → espèces sans
rechargement, M-Pesa et Airtel à la caisse, navigation mobile, absence de
débordement horizontal et de requête de paiement. Formats : 320 × 844,
390 × 844, 768 × 844, 1440 × 844, 390 × 420 et 844 × 390. La hauteur réduite
simule l'espace contraint par le clavier, pas un véritable clavier iOS.

Prérequis : Node, les dépendances frontend, un module `playwright` accessible
à Node et son Chromium installé. Un Edge installé convient aussi avec
`BROWSER_CHANNEL=msedge`. Pour un Playwright fourni par un runtime externe,
définir `NODE_PATH` sur le dossier `node_modules` de ce runtime.

Depuis `techshop-manager/frontend`, dans deux terminaux :

```text
npm run dev -- --host 127.0.0.1 --port 5187 --strictPort
node scripts/check-mobile-payments.cjs
```

`MOBILE_TEST_URL` permet de choisir une autre origine locale.

## Validation

- Avant correction : 5 scénarios réussis et 19 en échec sur les quatre formats
  initiaux, pour les polices trop petites et la hauteur de caisse.
- Après correction : les 24 mêmes scénarios réussissent.
- La suite étendue aux formats paysage et à hauteur réduite réussit également :
  36 scénarios sur 36, sans erreur JavaScript ni requête d'écriture.
- Les 28 tests ciblés de disponibilité Mobile Money et de formulaire passent.
- La compilation TypeScript et le build de production passent. L'avertissement
  existant sur les gros bundles PDF reste hors périmètre.
