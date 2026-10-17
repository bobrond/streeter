# Streeter

PWA personnelle de programmation et de suivi d'entraînement street workout : un seul utilisateur, hors ligne, sans backend. Objectifs actuels : **planche** et **touch front lever** (FL). Elle remplace un tableur Excel et doit rester aussi paramétrable que lui, avec une interface pour téléphone utilisable d'une main entre deux séries, dehors, sans réseau.

- Cahier des charges complet : [docs/cahier_des_charges.md](docs/cahier_des_charges.md).
- **Source de vérité** pour les données de départ et la logique : `docs/programme_planche_touch_fl_1.xlsx` (le cahier des charges le nomme sans `_1`). Onglets : Lisez-moi, Programme, Volume hebdo, Journal, Objectifs, Exercices. Le fichier est exclu du dépôt (`.gitignore`) : il n'existe qu'en local. Depuis le 12/10/2026, le programme de l'appli s'en écarte (voir « Rotateurs externes » plus bas).
- **En cas de doute sur une règle d'entraînement, demander à l'utilisateur au lieu de supposer.** Les règles ci-dessous marquées « décidé » ont été tranchées avec lui le 07/10/2026 et priment sur le tableur.

## Méthode de travail

- Phases livrables et testables sur téléphone : 0 socle, import, calculs testés, mise en ligne → 1 Aujourd'hui et mode séance, hors ligne, export JSON de secours → 2 édition complète dans Réglages → 3 Semaine, Journal, Objectifs → 4 sauvegarde complète, exports, finitions PWA. Refonte de l'interface en cours : phases 0 et A à F, voir « Interface V2 ».
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

## Interface V2 (décidée le 17/10/2026, en cours)

Refonte de l'interface d'après la spec et les maquettes de l'utilisateur (16/10/2026), copiées dans `vault/v2/` (privé, hors dépôt). Tant qu'une phase n'est pas livrée, les autres sections décrivent l'appli en ligne ; elles sont mises à jour phase par phase.

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
- Séance express (20, 30 ou 45 min) : elle remplace la séance du jour, matin ou soir ; la fatigue de la veille n'entre pas en compte. Elle reprend les lignes planche / FL de la séance remplacée (donc son intensité), puis les composantes selon leur retard (minimum − séries faites − séries du soir encore prévues dans la semaine), puis le bonus jusqu'au maximum.
- Une série d'échauffement ne compte pas dans le volume ; une série assistée compte à part (totaux Skill et Skill assisté séparés, déjà le cas) ; un exercice nourrit une seule composante.

Choix sans l'utilisateur, à valider :

- Navigation : réglages derrière une roue crantée dans Programmes ; Progression en 3 vues : Skills, Volume (jauges, totaux skills, semaines passées), Historique.
- Tableau : lignes de 56 px ; toucher une valeur ouvre un pavé en bas (valeur, élastique, RPE, qualité, note) ; un bouton « Valider » reste en bas pour la série proposée ; autant de lignes que le min de séries, puis « + Ajouter une série » jusqu'au max ; décocher une ligne annule la série.
- Charte des maquettes (orange `#FF5114`, bleu `#2BABE8`, Bebas Neue et Heebo embarquées) ajustée pour le plein soleil : orange en aplat plutôt qu'en petit texte, gris éclaircis.

Phases (même méthode : tests, journal, commit, push, test sur téléphone) :

- 0 (livrée le 17/10/2026, v1.0.1) : « Envoyer une sauvegarde » corrigé ; l'utilisateur fait une vraie sauvegarde avant toute migration (faite le 17/10/2026).
- A (livrée le 17/10/2026, v1.1.0) : fondations : repos et sons de la séance au niveau de l'appli ([src/features/session/SessionRuntime.tsx](src/features/session/SessionRuntime.tsx) ; ils continuent hors de l'écran Séance), schéma Dexie v2 (type de série), sauvegarde et export ; repos de l'alternance planche / FL et durée estimée. Le type de série n'a pas encore de saisie : elle viendra avec le tableau (phase C).
- B (livrée le 17/10/2026, v1.2.0) : charte, polices, 4 onglets, barre de séance active, roue crantée, Historique avec le calendrier. Voir « Navigation et charte ».
- C : séance en tableau, sans minuteur de hold.
- D : Programmes : semaine J1-J7, éditeur de modèle, bibliothèque d'exercices.
- E : Progression : Skills (objectifs, records par élastique), Volume.
- F : Aujourd'hui refondu et séance express.

