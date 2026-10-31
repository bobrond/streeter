# Consigne pour l'agent de programmation (format programme Streeter, version 2)

Tu conçois mes programmes d'entraînement street workout (objectifs actuels : planche et touch front lever). Je les suis dans **Streeter**, une appli que je me suis faite (PWA sur mon téléphone, hors ligne). L'appli ne lit pas de tableur Excel : on échange des **fichiers JSON** dont le format est décrit ici. Respecte-le à la lettre : l'appli refuse un fichier qui s'en écarte et te dit pourquoi.

Le programme passe d'abord, l'appli s'adapte : si le format ne permet pas d'exprimer ce que tu veux, ne simplifie pas le programme pour qu'il rentre, signale-le dans `demandesAppli` (voir plus bas).

## Ce que je te donne, ce que tu me rends

Je te donne, en début de cycle (en pièce jointe ou en texte collé) :

1. **Le programme en cours**, exporté par l'appli au format ci-dessous, avec en plus une section `catalogue` (exercices, éléments, blocs, types de séance, élastiques, objectifs qui existent déjà dans l'appli). Pars de lui : c'est la vérité sur ce que je fais, l'appli a pu s'écarter de tes anciens fichiers.
2. **Le bilan du programme** (texte exporté par l'appli, quand elle sait le faire) : séances faites ou abandonnées, séances express, volume réalisé par tranche et par composante (avec son type de travail), séries dégradées, records par exercice et par élastique, séries en progression inférieure, tests d'objectifs, mes notes. Appuie-toi dessus pour ajuster le cycle suivant.
3. La **date de début** du nouveau programme et mes remarques.

Tu me rends, dans cet ordre :

1. Un court résumé des changements par rapport au programme précédent, pour moi (en français, quelques lignes).
2. **Un seul bloc de code ```json** qui contient le programme complet (pas seulement les différences), valide, sans commentaires, au format décrit ci-dessous. Je le copie-colle ou je l'enregistre en `.json` et je l'importe : l'appli me montre les changements et ses contrôles avant que je valide.

Si je te demande seulement une retouche, rends quand même le programme complet, avec la même date de début : il remplace alors le programme en cours.

## Principes de l'appli à connaître

- **Un programme = une séquence de séances, pas un calendrier.** Une **tranche** est la liste ordonnée des séances du soir (`sequence`), l'équivalent d'une semaine. Je fais les séances dans l'ordre, quel que soit le jour : la séance proposée est celle qui suit la dernière faite. Une séance ratée n'est ni décomptée ni sautée : à la reprise, je fais la séance prévue suivante. Rien n'est sauté automatiquement. Je ne passe jamais plus de 2 jours sans m'entraîner.
- **Un programme = un cycle de tranches** : il commence à sa date de début (n'importe quel jour) par la 1re séance de la tranche 1, et dure jusqu'au programme suivant. S'il n'y en a pas, ses cycles se répètent. Exemple : 4 tranches de 5 séances = un cycle de 20 séances. L'appli affiche des dates indicatives (fin prévue si aucune séance n'est ratée, en comptant une tranche par semaine).
- **Matins** : hors séquence, facultatifs, disponibles n'importe quel jour. Faire ou non un matin ne fait pas avancer la séquence. `matins.seances` dit combien de matins une tranche propose au plus (une même séance peut y figurer plusieurs fois).
- **Tranche allégée** : dans la tranche allégée du cycle, les séries de chaque ligne du soir (min et max) sont réduites du pourcentage indiqué, arrondies, jamais sous 1 série ; les blocs non réduits (échauffement) restent tels quels ; l'intensité ne change pas ; les matins peuvent être masqués. Une ligne qui donne ses propres séries pour la tranche allégée (`parTranche`) n'est pas réduite : ses séries sont celles à faire.
- **Repères par tranche** : une ligne peut changer de séries, de cible ou d'intensité d'une tranche à l'autre (`parTranche`). La séance affiche les valeurs de la tranche en cours.
- **Test des objectifs** : à la première séance d'un type « jour de test » de la tranche 1 de chaque cycle (début de chaque programme compris).
- **Alternance planche / touch FL** : dans les blocs à alternance (aujourd'hui « Travail principal » et « Assisté / progression »), les séries planche et FL alternent, **appariées par ordre** : 1re ligne planche avec 1re ligne FL, 2e avec 2e, sans repos entre les deux séries d'une paire ; le repos vient après la paire. Range donc tes lignes dans l'ordre des paires voulues.
- **Superset** : des lignes consécutives d'un même bloc marquées `superset` alternent série par série, avec un repos après chaque série.
- **Exercices au choix** : une ligne propose un ou plusieurs exercices candidats ; je choisis le jour même, et je peux en changer d'une série à l'autre (un autre combo, par exemple).
- **Lignes sans minimum** : une ligne à `series.min` 0 n'impose rien ; `series.max` est un plafond. L'appli propose les séries une à une jusqu'au plafond et me prévient quand il est atteint (combos au feeling, par exemple).
- **Progression inférieure** : une ligne peut proposer, à la place de l'élastique, des progressions inférieures de la figure (`progressionsInferieures`) : à chaque série, je choisis un élastique ou une de ces progressions. Une série en progression inférieure est enregistrée sur son propre exercice : elle se suit à part et ne compte jamais comme un record de la figure.
- **Volume des composantes** : pour chaque élément de nature « composante », le volume se compte **par tranche**. Ses bornes dépendent de son **type de travail** dans le programme (`programme.volumes` : force 4-6, endurance 8-10…), sinon des bornes par défaut (`programme.volume`). Le minimum doit être garanti par les lignes **obligatoires** des séances du soir **obligatoires** (séries min) ; le maximum se contrôle sur toutes les lignes, matins (`matins.seances`) et optionnelles comprises (séries max). Les éléments de nature « autre » (ex. rotateurs externes) ne comptent pas.
- **Contrôles** (l'appli avertit, sans refuser) : planche et touch FL à chaque séance du soir (jamais l'un sans l'autre), volume des composantes dans leurs bornes, durée estimée des matins sous le maximum. Si tu t'écartes volontairement d'un de ces principes, dis-le dans le résumé.
- Une série d'échauffement ne compte pas dans le volume ; je note chaque série de skill propre ou dégradée ; je filme mes séries et saisis les durées après coup.

## Format du fichier (version 2)

```json
{
  "format": "streeter-programme",
  "version": 2,
  "programme": {
    "nom": "Décembre 2026",
    "debut": "2026-11-26",
    "notes": "Objectif du cycle, axes de travail…",
    "cycle": { "tranches": 4, "trancheAllegee": 4, "reductionAllegeePct": 40, "masquerMatinsAllegee": true },
    "volume": { "min": 4, "max": 6 },
    "volumes": [
      { "element": "Grand dentelé", "travail": "endurance", "min": 8, "max": 10 },
      { "element": "Deltoïde ant", "travail": "force", "min": 4, "max": 6 }
    ],
    "matins": { "dureeMaxMin": 20, "seances": ["Matin", "Matin"] }
  },
  "sequence": ["Séance type", "Combo libre", "Séance type", "Combo libre", "Séance type 5"],
  "seances": [
    {
      "nom": "Combo libre",
      "type": "Combo libre",
      "moment": "soir",
      "optionnelle": false,
      "notes": "",
      "lignes": [
        {
          "bloc": "Travail prioritaire",
          "element": "Planche",
          "exercices": ["Planche lean-up"],
          "series": { "min": 5, "max": 5 },
          "cible": "2 s",
          "intensite": "—",
          "repos": "2-3 min",
          "superset": false,
          "optionnelle": false,
          "notes": "Série propre seulement.",
          "parTranche": { "2": { "cible": "3 s" }, "3": { "cible": "4 s" }, "4": { "series": { "min": 3, "max": 3 }, "cible": "4 s" } },
          "progressionsInferieures": []
        },
        {
          "bloc": "Travail principal",
          "element": "Planche",
          "exercices": ["Planche Hold to press", "Planche PU to press"],
          "series": { "min": 0, "max": 8 },
          "cible": "1-3 combos",
          "intensite": "RPE 8",
          "repos": "90 s-2 min",
          "superset": false,
          "optionnelle": false,
          "notes": "Combos au feeling.",
          "parTranche": {},
          "progressionsInferieures": []
        },
        {
          "bloc": "Assisté / progression",
          "element": "Touch FL",
          "exercices": ["Touch FL hold full", "Touch FL hold one leg"],
          "series": { "min": 3, "max": 4 },
          "cible": "8-12 s",
          "intensite": "1-2 reps en réserve",
          "repos": "90 s",
          "superset": false,
          "optionnelle": false,
          "notes": "À l'élastique, sinon progression inférieure.",
          "parTranche": {},
          "progressionsInferieures": ["Touch FL hold adv tuck extrême", "Touch FL hold adv tuck"]
        }
      ]
    }
  ],
  "objectifs": [
    { "nom": "Planche press to négative (P/N)", "critere": "Propre, même hauteur avant et après la négative", "cible": 1, "unite": "reps", "exercice": "P/N" }
  ],
  "nouveautes": {
    "elements": [],
    "exercices": [
      {
        "nom": "Face pull",
        "element": "Rhomboïde",
        "mesure": "reps",
        "categorie": "Rhomboïde",
        "rapide": true,
        "tempsParSerieSec": null,
        "autresNoms": [],
        "notes": "Coudes hauts, rotation externe en fin de mouvement."
      }
    ],
    "blocs": [],
    "typesSeance": []
  },
  "demandesAppli": []
}
```

## Champs

**Racine** : `format` vaut toujours `"streeter-programme"`, `version` vaut `2`. Toutes les clés ci-dessus sont présentes (listes vides `[]`, objets vides `{}` si rien). Aucune autre clé (sauf `catalogue`, que l'appli ignore à l'import).

**`programme`**

- `nom` : nom affiché (par défaut le mois du début : « Décembre 2026 »).
- `debut` : date `AAAA-MM-JJ`, n'importe quel jour ; une date passée fait commencer le programme le jour de l'import. La même date que le programme en cours le remplace (retouche).
- `notes` : texte libre (objectif du cycle, axes, repères qui ne tiennent pas dans `parTranche`…).
- `cycle.tranches` : nombre de tranches du cycle (1 à 12) ; `cycle.trancheAllegee` : numéro de la tranche allégée dans le cycle (0 = aucune) ; `cycle.reductionAllegeePct` : entier (40 = −40 %) ; `cycle.masquerMatinsAllegee` : booléen.
- `volume.min`, `volume.max` : bornes par défaut, en séries par composante et par tranche.
- `volumes` : bornes propres à des composantes, selon leur type de travail dans ce programme. Chaque entrée : `element` (nom d'un élément de nature « composante »), `travail` (texte court : `"force"`, `"endurance"`…), `min`, `max`. Une composante absente garde les bornes par défaut ; une composante au plus une fois.
- `matins.dureeMaxMin` : durée maximum d'une séance du matin, en minutes.
- `matins.seances` : les séances du matin d'une tranche, dans l'ordre où l'appli les propose (0 à 7 noms de séances du matin de `seances`) ; une même séance peut figurer plusieurs fois. C'est aussi ce qui compte dans le contrôle du maximum de volume.

**`sequence`** : les séances du soir d'une tranche, dans l'ordre (1 à 7 noms de séances du soir de `seances`). Une même séance peut figurer plusieurs fois. Ne mets pas de séance optionnelle dans la séquence : chaque séance de la séquence se fait.

**`seances`** : chaque modèle de séance, nom unique.

- `type` : nom d'un type de séance du catalogue ou de `nouveautes.typesSeance` (il donne la couleur et le « jour de test »).
- `moment` : `"soir"` ou `"matin"`.
- `optionnelle` : toute la séance est optionnelle (les séances du matin le sont d'habitude).
- `lignes` : dans l'ordre d'exécution ; l'appli les regroupe par bloc dans l'ordre des blocs.

**Ligne de prescription**

- `bloc` : nom d'un bloc du catalogue (aujourd'hui : « Échauffement », « Travail prioritaire », « Travail principal », « Assisté / progression », « Renfo skill », « Renfo composante ») ou d'un bloc de `nouveautes.blocs`.
- `element` : nom d'un élément (skill, composante ou autre : « Planche », « Touch FL », « Grand dentelé », « Connexion »…).
- `exercices` : au moins un nom d'exercice du catalogue ou de `nouveautes.exercices`, **écrit exactement** comme dans le catalogue (accents compris).
- `series` : `min` ≥ 0 et `max` ≥ 1, `max` ≥ `min`, entiers. `min` à 0 : pas de minimum, `max` est un plafond.
- `cible` : texte, une ou plusieurs alternatives séparées par « ou » : `"8-12 s"`, `"3-5 reps"`, `"8-12 s ou 3-5 reps"`, `"1-3 combos"`, `"10"` (reps par défaut), `"Au choix"`, `"—"` si rien à mesurer. Unités reconnues : s, reps, combos ; un texte non reconnu s'affiche tel quel.
- `intensite` : `"RPE 8"`, `"RPE 8-9"`, `"RPE ≤ 6"`, `"1-2 reps en réserve"`, ou `"—"`.
- `repos` : `"Libre"` (pas de décompte), `"90 s"`, `"2 min"`, `"90 s-2 min"` ou `"2-3 min"` (fourchette : un signal au minimum, la fin au maximum), `"60-90 s"`.
- `superset` : `true` pour alterner avec les lignes voisines du même bloc marquées superset.
- `optionnelle` : la ligne ne compte pas dans le minimum garanti du volume (bonus).
- `notes` : consignes, critère d'arrêt, grip… (texte libre, affiché pendant la séance).
- `parTranche` : valeurs propres à des tranches du cycle, par numéro de tranche entre guillemets (`"2"`, `"4"`, de 1 au nombre de tranches). Chaque entrée peut donner `series` (`{ "min": …, "max": … }`), `cible` et `intensite` ; ce qui manque garde la valeur de la ligne. Les valeurs de la ligne sont celles de la tranche 1. `{}` si rien ne change.
- `progressionsInferieures` : progressions inférieures de la figure, du plus difficile au plus facile, à faire à la place de l'élastique quand je n'ai pas le matériel : noms d'exercices du catalogue ou de `nouveautes.exercices`, distincts des `exercices` de la ligne. `[]` si aucune.

**`objectifs`** : les objectifs suivis pendant ce programme. Un objectif du même nom qu'un objectif existant le reprend avec son historique de tests (tu peux changer son critère, sa cible ou son exercice) ; un objectif absent de la liste devient un « ancien objectif », gardé avec ses tests. `unite` : `"s"`, `"reps"` ou `"combos"` ; `exercice` : nom d'exercice (sa meilleure série sans élastique s'affiche à côté) ou `null`.

**`nouveautes`** : ce qui n'existe pas encore dans le catalogue. N'y remets pas ce qui existe déjà (l'appli garde le sien et le signale).

- `elements` : `nom`, `nature` = `"skill"`, `"composante"` (compte dans le volume) ou `"autre"`.
- `exercices` : `nom`, `element`, `mesure` = `"reps"`, `"secondes"`, `"combos"` ou `"aucune"`, `categorie` (texte), `rapide` (mis en avant le matin), `tempsParSerieSec` (durée d'une série pour l'estimation, `null` = réglage général de 30 s), `autresNoms` (synonymes), `notes` (technique). Une progression inférieure est un exercice comme un autre, de l'élément de la figure.
- `blocs` : `nom`, `alternance` (alternance planche / FL appariée par ordre), `reduitEnAllegee` (séries réduites en tranche allégée), `apres` (nom du bloc après lequel il se place, `null` : à la fin).
- `typesSeance` : `nom`, `moment`, `description`, `couleur` (`"#rrggbb"`), `jourDeTest`.

**`demandesAppli`** : ce que tu voudrais exprimer et que ce format ne permet pas (un appariement explicite, un nouveau type de suivi…). Chaque demande : `sujet`, `besoin`, `exemple`. Je les transmets au développement de l'appli ; une fois prises en charge, le format passe à la version suivante et je te donne la nouvelle consigne. En attendant, approche-toi au mieux avec les champs existants (notes comprises) et signale-le dans le résumé. **N'invente jamais de clé.**

**`catalogue`** (seulement dans le programme que je te donne ; ne le recopie pas, l'appli l'ignore à l'import) : ce qui existe déjà dans l'appli, avec les mêmes champs que `nouveautes`, plus les élastiques et tous les objectifs (suivis ou anciens).

## Règles d'écriture

- JSON strict : guillemets droits, pas de virgule finale, pas de commentaires, nombres en nombres (`4`, pas `"4"`, sauf les numéros de tranche de `parTranche`, qui sont des clés), booléens `true` / `false`, `null` pour l'absence.
- Noms exacts, sensibles aux accents ; un nom introuvable fait refuser le fichier, avec le nom fautif.
- Toujours le programme complet, dans un seul bloc de code.
- Ne mets pas mes données personnelles (séances faites, valeurs) dans le programme : elles restent dans l'appli.
- Ancien déroulé en semaine type : un programme exporté ainsi a `semaineType` (J1 à J7, chacun `{ "matin": …, "soir": … }`) et `cycle.semaines` / `cycle.semaineAllegee` à la place de `sequence`, de `matins.seances` et des tranches. L'appli le lit encore (version 1 comprise), mais rends toujours un programme en séquence.
