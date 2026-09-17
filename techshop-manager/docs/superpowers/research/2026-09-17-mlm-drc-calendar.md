# Calendrier MLM RDC : recherche et contrat de configuration

Recherche du 17 septembre 2026. Perimetre : helpers de la tache 2, sans seed, migration appliquee, acces a la base distante ni calendrier active.

## Conclusion operationnelle

La liste legale de reference trouvee est celle de l'ordonnance n° 23/042 du 30 mars 2023. La reproduction du texte consulte indique un conge **le jour precedent** lorsqu'un ferie coincide avec un dimanche, et non un report automatique au lundi. Les derogations et communiques propres a une annee doivent toutefois etre verifies avant configuration.

La recherche ne certifie pas un calendrier annuel 2026/2027 complet, ni l'absence de textes modificatifs ou fermetures exceptionnelles. Aucun tableau de dates pret a etre importe n'est fourni. Ne pas activer un calendrier a partir des seuls exemples de tests ou de la liste recurrente ci-dessous.

## Sources effectivement ouvertes

### Texte de l'ordonnance

[Ordonnance du 30 mars 2023, reproduction Droit Congolais](https://droitcongolais.info/files/143.03.23_Ordonnance-du-30-mars-2023_jours-feries.pdf).

- PDF accessible, deux pages ; contenu juridique sur la premiere page. Extraction de texte et controle visuel de cette page effectues.
- En-tete : ordonnance n° 23-042 du 30 mars 2023, publication indiquee au Journal officiel RDC du 15 mai 2023.
- Il s'agit d'une reproduction juridique sur un site non gouvernemental, pas d'un original certifie du Journal officiel.
- SHA-256 des octets consultes : `b679de9e9291bfee0b6e9a18a60bfe97fce2985410c823c710dcea380490032e`.
- L'article 3 abroge l'ordonnance 14-010 du 14 mai 2014 et les dispositions anterieures contraires. L'article 4 indique une prise d'effet a la signature.

Article 1, liste transcrite du texte :

- 1er janvier : Nouvel an.
- 4 janvier : Journee des Martyrs de l'independance.
- 16 janvier : Journee du heros national Laurent Desire Kabila.
- 17 janvier : Journee du heros national Patrice Emery Lumumba.
- 6 avril : Journee du combat de Simon Kimbangu et de la conscience africaine.
- 1er mai : Fete du travail.
- 17 mai : Journee des Forces armees.
- 30 juin : Journee de l'independance.
- 1er aout : Fete des parents.
- 25 decembre : Noel.

Article 2, transcription : « Dans le cas ou l'un des jours feries legaux vises a l'article 1er coincide avec un dimanche, le conge relatif a ce jour est pris le jour precedent. »

Cette disposition ne justifie ni un report systematique au lundi, ni un deplacement automatique des feries tombant un samedi. Le texte consulte ne liste pas Paques, le lundi de Paques ou les fetes du Congo-Brazzaville comme feries nationaux RDC ; ne pas les importer par analogie.

### Communique officiel sur domaine gouvernemental

[Ministere de l'Emploi, Travail et Prevoyance Sociale, communique du 23 decembre 2023, heberge par le MEDD](https://medd.gouv.cd/wp-content/uploads/2023/12/COMMUNIQUE-25-DEC-01-ET-04-JANVIER.pdf).

- Document signe par Claudine Ndusi M'Kembe, une page scannee ; rendu en memoire et lu visuellement, car l'extraction PDF ne contient pas de texte exploitable.
- Le ministere cite explicitement l'ordonnance n° 23/042 du 30 mars 2023.
- Il declare chomes et payes sur tout le territoire national le lundi 25 decembre 2023, le lundi 1er janvier 2024 et le jeudi 4 janvier 2024.
- C'est une preuve administrative primaire de ces trois dates et de l'application de cette ordonnance, pas une approbation des dates observees en 2026 ou 2027.

### Corroboration et limites

- [Notice Leganews de l'ordonnance](https://leganews.pro/articles/0188daca-82b3-7ddd-bbd8-f0a7c7ea6079) : notice accessible, source indiquee « J.O RDC, numero 10, 15 mai 2023 ». Le texte integral est reserve aux abonnes ; il n'a pas ete consulte ni contourne.
- [Article 7sur7 du 3 avril 2023](https://7sur7.cd/2023/04/03/rdc-voici-la-liste-actualisee-de-tous-les-jours-feries) : le corps de l'article confirme les dix dates et « le jour precedent ». Source de presse secondaire uniquement ; le pied de page comporte des liens sans rapport, non utilises comme preuve.
- [Article CongoJob du 30 juin 2026](https://congojob.cd/liste-des-jours-feries-en-rdc/) : signale un amenagement du 17 janvier 2026 au lundi 19 janvier 2026. Le communique primaire correspondant n'a pas ete obtenu ; cette affirmation n'est donc **pas validee pour import**. Elle souligne pourquoi une regle recurrente seule est insuffisante.
- Le site `emploi.gouv.cd` n'etait pas resoluble pendant la recherche ; l'API publique ACP a retourne HTTP 403. La recherche DuckDuckGo a ensuite demande une verification humaine. Aucun contournement n'a ete tente. Ces limites empechent de garantir l'exhaustivite des annonces annuelles recentes.

## Traduction en comportement logiciel

- `getReleaseSchedule(validatedAt, tx?)` compte 30 jours ouvrables a partir du lendemain de la date locale dans `Africa/Lubumbashi`, samedi inclus, dimanche exclu. Il conserve heure, minutes, secondes et millisecondes de validation ; la zone contemporaine n'a pas de changement d'heure saisonnier.
- Aucune fete n'est codee en dur. Le service exclut seulement les dates explicitement configurees. Il ne consulte aucun site Internet et ne deduit aucun report, precedent ou suivant, pendant un calcul.
- Une date observee doit figurer explicitement dans `holidays` apres verification documentaire. Ajouter un samedi observe est supporte exactement comme tout autre ferie ; les doublons n'excluent pas deux jours.
- Toute annee locale couverte est obligatoire, y compris celle de validation meme si celle-ci est le 31 decembre. Les dates UTC pouvant appartenir a une autre annee locale sont testees.
- Le lot doit recevoir exactement le triplet retourne : `releaseDate`, `calendarVersion`, `timezone`. `calendarVersion` est une chaine JSON ordonnee contenant `year`, `version` et `fingerprint` (SHA-256 hexadecimal du contenu canonique) pour chaque annee couverte ; ne pas la tronquer a une seule annee ni supprimer l'empreinte.
- Le cache est limite a un calcul. Une nouvelle configuration n'altere pas une echeance deja retournee ; les futurs calculs relisent la base.

## Contrat de listYears / saveYear

- `listYears()` renvoie les lignes par annee croissante et refuse les donnees stockees mal formees au lieu de calculer avec elles.
- `saveYear(year, input)` accepte un entier de 1 a 9999 ; `input` contient `holidays: string[]`, `version: string`, `source: string`, et eventuellement `timezone: 'Africa/Lubumbashi'`.
- `version` : 1 a 100 caracteres ; `source` : 1 a 2000 caracteres ; espaces de bord retires apres controle de longueur et contenu non vide. La source peut reunir references de texte et communiques ; le service ne certifie pas juridiquement leur contenu.
- `holidays` : au plus 366 entrees au format exact `YYYY-MM-DD`, toutes reelles et dans l'annee configuree. Tri et deduplication sans mutation du tableau fourni. Une liste vide est syntaxiquement valide, notamment pour les fixtures, mais n'est pas une certification d'absence de feries en RDC.
- Tout changement des dates ou de la source exige une version differente de celle de la ligne courante. Un enregistrement identique apres normalisation est idempotent et n'ecrit pas en base.
- Controle et ecriture sont executes dans une transaction Prisma `Serializable`. Les conflits Prisma `P2034` / `P2002` deviennent HTTP 409 ; le client doit recharger avant de reessayer. Les donnees invalides produisent HTTP 400.
- Le schema ne conserve qu'une ligne par annee : il ne constitue pas une archive de toutes les anciennes versions. Utiliser des identifiants de revision jamais reutilises et conserver les sources / anciennes configurations dans l'archive administrative ; ne pas recycler une ancienne version apres plusieurs revisions.
- Ce service ne change aucun lot deja valide et ne modifie pas la politique d'autorisation de l'API, qui reste a la charge du module existant.

## Gate avant activation

Correction apres revue : chaque annee capturee dans `calendarVersion` comprend aussi `fingerprint`, SHA-256 du JSON canonique `{year, holidays, source, timezone}`. Les dates sont deja triees/dedupliquees. Reutiliser un ancien libelle avec un autre contenu produit donc une identite complete differente. Cette empreinte ne remplace pas une archive des anciennes dates ; les echeances deja calculees restent immuables.

1. Obtenir / verifier le texte applicable et les communiques de l'annee depuis une source administrative authentifiable, notamment les exceptions propres aux samedis et dimanches.
2. Documenter la provenance de chaque date observee ou fermeture exceptionnelle ; lever les contradictions avant saisie.
3. Configurer toutes les annees potentiellement traversees avec des versions uniques, puis verifier quelques echeances autour des limites d'annee.
4. Ne pas lancer de seed, d'import ou de mise a jour de la base distante a partir de cette note. Aucune activation de calendrier n'a ete effectuee dans la tache 2.
