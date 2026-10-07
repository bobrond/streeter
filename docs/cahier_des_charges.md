# Projet : application mobile de programmation et de suivi d'entraînement street workout

## 1. Contexte

Je m'entraîne en street workout 5 à 6 fois par semaine, avec des séances courtes certains matins. Mes objectifs actuels sont la planche et le touch front lever. Aujourd'hui, je gère ma programmation et mon carnet de suivi dans un tableur Excel : `docs/programme_planche_touch_fl.xlsx`, qui se trouve dans ce dossier. Lis-le en entier avant toute chose. **C'est la source de vérité** pour mes données de départ et pour la logique du programme.

Le tableur fonctionne, mais il est pénible à utiliser sur téléphone pendant une séance. Je veux une application qui fait la même chose que ce tableur : elle doit être aussi paramétrable que lui, mais avec une interface pensée pour le smartphone et utilisable d'une main entre deux séries, y compris dehors, sur un parc de street workout, sans réseau.

L'application est pour moi seul. Je ne cherche pas un produit grand public, je cherche un outil personnel fiable, rapide et entièrement personnalisable.

## 2. Ce que fait le tableur (à reproduire)

Le fichier contient 6 onglets :

- **Programme** : une ligne par bloc de prescription, par jour (J1 à J7) et par moment (Matin / Soir). Colonnes : Jour, Moment, Ordre, Type séance, Bloc, Élément, Exercices au choix, Séries min, Séries max, Reps / durée, RPE / marge, Repos, Optionnel, Notes.
- **Volume hebdo** :
  - paramètres (minimum 4 et maximum 6 séries par composante et par semaine, réduction de 40 % en semaine allégée) ;
  - séries soir / matin / total par composante, avec un contrôle « OK / Sous le min (soir) / Au-dessus du max » ;
  - totaux par skill.
- **Journal** : une ligne par exercice réalisé. Colonnes : Date, Semaine, Jour, Moment, Type séance, Bloc, Exercice, Séries faites, Reps / durée (valeurs par série séparées par « ; »), Élastique (couleur), RPE, Ressenti / notes. Il contient déjà de vraies séances à importer.
- **Objectifs** : 4 objectifs chiffrés, avec cible, unité, dernier test, date, écart et statut (« À tester / En cours / Atteint »).
- **Exercices** : le catalogue par catégorie, avec un indicateur « Rapide (matin) ».
- **Lisez-moi** : les règles et les hypothèses.

## 3. Règles métier à respecter

### Structure d'une séance

1. **Ordre des blocs**, à rendre paramétrable : Échauffement (connexion + élastique) → Skill → Skill assisté (élastique) → Renfo spé skill → Renfo composantes.
2. **Planche et touch front lever sont travaillés à chaque séance du soir.** Il n'existe pas de séance « planche seule » ou « FL seule ».
3. **Pendant le bloc Skill**, les séries planche et FL s'alternent. L'application doit proposer cette alternance.
4. **Le choix de l'exercice se fait le jour même.** Une ligne de prescription définit un élément (ex. « Grand dentelé »), une fourchette de séries, une cible et une intensité, plus une **liste d'exercices candidats**. Je choisis l'exercice au moment de la séance. Par défaut, l'application me propose celui que j'ai fait la dernière fois.

### Types de séance

Ils sont présents dans le tableur et doivent rester paramétrables :

| Type | Moment | Principe |
|---|---|---|
| Max | Soir | Skills isolés, intensité haute (RPE 8-9) |
| Combo | Soir | Enchaînements (hold to press, PU to press, PU to touch, FL press), RPE 8 |
| Technique | Soir | Skills isolés à environ 70 %, focus qualité (RPE 6-7) |
| Technique léger | Soir | Optionnel, RPE ≤ 6, aucune fatigue résiduelle |
| Matin A / Matin B | Matin | 30 min maximum, exercices rapides, optionnels |
| Repos | — | — |

### Semaine type actuelle

À importer depuis l'onglet Programme ; ce tableau sert de vérification :

