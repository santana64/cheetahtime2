# Cheetah Time — contrat de design

## Concept
Cockpit de pilotage FGF pour maîtrise d'ouvrage / marché public. Densité utile,
vocabulaire métier (LT, B2P, BàD, VA, CP, SPI/CPI), lecture « patron pressé » en
10 secondes puis approfondissement. **Ce que MS Project ne fait pas** : juger le
même projet, au même rythme (les B2P), sous **deux lentilles** simultanées —
délai *et* coût — avec un verdict unique.

## Palette (charte existante, à respecter)
- Vert profond `#1a4a20`, vert signature `#56a45b`, nuit `#0d1f10 / #0e2714`
- Orange signature `#f4a321` (accent, jamais décoratif seul)
- Surfaces claires : blanc sur canvas `oklch(0.978 0.008 85)`
- Tokens coût FGF : `--c-bad #111827`, `--c-va #3730a3`, `--c-cp #047857`,
  `--c-depenses #be123c`, `--c-ecart-pos #dc2626` (défavorable), `--c-ecart-neg #059669` (favorable)
- Niveaux d'état (une seule sémantique partout) :
  favorable `#56a45b` · vigilance `#f4a321` · tension `#e8842f` · critique `#e2424a`

## Typographie
- Manrope (`--font-sans`) pour titres et UI ; IBM Plex Mono (`--font-mono`) pour
  chiffres/dates denses (`tabular-nums`). Labels : 9–11px, uppercase, tracking 0.16–0.22em.

## Géométrie
- Rayons : `--radius 0.625rem` (xl ≈ 1.1rem pour panneaux). Bordures 1px douces.
- Barres d'accent verticales 3px (vert→orange). Hero sombre à « speed lines ».

## Signature du produit
**Le rail de rythme B2P** : timeline opérationnelle horizontale (B2P0…B2Pn)
positionnée aux vraies dates, marqueur « aujourd'hui », passés cochés, B2P courant
pulsé en orange. Au-dessus, les **deux lentilles** (délai/coût) avec jauge d'indice
centrée sur 1.0. Un seul verdict combiné en tête.

## États & accès
- Statut jamais porté par la seule couleur : toujours un label texte.
- Contraste AA sur fond sombre (texte blanc ≥ 70 %). Jauges avec `aria-label`.
- Responsive : lentilles empilées < 640px ; rail défilable horizontalement.
- `prefers-reduced-motion` respecté (réutilise les utilitaires globaux).

## Anti-patterns bannis ici
Pas de blobs/halos décoratifs sans fonction, pas de carte générique répétée pour
tout, pas de chiffre géant marketing sans contexte, pas de donnée factice.
