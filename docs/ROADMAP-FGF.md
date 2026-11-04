# Cheetah Time — Roadmap produit FGF

> **Vision** : le système d'exploitation FGF de la maîtrise d'ouvrage française.
> **Une méthode (FGF), un rythme (les B2P), deux lentilles** — le coût (Cheetah Cost)
> et le délai (Cheetah Time) sur la même donnée et les mêmes jalons.
> Cibles : maîtrise d'ouvrage publique, bailleurs sociaux, ETI BTP, AMO/OPC.

## Principe directeur
- On reste **FGF · maîtrise d'ouvrage · marché public · français**.
- On ne court **pas** après MS Project / Primavera sur les features génériques.
- Simplicité pour le patron pressé **+** rigueur pour le coûteneur expert.

---

## Déjà livré (socle actuel)
- Vocabulaire FGF de Coûtenance + couleurs sémantiques partagées.
- Vue Direction (verdict en 10 s), simulateur what-if (coût du glissement), palette ⌘K, mode réunion.
- Flux de création façon CheetahCost : projet (nom, phase, dates) → **Lots de Tâches** → **dates de B2P** générées par la règle FGF (identiques à Cheetah Cost).
- **BàD piloté par les LT**, calendrier des bilans B2P.
- **Bilan planning B2P** (lentille durée) : revue par lot + note de bilan éditable.
- Démo française BTP, tests `verify:fgf`.

---

## H1 — Solidifier la suite (priorité)

| # | Chantier | Effort | Impact | Pourquoi |
|---|----------|--------|--------|----------|
| 1 | **« Un projet, deux lentilles »** : interop réelle Time ⇄ Cost (format `.cheetahcost.json` partagé, B2P/lots = une seule source) | M | 🔥🔥🔥 | Le moat : indéboulonnable sans la méthode FGF + les 2 modules |
| 2 | **Rapport de B2P (R2P)** : livrable coût + délai qualité marché public | M | 🔥🔥 | Ce qui se pose sur la table en commission |
| 3 | **Persistance Postgres + audit/versions multi-utilisateur** | M-L | 🔥🔥 | Traçabilité = non négociable en marché public |

## H2 — Approfondir la décision

| # | Chantier | Effort | Impact |
|---|----------|--------|--------|
| 4 | **Marché public natif** : phasage CCAP/CCTP, planning contractuel, exports OPC, jalons contractuels, pénalités | L | 🔥🔥🔥 |
| 5 | **Tour de contrôle PMO** (portefeuille) : qui doit faire son B2P, qui a dérivé | M | 🔥🔥 |
| 6 | **Scénarios correctifs FGF** au B2P (côté délai, façon T2P i-2j) | M | 🔥🔥 |
| 7 | **Risques quantifiés** reliés au Monte Carlo + provision pour aléas (PTO) | M | 🔥 |

## H3 — Étendre la portée

| # | Chantier | Effort | Impact |
|---|----------|--------|--------|
| 8 | **Terrain / mobile** : saisie d'avancement chantier (conducteur de travaux) alimentant le B2P | L | 🔥🔥 |
| 9 | **White-label AMO** : revente par les AMO à leurs clients (déjà ébauché) | S | 🔥 |
| 10 | **Benchmark données** : « vos lots techniques glissent 20 % de plus que la médiane » | L | 🔥 (long terme) |

*Effort : S < M < L. Impact : 🔥 = utile → 🔥🔥🔥 = différenciant.*

---

## Modèle commercial
- Atterrir par **Time _ou_ Cost**, étendre à la **suite** (le B2P partagé = crochet de cross-sell).
- Tarification par projet / par B2P actif ; **white-label** pour les AMO.

## Dette à traiter
- Étendre le schéma Prisma : `phase`, `b2pDates`, `b2pNotes`, `budgetAmount` (LT) — aujourd'hui persistés en mode local uniquement.