| Jour | Matin | Soir |
|---|---|---|
| J1 | — | Max + renfo spé + rhomboïde + extension thoracique |
| J2 | — | Combo + grand dentelé + deltoïde ant |
| J3 | — | Technique + rhomboïde + extension thoracique |
| J4 | Matin A (renfo spé + grand dentelé + deltoïde ant) | Repos |
| J5 | — | Max + renfo spé |
| J6 | Matin B (renfo spé + rhomboïde + extension thoracique) | Combo + grand dentelé + deltoïde ant |
| J7 | — | Technique léger (optionnel) |

**Attention : J1 à J7 sont des jours de séquence, pas des jours de la semaine.** Prévois un réglage qui associe J1 à un jour de la semaine, et permets toujours de choisir manuellement la séance du jour, ou de décaler la séquence.

### Volume des composantes de renfo

Les composantes sont grand dentelé, rhomboïde, deltoïde antérieur et extension thoracique. La liste doit être éditable.

1. **Bornes** : entre 4 et 6 séries par composante et par semaine. Ces bornes sont paramétrables.
2. **Le soir garantit le minimum** : les séances du soir apportent à elles seules le minimum de 4 séries.
3. **Le matin est un bonus** : les matins sont optionnels et complètent jusqu'au maximum. Sauter un matin ne doit jamais faire passer sous le minimum.
4. **Contrôle à afficher** : le volume prévu (soir / matin / total) et le volume réellement réalisé dans la semaine en cours, avec le même statut que dans le tableur.
5. **Contrôle à l'édition** : quand je modifie le programme, l'application signale tout de suite si une composante sort des bornes.

### Séances du matin

