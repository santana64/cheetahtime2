# Cheetah Time — Cahier des charges François (CST · CdC-10 · FG 2026-08-17)

> Transcription fidèle du document scanné de 23 pages (écrans CheetahCost annotés
> à la main + logique manuscrite au crayon). Les passages incertains sont notés
> `[?]` ou `[illisible]`. Les captures d'écran sont décrites, les annotations
> manuscrites sont retranscrites. Objet : faire évoluer **Cheetah Time** (lentille
> délai) à partir de **CheetahCost** (lentille coût).

---

## Page 1 — Page d'accueil

**Écran (capture CheetahCost)** : fenêtre « CheetahCost — Méthode FGF de Coûtenance ».
- Barre latérale sombre : **Accueil**, **Projets en cours**, **Nouveau projet**, **Tous les projets**, **Tableau de bord PMO** ; mention « Sauvegarde automatique sur ce poste ».
- Centre : logo CheetahSoft, « Logiciel de Coûtenance — Maîtrise des Coûts des Projets », marque « CheetahCost ».
- 4 cartes d'action : **Projets en cours** (Reprendre un projet actif), **Nouveau projet** (Créer un projet et sa structure budgétaire), **Tous les projets** (Parcourir et ouvrir un projet existant), **Tableau de bord PMO** (Vue portefeuille : santé, écarts, échéances).

**Annotations (manuscrit)** : « **Time** », « **Planification** », « **Délais** », « Time ».
→ Adapter cet écran pour **CheetahTime** : « Logiciel de Planification / Maîtrise des Délais » au lieu de coûtenance ; « structure des tâches » au lieu de « structure budgétaire ».

---

## Page 2 — Nouveau projet

**Écran (capture)** : « Nouveau projet — Dates saisies en français (exemple : 02/03/20xx = 2 mars 20xx) », bouton **Annuler**.
- Bloc **Identité du projet** (Nom, durée et phase) : **Nom du projet\*** (ex : Programme Atlas — Modernisation SI), **Phase** (Réalisation), **Date de début** 14/08/2026, **Date de fin** 14/08/2026.
- Bloc **Unités de coût** (Type, monnaie, TVA, valeur) : Type d'unité = Unité monétaire, Monnaie = EUR, HT/TTC = HT — Hors Taxes, Mode de valeur = Courant(e), Coûts = Encouru, Précision décimale des montants (Entier / 0,0 / 0,00). Pied : « 0 B2P planifiés après B2P0 · 1 LB — 0 EUR HT, courant(e) », boutons **Annuler** / **Créer le projet →**.

**Annotations (manuscrit)** :
- **Date de début** : « dépend de l'action désirée ». **Date de fin** : « initiale ».
- « **À changer** » → **Unités de coût** devient **Unités de temps**.
- **Type d'unité** : au lieu de monétaire, choisir parmi **heure / jours / semaine / mois**.
- Tout le bloc coût (Monnaie EUR, HT/TTC, Mode de valeur, Coûts Encouru) est **barré d'une croix** = supprimé pour CheetahTime.
- **Nouveau champ « Action désirée »** avec 3 options :
  1. **Estimation Durée de la phase suivante** ✓ (coché)
  2. **Estimation Durée de la phase en cours**
  3. **Pilotage du Temps de la phase en cours**
- Règle : « Selon le choix ci-dessus, il y a **3 suites différentes (A, B, C)**. En phase **Réalisation**, le **1er choix n'est pas possible** (écriture en gris clair). » (le cas de référence détaillé ensuite = *Estimation Durée de la phase suivante*).

---

## Page 3 — Cas A · « Estimation Durée de la phase suivante » (A1)