## Navigation et charte (depuis la phase B)

- **Onglets** ([src/ui/tabs.ts](src/ui/tabs.ts), [src/ui/TabBar.tsx](src/ui/TabBar.tsx)) :
  - Aujourd'hui `/`.
  - Séance `/session` : sans séance en cours, séance prévue, autre séance, dernière séance à revoir ou corriger. Avec une séance, `/session/:id` en plein écran, sans onglets ; le chevron « Réduire la séance » revient à l'écran précédent.
  - Programmes `/programs` : semaine type J1-J7, modèles, exercices ; la roue crantée ouvre `/settings` (blocs, types de séance, éléments, élastiques, cycle, sauvegarde).
  - Progression : Skills `/objectives`, Volume `/week`, Historique `/journal`. Ces chemins restent ceux des anciens onglets ; l'onglet rouvre la dernière vue (préférence de l'appareil).
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
  - écran Programmes provisoire (refonte en phase D) ;
  - barre d'état à la couleur du haut de l'écran.

## Règles métier

### Séance

1. Les blocs suivent un ordre paramétrable, par défaut : Échauffement (connexion + élastique) → Skill → Skill assisté (élastique) → Renfo spé skill → Renfo composantes. Chaque ligne de prescription est une carte.
2. Planche **et** touch FL sont travaillés à chaque séance du soir, jamais l'un sans l'autre. L'éditeur signale un modèle du soir auquel il manque l'un des deux.
3. Dans les blocs Skill **et Skill assisté** (décidé ; réglage par bloc `alternateSkills`), les séries planche et FL **alternent**, appariées par ordre : 1re ligne planche avec 1re ligne FL, 2e avec 2e (J1 : planche hold ↔ touch FL hold, puis P/N ↔ FL PU). Quand une ligne a fini ses séries, l'autre continue seule. L'appli propose la série suivante, l'utilisateur peut dévier. **Pas de repos entre les deux séries d'une paire**, comme un superset (décidé le 17/10/2026) : le repos vient à la fin du tour, le plus long des repos des lignes du tour. Une ligne qui continue seule se repose après chaque série ; refaire la même ligne avant l'autre (écart) donne aussi un repos (choix sans l'utilisateur).
4. L'exercice se choisit **le jour même** parmi les candidats de la ligne (puces). Par défaut : l'exercice fait la dernière fois sur cette ligne ; si un candidat a déjà été fait plus tôt dans la séance (cas « même combo qu'au bloc skill »), celui-là. L'exercice est enregistré par série, on peut en changer entre deux séries.
5. Une série de skill s'arrête dès que la protraction (grand dentelé) ou le verrouillage du coude lâche. Chaque série peut être marquée **propre** ou **dégradée**.
6. Progression : une seule variable à la fois (+1 s de hold, +1 rep, ou élastique plus fin). Chaque carte affiche la dernière performance sur l'exercice (valeurs, élastique, date) pour viser juste au-dessus.
7. Minuteur de hold (**retiré en V2**, phase C : l'utilisateur ne s'en sert pas) : décompte de 3 s, puis comptage avec un bip à chaque seconde et un bip distinct quand la cible est atteinte (on ne regarde pas l'écran en planche), plus vibration. Arrêt en touchant n'importe où ; la valeur est reportée dans la série et reste ajustable au +/−.
8. Minuteur de repos : démarre à la validation d'une série avec le repos prescrit (sauf au milieu d'une paire planche / FL, règle 3). Pour une fourchette (« 90 s-2 min »), un premier signal au minimum et la fin au maximum. « Libre » : simple chronomètre. Ses sons et vibrations continuent hors de l'écran Séance, tant que l'appli est à l'écran.
9. L'écran reste allumé tant qu'une séance est en cours, quel que soit l'écran affiché (Wake Lock, ré-acquis au retour au premier plan ; « quel que soit l'écran » : choix sans l'utilisateur).

Choix d'interface du mode séance (phase 1, [src/domain/session.ts](src/domain/session.ts)) :

- Série proposée : on reste dans l'unité en cours (paire planche / FL, superset) en prenant la ligne qui a le moins de séries, sinon la première unité inachevée. Une ligne est proposée jusqu'à ses séries **max** ; « Terminer cet exercice » la clôt dès le min (ou avant).
- Exercice par défaut : la dernière fois **dans le même bloc** parmi les candidats ; « dernière performance » : la dernière séance où l'exercice a été fait dans le même bloc (le skill sans élastique ne se compare pas au skill assisté), sinon dans un autre bloc, signalé.
- Saisie pré-remplie : série précédente de la ligne, sinon 1re série de la dernière performance, sinon bas de la cible ; qualité « propre » par défaut sur un skill, rien ailleurs. Le bip distinct du hold sonne à la valeur saisie (sinon au bas de la cible).
- Après validation : repos prescrit lancé, carte suivante affichée, « Annuler la série » dans le bandeau de repos. Au milieu d'une paire planche / FL : pas de repos, la carte de l'autre skill s'affiche et un message « Série enregistrée » propose « Annuler ».
- Abandon : une séance sans série est supprimée ; sinon elle reste au journal, marquée abandonnée. Une seule séance en cours à la fois ; au lancement, l'appli rouvre la séance en cours.

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
- Réalisé (semaine en cours) : nombre de `SetLog` de la semaine sur la composante, hors séries d'échauffement, soir / matin / total, avec le même statut. Même règle pour les séries de skill réalisées.
- Contrôle à l'édition : toute modification du programme recalcule le volume et signale aussitôt une composante hors bornes.
- Totaux par skill (Planche, Touch FL) et par bloc (Skill, Skill assisté, Renfo spé skill) : Σ séries min, Σ séries max, nombre de séances (jours de séquence distincts, matin et soir confondus, lignes optionnelles comprises), max en semaine allégée.

### Matins

- Durée maximum 30 min (paramètre). Durée estimée = Σ séries × (temps de travail moyen par série + repos prescrit), sauf dans une alternance planche / FL : un seul repos par tour, le plus long des lignes du tour. Affichée en fourchette (séries et repos min → séries et repos max), avec 30 s de travail par série et 30 s pour un repos « Libre » par défaut. Alerte si la borne haute d'un modèle du matin dépasse la durée maximum. Matin A et Matin B : 17 à 25 min.
- Exercices « rapides » (sans barre, peu d'installation) mis en avant le matin (badge, en tête de liste) mais pas filtrés : les candidats renfo spé des matins ne sont pas marqués rapides dans le catalogue.
- Composantes du matin en superset (deux composantes alternées), 60-90 s de repos entre deux séries.

### Objectifs

- Nom, critère de qualité, cible, unité, exercice lié (optionnel), historique de tests {date, valeur, note}.
- Statut sur le **meilleur** test (décidé ; le tableur utilise le dernier) : aucun test → « À tester » ; meilleur test ≥ cible → « Atteint » ; sinon « En cours ». Écart = cible − meilleur test.
- L'exercice lié sert à afficher la meilleure performance en séance : séries **sans élastique**, **non dégradées** (décidé) et hors échauffement (décidé le 17/10/2026). Les séries importées du tableur, sans qualité notée, comptent.

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
- Fiche exercice : courbe de la meilleure valeur par séance, une courbe par élastique (« sans élastique » en blanc), séries dégradées et d'échauffement exclues ; record = meilleure série sans élastique, non dégradée et hors échauffement (comme pour les objectifs). Choix d'affichage de la phase 3.
- Export .xlsx et .csv avec exactement les colonnes de l'onglet Journal : Date, Semaine, Jour, Moment, Type séance, Bloc, Exercice, Séries faites, Reps / durée (« v1 ; v2 ; … »), Élastique, RPE, Ressenti / notes. Une ligne par (séance, bloc, exercice). Jour au format « J3 ». RPE : une valeur si toutes les séries ont la même, sinon « 6 ; 7 ; 8 ». Les séries dégradées, d'échauffement et à l'échec sont signalées dans les notes par leur numéro ; elles restent dans « Séries faites » et « Reps / durée » (choix sans l'utilisateur pour l'échauffement et l'échec).

## Modèle de données (Dexie)

Types complets : [src/domain/types.ts](src/domain/types.ts). Schéma et versions : [src/db/db.ts](src/db/db.ts).

```ts
Element          { id, name, kind: 'skill' | 'component' | 'other', order }
BlockType        { id, name, order, alternateSkills, reducedInDeload }
SessionType      { id, name, moment, description, color, isTestDay }
Exercise         { id, name, category, elementId, measure: 'reps' | 'seconds' | 'combos' | 'none',
                   quick, active, notes, aliases, order }
Band             { id, name, color, order /* 0 = le plus assistant */, active }
SessionTemplate  { id, name, sessionTypeId, moment, optional, notes, items: PrescriptionItem[] }
PrescriptionItem { id, blockTypeId, elementId, candidateExerciseIds, candidatesText, setsMin, setsMax,
                   targetText, targets: { unit, min, max }[], intensityText, intensity: { kind: 'rpe' | 'rir', min, max },
                   restText, restMinSec, restMaxSec, superset, optional, notes }
Settings         { cycleStartDate, cycleLengthWeeks, deloadWeek, deloadReductionPct, hideMorningsInDeload,
                   volumeMin, volumeMax, morningMaxMinutes, avgWorkSecPerSet, freeRestSec, lastBackupAt,
                   weekPlan: { 1…7: { morning: templateId | null, evening: templateId | null } } }
SessionLog       { id, date, week, cycleWeek, seqDay, moment, templateId, templateSnapshot, sessionTypeId,
                   sessionTypeName, deload, status: 'in_progress' | 'done' | 'abandoned', startedAt, endedAt,
                   note, source: 'app' | 'xlsx', resume }
SetLog           { id, sessionId, itemId, blockTypeId, elementId, exerciseId, setIndex, value, bandId, rpe,
                   quality: 'clean' | 'degraded' | null, kind: 'normal' | 'warmup' | 'failure', note, createdAt }
Objective        { id, name, criterion, target, unit, exerciseId, order, tests: { id, date, value, note }[] }
```

- Versions du schéma : 1 (07/10/2026) ; 2 (17/10/2026) ajoute `SetLog.kind`, les séries existantes deviennent `normal`.
- Dans `weekPlan`, `null` signifie « rien » : Repos le soir, pas de séance le matin.
- `SessionLog.resume` contient l'état d'interface de la séance en cours (carte active, exercice choisi par ligne, brouillon de série, minuteurs).
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

- Sauvegarde JSON complète ([src/io/json/backup.ts](src/io/json/backup.ts)) : toutes les tables, `formatVersion` et `dbVersion`. Une sauvegarde d'une version plus récente est refusée. Tout changement du format incrémente `BACKUP_FORMAT_VERSION` et ajoute une étape testée dans `migrate` (format 2 : `kind` sur chaque série, `normal` pour une sauvegarde de format 1). La restauration remplace toutes les données en une transaction ; elle est proposée dès l'écran d'accueil (changement de téléphone).
- Rappel de sauvegarde sur Aujourd'hui : dernière sauvegarde de plus de 7 jours, ou aucune alors qu'au moins une séance a été faite dans l'appli. Sur Android, « Envoyer une sauvegarde » ouvre le menu de partage (Drive, e-mail). Le fichier envoyé est en `.txt` (`text/plain`) : Chrome ne partage qu'une liste fermée de types, sans le JSON, et `navigator.canShare` ne vérifie pas le type. La restauration accepte `.json` et `.txt`. Une annulation ne dit rien ; un refus s'affiche avec « Enregistrer » (téléchargement) à la place.
- Export du journal ([src/io/journal/exportJournal.ts](src/io/journal/exportJournal.ts)) : .xlsx (onglet « Journal », vraies dates Excel) et .csv pour Excel en français (« ; », CRLF, marque UTF-8). Les notes de ligne reprennent la note de séance (1re ligne), les notes de série, « Séance abandonnée » et les numéros des séries dégradées.
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
