# Fichier commun de la suite Cheetah (`.cheetahcost.json`)

Un projet, deux lentilles : le même fichier circule entre **Cheetah Cost**
(coûtenance) et **Cheetah Time** (délais), avec la même identité, les mêmes LT
et les **mêmes dates de B2P**.

## Référence : Cheetah Cost

**Cheetah Cost est la référence.** Cheetah Time écrit exactement son format
(`app: "CheetahCost"`, `schemaVersion: "1.0.0"`, type `Projet`) et applique
les mêmes règles :

- dates de B2P : les dates saisies priment, sinon la règle FGF — même
  résultat que `getProjectPlannedB2PDates` (vérifié sur 4 000 couples de dates) ;
- lots : premier niveau de la structure, codes et libellés conservés ;
- dates affichées au format jj/mm/aaaa, onglets dans le même ordre
  (Tableaux B2P, Alerte, Dates des B2P, Structure, Rapports).

`npm run verify:fgf` importe un vrai fichier Cheetah Cost
(`scripts/fixtures/cheetahcost-demo.json`) et vérifie qu'il ressort à
l'identique (lots, codes, dates de B2P, version).

## Extension Cheetah Time : `project.lentilleDelai`

Bloc propre à Cheetah Time, **ignoré par Cheetah Cost** (sa normalisation ne
garde que les champs qu'il connaît) : il ne change rien côté coût et sert à
l'aller-retour Time → fichier → Time.

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

## Si Cheetah Cost veut un jour afficher le délai (facultatif)

Un patch optionnel existe (non appliqué, Cheetah Cost restant la référence) :
conserver `lentilleDelai` à la normalisation et l'afficher dans l'onglet
Alerte comme seconde lentille d'un verdict combiné.