**Manuscrit (logique de saisie des LT)** :
- En-tête : **Cas A1 — Estimation Durée de la phase suivante**. « Date de début … ou Date de fin (saisie d'une seule date possible) ».
- **Structure des Tâches (LT)** : colonnes **code** / **libellé** (ex : `PT1` = Provision de Temps 1 ; colonne **Durée**). Bouton **« Ajouter un LT »**.
- Quand je clique sur **Ajouter un LT**, je peux saisir :
  - `LT01`, le **libellé**, le **code du prédécesseur**\*, le **type de lien**\*\* (**FD / DD / FF / DF**).
  - \* Il peut y avoir **plusieurs prédécesseurs** à un LT.
  - \*\* Le **type de lien** est à indiquer **pour chaque prédécesseur**.
- **Suite 1** : le **délai sur lien**\*\*\*, la **date imposée**\*\*\*\*, le **Type**\* (5\*).
  - \*\*\* **Valeur numérique** dont l'unité est l'unité choisie (ex : 10 ou 50).
  - \*\*\*\* **Date imposée** — plusieurs contraintes possibles pour un même LT : « **ne pas commencer avant le / après le** », « **ne pas finir avant le / après la** » → saisie d'une date si activé.
  - **Type** (menu) : **Durée / Charge / Intensité**. (5\*) : **un seul choix possible**.
- **Suite 2** : **Durée** (6\*) · **Ressources** (7\*) · **Charge** (8\*) · **Intensité** (9\*).
  - 6\* Si **Type = Durée** : saisie possible d'un **nombre**, d'unité de temps = celle choisie au début. Si **Type ≠ Durée** : saisie impossible.
  - 7\* **Ressources** : choisir une ou des ressources parmi celles déjà saisies, ou saisir de **nouvelles ressources** puis les sélectionner.
  - 8\* Si **Type = Charge** : saisie possible d'un **nombre** ; l'unité de charge est par ex. **personne × jour** (unité de temps choisie).
  - 9\* Si **Type = Intensité** : saisie possible ; unité d'intensité, ex : **0,5 personne** ou **1 personne** … (unité de temps choisie).

---

## Page 4 — Cas A2 · calcul Durée / Charge / Intensité, plannings & chemins

> *(« CST » dans le manuscrit = l'application Cheetah Time.)*

**A2 — Si Type = Charge**, CST calcule la **Durée** par la division :
```
        Charge saisie de la Ressource déclarée
Durée = ───────────────────────────────────────────────
        Intensité de cette Ressource disponible pour ce projet   (voir A3 ci-après)
```
- **Exemple** : Charge = 10 soudeur×jour ; Ressource soudeur, Intensité disponible
  pour le projet = 2 soudeurs → Durée = 10 (soudeur·jour) / 2 (soudeurs) = **5 jours**.

**Si Type = Intensité**, CST **vérifie que le LT a deux prédécesseurs** : l'un en
**DD ou FD** et l'autre en **DF ou FF**, pour que le LT soit **limité dans le temps**.
Si ce n'est pas le cas, CST ouvre une fenêtre pour indiquer le(s) lien(s) manquant(s).
CST **autorise de ne pas avoir de réponse**.

**Génération du planning** : toutes ces saisies faites, on demande un **planning**.
Le planning se **cale sur la date choisie** (début ou fin). CST fournit **2 plannings
de Gantt** et remplit **Marge Totale** et **Marge Libre** pour chaque LT :
- **avant nivellement** (1er planning) ;
- **après nivellement** (2e planning).

CST indique :
- **en trait épais** le(s) **chemin(s) critique(s)** (MT mini) ;
- **en pointillés épais** le(s) **chemin(s) pseudo-critique(s)** : **MT < ~1,3 × MT mini**
  — ce **coefficient (1,3) est au choix du planificateur**.

---

## Page 5 — Cas A4 · plannings & diagrammes de charges (avant/après nivellement)

**Planning avant nivellement** — CST prend en compte : les **LT**, les **liens**, les
**délais sur liens**, les **dates imposées**, les **Durées**. On obtient un planning
représenté par un **diagramme de Gantt** (croquis : lignes LT avec barres sur un axe
temps).

CST fournit les **diagrammes de charges générées** sur **chaque Ressource utilisée**
par le projet (croquis : profil en escalier « charges générées » avec un repère à
**1** et **0** = l'**intensité affectée au projet**, ligne de capacité).

**Planning après nivellement** — CST **décale des tâches** pour **supprimer les
surcharges** qui apparaissent sur les diagrammes de charges → **nouveau planning** →
**nouveaux diagrammes de charges**.

> Note de François : « **Voir le cas complexe sportif comme exemple.** » (exemple
> travaillé, cf. pages suivantes).

---

## Page 6 — Cas B1 · « Pilotage du Temps de la phase en cours »

> *(CSC = CheetahCost ; CST = Cheetah Time.)*
> *(Un 1er paragraphe est **barré** : reprise de la liste des plannings faits en A,
> options envisagées, plannings après nivellement.)*

- **Soit** on déclare le planning fait en A comme **PI (Planning Initial)**.
- **Soit** on **modifie / ajoute des LT** … et on obtient un nouveau planning qu'on
  **déclare PI**.
- Cela conduit à : **Date de début** … **Date de fin Initiale**, et à une **liste de
  LT de référence**.
- Les **B2P sont calculés comme dans CheetahCost**, grâce aux dates. Ils apparaissent
  sur **l'axe des abscisses** du planning de Gantt (comme dans CheetahCost, courbes en S).
  Le **planning PI correspond au B2P0**.
- On peut ensuite demander de **passer au B2P1**. Il faut alors indiquer :
  - pour les **LT commencés** : la **date de début** × la **prévision de fin** ;
  - pour les **LT finis** : la **date de fin** ;
  - d'éventuels **nouveaux LT** (avec toutes les infos indiquées en « A1 ») ;
  - pour les **PT1, PT2 non franchis** : une **nouvelle durée**.

---

## Page 7 — Cas B2 · PI → PàD, double planning, scénarios correctifs

- Si nécessaire, il faut faire passer le **PI** au **PàD** (**Planning à Date** =
  le planning de référence à date). La **PT1 (Provision de Temps 1)** — ou PT1, PT2,
  etc. — sont en général **modifiées**. CST **replanifie**, sans et avec nivellement.
  Le planning après nivellement est le **PàD**.
- Sur le planning de Gantt, **dès le B2P1**, on voit (**double planning**) :
  - **en noir** : le **PàD** ;
  - **en rouge** : les **LT commencés** (et éventuellement finis) ;
  - **en vert** : les **fins de LT commencés** et les **LT non commencés** ;
  - **chemin critique** (trait épais) et **pseudo-critique** (pointillés).
- **Lorsqu'un retard apparaît**, on recherche — comme pour les coûts — d'autres
  déroulements de la fin du projet pour **supprimer ou réduire ce retard**. On modifie
  la façon de faire :
  - **LT ajoutés / LT supprimés** ;
  - **LT modifiés** (liens modifiés, et/ou délais sur lien, et/ou **intensité des
    ressources disponibles** pour le projet…).
- Différents **jeux de LT et plannings correspondants** sont donc à **stocker** :
  **Planning de Pilotage de Projet au B2Pi**, après pilotage, **envisagés (−2j)** et
  **retenu (−2)**. *(Gestion de scénarios correctifs par B2P.)*

---

## Page 8 — Cas B3 · Rapport Périodique de Pilotage du Temps

Dans le **Rapport Périodique de Pilotage du Temps**, il y aura :
- **non pas** les Courbes en S (Méthode FGF côté coût),
- **mais le double planning** : **PàD** | **réalisé + reste-prévu** ;
- **et, au choix** :
  - **× le diagramme Jalons-Jalons** (croquis, axe commun aux courbes en S) :
    - **en noir** : jalons de référence **J0, J1, J2 … J6** ;
    - **en rouge** : dates réalisées aux **B2P0, B2P1, B2P2, B2P3** (« si on fait le B2P3 ») ;
    - **en vert** : jalons **prévus** (J2 … J6) ;
  - **× le diagramme Temps-Temps** — « **Voir exemple joint ci-après** ».

> Ce sont les équivalents « délai » des graphiques de coûtenance FGF (analogues au
> « T2P i-2j »). L'exemple travaillé (« cas complexe sportif ») est joint plus loin.

---

## Page 9 — Exemple imprimé · le diagramme « Temps/Temps » (© Robert SUCH 2004)

Diapositive de référence de la méthode FGF. **Diagramme Temps/Temps = courbe de suivi
des jalons (Milestone Trend Analysis / « slip chart »)** :
- **Axe X** = semaine de mesure (S1…S24, chaque B2P) ; **Axe Y** = semaine **prévue**
  du jalon (S1…S24) ; **diagonale à 45°** = jalon franchi (prévu = réalisé).
- Pour **chaque jalon** (J1, J2, J3, J4, J51, J52, J6), on trace l'évolution de sa
  **date prévue** à chaque état d'avancement : trait **horizontal** = tenu, trait qui
  **monte** = glissement, qui **descend** = jalon avancé.
- Légende de l'exemple (« Huitième état d'avancement en semaine 18 ») :
  « Jalons à franchir : **J51 semaine S19**, **J52 ramené en S20**, **J6 en semaine 22** ».

> À implémenter comme **nouveau graphique CheetahTime** (onglet Analyse ou Bilans B2P) :
> le suivi de tendance des jalons, un jalon par courbe, mesuré à chaque B2P.

---

## Page 10 — Cas C1 · « Estimation Durée de la phase en cours »

(Page quasi vide.) « On fait tout ce qui est indiqué en **A1 et A2**, puis tout ce
qui est indiqué en **B1 et B2**. »

> Donc le mode C réutilise entièrement les parcours A (structure + calcul planning)
> puis B (pilotage B2P). Pas de logique nouvelle propre à C.

---

## Page 11 — Nouveau projet (suite) · renommages LB→LT, unité mois

**Écran (capture, suite du Nouveau projet)** annoté :
- « Unité affichée dans les tableaux B2P : **EUR HT, courant(e)** · Type de coût :
  **Encouru** » → annoté **« mois »** (afficher l'unité de temps, pas de coût).
- **Structure budgétaire (LB)** → à renommer **« Structure des tâches (LT) »**
  (« Lignes budgétaires et budget initial »). Bouton **« Ajouter une LB »** →
  **« Ajouter un LT »**.
  - Ligne : CODE **PTO 1** → annoté **PT(1)** ; LIBELLÉ « Provision pour Tâches
    Oubliées » → annoté **« de Temps 1 »** (= **Provision de Temps 1**). Budget initial
    → annoté **« et beaucoup d'autres informations (voir A1) »** (durée, prédécesseurs,
    type, ressources…).
- **Planning B2P proposé** — « Dates de déclenchement selon la règle FGF »,
  « Réinitialiser FGF ». Cadence : « Toutes les 1 heure · Projet < 1,5 jour · 0 B2P +
  B2P0 ». **B2P0 — lancement** 14/08/2026.
- Pied : « 0 B2P planifiés après B2P0 · 1 LB — 0 EUR HT, courant(e) », Annuler /
  Créer le projet →.

> Renommages clés : **LB → LT**, **budgétaire → des tâches**, **EUR → unité de temps**,
> **PTO (Provision pour Tâches Oubliées) → PT (Provision de Temps)**.
> **DÉCIDÉ = PT** : François l'a lui-même annoté à la main sur le CdC (« PTO » barré →
> « PT(1) / de Temps 1 », « PT2, PT3… maxi 9 »). CheetahCost (lentille coût) garde « PTO » ;
> Cheetah Time (lentille délai) utilise « PT ». Implémenté ainsi — plus à confirmer.

---

## Page 12 — Tableaux B2P (capture CheetahCost annotée) · correspondance coût → délai

**Écran** : vue projet « Test260808-1 · En cours · Réalisation · Vert ·
17/08/2026 → 30/12/2029 ». Boutons : « Nouveau B2P i-1 », « Ouvrir », « LB », « Fichier ».

**Bandeau KPI — correspondance annotée coûtenance → délai** :
| Coûtenance (CheetahCost) | Devient (CheetahTime, délai) |
|---|---|
| **BàD** (Budget à Date initial) 2000 | **Fin Initiale (Fi)** — 14-08-2027 |
| **Budget à Date** 2050 | **Fin à Date (F-D / PàD)** — 28-08-2027 |
| **Dépenses** 1955 | **Date actuelle** — 5-10-2026 |
| **CP** (Coût Prévisionnel) 1955 | **Fin Prévisionnelle (FP)** — 21-08-2027 |
| **Écart** −95 (kEUR) | **Écart en mois** (glissement) — −0,25 mois |
| **Avancement** 100 % | **Avancement** — 45 % |

**Onglets** (à re-titrer côté délai) : « Planning B2P 16 » (→ **Planning**), « Alerte »,
« Dates des B2P 11 », « Structure 6 », « **Rapports de coûts** » → **« Rapports de
délais »**. **Nouveaux onglets manuscrits** : **« Ressources »** et **« Représentation
Potentiel-Tâche »** (le réseau potentiel-tâches).

**Cartes B2P** (« Créer le tableau B2P0 » / « Démarrer B2P suivant ») :
- **Référence initiale : B2P0** — BàD/Dépenses/CP/Écart, Avancement 0 %.
- **Prévision avant pilotage : T2P1-1** — « Action de pilotage **non requise** »,
  Écart 0, Avancement 2 %.
- **Prévision avant pilotage : T2P2-1** — « Action de pilotage **requise** », Écart
  **125 kEUR** (→ **en mois**), Avancement 6 %. Annotation : « **mois sur le Planning** ».

> Toute la vue « Tableaux B2P » est à transposer en lentille délai : mêmes cartes,
> mêmes statuts (action de pilotage requise / non requise), mais grandeurs = **dates
> et glissements** au lieu des euros. « T2P » = tableau de pilotage du temps (analogue
> du B2P coût).

---

## Page 13 — Onglet « Structure » (capture annotée) · budgétaire → durées

**Écran** : onglet **Structure** de « Test260814-T1 ». « Structure budgétaire · 5 lignes
budgétaires · EUR HT, courant(e) », « Décimales 0 », « Modifier les LB ».

Annotations :
- **« DONNÉES ÉCONOMIQUES »** → **« Unité de Temps »** (avec case à cocher). Le bloc
  Type d'unité (Monétaire) / Monnaie (EUR) / Type de coût (Encouru) / TVA (HT) est
  **entièrement barré**.
- Colonne **« BUDGET INITIAL »** → **« DURÉES »**.
- Lignes : LB01 MP (100), LB02 Déf (600), LB03 Fab (1 700), LB04 Cle (200), **PTO
  Provision pour Tâches Oubliées → « de Temps 1 »** (0). TOTAL BI 2 600 → **total des
  durées**.
- Manuscrit : « **Possibilité de créer PT2, PT3 etc. (maxi 9)** » → plusieurs
  **Provisions de Temps**, **maximum 9**.

---

## Page 14 — Comparaison CheetahCost ↔ wizard CheetahTime actuel (annoté « oui »)

Cette page superpose l'onglet **Structure de CheetahCost** (haut, « budgétaire » →
annoté « des Tâches (LT) », colonne budget barrée) et le **wizard actuel de Cheetah
Time** (bas — l'app déjà construite) :
- **3 · Lots de Tâches (LT)** : « Code, nom, durée (jours), prédécesseurs (type de lien
  + délai ±) et ressources avec intensité. » (+ LT / + PTO). → annoté **« Plus d'info »**
  = la ligne LT doit porter **davantage de champs** (Type Durée/Charge/Intensité, dates
  imposées… cf. A1).
- **4 · Jalons (J1…J9)** : « LT à durée nulle — 9 au maximum. » → annoté **« oui »** (OK).
- **5 · Tâches Hamac (TH)** : « Tâches de synthèse regroupant des LT. » → annoté
  **« oui »** (OK).
- Pied : « 1 LT · 1 PTO · 0 jalon · 0 TH · 1 ressource · 7 B2P + B2P0 ».

> Lecture : le **wizard actuel est validé dans sa structure** (Jalons, TH), mais la
> **saisie d'un LT doit être enrichie** des champs de A1 (Type, charge/intensité, dates
> imposées, plusieurs prédécesseurs typés).

