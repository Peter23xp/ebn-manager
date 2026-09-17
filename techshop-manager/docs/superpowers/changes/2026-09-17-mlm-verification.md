# Verification locale du MLM 4 x N et des commissions 60/40

17 septembre 2026. Verification des modifications dans le checkout fourni, avant publication demandee sur main. Aucun deploiement, migration, sauvegarde ou purge de la base distante n'a ete execute par cette verification.

## Perimetre livre dans le code

- Le module MLM existant conserve Matrix/Position comme arbre unique. Quatre enfants maximum, spillover BFS deterministe, recruteur personnel distinct du parent matriciel.
- Le rang correspond a la derniere generation consecutive complete. Les agregats distinguent generation, total des descendants, positions occupees/restantes et progression. Builder est en cours avant 4/4 ; Sapphire exige 16/16. Les huit rangs restent en place.
- Deplacements/echanges transactionnels avec controles de cycle et de concurrence, preservation des sous-arbres et historique append-only. Une generation deja remuneree ne genere pas une deuxieme commission apres perte/reacquisition.
- Commissions capturees avec Decimal : total, immediat et retenue distincts. Validation administrative atomique ; calendrier a partir de cette validation, lundi-samedi hors feries configures. La tache planifiee rend la retenue eligible, sans transfert KPay. La restitution administrative transfere entre poches, sans compter un nouveau gain.
- Endpoints bornes et controles de roles ; ecrans existants adaptes aux montants serveur, a la progression, au recruteur/parent, aux mouvements et a l'historique. Les autres changements concernent uniquement les consommateurs MLM du portail et la route de configuration.
- Migration non destructive avec refus des structures historiques incompatibles. Audit en lecture seule et outillage de sauvegarde/restauration/purge securise ; aucune suppression automatique au demarrage.

## Preuves de verification

### Backend et PostgreSQL

Depuis `backend`, execution finale avec la seule base d'integration explicitement autorisee :

```powershell
$env:MLM_TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/mlm_integration'
npm test -- --runInBand
npm run build
$env:DATABASE_URL = $env:MLM_TEST_DATABASE_URL
$env:DIRECT_URL = $env:MLM_TEST_DATABASE_URL
npx prisma validate
npx prisma migrate status
npx prisma migrate diff --from-url $env:DATABASE_URL --to-schema-datamodel prisma/schema.prisma --exit-code
git diff --check
```

- Tests : **301 passes, 14 ignores, aucun echec ; 24 suites passees**, 42,912 secondes. Les 14 ignores appartiennent a la suite native opt-in de maintenance, executee separement.
- Les **12 scenarios PostgreSQL** de cette execution couvrent generations, recrutement independant, spillover concurrent, mouvements/echange/historique/cycles, absence de double commission ou restitution, roles HTTP, projections et audit.
- Build backend, generation Prisma, validation du schema et verification whitespace : codes de sortie 0. Sept migrations presentes, base locale a jour, comparaison Prisma : aucune difference.
- Un premier essai de cette derniere verification avait ajoute `?schema=public` a l'URL de test : le garde-fou exigeant l'URL exacte l'a refuse avant connexion. Seule la commande a ete corrigee ; aucune protection du test n'a ete affaiblie.
- Un essai anterieur avait lu un import temporairement sans export pendant l'edition RED du test de maintenance. La verification finale a ete relancee apres stabilisation de tous les fichiers.

### Sauvegarde et restauration natives

- **14/14 scenarios natifs passes** sur donnees synthetiques locales : restauration exacte JSON/Decimal/dates/FK/triggers/sequences, selection liee au manifeste, refus des ecritures concurrentes/paiements/dependances inconnues, confidentialite SCRAM/ACL et purge transactionnelle des seules fixtures autorisees.
- Apres ajout du controle du proprietaire Windows : **8/8 tests unitaires passes**, puis nouvelle execution native ciblee `npm test -- --runInBand --runTestsByPath src/modules/mlm/mlm-maintenance-postgres.spec.ts -t 'backs up natively'` : **1 passe / 13 ignores**, 26,168 secondes, code de sortie 0.
- Ce dernier essai utilise le service local prive SCRAM et le controle de proprietaire actif. Il ne constitue pas une nouvelle execution complete des 14 cas, ni une certification de restauration Supabase.
- Les donnees source de test sont sur le port local 55432 ; la restauration privee sur 55433. Aucun secret de connexion n'est publie dans ce rapport.
- Les deux serveurs PostgreSQL temporaires ont ete arretes proprement apres les verifications. Leurs donnees et les traces privees restent conservees hors depot ; aucun service de l'application ni aucune base distante n'a ete arrete.

### Frontend

Depuis `frontend` : `npm test -- --maxWorkers=1`, puis `npm run build`.

