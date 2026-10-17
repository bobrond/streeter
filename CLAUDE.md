# Streeter

PWA personnelle de programmation et de suivi d'entraînement street workout : un seul utilisateur, hors ligne, sans backend. Objectifs actuels : **planche** et **touch front lever** (FL). Elle remplace un tableur Excel et doit rester aussi paramétrable que lui, avec une interface pour téléphone utilisable d'une main entre deux séries, dehors, sans réseau.

- Cahier des charges complet : [docs/cahier_des_charges.md](docs/cahier_des_charges.md).
- **Source de vérité** pour les données de départ et la logique : `docs/programme_planche_touch_fl_1.xlsx` (le cahier des charges le nomme sans `_1`). Onglets : Lisez-moi, Programme, Volume hebdo, Journal, Objectifs, Exercices. Le fichier est exclu du dépôt (`.gitignore`) : il n'existe qu'en local. Depuis le 12/10/2026, le programme de l'appli s'en écarte (voir « Rotateurs externes » plus bas).
- **En cas de doute sur une règle d'entraînement, demander à l'utilisateur au lieu de supposer.** Les règles ci-dessous marquées « décidé » ont été tranchées avec lui le 07/10/2026 et priment sur le tableur.

## Méthode de travail

- Phases livrables et testables sur téléphone : 0 socle, import, calculs testés, mise en ligne → 1 Aujourd'hui et mode séance, hors ligne, export JSON de secours → 2 édition complète dans Réglages → 3 Semaine, Journal, Objectifs → 4 sauvegarde complète, exports, finitions PWA. Refonte de l'interface (V2) : phases 0 et A à F, toutes livrées le 17/10/2026, voir « Interface V2 ».
- Fin de phase : tests verts, journal de bord du jour à jour, `git commit`, `git push` (déploiement automatique), puis court récapitulatif (ce qui marche, ce qui reste, quoi tester sur le téléphone).
- Échanges en français, en tutoyant l'utilisateur. Son téléphone : Android (Chrome).

## Journal de bord (vault)

Le dossier `vault/` est le second cerveau du projet (lisible dans Obsidian et VS Code) : `vault/index.md` donne l'état du projet et pointe vers un journal de bord par jour de travail, `vault/journal/AAAA-MM-JJ.md`. À ne pas confondre avec l'écran Journal de l'appli.