---

## Page 15 — Exemple imprimé · « Représentation potentiel-tâches »

Diagramme de référence : la **représentation potentiel-tâches** (méthode MPM / potentiels).
- **Grille** : une **ligne par tâche** (A1, A2, A3, B1…B7, C), chaque tâche = un **petit
  rectangle** positionné horizontalement selon sa place dans l'enchaînement.
- **Flèches** reliant chaque tâche à ses successeurs (précédences).
- Lecture : B1 → A1 → A2 → A3, et B1 → B2/B3 → B4 → B5/B6 → B7 → C, etc.

> Réf. pour l'onglet **Potentiel-tâches** : François veut une **disposition en grille
> potentiel-tâches** (une tâche par ligne, positionnement horizontal + flèches), en
> plus/à la place du réseau PERT nœuds-liens actuel.

---

## Page 16 — Exemple imprimé (FGF Consultant / SKEMA) · Gantt & chemin critique

Diapositive « **5.3. Les Caractéristiques Fondamentales (4) — Chemin critique** »
(© FGF Consultant 2013-2014). **Gantt MS Project** de l'exemple fil-rouge (**« Marché
Génie Civil »**, projet type complexe) :
- Colonnes : **Task Name · Duration · Start · Finish · Prede(cesseurs) · Total Slack ·
  Free Slack · Resource**.
