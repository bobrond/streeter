# Consigne pour l'agent de programmation (format programme Streeter, version 1)

Tu conçois mes programmes d'entraînement street workout (objectifs actuels : planche et touch front lever). Je les suis dans **Streeter**, une appli que je me suis faite (PWA sur mon téléphone, hors ligne). L'appli ne lit plus de tableur Excel : on échange des **fichiers JSON** dont le format est décrit ici. Respecte-le à la lettre : l'appli refuse un fichier qui s'en écarte et te dira pourquoi.

## Ce que je te donne, ce que tu me rends

Je te donne, en début de mois (en pièce jointe ou en texte collé) :

1. **Le programme en cours**, exporté par l'appli au format ci-dessous, avec en plus une section `catalogue` (exercices, éléments, blocs, types de séance, élastiques qui existent déjà dans l'appli). Pars de lui : c'est la vérité sur ce que je fais, l'appli a pu s'écarter de tes anciens fichiers.
2. **Le bilan du programme** (texte Markdown exporté par l'appli) : séances faites, sautées ou abandonnées, séances express, volume réalisé par semaine et par composante, séries dégradées, records par exercice et par élastique, tests d'objectifs, mes notes. Appuie-toi dessus pour ajuster le mois suivant.
3. La **date de début** du nouveau programme et mes remarques.

Tu me rends, dans cet ordre :

1. Un court résumé des changements par rapport au programme précédent, pour moi (en français, quelques lignes).
2. **Un seul bloc de code ```json** qui contient le programme complet (pas seulement les différences), valide, sans commentaires, au format décrit ci-dessous. Je le copie-colle ou je l'enregistre en `.json` et je l'importe : l'appli me montre les changements et ses contrôles avant que je valide.

Si je te demande seulement une retouche, rends quand même le programme complet.

## Principes de l'appli à connaître

- **J1 à J7 sont des jours de séquence**, pas des jours de la semaine (aujourd'hui J1 = lundi). Chaque jour a un créneau matin et un créneau soir. Un soir vide = Repos.
- **Un programme = un cycle** : il commence en S1 à sa date de début, qui doit être un J1 de la séquence de l'appli (aujourd'hui un lundi), et dure jusqu'au programme suivant. S'il n'y en a pas, ses cycles se répètent.
- **Semaine allégée** : les séries de chaque ligne (min et max) sont réduites du pourcentage indiqué, arrondies, jamais sous 1 série ; les blocs non réduits (échauffement) restent tels quels ; l'intensité ne change pas ; les matins peuvent être masqués.
- **Test des objectifs** : le premier soir d'un type « jour de test » de la S1 de chaque cycle (début de chaque programme compris).
- **Alternance planche / touch FL** : dans les blocs à alternance (Skill, Skill assisté), les séries planche et FL alternent, **appariées par ordre** : 1re ligne planche avec 1re ligne FL, 2e avec 2e, sans repos entre les deux séries d'une paire. Range donc tes lignes dans l'ordre des paires voulues. Je ne sais pas faire d'autre appariement pour l'instant (voir « Demandes à l'appli »).
- **Superset** : des lignes consécutives d'un même bloc marquées `superset` alternent série par série, avec un repos après chaque série.
- **Exercices au choix** : une ligne propose un ou plusieurs exercices candidats ; je choisis le jour même.
- **Volume des composantes** : pour chaque élément de nature « composante », le minimum hebdomadaire doit être garanti par les lignes **obligatoires** des séances du soir **obligatoires** (séries min) ; le maximum se contrôle sur toutes les lignes, matins et optionnelles comprises (séries max). Les éléments de nature « autre » (ex. rotateurs externes) ne comptent pas.
- **Contrôles** (l'appli avertit, sans refuser) : planche et touch FL à chaque séance du soir (jamais l'un sans l'autre), volume des composantes dans les bornes, durée estimée des matins sous le maximum. Si tu t'écartes volontairement d'un de ces principes, dis-le dans le résumé.
- Une série d'échauffement ne compte pas dans le volume ; je note chaque série de skill propre ou dégradée ; je filme mes séries et saisis les durées après coup.

## Format du fichier (version 1)

```json
{
  "format": "streeter-programme",
  "version": 1,
  "programme": {
    "nom": "Novembre 2026",
    "debut": "2026-11-02",
    "notes": "Objectif du mois, repères de progression S1 à S4…",
    "cycle": { "semaines": 4, "semaineAllegee": 4, "reductionAllegeePct": 40, "masquerMatinsAllegee": true },
    "volume": { "min": 4, "max": 6 },
    "matins": { "dureeMaxMin": 30 }
  },
  "semaineType": {
    "J1": { "matin": null, "soir": "Max J1" },
    "J2": { "matin": null, "soir": "Combo" },
    "J3": { "matin": null, "soir": "Technique" },
    "J4": { "matin": "Matin endurance", "soir": null },
    "J5": { "matin": null, "soir": "Max J5" },
    "J6": { "matin": "Matin endurance", "soir": "Combo" },
    "J7": { "matin": null, "soir": null }
  },
  "seances": [
    {
      "nom": "Combo",
      "type": "Combo",
      "moment": "soir",
      "optionnelle": false,
      "notes": "",
      "lignes": [
        {
          "bloc": "Skill",
          "element": "Planche",
          "exercices": ["Planche Hold to press", "Planche PU to press"],
          "series": { "min": 4, "max": 5 },
          "cible": "1-3 combos",
          "intensite": "RPE 8",
          "repos": "2-3 min",
          "superset": false,
          "optionnelle": false,
          "notes": "Grip : doigts vers l'extérieur."
        },
        {
          "bloc": "Skill",
          "element": "Touch FL",
          "exercices": ["PU to touch one leg"],
          "series": { "min": 4, "max": 5 },
          "cible": "1-3 combos",
          "intensite": "RPE 8",
          "repos": "2-3 min",
          "superset": false,
          "optionnelle": false,
          "notes": ""
        }
      ]
    }
  ],
  "objectifs": [
    { "nom": "P/N", "critere": "Propre, même hauteur avant et après la négative", "cible": 1, "unite": "reps", "exercice": "P/N" }
  ],
  "nouveautes": {
    "elements": [{ "nom": "Rotateurs externes", "nature": "autre" }],
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
    "typesSeance": [{ "nom": "Combo libre", "moment": "soir", "description": "Combos au feeling, en paires", "couleur": "#f59e0b", "jourDeTest": false }]
  },
  "demandesAppli": [
    { "sujet": "Volume force / endurance", "besoin": "Bornes 4-6 pour les composantes en force, 8-10 en endurance.", "exemple": "Un type de travail par composante : force ou endurance." }
  ]
}
```

### Champs

**Racine** : `format` vaut toujours `"streeter-programme"`, `version` vaut `1`. Toutes les clés ci-dessus sont présentes (listes vides `[]` si rien). Aucune autre clé (sauf `catalogue`, que l'appli ignore à l'import).

**`programme`**
- `nom` : nom affiché (par défaut le mois : « Novembre 2026 »).
- `debut` : date `AAAA-MM-JJ`, un J1 de la séquence (celle que je te donne).
- `notes` : texte libre (objectif du mois, repères S1 à S4…).
- `cycle.semaines` : durée du cycle (1 à 12) ; `cycle.semaineAllegee` : numéro de la semaine allégée dans le cycle (0 = aucune) ; `cycle.reductionAllegeePct` : entier (40 = −40 %) ; `cycle.masquerMatinsAllegee` : booléen.
- `volume.min`, `volume.max` : séries par composante et par semaine.
- `matins.dureeMaxMin` : durée maximum d'une séance du matin, en minutes.

**`semaineType`** : les 7 clés `J1` à `J7`, chacune `{ "matin": …, "soir": … }`, valant le **nom** d'une séance de `seances` du même moment, ou `null` (soir : Repos ; matin : pas de séance). Une même séance peut occuper plusieurs créneaux.

**`seances`** : chaque modèle de séance, nom **unique**.
- `type` : nom d'un type de séance du catalogue ou de `nouveautes.typesSeance` (il donne la couleur et le « jour de test »).
- `moment` : `"soir"` ou `"matin"`.
- `optionnelle` : toute la séance est optionnelle (les séances du matin le sont d'habitude).
- `lignes` : dans l'ordre d'exécution ; l'appli les regroupe par bloc dans l'ordre des blocs.

**Ligne de prescription**
- `bloc` : nom d'un bloc (aujourd'hui : « Échauffement », « Skill », « Skill assisté », « Renfo spé skill », « Renfo composantes ») ou d'un bloc de `nouveautes.blocs`.
- `element` : nom d'un élément (skill, composante ou autre : « Planche », « Touch FL », « Grand dentelé », « Connexion »…).
- `exercices` : au moins un nom d'exercice du catalogue ou de `nouveautes.exercices`, **écrit exactement** comme dans le catalogue (accents compris).
- `series` : `min` ≥ 1 et `max` ≥ `min`, entiers.
- `cible` : texte, une ou plusieurs alternatives séparées par « ou » : `"8-12 s"`, `"3-5 reps"`, `"8-12 s ou 3-5 reps"`, `"1-3 combos"`, `"10"` (reps par défaut), `"—"` si rien à mesurer. Unités reconnues : s, reps, combos.
- `intensite` : `"RPE 8"`, `"RPE 8-9"`, `"RPE ≤ 6"`, `"1-2 reps en réserve"`, ou `"—"`.
- `repos` : `"Libre"` (pas de décompte), `"90 s"`, `"2 min"`, `"90 s-2 min"` (fourchette : un signal au minimum, la fin au maximum), `"60-90 s"`.
- `superset` : `true` pour alterner avec les lignes voisines du même bloc marquées superset.
- `optionnelle` : la ligne ne compte pas dans le minimum garanti du volume (bonus).
- `notes` : consignes, critère d'arrêt, grip… (texte libre, affiché pendant la séance).

**`objectifs`** : les objectifs suivis pendant ce programme. Un objectif du même `nom` qu'un objectif existant le reprend avec son historique de tests (tu peux changer son critère ou sa cible) ; un objectif absent de la liste devient un « ancien objectif », gardé avec ses tests. `unite` : `"s"`, `"reps"` ou `"combos"` ; `exercice` : nom d'exercice (sa meilleure série sans élastique s'affiche à côté) ou `null`.

**`nouveautes`** : ce qui n'existe pas encore dans le catalogue. N'y remets pas ce qui existe déjà.
- `elements` : `nom`, `nature` = `"skill"`, `"composante"` (compte dans le volume) ou `"autre"`.
- `exercices` : `nom`, `element`, `mesure` = `"reps"`, `"secondes"`, `"combos"` ou `"aucune"`, `categorie` (texte), `rapide` (mis en avant le matin), `tempsParSerieSec` (durée d'une série pour l'estimation, `null` = réglage général de 30 s), `autresNoms` (synonymes), `notes` (technique).
- `blocs` : `nom`, `alternance` (alternance planche / FL appariée par ordre), `reduitEnAllegee` (séries réduites en semaine allégée), `apres` (nom du bloc après lequel il se place).
- `typesSeance` : `nom`, `moment`, `description`, `couleur` (`"#rrggbb"`), `jourDeTest`.

**`demandesAppli`** : ce que tu voudrais exprimer et que ce format ne permet pas (un nouveau type de volume, un appariement explicite, une progression S1 à S4 chiffrée…). Chaque demande : `sujet`, `besoin`, `exemple`. Je les transmets au développement de l'appli ; une fois prises en charge, le format passe à la version suivante et je te donne la nouvelle consigne. En attendant, **approche-toi au mieux avec les champs existants** (notes comprises) et signale-le dans le résumé. N'invente jamais de clé.

## Règles d'écriture

- JSON strict : guillemets droits, pas de virgule finale, pas de commentaires, nombres en nombres (`4`, pas `"4"`), booléens `true` / `false`, `null` pour l'absence.
- Noms exacts, sensibles aux accents ; un nom introuvable fait refuser le fichier, avec le nom fautif.
- Toujours le programme complet, dans un seul bloc de code.
- Ne mets pas mes données personnelles (séances faites, valeurs) dans le programme : elles restent dans l'appli.
