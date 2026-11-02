# Expiration des transactions d'activation MLM

Le journal Render signalait une transaction Prisma expirée après 30 secondes.
Un test sur PostgreSQL local reproduit la même erreur avec une attente de
31 secondes dans la transaction, puis confirme la création après correction.

Le recalcul des huit générations effectue désormais une seule écriture groupée
par ancêtre, au lieu de huit upserts successifs. L'ordre des ancêtres est
conservé. Les conflits ne mettent à jour que les compteurs et la complétion :
les identifiants, positions, budgets figés et historiques financiers restent
intacts. Les contrôles financiers et le verrouillage MLM sont conservés.

L'intégration dispose de 100 secondes au total, acquisition de connexion
comprise (jusqu'à 90 secondes de transaction au premier essai). Les conflits
réessayables partagent ce budget. Une transaction expirée n'est pas rejouée
automatiquement. L'activation commerciale ne lance plus trois tentatives
supplémentaires, ni une quatrième depuis la lecture de sa réponse. Elle
retourne le client déjà activé ; le bouton MLM permet une reprise ultérieure.

Les appels frontend d'activation, de relance et de lecture de la fiche
(qui peut réparer le MLM) attendent jusqu'à 120 secondes. Le délai global
des autres requêtes reste inchangé. Aucune migration n'est nécessaire.

Validation : suites de placement/remontées, commissions progressives,
permissions clients, reprise MLM et détail client ; 112 tests frontend
(bouton de reprise, paiements et caches privés). Les builds backend et
frontend réussissent. Sous Windows, la génération Prisma a été relancée
après la fin des tests qui verrouillaient sa DLL. Les tests PostgreSQL
utilisent exclusivement la base locale dédiée.