- Tâches : **A — Marché Génie Civil** (252 j) › A.1 Prép-Négo-Signat (1 mois),
  A.2 Réalisation gros œuvre (7 mois), A.3 Réalisation second œuvre (4 mois) ;
  **B — Management d'ensemble** (379 j) › B.1 Définition d'ensemble (2,9 mois),
  B.2 Sélection des équi. (4 mois), B.3 Commandes des équi. (2 mois), B.4 Réception et
  install. (6 mois), B.5 Test (1 mois), B.6 Préparation et répé. (1 mois),
  B.7 Inauguration (1 jour) ; **C — Marge** (1 mois).
- Prédécesseurs avec liens et délais : ex. « 6FS-1 mo », « 8;4FF+1 m », « 7FF »,
  « 11;13 », « 11.10 » (FS/FF + lags). Colonnes **Total Slack / Free Slack** renseignées.
- **Chemin critique en rouge**, hors-critique en bleu, jalons « 0 % ».

Annotations : « **en rouge** » (le critique) ; « **Nota : code couleur MS Project, ce
n'est pas celui de CheetahTime** » → **ne pas copier le code couleur MS Project** ;
CheetahTime garde **sa charte** (vert/orange).

---

## Page 17 — Exemple imprimé (FGF) · Planning Initial & double planning