- Durée maximum : 30 min.
- **Estimation de durée** : l'application estime la durée d'une séance à partir des séries, d'un temps de travail moyen par série et des repos prescrits. Elle m'avertit si un modèle du matin dépasse 30 min.
- Le catalogue marque les exercices « rapides » (sans barre, peu d'installation). Le matin, l'application filtre ou met en avant ces exercices.
- Les composantes du matin se font en superset, avec 60-90 s de repos.

### Cycle et progression

- **Cycle** de 4 semaines, avec une durée paramétrable. Les semaines 1 à 3 sont en progression ; la semaine 4 est allégée.
- **Semaine allégée** :
  - séries du soir réduites de 40 % (paramétrable), arrondies à l'entier ;
  - séances du matin masquées ;
  - intensité inchangée.
- **Test des objectifs** : en début de semaine 5, sur un jour Max. L'application me le rappelle.
- **Règle de progression** : faire progresser une seule variable à la fois (+1 s de hold, +1 rep, ou élastique plus fin). L'application affiche ma dernière performance sur l'exercice pour que je puisse viser juste au-dessus.
- **Critère d'arrêt des séries de skill** : la série s'arrête dès que la protraction (grand dentelé) ou le verrouillage du coude lâche. Je veux pouvoir marquer une série « propre » ou « dégradée ».

### Objectifs actuels

À importer depuis l'onglet Objectifs :

- Planche hold : 10 s avec bonne activation du grand dentelé.
- Planche press to négative (P/N) : 1 rep, activation du grand dentelé et bras tendus verrouillés.
- Touch front lever hold one leg : 15 s, bassin au minimum neutre.
- Touch front lever hold full : 5 s, bassin au minimum neutre.

Chaque objectif garde un historique de tests (date, valeur, note). Il peut être lié à un exercice du catalogue, pour afficher la meilleure performance enregistrée en séance.

### Élastiques

Je note l'assistance par la couleur de l'élastique (actuellement « vert » et « jaune »). Prévois une liste éditable d'élastiques, ordonnée du plus assistant au moins assistant, pour pouvoir suivre la progression vers « sans élastique ».

## 4. Modèle de données (proposition, à affiner)

- **Exercise** : id, nom, catégorie, élément/composante, type de mesure (reps / durée en s / combo), rapide (bool), actif (bool), notes.
- **Element** : id, nom (Planche, Touch FL, Grand dentelé…), compteDansVolumeComposante (bool).
- **BlockType** : id, nom, ordre.
- **SessionTemplate** : id, nom, moment (Matin / Soir), couleur, optionnel, liste ordonnée de **PrescriptionItem**.
- **PrescriptionItem** : bloc, élément, exercices candidats, séries min/max, cible (texte libre, plus valeurs numériques min/max et unité quand c'est possible), intensité (RPE ou reps en réserve), repos en secondes, optionnel, notes.
- **WeekPlan** : pour chaque jour de séquence J1 à J7 et chaque moment, un modèle de séance ou « Repos ».
- **Cycle / Settings** :
  - date de début, durée du cycle, numéro de la semaine allégée, réduction en %, masquer les matins en allégé ;
  - bornes min/max de volume, durée maximum du matin ;
  - correspondance J1 → jour de la semaine.
- **Band** : nom/couleur, ordre d'assistance.
- **SessionLog** : date, numéro de semaine du cycle, jour de séquence, moment, modèle, début/fin, note globale.
- **SetLog** : séance, bloc, élément, exercice, index de série, valeur (reps ou secondes), élastique, RPE, qualité (propre / dégradée), note.
- **Objective** : nom, critère, cible, unité, exercice lié (optionnel), tests [{date, valeur, note}].

**Le nombre de séries faites se déduit des SetLog**, il n'est jamais saisi. Dans mon tableur, il m'arrive de noter « 3 séries » avec 4 valeurs ; l'application doit rendre cette incohérence impossible.

## 5. Écrans

L'application a une barre d'onglets en bas : **Aujourd'hui · Semaine · Journal · Objectifs · Réglages**.

1. **Aujourd'hui**
   - Affiche la séance prévue (jour de séquence, moment, type, semaine du cycle, et « semaine allégée » le cas échéant), avec un bouton « Commencer ».
   - Propose de changer de séance ou de passer au jour suivant.
2. **Mode séance** : c'est l'écran le plus important, il doit être irréprochable.
   - **Navigation** : les blocs s'enchaînent dans l'ordre ; chaque prescription est une carte.
   - **Contenu d'une carte** :
     - choix de l'exercice parmi les candidats, en puces ;
     - rappel de la prescription : séries, cible, intensité, repos, notes ;
     - dernière performance sur cet exercice (valeurs, élastique, date).
   - **Saisie d'une série** :
     - valeur avec de gros boutons +/− et une saisie directe ;
     - élastique en puces ;
     - RPE en puces de 5 à 10 ;
     - bascule « propre / dégradée » ;
     - note optionnelle.
   - **Minuteurs** :
     - minuteur de hold avec décompte de 3 s, puis comptage, vibration et bip, avec la valeur reportée automatiquement dans la série ;
     - minuteur de repos qui démarre automatiquement après la validation d'une série, avec la durée prescrite.
   - **Alternance planche / FL** pendant le bloc Skill.
   - **Écran allumé** pendant la séance (Wake Lock API).
   - **Reprise** : une séance interrompue (appel, fermeture de l'application) reprend exactement où elle en était.
3. **Semaine**
   - Vue de la semaine type (J1 à J7, Matin / Soir) et de l'avancement de la semaine en cours.
   - Tableau de volume par composante (prévu soir / prévu matin / réalisé / statut) et totaux par skill.
4. **Journal**
   - Historique des séances, filtrable par exercice, élément, bloc et type de séance.
   - Fiche exercice avec courbe de progression (meilleure valeur par séance, avec l'élastique indiqué).
5. **Objectifs** : liste avec statut, saisie d'un test, historique et graphique.
6. **Réglages**
   - Édition complète : exercices, éléments, blocs, modèles de séance et leurs prescriptions, semaine type, élastiques, paramètres de cycle et de volume.
   - Import / export.

## 6. Contraintes techniques

- **Type d'application** : une PWA installable sur l'écran d'accueil, iOS et Android. Pas de stores, pas de backend, pas de compte.
- **Hors ligne** : l'application fonctionne entièrement hors ligne (service worker).
- **Stockage** : données locales dans IndexedDB. Demande un stockage persistant (`navigator.storage.persist()`).
- **Stack suggérée** : Vite + React + TypeScript + Tailwind, Dexie pour IndexedDB, vite-plugin-pwa, une petite librairie de graphiques, SheetJS pour l'import/export Excel, Vitest pour les tests. Si tu proposes autre chose, justifie-le avant de commencer.
- **Sauvegarde** :
  - export / import JSON complet ;
  - rappel de sauvegarde si la dernière date de plus de 7 jours ;
  - les données ne doivent jamais être perdues lors d'une mise à jour de l'application ; prévois des migrations de schéma versionnées.
- **Compatibilité tableur** :
  - **import** du fichier Excel actuel : onglets Programme, Exercices, Objectifs et Journal. Le Journal contient des « Jour » saisis tantôt « J3 », tantôt « 3 » : normalise-les. Les « Reps / durée » du type « 3 ; 3 ; 2 ; 2 » se découpent en SetLog ;
  - **export** du journal en .xlsx / .csv avec les mêmes colonnes que l'onglet Journal.
- **Interface** :
  - en français ;
  - mobile d'abord (à tester à 375 px de large) ;
  - zones tactiles d'au moins 44 px ;
  - actions principales dans la moitié basse de l'écran, pour le pouce ;
  - mode sombre par défaut avec un bon contraste en plein soleil ;
  - aucune saisie au clavier obligatoire pendant une séance.
- **Déploiement** : sur un hébergement gratuit en HTTPS (GitHub Pages, Netlify ou Vercel). Explique-moi la procédure, et comment installer l'application sur mon téléphone.

## 7. Hors périmètre de la v1

- Synchronisation cloud et comptes.
- Applications natives.
- Coaching automatique ou IA.
- Multi-utilisateur.
- **À noter pour une v2, sans l'implémenter** : un avertissement si une composante « pousser » (grand dentelé, deltoïde antérieur) est programmée dans les 24 h avant une séance Max.

## 8. Méthode de travail attendue

1. **Avant de coder** :
   - lis le tableur et ce document ;
   - crée un `CLAUDE.md` qui résume les règles métier, le modèle de données et les conventions du projet ;
   - propose-moi un plan par phases ;
   - pose-moi tes questions sur les points ambigus.
2. **Avancer par phases**, chacune livrable et testable sur téléphone :
   - **Phase 0** : initialisation, modèle de données, import du tableur dans la base, tests unitaires du calcul de volume, de la semaine allégée et du statut des objectifs. Vérifie que l'import redonne exactement les totaux de l'onglet Volume hebdo.
   - **Phase 1** : écran Aujourd'hui et mode séance complet (saisie, minuteurs, reprise). À la fin de cette phase, je dois pouvoir m'entraîner avec l'application.
   - **Phase 2** : édition complète du programme et du catalogue depuis les Réglages.
   - **Phase 3** : Semaine et volume, Journal et graphiques, Objectifs.
   - **Phase 4** : PWA hors ligne, sauvegarde, export, déploiement.
3. **À la fin de chaque phase** : fais un commit, puis donne-moi un court récapitulatif de ce qui marche, de ce qui reste et de ce que je dois tester.
4. **En cas de doute sur une règle d'entraînement**, demande-moi au lieu de supposer.

## 9. Critères d'acceptation

- Après l'import du tableur, la semaine type, le catalogue, les 4 objectifs et les séances déjà notées dans le Journal sont présents et corrects.
- Le volume prévu par composante vaut 4 séries le soir, 2 le matin et 6 au total, avec le statut OK. Si je retire une série du soir, le statut passe à « Sous le min ».
- Je peux faire une séance complète d'une main, hors ligne, sans clavier, avec les minuteurs de hold et de repos.
- Une séance interrompue reprend où elle en était.
- Je peux ajouter un exercice, le rendre candidat d'une prescription et le retrouver en séance, sans toucher au code.
- La semaine allégée réduit les séries du soir de 40 % et masque les matins.
- L'export du journal se rouvre dans Excel avec les mêmes colonnes que mon tableur.