- **Privé : le vault reste sur ce PC.** Il est ignoré par git (`.gitignore`) et ne doit jamais être commité ni poussé : le dépôt est public (décidé avec l'utilisateur le 08/10/2026). Il n'a pas de sauvegarde en ligne.
- **Chaque session de travail le tient à jour, sans attendre qu'on le demande.** En début de session, lire l'index et le dernier journal pour reprendre le fil.
- `npm run journal` crée le journal du jour depuis le modèle `vault/templates/journal.md`, régénère sa liste de commits (heure locale) et la navigation entre les jours, et ajoute sa ligne dans l'index. Ne jamais modifier à la main ce qui est entre les repères `commits:début` / `commits:fin`.
- À la main, au fil de la journée : Actions (ce qui a été fait, par thème), Décisions (qui a tranché ; « décidé avec l'utilisateur » ou « choix sans l'utilisateur, à valider »), Problèmes et corrections, Mises à jour (dépendances, versions, schéma Dexie, format de sauvegarde, déploiement), Suite (cases à cocher).
- En fin de session, après le dernier commit : `npm run journal`, puis « En bref » du jour, ligne du jour dans l'index (une phrase), « État actuel » et « En attente / à décider » de l'index.
- Les liens sont des liens Markdown relatifs (pas de `[[…]]`), pour fonctionner partout.

## Stack

- Vite, React, TypeScript strict, Tailwind CSS v4. TypeScript reste en 6.0 : typescript-eslint ne supporte pas encore la 7.
- Dexie (IndexedDB) et `dexie-react-hooks` ; `navigator.storage.persist()` au démarrage.
- `vite-plugin-pwa` (Workbox) : manifest, précache, fonctionnement entièrement hors ligne.
- SheetJS 0.20.3 installé depuis son CDN officiel (`cdn.sheetjs.com`), pas le paquet npm `xlsx` (figé en 0.18.5, failles connues). Chargé par `import()` dynamique.
- Graphiques : uPlot. Tests : Vitest, avec `fake-indexeddb` pour Dexie.
- Polices : `@fontsource-variable/heebo` et `@fontsource/bebas-neue`, dont `src/index.css` référence les seuls fichiers woff2 latins (précachés par Workbox).
- Routage par hash (hébergement statique, hors ligne).
- Commandes : `npm run dev` (http://localhost:5173/streeter/), `npm run build`, `npm test`, `npm run lint`, `npm run preview`.

## Conventions

- Identifiants et fichiers du code en anglais ; tout texte visible en français (glossaire ci-dessous).
- `src/domain/` contient la logique métier **pure** : ni React, ni Dexie, ni horloge implicite (« aujourd'hui » est un paramètre). Chaque règle de ce fichier y est implémentée et testée (`*.test.ts` à côté du code).
- `src/db/` : schéma Dexie, migrations, écriture des imports. `src/io/` : import et export (xlsx, csv, json). `src/features/<écran>/` : écrans. `src/ui/` : composants partagés. `src/lib/` : APIs du navigateur (wake lock, audio, vibration, stockage). `src/test/` : constructeurs de données et classeur d'exemple pour les tests.
- Dates calendaires en chaîne locale `YYYY-MM-DD` ; l'arithmétique de jours se fait sur ces dates, jamais sur des instants UTC. Instants en epoch ms. Identifiants : `crypto.randomUUID()`.
- Arrondis identiques au `ROUND` d'Excel (demi vers le haut) ; pourcentages stockés en entiers pour éviter les erreurs de flottants.
- Pas d'échappements Unicode (antislash, « u », 4 chiffres hexadécimaux) ni de caractères invisibles dans les sources : les outils d'écriture de fichiers les transforment en caractères littéraux. `\s` couvre déjà les espaces insécables et `\p{M}` les accents combinants.
- **Aucune perte de données** : tout changement de schéma ajoute une `db.version(n)` avec une fonction `upgrade` testée, sans jamais modifier une version déjà publiée. L'export JSON porte un numéro de version de format.
- Une séance enregistrée garde une **copie figée** de son modèle : éditer le programme ne change ni l'historique ni une séance en cours.
- Séance en cours : tout son état est écrit dans IndexedDB à chaque action, pour une reprise exacte après un appel ou une fermeture. Les minuteurs se calculent à partir d'horodatages (`startedAt`, `endsAt`), jamais en accumulant des ticks.
- Interface conçue à 375 px de large ; cibles tactiles d'au moins 44 px (56 px en mode séance) ; actions principales dans la moitié basse de l'écran ; thème sombre par défaut à fort contraste, lisible en plein soleil ; aucune saisie clavier obligatoire pendant une séance.

| Interface (fr) | Code (en) |
|---|---|
| Exercice · Élément · Composante | `Exercise` · `Element` · `Element.kind = 'component'` |
| Bloc · Type de séance · Modèle de séance | `BlockType` · `SessionType` · `SessionTemplate` |
| Ligne de prescription · Semaine type | `PrescriptionItem` · `Settings.weekPlan` |
| Jour de séquence J1…J7 · Matin / Soir | `seqDay` 1…7 · `'morning'` / `'evening'` |
| Semaine allégée · Élastique | `deload` · `Band` |
| Séance faite · Série faite · Propre / dégradée | `SessionLog` · `SetLog` · `'clean'` / `'degraded'` |
| Type de série : normale · échauffement · échec | `SetLog.kind` : `'normal'` · `'warmup'` · `'failure'` |
| Objectif · Test d'objectif | `Objective` · `ObjectiveTest` |

## Interface V2 (décidée et livrée le 17/10/2026)

Refonte de l'interface d'après la spec et les maquettes de l'utilisateur (16/10/2026), copiées dans `vault/v2/` (privé, hors dépôt). Les autres sections décrivent l'appli en ligne ; elles ont été mises à jour phase par phase.

Décidé avec l'utilisateur :

- 4 onglets : Aujourd'hui, Séance, Programmes, Progression. Hors de l'écran Séance, une barre de séance active (nom, chrono total, repos) rouvre la séance d'un toucher : changer d'onglet ne perd jamais la séance.
- Programme = la semaine J1-J7 actuelle (matin / soir, cycles, semaine allégée, jour de test, décalage de séquence). Un seul programme, pas de rotation A → B → C.
- Séance en tableau : une ligne par série (numéro ou type, précédent, valeur, ✓) ; le ✓ valide la série et lance le repos ; « + Ajouter une série » copie la dernière ligne.
- Alternance planche / FL (blocs Skill et Skill assisté) : **pas de repos entre la série planche et la série FL d'une paire**, comme un superset ; le repos vient après la paire. Partout ailleurs, supersets du matin compris : repos après chaque série, comme aujourd'hui. Détails : règles 3 et 8.
- Types de série : normale, échauffement (hors volume hebdo), échec (aller chercher l'échec total ; compte dans le volume). La qualité reste à part : dégradée = mouvement mal maîtrisé. Les records excluent les séries dégradées et d'échauffement.
- Plus de minuteur de hold : l'utilisateur ne s'en sert pas. Il filme ses séries avec le même téléphone et saisit la durée après coup.
- Quitter l'appli pour filmer ne doit jamais couper la séance : reprise exacte au retour (déjà le cas, à préserver). Les sons quand l'appli n'est pas à l'écran ne sont pas nécessaires.
- Pas de charge (kg) pour l'instant. Composantes : les 4 actuelles (poussée / tirage / gainage des maquettes étaient illustratifs).
- Pas de règle de passage ni de badge « Prêt à passer » : l'utilisateur gère seul ses progressions. **Pas d'échelles de progression** : la vue Skills montre les objectifs, les records par élastique et les courbes ; l'exercice se change parmi les candidats de la ligne (règle 4 inchangée).
- Objectifs gardés. Records : un par élastique, en plus du record sans élastique.
- Vue calendrier des jours d'entraînement, dans Progression › Historique (calendrier du mois, liste des séances, export).
- Séance express (20, 30 ou 45 min) : elle remplace la séance du jour, matin ou soir ; la fatigue de la veille n'entre pas en compte. Elle reprend les lignes planche / FL de la séance remplacée (donc son intensité), puis les composantes selon leur retard (minimum − séries faites − séries du soir encore prévues dans la semaine), puis le bonus jusqu'au maximum. Le reste, tranché en phase F (échauffement gardé, jamais de Skill assisté, ordre des retraits, semaine allégée, repos compté) : voir « Aujourd'hui et séance express ».
- Une série d'échauffement ne compte pas dans le volume ; une série assistée compte à part (totaux Skill et Skill assisté séparés, déjà le cas) ; un exercice nourrit une seule composante.
- Temps de travail par série propre à chaque exercice (décidé le 17/10/2026, phase D) : facultatif, le réglage général (30 s) sinon ; la durée estimée d'une ligne prend le plus court de ses exercices candidats pour la borne basse, le plus long pour la borne haute.

Choix sans l'utilisateur, à valider :

- Navigation : réglages derrière une roue crantée dans Programmes ; Progression en 3 vues : Skills, Volume (jauges, totaux skills, semaines passées), Historique.
- Tableau de séance : voir « Choix d'interface du mode séance » (phase C).
- Charte des maquettes (orange `#FF5114`, bleu `#2BABE8`, Bebas Neue et Heebo embarquées) ajustée pour le plein soleil : orange en aplat plutôt qu'en petit texte, gris éclaircis.

Phases (même méthode : tests, journal, commit, push, test sur téléphone) :

- 0 (livrée le 17/10/2026, v1.0.1) : « Envoyer une sauvegarde » corrigé ; l'utilisateur fait une vraie sauvegarde avant toute migration (faite le 17/10/2026).
- A (livrée le 17/10/2026, v1.1.0) : fondations : repos et sons de la séance au niveau de l'appli ([src/features/session/SessionRuntime.tsx](src/features/session/SessionRuntime.tsx) ; ils continuent hors de l'écran Séance), schéma Dexie v2 (type de série), sauvegarde et export ; repos de l'alternance planche / FL et durée estimée. Le type de série n'a pas encore de saisie : elle viendra avec le tableau (phase C).
- B (livrée le 17/10/2026, v1.2.0) : charte, polices, 4 onglets, barre de séance active, roue crantée, Historique avec le calendrier. Voir « Navigation et charte ».
- C (livrée le 17/10/2026, v1.3.0) : séance en tableau, sans minuteur de hold, avec le type de série. Voir « Choix d'interface du mode séance ».
- D (livrée le 17/10/2026, v1.4.0) : Programmes : semaine J1-J7, éditeur de modèle, bibliothèque d'exercices ; schéma Dexie v3 (modèle archivé, temps par série d'un exercice). Voir « Programmes (depuis la phase D) ».
- E (livrée le 17/10/2026, v1.5.0) : Progression : Skills (objectifs, records par élastique, courbes), Volume (jauges, totaux skills, semaines). Pas de changement de schéma. Voir « Progression (depuis la phase E) ».
- F (livrée le 17/10/2026, v1.6.0) : Aujourd'hui refondu et séance express ; schéma Dexie v4 (séance express). Voir « Aujourd'hui et séance express (depuis la phase F) ».

## Navigation et charte (depuis la phase B)

- **Onglets** ([src/ui/tabs.ts](src/ui/tabs.ts), [src/ui/TabBar.tsx](src/ui/TabBar.tsx)) :
  - Aujourd'hui `/` : détail dans « Aujourd'hui et séance express (depuis la phase F) ».
  - Séance `/session` : sans séance en cours, séance prévue, autre séance, dernière séance à revoir ou corriger. Avec une séance, `/session/:id` en plein écran, sans onglets ; le chevron « Réduire la séance » revient à l'écran précédent.
  - Programmes : vues Programmes `/programs` et Exercices `/programs?vue=exercices` (l'onglet rouvre la dernière vue) ; la roue crantée ouvre `/settings` (blocs, types de séance, éléments, élastiques, cycle, sauvegarde). Détail : « Programmes (depuis la phase D) ».
  - Progression : Skills `/objectives` (fiche d'un skill `/objectives/skill/:id`), Volume `/week` (`?semaine=N`), Historique `/journal`. Ces chemins restent ceux des anciens onglets ; l'onglet rouvre la dernière vue (préférence de l'appareil). Détail : « Progression (depuis la phase E) ».
- **Barre de séance active** ([src/features/session/ActiveSessionBar.tsx](src/features/session/ActiveSessionBar.tsx)), au-dessus des onglets dès qu'une séance est en cours, hors de l'écran Séance : nom, chrono total, série à faire, repos (« Libre » pour un repos libre). Un toucher rouvre la séance. Aujourd'hui n'affiche alors ni carte « Séance en cours » ni bouton « Reprendre ».
- **Lancer depuis l'onglet Séance** : la séance remplace l'écran dans l'historique, sinon « Réduire » ramènerait sur l'onglet, qui rouvrirait la séance en boucle.
- **Calendrier** (Historique › Séances, [src/domain/calendar.ts](src/domain/calendar.ts)) :
  - mois du lundi au dimanche, mois choisi dans l'adresse (`?mois=AAAA-MM`) ;
  - une pastille par séance à la couleur de son type, un anneau pour une séance abandonnée ;
  - toucher un jour ouvre sa séance, ou la liste s'il y en a plusieurs ;
  - il suit les filtres du journal ; les séances en cours n'y figurent pas.
- **Charte** ([src/index.css](src/index.css)) : maquettes de l'utilisateur ajustées au plein soleil.
  - Couleurs (jetons Tailwind) :
    - fond `page`, cartes `card` / `card-2`, bordures `line` ;
    - texte `ink` / `ink-2` / `ink-3` ;
    - `accent` orange pour les repères (onglet actif, étiquettes, badges, barre de séance) ;
    - `action` bleu pour l'action principale.
  - Puce sélectionnée en clair sur sombre (`bg-ink text-page`), neutre vis-à-vis des couleurs d'élastique.
  - Contrastes minimum mesurés :

    | Élément | Contraste |
    |---|---|
    | texte sur carte | 14:1 |
    | `ink-2` | 8,5:1 |
    | `ink-3` | 5,2:1 |
    | orange | 4,6:1 |
    | bouton bleu | 7,3:1 |

  - Polices embarquées (licence OFL, sous-ensemble latin, mises en cache pour le hors ligne) : Heebo variable pour le texte, Bebas Neue (capitales) pour les titres d'écran (`font-display`).
  - Angles plus nets (`rounded-2xl` = 10 px).
- Choix sans l'utilisateur, à valider à l'usage :
  - puces sélectionnées en clair ;
  - calendrier en tête de Historique › Séances, et qui suit les filtres ;
  - contenu de l'onglet Séance sans séance ;
  - barre d'état à la couleur du haut de l'écran.

## Programmes (depuis la phase D)

Onglet Programmes ([src/features/programs/](src/features/programs/)). Un seul programme : la semaine type J1-J7 (pas de rotation, décidé).

- **Adresses** :
  - `/programs` : programme actif ; `/programs?vue=exercices` : bibliothèque (`&nature=skills|composantes|autres`, `&element=…`) ;
  - `/programs/template/:id` : éditeur de modèle ; `/programs/week` : les 14 créneaux et le volume prévu ;
  - `/programs/exercise/:id` : fiche (celle de l'Historique, [src/features/journal/ExerciseDetail.tsx](src/features/journal/ExerciseDetail.tsx)) ; `/programs/exercise/:id/edit` et `/programs/exercise/new` : éditeur ;
  - les anciennes adresses `/settings/templates…`, `/settings/exercises…` et `/settings/week` redirigent.
- **Programme actif** : J1 à J7 en cartes ; aujourd'hui en orange (bordure, case du jour pleine, « auj. »).
  - Chaque séance : nom, moment, nombre de lignes, durée estimée, « ✓ faite » cette semaine.
  - Son ⋯ : modifier, changer la séance du créneau, renommer, type / moment / notes, dupliquer, archiver, supprimer.
  - Le ⋯ du programme mène aux créneaux et au cycle.
  - Puis « Nouveau modèle », « Autres modèles » (hors semaine type) et « Archivés ».
- **Glisser-déposer** ([src/ui/gestures.ts](src/ui/gestures.ts), `useVerticalDrag`) par la poignée ⠿, avec défilement près des bords ; toujours un équivalent dans un menu ⋯.
  - Une séance glissée sur un autre jour échange les séances de ce moment entre les deux jours (« Annuler » dans le message).
  - Une ligne glissée dans l'éditeur change de rang dans son bloc, d'après l'ordre affiché ; dans un bloc à alternance, les paires se reforment d'après le nouvel ordre (règle 3). Monter / Descendre dans le ⋯ de la ligne.
- **Éditeur de modèle** : blocs, paires et supersets comme le tableau de la séance (trait orange). Une carte par ligne de prescription : élément, exercices candidats (toucher : choisir), cellules Séries, Cible, RPE (ou « En réserve »), Repos, note.
  - Toucher une cellule ouvre ce seul champ dans une feuille (`ItemSheet`), avec « Toute la ligne » ; « Enregistrer » valide, fermer abandonne.
  - ⋯ ou appui long sur l'en-tête d'une ligne : modifier toute la ligne, dupliquer, monter, descendre, supprimer (« Annuler » dans le message).
  - « + Ligne en <bloc> » sous chaque bloc, « Ajouter une ligne » en bas.
  - Contrôles du programme dans un bandeau collé en haut de l'écran, détail au toucher. Ils couvrent aussi le modèle édité quand il est hors de la semaine type (`editorIssues`).
- **Archiver** un modèle le retire de la semaine type (avec confirmation s'il y est) ; il n'est plus proposé (créneaux, « Choisir une séance ») mais reste modifiable. Il se désarchive sans revenir dans la semaine type. Les séances faites gardent leur copie.
- **Bibliothèque** ([src/domain/library.ts](src/domain/library.ts)) : recherche (nom, autres noms, élément), puces Tous / Skills / Composantes / Autres, puis un élément ; exercices groupés par élément, désactivés à part.
- **Création d'un exercice en 2 niveaux** : nom, type de mesure, élément ; « Plus d'options » replié : temps par série, catégorie, rapide, actif, notes techniques, autres noms.
- Choix sans l'utilisateur, à valider à l'usage :
  - glisser une séance sur un autre jour = échange des deux jours ;
  - cellules à toucher plutôt qu'édition dans la carte ; repos d'une fourchette sur deux lignes (« 90 s / à 2 min ») ;
  - archiver retire de la semaine type, désarchiver ne l'y remet pas ;
  - la copie d'un modèle n'est pas placée dans la semaine type ;
  - les 14 créneaux et le volume prévu derrière ⋯ › Créneaux.

## Progression (depuis la phase E)

Onglet Progression : Skills ([src/features/objectives/](src/features/objectives/)), Volume ([src/features/week/VolumeScreen.tsx](src/features/week/VolumeScreen.tsx)), Historique. Pas d'échelle de progression ni de règle de passage (décidé).

- **Skills** (`/objectives`) :
  - prochain test des objectifs (`nextObjectiveTestDate`), ou « Jour de test » le jour même ;
  - une carte par skill (éléments de nature `skill`) : ses objectifs (meilleur test en grand, cible, statut, meilleure série en séance, jauge), puis les records par élastique de ses 2 premiers exercices ; toucher la carte ouvre la fiche du skill ;
  - « Autres objectifs » : ceux dont l'exercice lié n'est pas un skill, ou sans exercice ; « + Nouvel objectif » en bas.
- **Rattachement** ([src/domain/skills.ts](src/domain/skills.ts)) : un objectif appartient au skill de son exercice lié (`objectivesBySkill`). Exercices d'un skill (`skillRecords`) : ceux de l'élément, mesurés, avec au moins un record ; ceux des objectifs d'abord, puis les plus récemment faits.
- **Records par élastique** (`bandRecords`, [src/domain/objectives.ts](src/domain/objectives.ts)) : pour chaque élastique et sans élastique, la meilleure série non dégradée et hors échauffement (l'échec compte) ; à égalité, la première. Le record sans élastique reste celui des objectifs (`bestSessionPerformance`).
  - Affichage en paliers (`BandLadder`) : élastiques du plus assistant au moins assistant, puis « sans » (blanc) ; un élastique sans record reste pâle ; un exercice jamais fait avec élastique n'a que sa ligne « sans élastique ».
  - Visible sur la carte et la fiche du skill, la fiche d'un objectif (exercice lié) et la fiche exercice.
- **Fiche d'un skill** (`/objectives/skill/:id`) : objectifs ; courbes d'un exercice choisi par puces (`?exercice=`), une courbe par élastique, avec la cible de l'objectif lié en pointillés ; records de tous les exercices (toucher : fiche exercice).
- **Volume** (`/week`, `?semaine=N` pour une autre semaine) :
  - **Composantes** : une jauge en cases par composante, de 1 au maximum (plus si dépassé), zone cible (4 à 6) plus claire. Séries faites en plein, **séries encore prévues le soir** en pointillés (`remainingEveningSets` : séries min des lignes obligatoires des soirs obligatoires d'aujourd'hui et des jours suivants pas encore commencés, allégées en semaine allégée, plus le reste de la séance du soir en cours ; ni matins ni séances optionnelles). Détail soir / matin / encore prévues.
  - Couleur et libellé sur le **total** fait (spec de l'utilisateur, `rangeStatus`) : sous le min « à compléter » (gris), dans la fourchette « dans la cible » (orange), au-dessus « au-delà de la cible » (jaune). Semaine allégée : gris neutre, sans zone ni statut.
  - **Skills** : par skill puis par bloc (Skill, Skill assisté, Renfo spé), séries faites sur Σ min-max de la semaine type (`skillTotals`), jauge continue, même code ; semaine allégée : sur le max allégé.
  - **Séances de la semaine** : J1-J7, matin et soir, avec leur statut ; toucher : la séance faite, ou l'aperçu du modèle.
  - **Semaines** : tableau des 6 dernières semaines (séries faites par composante, fond orange dans la cible) ; toucher une semaine l'affiche.
- Choix sans l'utilisateur, à valider à l'usage :
  - le statut du volume réalisé suit le total (spec) et non plus la formule du tableur (« Sous le min (soir) » si le soir seul est sous le minimum) ; le prévu garde la formule du tableur ;
  - séries encore prévues = minimum des soirs obligatoires, en pointillés ;
  - records en paliers d'élastiques ; 2 exercices sur la carte d'un skill ;
  - la carte d'un skill s'ouvre en entier (pas de raccourci vers un objectif) ;
  - cible de l'objectif tracée sur la courbe de son exercice lié.

## Aujourd'hui et séance express (depuis la phase F)

Écran Aujourd'hui ([src/features/today/](src/features/today/)), d'après la maquette de l'utilisateur, de haut en bas :

- date, titre, jour de séquence, semaine et cycle (badge « Semaine allégée ») ; bandeau du jour de test.
- **Séance prévue** : la prochaine séance du jour à faire (`pendingPlanned`, le matin d'abord), durée estimée, exercices proposés par défaut (3 puces et « +N » ; toucher : contenu de la séance), « Démarrer ».
  - Faite : « ✓ faite » et « Revoir la séance ». Séance en cours : badge « en cours », pas de bouton (la barre la rouvre).
  - L'autre séance du jour en une ligne (« Aussi aujourd'hui ») : « Démarrer », « en cours », « ✓ faite » ou « masquée ».
  - Soir de repos : carte « Repos » et la prochaine séance (`nextPlanned`).
- **Séance express** : 20 / 30 / 45 min (durée gardée sur l'appareil) et « Générer » ; absente pendant une séance ; « Rien à remplacer » sans séance du jour à faire.
- **Volume de la semaine** : une jauge en cases par composante (`CellGauge`, séries encore prévues le soir en pointillés) et « 4/6 » (le total seul en semaine allégée) ; toucher : Progression › Volume.
- **Dernière séance** en une ligne : jour (« hier », « mercredi »), nom, durée, records battus (`recordsBeaten` : par exercice et par élastique, mieux que les séances d'avant) ; toucher : la séance.
- Rappels (sauvegarde, installation), puis « Autres options » (autre séance, passer au jour suivant, reporter à demain).

**Séance express** ([src/domain/express.ts](src/domain/express.ts), `componentNeeds` et `buildExpress`). Décidé avec l'utilisateur le 17/10/2026, sauf mention contraire :

- Elle remplace une séance du jour ni faite ni abandonnée, matin ou soir (au choix s'il y en a deux) ; sans séance à remplacer, pas de séance express. La fatigue de la veille ne compte pas.
- Rôle des blocs d'après leurs réglages, pas leur nom (choix sans l'utilisateur) : échauffement = bloc non réduit en semaine allégée ; Skill = premier bloc à alternance ; Skill assisté = blocs à alternance suivants ; Renfo spé = lignes planche / FL des autres blocs.
- Contenu, dans l'ordre :
  1. l'échauffement de la séance remplacée, au minimum de séries ;
  2. ses paires du Skill, dans l'ordre, au minimum de séries ;
  3. son Renfo spé, en entier, s'il rentre ;
  4. jamais le Skill assisté, même s'il reste du temps ;
  5. les composantes en retard (minimum − séries faites − séries du soir encore prévues, sans la séance remplacée), la plus en retard d'abord, série par série ; puis le bonus jusqu'au maximum.
- Quand ça ne tient pas : le Renfo spé est retiré d'abord, puis les dernières paires du Skill. La dernière paire qui rentre peut perdre des séries, au moins 2 ; la première paire est toujours là, à 2 séries s'il le faut (ces deux bornes : choix sans l'utilisateur).
- Semaine allégée : lignes reprises allégées ; minimum des composantes = séries min allégées des soirs obligatoires de la semaine type (`deloadEveningGuaranteed`, 2 par composante aujourd'hui) ; pas de bonus.
- Durée : la borne haute de l'estimation (repos maximum, exercice le plus long) tient dans la durée choisie, comme pour le contrôle des matins.
- Lignes : prescription de la séance remplacée (exercices, cible, intensité, repos), séries fixes (min = max). Une composante reprend la ligne de la séance remplacée, sinon celle d'un soir de la semaine type, sinon celle d'un matin, sans superset ni option (choix sans l'utilisateur).
- Aperçu avant de démarrer (feuille `ExpressSheet`) : séries par ligne (0 = retirée), durée estimée en direct (orange au-delà de la durée choisie), autre durée ou autre séance remplacée (régénère), ce qui n'est pas repris et pourquoi.
- Enregistrement : `SessionLog.expressMinutes` = la durée, `templateId` = la séance remplacée, `templateSnapshot` = la séance générée, nommée « Express 30 min · Combo » (type de la séance remplacée). Elle prend le type, la couleur et le créneau de la séance remplacée : le créneau compte comme fait. L'export du journal la signale (« Séance express (30 min) »).
- Choix sans l'utilisateur, à valider à l'usage :
  - « Démarrer » dans la carte, comme la maquette, et non plus en bas d'écran ;
  - séance remplacée par défaut : la séance prévue (le matin tant qu'il n'est pas fait) ;
  - au moins 2 séries pour une paire raccourcie, première paire toujours là ;
  - Technique léger : ses lignes planche / FL sont en Skill assisté, donc sa séance express n'a que l'échauffement et des composantes (règle 2 à confirmer pour ce cas) ;
  - les lignes « autres » hors échauffement (coiffe dynamique du J3 et du Matin B) ne sont pas reprises ;
  - une première fois sur un exercice ou un élastique n'est pas un record battu.

## Règles métier

### Séance

1. Les blocs suivent un ordre paramétrable, par défaut : Échauffement (connexion + élastique) → Skill → Skill assisté (élastique) → Renfo spé skill → Renfo composantes. Chaque ligne de prescription est une carte du tableau de la séance, avec une ligne par série.
2. Planche **et** touch FL sont travaillés à chaque séance du soir, jamais l'un sans l'autre. L'éditeur signale un modèle du soir auquel il manque l'un des deux, même hors de la semaine type.
3. Dans les blocs Skill **et Skill assisté** (décidé ; réglage par bloc `alternateSkills`), les séries planche et FL **alternent**, appariées par ordre : 1re ligne planche avec 1re ligne FL, 2e avec 2e (J1 : planche hold ↔ touch FL hold, puis P/N ↔ FL PU). Quand une ligne a fini ses séries, l'autre continue seule. L'appli propose la série suivante, l'utilisateur peut dévier. **Pas de repos entre les deux séries d'une paire**, comme un superset (décidé le 17/10/2026) : le repos vient à la fin du tour, le plus long des repos des lignes du tour. Une ligne qui continue seule se repose après chaque série ; refaire la même ligne avant l'autre (écart) donne aussi un repos (choix sans l'utilisateur).
4. L'exercice se choisit **le jour même** parmi les candidats de la ligne (puces). Par défaut : l'exercice fait la dernière fois sur cette ligne ; si un candidat a déjà été fait plus tôt dans la séance (cas « même combo qu'au bloc skill »), celui-là. L'exercice est enregistré par série, on peut en changer entre deux séries.
5. Une série de skill s'arrête dès que la protraction (grand dentelé) ou le verrouillage du coude lâche. Chaque série peut être marquée **propre** ou **dégradée**.
6. Progression : une seule variable à la fois (+1 s de hold, +1 rep, ou élastique plus fin). Chaque carte affiche la dernière performance sur l'exercice (valeurs, élastique, date) pour viser juste au-dessus.
7. Pas de minuteur de hold (retiré le 17/10/2026 : l'utilisateur filme ses séries avec le même téléphone et saisit la durée après coup).
8. Minuteur de repos : démarre à la validation d'une série avec le repos prescrit (sauf au milieu d'une paire planche / FL, règle 3). Pour une fourchette (« 90 s-2 min »), un premier signal au minimum et la fin au maximum ; « −15 s » / « +15 s » déplacent la fin, jamais avant le début. « Libre » : simple chronomètre. Ses sons et vibrations continuent hors de l'écran Séance, tant que l'appli est à l'écran.
9. L'écran reste allumé tant qu'une séance est en cours, quel que soit l'écran affiché (Wake Lock, ré-acquis au retour au premier plan ; « quel que soit l'écran » : choix sans l'utilisateur).

Choix d'interface du mode séance (tableau de la phase C, [src/domain/sessionTable.ts](src/domain/sessionTable.ts), [src/features/session/](src/features/session/)) ; choix sans l'utilisateur, à valider à l'usage :

- **Lignes** : autant que le **minimum** de séries de la ligne, puis « + Ajouter une série » (le maximum est indiqué, on peut le dépasser).
  - Une ligne est proposée jusqu'à ses séries prévues : le minimum, plus les lignes ajoutées.
  - « Terminer cet exercice » ou « Passer cet exercice » est dans les options (⋯ ou appui long sur l'en-tête).
- **Série proposée** : on reste dans l'unité en cours (paire planche / FL, superset) en prenant la ligne qui a le moins de séries, sinon la première unité inachevée.
  - Elle est surlignée (trait orange) et revient au milieu de l'écran après chaque validation.
  - Le gros bouton du bas « Valider la série N » la valide et rappelle ce qui sera enregistré.
  - ✓ valide n'importe quelle série ; ✓ d'une série faite la décoche : elle redevient à faire avec ses valeurs, et son repos s'arrête.
- **Exercice par défaut** : la dernière fois **dans le même bloc** parmi les candidats ; on en change dans les options de la ligne (règle 4).
  - « Dernière performance » : la dernière séance où l'exercice a été fait dans le même bloc (le skill sans élastique ne se compare pas au skill assisté), sinon dans un autre bloc, signalé.
  - La colonne « Précédent » montre sa série de même rang ; la toucher la recopie.
- **Pré-remplissage** :
  - 1re série à faire : la série précédente de la ligne (hors échauffement), sinon la 1re série de la dernière performance, sinon le bas de la cible ;
  - séries suivantes : recopie de la dernière série normale au-dessus ;
  - qualité « propre » par défaut sur un skill, rien ailleurs ; série normale.
- **Type de série** : toucher le numéro d'une série à faire fait défiler normale → échauffement (« E », pointillés) → échec (numéro sur fond rouge). Le choix existe aussi dans le pavé.
  - Une série d'échauffement s'ajoute sans prendre la place d'une série prévue, et ne compte pas dans l'avancement de la ligne.
- **Pavé de saisie** (toucher une valeur) : le premier chiffre remplace la valeur pré-remplie ; ⌫, C, −1 / +1 ; type, élastique, RPE, qualité, note.
  - Série à faire : « Valider la série » ou « Garder ces valeurs ».
  - Série faite : corriger, exercice compris, ou supprimer.
- **Gestes** : glisser une ligne à gauche révèle « Supprimer » (série faite, avec « Annuler ») ou « Retirer » (série à faire : une série prévue de moins). Appui long sur l'en-tête d'un exercice : ses options.
- **En-tête** : « Réduire » (chevron), nom, chrono total, exercices finis / total, « Terminer », ⋯ (son, accueil, abandon).
- **Repos** : en bas de l'écran, à la place du bouton de validation. Plus de feuille « Plan » ni de carte unique : le tableau montre toute la séance.
- **Abandon** : une séance sans série est supprimée ; sinon elle reste au journal, marquée abandonnée. Une seule séance en cours à la fois ; au lancement, l'appli rouvre la séance en cours.

### Types de séance (paramétrables)

| Type | Moment | Principe |
|---|---|---|
| Max | Soir | Skills isolés, intensité haute (RPE 8-9) ; jour de test des objectifs |
| Combo | Soir | Enchaînements (hold to press, PU to press, PU to touch, FL press), RPE 8 |
| Technique | Soir | Skills isolés à environ 70 %, focus qualité (RPE 6-7) |
| Technique léger | Soir | Optionnel, RPE ≤ 6, aucune fatigue résiduelle |
| Matin A (pousser) / Matin B (tirer) | Matin | 30 min maximum, exercices rapides, optionnels |
| Repos | — | — |

### Semaine type (après import)

| Jour | Matin | Soir |
|---|---|---|
| J1 | — | Max + renfo spé + rhomboïde + extension thoracique |
| J2 | — | Combo + grand dentelé + deltoïde ant |
| J3 | — | Technique + rhomboïde + extension thoracique |
| J4 | Matin A (renfo spé + grand dentelé + deltoïde ant) | Repos |
| J5 | — | Max + renfo spé |
| J6 | Matin B (renfo spé + rhomboïde + extension thoracique) | Combo + grand dentelé + deltoïde ant |
| J7 | — | Technique léger (optionnel) |

J2 et J6 (soir) sont identiques : un seul modèle partagé. J1 et J5 diffèrent (J1 a rhomboïde + extension thoracique) : deux modèles Max.

### Rotateurs externes (coiffe), ajoutés le 12/10/2026

Saisis par l'utilisateur dans Réglages, absents du tableur : **ne plus réimporter le tableur**, qui remplacerait les modèles et effacerait ces lignes. Décidé avec l'utilisateur sauf mention contraire.

- But : tenir la tête humérale centrée sous charge statique en planche. Force et endurance en position, pas d'hypertrophie. Le grand dentelé reste prioritaire ; la coiffe est un complément.
- Élément « Rotateurs externes », nature `other` : hors du contrôle 4-6 séries des composantes.
- Isométrie bras devant en fin d'échauffement des J1, J3 et J5 : 3 séries, 20-30 s, RPE ≤ 6, repos libre.
- Dynamique (descente en 3-4 s) en fin de renfo composantes du J3 (4 séries, 10-15 reps, 1-2 reps en réserve, repos 30 s) et du Matin B (même ligne, optionnelle, 2 reps en réserve car Combo le soir). Matin B plutôt que Matin A : le Matin A suit le J3 de 12 h et précède le Max J5 (choix sans l'utilisateur).
- Une ligne par exercice (choix sans l'utilisateur) : chaque série = droite puis gauche, la dernière à droite seule, pour le volume en plus à droite. Pas de suivi par côté : l'indicateur reste la planche, et si elle est propre.
- Arrêt de série si le corps tourne ou si l'épaule monte. Prone W et Prone Y forment un seul exercice. Progression : qualité, puis position du bras (coude au corps → 90° → bras devant), puis durée ou reps, l'élastique en dernier.

### Calendrier et cycle

- J1…J7 sont des **jours de séquence**, pas des jours de la semaine. Réglage : une date de début, qui est un J1 ; son jour de la semaine donne « J1 = lundi ». Jour de séquence = (jours écoulés depuis le début mod 7) + 1 ; semaine = ⌊jours écoulés / 7⌋ + 1.
- Date de début actuelle : **lundi 05/10/2026, J1 = lundi** (décidé ; déduit du Journal : semaine 1, J3, le mercredi 07/10).
- Numéro de semaine **absolu**, qui continue d'un cycle à l'autre (1, 2… 5, 6…) ; c'est lui qui va dans la colonne « Semaine » du Journal (décidé). La semaine du cycle s'affiche à part (« cycle 2 · S1/4 »).
- On peut toujours choisir une autre séance pour aujourd'hui (choix ponctuel) ou **décaler la séquence** d'un jour : « Passer au jour suivant » ou « Reporter à demain ». Le décalage déplace la date de début, donc aussi les limites de semaine.
- Cycles de 4 semaines (paramètre) qui s'enchaînent : S1 à S3 en progression, S4 allégée (numéro paramétrable).
- Test des objectifs en début de semaine 5 (S1 des cycles suivants), le premier jour de type Max de la semaine ; l'appli le rappelle.

### Semaine allégée

- Séries du soir × (1 − 40 %) (paramètre), arrondies (`ROUND` Excel), appliqué au **min et au max** de chaque ligne, jamais sous 1 série (décidé). Exemples : 4-5 → 2-3, 2 → 1.
- **L'échauffement n'est pas réduit** (décidé ; réglage par bloc `reducedInDeload`).
- Intensité inchangée. Séances du matin masquées (paramètre).
- Les totaux « allégée » affichés sont la somme réelle des séances allégées (décidé). Le tableur, lui, arrondit le total hebdo et compte les matins : planche skill 23 dans le tableur, 22 dans l'appli ; renfo spé planche 7 contre 4.

### Volume des composantes

- Composantes (liste éditable) : grand dentelé, rhomboïde, deltoïde antérieur, extension thoracique.
- Bornes paramétrables : 4 à 6 séries par composante et par semaine.
- Le **soir garantit le minimum** à lui seul ; le **matin est un bonus** jusqu'au maximum ; sauter un matin ne fait jamais passer sous le minimum.
- Prévu : somme sur la semaine type des séries des lignes dont l'élément est la composante, quel que soit le bloc, séparée soir / matin.
  - **Minimum garanti** (décidé) = Σ séries **min** des lignes obligatoires des séances du soir obligatoires.
  - **Contrôle du maximum** = Σ séries **max** de toutes les lignes, soir + matin, optionnelles comprises.
  - Le tableur additionne la colonne Séries max et filtre sur le bloc « Renfo composantes » : même résultat avec le programme actuel.
- Statut (formule du tableur) : minimum garanti < min → « Sous le min (soir) » ; sinon total > max → « Au-dessus du max » ; sinon « OK ». En semaine allégée, afficher « Semaine allégée » au lieu de ce statut.
- Réalisé (semaine en cours) : nombre de `SetLog` de la semaine sur la composante, hors séries d'échauffement, soir / matin / total. Même règle pour les séries de skill réalisées. Depuis la phase E, la jauge du réalisé se colore sur le total (sous le min, dans la fourchette, au-dessus ; spec de l'utilisateur, à valider) ; la formule du tableur ne sert plus qu'au prévu.
- Contrôle à l'édition : toute modification du programme recalcule le volume et signale aussitôt une composante hors bornes.
- Totaux par skill (Planche, Touch FL) et par bloc (Skill, Skill assisté, Renfo spé skill) : Σ séries min, Σ séries max, nombre de séances (jours de séquence distincts, matin et soir confondus, lignes optionnelles comprises), max en semaine allégée.

### Matins

- Durée maximum 30 min (paramètre). Durée estimée = Σ séries × (temps de travail par série + repos prescrit), sauf dans une alternance planche / FL : un seul repos par tour, le plus long des lignes du tour. Temps de travail d'une série : celui de l'exercice (`Exercise.workSecPerSet`), sinon le réglage général (30 s par défaut) ; parmi les candidats actifs d'une ligne, le plus court pour la borne basse, le plus long pour la borne haute (décidé). Affichée en fourchette (séries, repos et temps min → max), avec 30 s pour un repos « Libre » par défaut. Alerte si la borne haute d'un modèle du matin dépasse la durée maximum. Matin A et Matin B : 17 à 25 min.
- Exercices « rapides » (sans barre, peu d'installation) mis en avant le matin (badge, en tête de liste) mais pas filtrés : les candidats renfo spé des matins ne sont pas marqués rapides dans le catalogue.
- Composantes du matin en superset (deux composantes alternées), 60-90 s de repos entre deux séries.

### Objectifs

- Nom, critère de qualité, cible, unité, exercice lié (optionnel), historique de tests {date, valeur, note}.
- Statut sur le **meilleur** test (décidé ; le tableur utilise le dernier) : aucun test → « À tester » ; meilleur test ≥ cible → « Atteint » ; sinon « En cours ». Écart = cible − meilleur test.
- L'exercice lié sert à afficher la meilleure performance en séance : séries **sans élastique**, **non dégradées** (décidé) et hors échauffement (décidé le 17/10/2026). Les séries importées du tableur, sans qualité notée, comptent. Les records avec élastique de l'exercice lié s'affichent à côté (phase E).

| Objectif | Critère de qualité | Cible | Exercice lié |
|---|---|---|---|
| Planche hold | Bonne activation du grand dentelé | 10 s | Planche Hold |
| Planche press to négative (P/N) | Activation du grand dentelé + bras tendus verrouillés | 1 rep | P/N |
| Touch front lever hold one leg | Forme acceptable, bassin au minimum neutre | 15 s | Touch FL hold one leg |
| Touch front lever hold full | Forme acceptable, bassin au minimum neutre | 5 s | Touch FL hold full |

### Élastiques

- Liste éditable, ordonnée du plus assistant au moins assistant : **orange → jaune → vert → bleue → sans élastique** (décidé ; du plus lourd au plus léger).
- L'élastique sert aussi de résistance (CARs, rétraction, Zanetti fly). Il est noté par série dans tous les cas, mais la progression vers « sans élastique » ne concerne que l'assistance.

### Journal

- Une `SetLog` par série. Le nombre de séries faites **se déduit** des `SetLog` et n'est jamais saisi (le tableur contient « 3 séries » avec 4 valeurs, ce qui doit être impossible dans l'appli).
- Fiche exercice : courbe de la meilleure valeur par séance, une courbe par élastique (« sans élastique » en blanc), séries dégradées et d'échauffement exclues ; record = meilleure série sans élastique, non dégradée et hors échauffement (comme pour les objectifs), plus un record par élastique (phase E). Choix d'affichage de la phase 3.
- Export .xlsx et .csv avec exactement les colonnes de l'onglet Journal : Date, Semaine, Jour, Moment, Type séance, Bloc, Exercice, Séries faites, Reps / durée (« v1 ; v2 ; … »), Élastique, RPE, Ressenti / notes. Une ligne par (séance, bloc, exercice). Jour au format « J3 ». RPE : une valeur si toutes les séries ont la même, sinon « 6 ; 7 ; 8 ». Les séries dégradées, d'échauffement et à l'échec sont signalées dans les notes par leur numéro ; elles restent dans « Séries faites » et « Reps / durée » (choix sans l'utilisateur pour l'échauffement et l'échec).

## Modèle de données (Dexie)

Types complets : [src/domain/types.ts](src/domain/types.ts). Schéma et versions : [src/db/db.ts](src/db/db.ts).

```ts
Element          { id, name, kind: 'skill' | 'component' | 'other', order }
BlockType        { id, name, order, alternateSkills, reducedInDeload }
SessionType      { id, name, moment, description, color, isTestDay }
Exercise         { id, name, category, elementId, measure: 'reps' | 'seconds' | 'combos' | 'none',
                   quick, active, notes, aliases, order, workSecPerSet /* null : réglage général */ }
Band             { id, name, color, order /* 0 = le plus assistant */, active }
SessionTemplate  { id, name, sessionTypeId, moment, optional, notes, items: PrescriptionItem[], archived }
PrescriptionItem { id, blockTypeId, elementId, candidateExerciseIds, candidatesText, setsMin, setsMax,
                   targetText, targets: { unit, min, max }[], intensityText, intensity: { kind: 'rpe' | 'rir', min, max },
                   restText, restMinSec, restMaxSec, superset, optional, notes }
Settings         { cycleStartDate, cycleLengthWeeks, deloadWeek, deloadReductionPct, hideMorningsInDeload,
                   volumeMin, volumeMax, morningMaxMinutes, avgWorkSecPerSet, freeRestSec, lastBackupAt,
                   weekPlan: { 1…7: { morning: templateId | null, evening: templateId | null } } }
SessionLog       { id, date, week, cycleWeek, seqDay, moment, templateId, templateSnapshot, sessionTypeId,
                   sessionTypeName, deload, status: 'in_progress' | 'done' | 'abandoned', startedAt, endedAt,
                   note, source: 'app' | 'xlsx', resume, expressMinutes /* null : séance d'un modèle */ }
SetLog           { id, sessionId, itemId, blockTypeId, elementId, exerciseId, setIndex, value, bandId, rpe,
                   quality: 'clean' | 'degraded' | null, kind: 'normal' | 'warmup' | 'failure', note, createdAt }
Objective        { id, name, criterion, target, unit, exerciseId, order, tests: { id, date, value, note }[] }
```

- Versions du schéma : 1 (07/10/2026) ; 2 (17/10/2026) ajoute `SetLog.kind`, les séries existantes deviennent `normal` ; 3 (17/10/2026) ajoute `SessionTemplate.archived` (`false`, copies figées des séances comprises) et `Exercise.workSecPerSet` (`null`) ; 4 (17/10/2026) ajoute `SessionLog.expressMinutes` (`null` sur les séances existantes).
- Dans `weekPlan`, `null` signifie « rien » : Repos le soir, pas de séance le matin.
- `SessionLog.resume` contient l'état d'interface de la séance en cours :
  - ligne où l'on vient d'agir, exercice choisi par ligne, lignes terminées ;
  - séries à faire modifiées (`pendingDrafts`, par ligne et par rang), lignes ajoutées ou retirées (`extraRows`) ;
  - repos.

  Une séance commencée avant le tableau garde son brouillon comme première série à faire (`readResume`).
- `PrescriptionItem.superset` : des lignes consécutives du même bloc marquées superset alternent série par série.

## Import du tableur

Des fonctions pures ([src/io/xlsx/](src/io/xlsx/)) transforment le fichier en données et en rapport d'import ; elles sont testées sur le vrai fichier, puis le résultat est écrit dans Dexie. Un ré-import garde les identifiants existants (rapprochement par nom) et ne crée pas de doublon.

- **Exercices** (35 lignes) : catégorie → élément (« Planche skill » et « Planche renfo spé » → Planche, « Touch FL skill » et « Touch FL renfo spé » → Touch FL, chaque composante → elle-même, « Connexion » → Connexion). « Rapide (matin) » → `quick`. Type de mesure déduit du nom : secondes pour les hold ; combos pour Planche Hold to press, Planche PU to press, PU to touch full / one leg et FL press ; reps pour le reste. Espaces normalisés (« PU to touch  one leg »).
- **Programme** (69 lignes) : groupes (Jour, Moment) triés par Ordre ; groupes identiques dédoublonnés ; ligne « Repos » (J4 soir) → créneau vide. Parsing de « Reps / durée » (« 8-12 s ou 3-5 reps » → deux cibles), de « RPE / marge » (« RPE ≤ 5 », « RPE 8-9 », « 1-2 reps en réserve ») et de « Repos » (« Libre » → pas de décompte, « 90 s-2 min » → 90-120 s, « Superset, 60-90 s » → superset de 60-90 s). « Optionnel » Oui/Non par ligne ; séances optionnelles : Matin A, Matin B, Technique léger.
- **Candidats** : le texte libre de « Exercices au choix » est résolu vers le catalogue. Séparateurs « , » et « ou » ; alternatives « (full / one leg) » ; parenthèses sans chiffre = mots optionnels (« (to touch) ») ; cibles entre parenthèses ignorées ; « à l'élastique » ignoré ; synonymes élastique / elastic, mur / wall, légère / léger. Règles : « Au choix (skill planche) » → catégorie Planche skill ; « Au choix (skill FL) » → Touch FL skill ; « 2 exercices de connexion au choix » → catégorie Connexion ; « Même combo qu'au bloc skill » → candidats de la ligne Skill du même élément ; « Au choix » de l'activation élastique → exercice générique « Activation élastique » (mesure `none`). Les rapprochements approximatifs (« Planche hold court » → Planche Hold, « uppercut élastique » → Uppercut, « adv tuck planche sol » → Adv tuck planche hold sol) et les textes non résolus figurent dans le rapport.
- **Objectifs** (4 lignes) : si « Dernier test » et « Date du test » sont remplis, ils deviennent un test de l'historique.
- **Journal** : une séance par (Date, Moment). « Jour » « J3 » ou 3 → 3 ; « Matin A — pousser » → Matin A. « Reps / durée » est découpé sur « ; » (espacement variable : « 15 ;15 ») en une `SetLog` par valeur ; « - » ou vide → autant de séries sans valeur que « Séries faites ». Si « Séries faites » diffère du nombre de valeurs, les valeurs font foi et le rapport le signale. RPE de la ligne → chaque série ; note → dernière série ; élastique inconnu → créé. Noms rapprochés du catalogue (« Touch FL hold / one leg » et « Touch FL one leg » → Touch FL hold one leg, en secondes ; « activation elastic » → Activation élastique).
- Contenu actuel du Journal : une séance (07/10/2026, semaine 1, J3 soir, Technique), 11 lignes, 29 séries, dont 2 lignes incohérentes (3 séries déclarées, 4 valeurs).

### Valeurs de contrôle (tests d'acceptation)

- Chaque composante : soir 4, matin 2, total 6, « OK », 2 en semaine allégée. Retirer une série du soir → « Sous le min (soir) ».
- Totaux skills (min / max / nombre de séances / allégée appli) : Skill planche 28 / 38 / 5 / 22 ; Skill FL 28 / 34 / 5 / 20 ; Skill assisté planche 13 / 18 / 6 / 12 ; Skill assisté FL 13 / 18 / 6 / 12 ; Renfo spé planche 8 / 12 / 4 / 4 ; Renfo spé FL 8 / 12 / 4 / 4.
- Le test d'import relit les valeurs attendues dans les cellules de l'onglet Volume hebdo ; le rapport d'import affiché dans l'appli fait la même comparaison.

## Sauvegarde et exports

- Sauvegarde JSON complète ([src/io/json/backup.ts](src/io/json/backup.ts)) : toutes les tables, `formatVersion` et `dbVersion`. Une sauvegarde d'une version plus récente est refusée. Tout changement du format incrémente `BACKUP_FORMAT_VERSION` et ajoute une étape testée dans `migrate` (format 2 : `kind` sur chaque série, `normal` pour une sauvegarde de format 1 ; format 3 : `archived` sur les modèles et leurs copies figées, `workSecPerSet` sur les exercices ; format 4 : `expressMinutes` sur les séances, `null` avant). La restauration remplace toutes les données en une transaction ; elle est proposée dès l'écran d'accueil (changement de téléphone).
- Rappel de sauvegarde sur Aujourd'hui : dernière sauvegarde de plus de 7 jours, ou aucune alors qu'au moins une séance a été faite dans l'appli. Sur Android, « Envoyer une sauvegarde » ouvre le menu de partage (Drive, e-mail). Le fichier envoyé est en `.txt` (`text/plain`) : Chrome ne partage qu'une liste fermée de types, sans le JSON, et `navigator.canShare` ne vérifie pas le type. La restauration accepte `.json` et `.txt`. Une annulation ne dit rien ; un refus s'affiche avec « Enregistrer » (téléchargement) à la place.
- Export du journal ([src/io/journal/exportJournal.ts](src/io/journal/exportJournal.ts)) : .xlsx (onglet « Journal », vraies dates Excel) et .csv pour Excel en français (« ; », CRLF, marque UTF-8). Les notes de ligne reprennent « Séance express (N min) », « Séance abandonnée » et la note de séance (1re ligne), les notes de série et les numéros des séries dégradées.
- Version affichée dans Réglages → Sauvegarde et données → Appli : `version` du package.json et date du build.
- `vite-plugin-pwa` reste en 1.3 (la 2.0, sortie le 03/10/2026, était trop récente). Mise à jour proposée par un message, jamais imposée.

## Hors périmètre de la v1

- Synchronisation cloud, comptes, applications natives, coaching automatique ou IA, multi-utilisateur.
- **Idée pour plus tard, à ne pas implémenter** : avertir si une composante « pousser » (grand dentelé, deltoïde antérieur) est programmée dans les 24 h avant une séance Max.

## Déploiement

- Dépôt public `bobrond/streeter`, publié sur GitHub Pages par GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) à chaque push sur `main` : https://bobrond.github.io/streeter/.
- Les données IndexedDB sont liées à l'adresse du site : une fois de vraies séances saisies, l'URL ne doit plus changer (sinon il faut passer par un export puis un import JSON).
- Le dépôt est public : jamais de tableur (`*.xlsx`) ni de contenu du journal dans le dépôt. Le test d'import sur le vrai fichier est sauté quand le fichier est absent (CI).
- Identité git du dépôt : `bobrond` / `128741354+bobrond@users.noreply.github.com`.