Diapositive « **5.4. Le Processus d'établissement du Planning (2) — Planning Initial** ».
Même Gantt « Marché Génie Civil », illustrant le **Planning Initial**. Annotations :
« **Double planning** » et de nouveau « **Code couleur MS Project…** » (rappel : ne pas
reprendre les couleurs MS Project). Confirme l'exigence d'affichage **double planning**
sur le Gantt CheetahTime.

---

## Page 18 — Couverture · exemple de référence « Cas complexe sportif »

Couverture (rouge) d'un support de formation FGF Consultant / CPE Lyon :
« **Le métier de Chef de Projet — Maîtrise des Délais des Projets — Cas complexe
sportif (3) — Corrigé — Travaux Dirigés PO 01** », auteur **François Gagné**
(© FGF consultant 2002-2010, page 1/6).

Annotation : « **Dans cet exemple, il y a une Ressource : l'équipe projet.** »

> Les pages suivantes (2/6 → 6/6) déroulent ce **corrigé** : c'est l'**exemple de
> référence** attendu pour valider CheetahTime (planning, charges, jalons, temps-temps).

---

## Page 19 (2/6) — Énoncé · « Projet de construction d'un complexe sportif »

Une université décide de se doter d'un nouveau complexe sportif ; on établit le
**référentiel calendaire**. Les tâches, durées et liens sont fournis (annexe 1). Le
complexe doit être prêt pour la rentrée 200n+1 : **inauguration prévue le 1er octobre**.
Le projet **ne peut pas démarrer avant le 1er avril 200n** (réunion du CA).