- Suite complete : **150 passes / 21 echecs**, 11 fichiers verts sur 13. Les **44 nouveaux tests MLM passent**.
- Les echecs etaient presents avant les modifications : 19 dans `PortalPointsPage.test.tsx` (mock obsolete ne fournissant pas `usePortalWalletHistory`), deux dans `NotFoundPage.test.tsx` (anciennes attentes de texte/liens). Ces deux fichiers de tests ne sont pas modifies. La suite complete n'est donc pas declaree verte.
- Build frontend : code de sortie 0. Avertissements existants concernant lottie/eval et la taille du bloc PDF.
- Controle visuel navigateur sur donnees synthetiques : arbre, panneau membre avec recruteur et parent distincts, progression, montants 40/24/16 separes. Ce controle n'est ni un test E2E distant, ni une validation mobile. Le serveur de demonstration et l'onglet ont ete fermes.

## Revue et decisions d'execution

Revues independantes core, finance/calendrier, portefeuille/portail, frontend et maintenance : findings corriges et re-revues acceptees. Revue finale des interfaces : aucun nouveau blocage prouve.

- Travail dans le checkout fourni, sans creation de branche. Apres la verification initiale, l'utilisateur autorise explicitement le commit et le push sur main ainsi que la conservation des deux super-admins. Les echecs frontend preexistants restent signales, sans extension de perimetre pour les corriger.
- Interprétation du rang fixee par le contrat : derniere generation consecutive complete, pas simple nombre de recrutements ni total de descendants.
- Delegation en parallele uniquement sur domaines disjoints, suivie de revues des interfaces et de verification commune.
- Limite non bloquante connue : les lots du portefeuille affichent explicitement un apercu borne a 100 ; la pagination backend existe mais la navigation UI au-dela de cet apercu reste a ajouter pour des historiques volumineux. Le resume financier couvre tous les lots.

## Conditions restantes avant intervention distante

### Precision utilisateur et verification avant publication

L'utilisateur demande de conserver les deux super-admins et de pousser les modifications sur main. L'option `--preserve-admin-ids` accepte un ensemble explicite normalise ; l'ancien choix unique reste compatible. Le manifeste lie exactement cet ensemble a la sauvegarde, avec refus des omissions, sous-ensembles et sur-ensembles. Les identifiants ne sont pas codes en dur et un autre administrateur n'est pas conserve implicitement.

- TDD de cette adaptation : deux echecs attendus avant implementation ; ensuite neuf tests unitaires passes et deux cas natifs passes (ancien choix unique et conservation de deux comptes). La purge de fixtures verifie ID/hash/attributs des deux comptes et ne modifie que leurs rattachements aux sites supprimes.
- Verification backend complete relancee avant commit : **302 passes / 15 natifs optionnels ignores**, 24 suites passees, 47,482 secondes. Compilation autonome du script de maintenance reussie.
- Revue independante de la selection multiple : approbation statique, aucun finding actionnable ; les fichiers verifies correspondent aux empreintes revues. La compatibilite des anciens manifestes format 1 a ete inspectee statiquement, pas revalidee par un nouvel essai natif de ce format.
- Builds backend/frontend, Prisma validate/status/diff local revalides. Frontend relance : **150 passes / 21 echecs preexistants**, build reussi en 23,84 secondes. Aucune presentation de cette suite comme entierement verte.
- Publication demandee sur `main`, sans push force. Le document technique utilisateur deja non suivi avant ce travail reste hors du commit MLM. Ni secrets, ni sauvegardes, ni donnees locales ne font partie des fichiers prepares.

### Operations distantes non executees

**La purge demandee reste non executee.** Les tests locaux ne remplacent aucune de ces conditions :

1. Conservation confirmee par l'utilisateur : **Peter AKILIMALI et Seraphin Bagalwa**. L'ensemble exact de leurs ID/hash doit etre preserve et lie au manifeste ; ne pas inclure implicitement un autre compte.
2. Fournir/verifier une connexion PostgreSQL directe appropriee. Les deux URL configurees utilisent actuellement le session pooler, refuse par l'outil ; ne pas contourner ce garde-fou.
3. Etablir la maintenance reelle, arreter les ecritures et verifier les paiements ainsi que l'exclusivite de la cible. Aucun arret distant n'a ete effectue.
4. Sauvegarder la cible hors depot, restaurer confidentiellement, comparer donnees/schema, puis effectuer le dry-run et la purge allowlist avec les deux identites confirmees. Les schemas internes Supabase restent hors perimetre.
5. Appliquer les migrations/niveaux et verifier les donnees attendues ainsi que les deux admins preserves avant reouverture.
6. Certifier/configurer les calendriers annuels RDC couvrant 2026/2027, y compris jours exceptionnels et reports applicables. La source juridique recherchee ne suffit pas a inventer cette couverture annuelle. Une validation de commission reste refusee si son calcul traverse une annee non configuree.

Procedure operationnelle : `docs/superpowers/maintenance-runbook.md`. Sources calendrier : `docs/superpowers/research/2026-09-17-mlm-drc-calendar.md`. Les traces detaillees des commandes et revues sont conservees dans le journal local `.superpowers/sdd/2026-09-17-mlm-4xn-implementation` du depot parent.
