# Fichier commun de la suite Cheetah (`.cheetahcost.json`)

Un projet, deux lentilles : le même fichier circule entre **Cheetah Cost**
(coûtenance) et **Cheetah Time** (délais), avec la même identité, les mêmes LT
et les **mêmes dates de B2P**.

## Versions du schéma

| Version | Contenu |
|---|---|
| 1.0.0 | Identité, phase, dates, monnaie, LT (`lots`), dates de B2P |
| **1.1.0** | + bloc `project.lentilleDelai` : le retard délai mesuré par Cheetah Time |

Le changement est **additif** : un lecteur 1.0.0 ignore `lentilleDelai`, et
Cheetah Time relit toujours les fichiers 1.0.0.

## Bloc `project.lentilleDelai` (1.1.0)

```jsonc
"lentilleDelai": {
  "module": "CheetahTime",
  "uniteTemps": "mois",            // heures | jours | semaines | mois
  "dateEtat": "2026-11-04",        // date d'état du dernier B2P saisi
  "finInitiale": "2027-10-01",     // Fi — fin du Planning Initial (B2P0)
  "finADate": "2027-10-01",        // PàD — fin du planning de référence à date
  "finPrevisionnelle": "2027-11-01", // FP — calculée par le moteur
  "ecart": 1,                       // FP − PàD dans l'unité du projet (> 0 = retard)
  "ecartJours": 22,                 // même écart en jours ouvrés
  "avancement": 45,                 // % d'avancement physique global
  "actionPilotageRequise": true,    // CdC p. 12 : « Action de pilotage requise »
  "piFige": true,                   // false = projet encore en planification
  "parB2P": [                       // une entrée par B2P saisi (« T2Pi-1 »)
    { "date": "2026-10-05", "indexB2P": 1, "finADate": "2027-10-01",
      "finPrevisionnelle": "2027-10-01", "ecart": 0, "avancement": 2,
      "actionPilotageRequise": false }
  ],
  "lots": [                         // même ordre et même libellé que project.lots
    { "code": "LT01", "libelle": "Gros œuvre", "finPrevue": "2027-01-31",
      "glissement": 0.5, "glissementJours": 11, "avancement": 30 }
  ]
}
```

## Usage côté Cheetah Cost (proposé)

- Afficher, à côté du verdict coût de chaque B2P, l'écart délai de
  `parB2P[date]` : c'est la seconde lentille du **verdict combiné**.
- Rapprocher `lots[i]` de `project.lots[i]` (même index, même libellé) pour
  chiffrer le coût du glissement d'un lot.
- Considérer `actionPilotageRequise` comme une alerte du B2P.

Le test `npm run verify:fgf` vérifie l'aller-retour (export → ré-import) et la
lecture d'un fichier 1.0.0.