**Questions (le workflow complet attendu de CheetahTime)** :
1. Faites la **représentation « potentiel-tâches »**.
2. Tracez le **planning de Gantt** pour une **planification au plus tôt**.
3. Avec une autre couleur, même tracé pour une **planification au plus tard** ;
   déduisez, pour les tâches non critiques, la **Marge Libre** et la **Marge Totale**
   (en mois).
4. Les **commandes d'équipements (tâche B3)** ne peuvent pas être passées avant le
   1er octobre 200n → **date imposée**. Conséquences ? Nouveau Gantt fléché, nouvelles
   marges.
5. Les tâches de **management (Bi)** sont faites par **l'équipe projet** (dispo limitée) ;
   durées estimées pour une **intensité de ressource = 1** (chaque tâche mobilise toute
   l'équipe). Tracez le **diagramme des charges** de l'équipe. (B3 débute le 1-10-200n.)
6. **Nivellement par les charges** → diagramme des charges obtenu, puis Gantt au plus
   tôt. Pour tenir l'inauguration, on **réduit la provision calendaire** : la **durée
   de la tâche C est ramenée à 1 mois**.
7. Après nivellement, **que devient le chemin critique** ? Avis sur la future maîtrise
   des délais ?

> C'est **l'exemple de recette de CheetahTime** : potentiel-tâches, Gantt au plus tôt /
> au plus tard, marges libre/totale, date imposée (B3), diagramme de charges,
> nivellement, réduction de provision (C), chemin critique après nivellement.

---

## Page 20 (3/6) — ANNEXE 1 · Tâches du projet (jeu de données de référence)

| Code | Intitulé | Durée (mois) | Prédécesseur | Type de lien | Décalage |
|------|----------|:---:|------|------|------|
| **A** | Marché Génie Civil | — | | | |
| A1 | Préparation / Négociation / Signature contrat | 1 | B1 | FD | **−1 mois** |
| A2 | Réalisation gros œuvre | 7 | A1 | FD | |
| A3 | Réalisation second œuvre | 4 | A2 | FD | |
| **B** | Management d'ensemble | — | | | |
| B1 | Définition d'ensemble (salles, rangement, vestiaires) | 3 | — | — | |
| B2 | Sélection des équipements | 4 | B1 | FD | |
| B3 | Commandes des équipements | 2 | B2 | **DD et FF** | |
| B4 | Réception et installation des équipements | 6 | B3 ; A3 | FD ; **FF** | ; **1 mois** |
| B5 | Test des différentes configurations d'utilisation | 1 | B4 | FD | |
| B6 | Préparation et répétition du spectacle inaugural | 1 | B4 | FD | |
| B7 | Inauguration | 0 | B6 ; C | FD ; FD | |
| C | Marge | **2 \*** | B5 ; B6 | FD ; FD | |

\* Durée de C **ramenée à 1 mois après nivellement**.

**Légende des liens** : **FD** = Fin à Début · **DD** = Début à Début · **FF** = Fin à Fin.

> Jeu de données à intégrer comme **projet de démonstration / test de recette** de
> CheetahTime (liens multiples typés, décalages ±, double lien DD+FF sur B3, FF+1 mois
> sur B4, jalon B7 à durée 0, marge C).

---

## Page 21 (4/6) — ANNEXE 2 · Corrigé Q1-Q3

- **Q1 — Représentation potentiel-tâches** : « Il est recommandé de respecter la
  présentation donnée en exemple. » (Grille = une tâche par ligne + flèches, cf. page 15.
  Solution pour A1…A3, B1…B7, C.)
- **Q2 — Planning de Gantt** : tâches A1…C en lignes, axe temps **1/4/n → 1/10/n+1**.
  **Légende : Planification au plus tôt (trait plein) / au plus tard (pointillé)** —
  double tracé sur le même Gantt.
- **Q3 — Marges des tâches non critiques** (en mois) :
  - **B2 : ML = 0 ; MT = 2 mois**
  - **B3 : ML = 2 mois ; MT = 2 mois**

> Valide le calcul **Marge Libre / Marge Totale** de CheetahTime et l'affichage
> **au plus tôt / au plus tard** sur le Gantt.

---

## Page 22 (5/6) — ANNEXE 3 · Corrigé Q4-Q5

- **Q4 — Conséquences de la date imposée sur B3** (commandes ≥ 1-10-n) :
  **« Seule la tâche B3 est décalée. »** → **Planning de Gantt fléché** (au plus tôt).
  Nouvelles marges :
  - **B2 : ML = 1 mois ; MT = 2 mois**
  - **B3 : ML = 1 mois ; MT = 1 mois**
- **Q5 — Diagramme des charges de l'équipe projet** : histogramme d'**intensité**
  (axe Y : 0 · 0,5 · 1 · 1,5 · 2 · 2,5). Les blocs B1, B2, B3, B4, B5, B6 se superposent
  par endroits → **pics à 1,5 = surcharges** (intensité > 1 sur l'équipe) à résorber par
  nivellement.

> Valide : **date imposée** (SNET sur B3) qui ne décale que la tâche concernée +
> recalcul des marges, et le **diagramme de charge par ressource** avec détection de
> surcharge (> capacité).

---

## Page 23 (6/6) — ANNEXE 4 · Corrigé Q6-Q7

- **Q6 — Après nivellement** :
  - **Planning de Gantt après nivellement** (au plus tôt) : tâches réordonnées, sans
    surcharge.
  - **Diagramme des charges de l'équipe après nivellement** : profil **nivelé**
    (intensité ≤ capacité, plus aucun pic > 1 ; B1…B6 séquencés).
- **Q7** :
  - **Chemin critique après nivellement : « Toutes les tâches sont critiques. »**
    (après nivellement + réduction de C à 1 mois).
  - **Avis sur la maîtrise des délais : « Sera difficile car C réduite pour respecter
    la date de fin du projet »** (plus de provision/marge → pilotage tendu).

---

# Synthèse — ce que le CdC demande pour Cheetah Time

**Positionnement** : Cheetah Time = jumeau « délai » de CheetahCost. **Même méthode
FGF, même rythme B2P, mêmes écrans**, mais tout ce qui est **coût/€** devient
**durée/temps**.

**1. Nouveau projet**
- Remplacer **« Unités de coût » → « Unités de temps »** (heure / jours / semaine / mois) ;
  **supprimer** monnaie, HT/TTC, mode de valeur, type de coût.
- Ajouter le sélecteur **« Action désirée »** à 3 modes → 3 parcours :
  **A** = Estimation Durée de la phase suivante · **B** = Pilotage du Temps de la phase
  en cours · **C** = Estimation Durée de la phase en cours (= A puis B). En phase
  **Réalisation**, le mode A est **grisé**.
- Renommer **« Structure budgétaire (LB) » → « Structure des tâches (LT) »**,
  **« Ajouter une LB » → « Ajouter un LT »**, colonne **« Budget initial » → « Durées »**,
  **PTO → PT (Provision de Temps)**, **PT1…PT9 max**.

**2. Saisie d'un LT (parcours A1)** — enrichir la ligne LT :
- code, libellé, **plusieurs prédécesseurs** chacun **typé** (FD/DD/FF/DF) + **délai sur
  lien** (± en unité choisie) ;
- **dates imposées** (ne pas commencer avant/après, ne pas finir avant/après) ;
- **Type = Durée / Charge / Intensité** (un seul) :
  - Durée → saisie d'un nombre (unité de temps) ;
  - Charge → nombre en **ressource × unité** ; CST calcule Durée = Charge / Intensité dispo ;
  - Intensité → exige **2 prédécesseurs** (un DD/FD + un DF/FF) pour borner le LT.

**3. Planning (parcours A2/A4)**
- **Deux Gantt** : **avant** et **après nivellement**, calés sur la date choisie
  (début ou fin) ; **Marge Totale / Marge Libre** par LT.
- **Chemin critique** (trait épais) + **pseudo-critique** (pointillés, MT < ~1,3 × MT mini,
  coefficient réglable).
- **Diagrammes de charges** par ressource (intensité vs capacité) ; **nivellement** =
  décaler pour supprimer les surcharges → nouveau Gantt + nouvelles charges.
- **Ne pas** reprendre le **code couleur MS Project** ; garder la **charte Cheetah**.

**4. Pilotage B2P (parcours B)**
- Déclarer le planning en **PI (= B2P0)**, puis avancer **B2P par B2P** (LT commencés :
  début + prévision de fin ; LT finis : date de fin ; nouveaux LT ; durées PT).
- Passage **PI → PàD (Planning à Date)** ; **double planning** sur le Gantt
  (**noir** = PàD, **rouge** = LT commencés, **vert** = fins prévues + LT non commencés).
- **Scénarios correctifs** stockés par B2P (envisagés / retenu).
- **Rapport Périodique de Pilotage du Temps** : double planning + au choix le
  **diagramme Jalons-Jalons** et le **diagramme Temps/Temps** (suivi de tendance des
  jalons — MTA / slip chart).

**5. Vue « Tableaux B2P »** — transposer la coûtenance en délai :
BàD → **Fin Initiale**, Budget à Date → **Fin à Date (PàD)**, Dépenses → **Date
actuelle**, CP → **Fin Prévisionnelle**, Écart (€) → **Écart en mois** ; onglet
« Rapports de coûts » → **« Rapports de délais »** ; **nouveaux onglets** « Ressources »
et « Représentation Potentiel-Tâche ».

**6. Onglet Potentiel-tâches** — proposer une **représentation en grille potentiel-tâches**
(une tâche par ligne + flèches), façon méthode MPM.

**7. Exemple de recette** — le **« Cas complexe sportif »** (annexe 1, pages 20-23) est
le **jeu d'essai officiel** : à saisir dans Cheetah Time et à faire correspondre au
corrigé (potentiel-tâches, Gantt tôt/tard, marges, date imposée B3, charges,
nivellement, C ramené à 1 mois, « toutes les tâches critiques »).

**Décisions tranchées (sans attendre François, cohérence des deux lentilles)** :
- **« PT » (Provision de Temps)** — décidé par l'annotation manuscrite de François lui-même ;
  CheetahCost garde « PTO » côté coût. **Fait.**
- **Modes « Action désirée » A/B/C** — libellés retenus tels qu'implémentés dans le wizard.
- **Coefficient pseudo-critique = 1,3×** la plus petite marge positive — valeur par défaut
  retenue (near-critical path), ajustable dans le code si besoin.

> *Transcription établie à partir du scan `1 CST - CdC-10 - FG260817.pdf` (23 pages).
> Passages manuscrits au crayon : lecture au mieux, quelques termes approximés.*

