// Génère "Guide-Cheetah-Time-Francois.pdf" — document pédagogique, sans dépendance.
// PDF 1.4 écrit à la main (A4), polices Helvetica WinAnsi pour les accents FR.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ─── Métriques Helvetica (AFM, /1000) pour le retour à la ligne ─── */
const W = {
  " ":278,"!":278,'"':355,"#":556,"$":556,"%":889,"&":667,"'":191,"(":333,")":333,"*":389,"+":584,",":278,"-":333,".":278,"/":278,
  "0":556,"1":556,"2":556,"3":556,"4":556,"5":556,"6":556,"7":556,"8":556,"9":556,
  ":":278,";":278,"<":584,"=":584,">":584,"?":556,"@":1015,
  "A":667,"B":667,"C":722,"D":722,"E":667,"F":611,"G":778,"H":722,"I":278,"J":500,"K":667,"L":556,"M":833,"N":722,"O":778,"P":667,"Q":778,"R":722,"S":667,"T":611,"U":722,"V":667,"W":944,"X":667,"Y":667,"Z":611,
  "[":278,"\\":278,"]":278,"^":469,"_":556,"`":333,
  "a":556,"b":556,"c":500,"d":556,"e":556,"f":278,"g":556,"h":556,"i":222,"j":222,"k":500,"l":222,"m":833,"n":556,"o":556,"p":556,"q":556,"r":333,"s":500,"t":278,"u":556,"v":500,"w":722,"x":500,"y":500,"z":500,
  "{":334,"|":260,"}":334,"~":584,
  "\x9c":944,"\x8c":1000,
};
const BASE = { "à":"a","â":"a","ä":"a","é":"e","è":"e","ê":"e","ë":"e","ï":"i","î":"i","ô":"o","ö":"o","ù":"u","û":"u","ü":"u","ç":"c","ÿ":"y","À":"A","Â":"A","É":"E","È":"E","Ê":"E","Ô":"O","Û":"U","Ç":"C","«":"o","»":"o","°":"o","\x95":"o" };
function cw(ch){ if (W[ch] != null) return W[ch]; const b = BASE[ch]; if (b) return W[b]; return 556; }
function strW(s, size){ let t = 0; for (const ch of s) t += cw(ch); return (t * size) / 1000; }

/* ─── Sanitation : tout ramener dans WinAnsi (latin1) ─── */
function san(s){
  return String(s)
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/[→➔⇄➤➙]/g, "->")
    .replace(/€/g, "EUR")
    .replace(/•/g, "\x95")
    .replace(/œ/g, "\x9C").replace(/Œ/g, "\x8C")
    .replace(/[✓✔]/g, "(ok)")
    .replace(/[^\x00-\xFF]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}
function esc(s){ return san(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }

/* ─── Couleurs ─── */
const GREEN = "0.102 0.290 0.125";
const DGREEN = "0.16 0.34 0.20";
const ORANGE = "0.957 0.639 0.129";
const BODY = "0.13 0.16 0.20";
const MUT = "0.42 0.45 0.50";
const WHITE = "1 1 1";

/* ─── Page model ─── */
const LM = 56, RM = 56, RIGHT = 595 - RM, UW = 595 - LM - RM, TOP = 788, BOT = 74;
const pages = [];
let cur = null, y = 0;

function emitText(pg, font, size, color, x, yy, str){
  pg.txt.push(`${color} rg`, `/F${font} ${size} Tf`, `1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm`, `(${esc(str)}) Tj`);
}
function rect(pg, color, x, yy, w, h){ pg.gfx.push(`${color} rg`, `${x} ${yy} ${w} ${h} re`, "f"); }
function line(pg, color, lw, x1, y1, x2, y2){ pg.gfx.push(`${color} RG`, `${lw} w`, `${x1} ${y1} m`, `${x2} ${y2} l`, "S"); }

function header(pg){
  emitText(pg, 2, 8, ORANGE, LM, 808, "CHEETAH TIME");
  emitText(pg, 1, 8, MUT, LM + 78, 808, "Guide utilisateur - methode FGF");
  line(pg, "0.86 0.88 0.86", 0.8, LM, 802, RIGHT, 802);
}
function newPage(){ cur = { gfx: [], txt: [] }; pages.push(cur); header(cur); y = TOP; }
function ensure(h){ if (y - h < BOT) newPage(); }

/* ─── Wrapping ─── */
function wrap(text, size, maxW){
  const words = san(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words){
    const trial = line ? line + " " + w : w;
    if (strW(trial, size) <= maxW || !line){
      if (strW(w, size) > maxW && !line){
        let chunk = "";
        for (const ch of w){
          if (strW(chunk + ch, size) > maxW){ lines.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        line = chunk;
      } else line = trial;
    } else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/* ─── Blocs ─── */
function h1(eyebrow, title){
  ensure(60); y -= 12;
  emitText(cur, 2, 8.5, ORANGE, LM, y, eyebrow.toUpperCase()); y -= 16;
  for (const ln of wrap(title, 17, UW)){ ensure(20); emitText(cur, 2, 17, GREEN, LM, y, ln); y -= 21; }
  y -= 1; rect(cur, GREEN, LM, y, 60, 2.4); rect(cur, ORANGE, LM + 66, y, 26, 2.4); y -= 16;
}
function h2(title){
  ensure(30); y -= 9;
  for (const ln of wrap(title, 12.5, UW)){ ensure(16); emitText(cur, 2, 12.5, GREEN, LM, y, ln); y -= 16; }
  y -= 3;
}
function h3(title){
  ensure(22); y -= 5;
  emitText(cur, 2, 10.5, DGREEN, LM, y, title); y -= 14;
}
function p(text){
  const lead = 13.6;
  for (const ln of wrap(text, 10, UW)){ ensure(lead); emitText(cur, 1, 10, BODY, LM, y, ln); y -= lead; }
  y -= 3;
}
function bullet(text){
  const lead = 13.6, lines = wrap(text, 10, UW - 20);
  lines.forEach((ln, i) => {
    ensure(lead);
    if (i === 0) emitText(cur, 2, 10, ORANGE, LM + 4, y, "\x95");
    emitText(cur, 1, 10, BODY, LM + 20, y, ln); y -= lead;
  });
  y -= 1;
}
function kv(label, value){
  const lead = 13.4, labelW = 116, valX = LM + 124, valW = RIGHT - valX;
  const L = wrap(label, 9.6, labelW), V = wrap(value, 10, valW), n = Math.max(L.length, V.length);
  ensure(n * lead + 2);
  for (let i = 0; i < n; i++){
    if (L[i]) emitText(cur, 2, 9.6, DGREEN, LM, y, L[i]);
    if (V[i]) emitText(cur, 1, 10, BODY, valX, y, V[i]);
    y -= lead;
  }
  y -= 3;
}
function note(text){
  const lead = 12.9, lines = wrap(text, 9.6, UW - 24), boxH = lines.length * lead + 12;
  ensure(boxH + 4);
  const top = y + 3;
  rect(cur, "0.985 0.94 0.84", LM, top - boxH, UW, boxH);
  rect(cur, ORANGE, LM, top - boxH, 3, boxH);
  y = top - 15;
  for (const ln of lines){ emitText(cur, 3, 9.6, "0.44 0.30 0.05", LM + 13, y, ln); y -= lead; }
  y = top - boxH - 7;
}
function sp(a){ y -= a; }

/* ════════════════ COUVERTURE ════════════════ */
const dateStr = new Date(2026, 5, 19).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
const cover = { gfx: [], txt: [] };
pages.push(cover);
rect(cover, GREEN, 0, 548, 595, 294);
rect(cover, ORANGE, 0, 540, 595, 8);
rect(cover, "0.34 0.64 0.36", 0, 836, 595, 6);
emitText(cover, 2, 9, ORANGE, 56, 752, "GUIDE UTILISATEUR - MÉTHODE FGF");
emitText(cover, 2, 37, WHITE, 54, 700, "Cheetah Time");
emitText(cover, 1, 16, "0.90 0.94 0.90", 56, 668, "Le guide complet et pédagogique");
rect(cover, "0.42 0.70 0.45", 56, 648, 42, 3);
rect(cover, ORANGE, 102, 648, 18, 3);
emitText(cover, 3, 11, "0.88 0.92 0.88", 56, 624, "Une méthode (FGF) - un rythme (les B2P) - une lentille (le délai).");
emitText(cover, 2, 12.5, GREEN, 56, 506, "Préparé pour : François");
emitText(cover, 1, 10.5, BODY, 56, 484, "Objet : comprendre chaque onglet et le parcours utilisateur, pas à pas.");
emitText(cover, 1, 10.5, BODY, 56, 466, "Périmètre : 7 écrans globaux + 12 onglets projet + le parcours de A à Z.");
emitText(cover, 1, 10, MUT, 56, 444, "Édité le " + dateStr + ".");
emitText(cover, 2, 11, GREEN, 56, 406, "Au sommaire");
const toc = [
  "1.  L'idée en une phrase",
  "2.  Le vocabulaire essentiel",
  "3.  Se repérer : les deux barres de menu",
  "4.  Le parcours type, de A à Z",
  "5.  Les écrans globaux (la barre du haut)",
  "6.  L'assistant Nouveau projet (6 étapes)",
  "7.  Les 12 onglets du projet, un par un",
  "8.  Les petits plus qui font gagner du temps",
  "9.  Un scénario concret de bout en bout",
];
let ty = 384;
for (const t of toc){ emitText(cover, 1, 10.5, BODY, 64, ty, t); ty -= 17; }
line(cover, "0.80 0.83 0.80", 0.8, 56, 70, RIGHT, 70);
emitText(cover, 1, 9, MUT, 56, 54, "CheetahSoft - Project Management Software");
emitText(cover, 1, 9, MUT, RIGHT - 64, 54, "Cheetah Time");

/* ════════════════ CONTENU ════════════════ */
newPage();

h1("Section 1", "L'idée en une phrase");
note("Une méthode (FGF), un rythme (les B2P), une lentille (le délai).");
p("Cheetah Time est le module délai / planning de la suite. Son frère, Cheetah Cost, regarde exactement la même donnée mais par la lentille du coût. Les deux partagent les mêmes points d'étape B2P : c'est ça, le secret de la suite - un seul projet, deux paires de lunettes pour le regarder.");
p("Concrètement, le logiciel fait quatre choses pour vous :");
bullet("Vous DÉCRIVEZ votre projet (les lots, les durées, les liens, les ressources).");
bullet("Il CALCULE tout seul le planning (le Gantt, le chemin critique, les dates).");
bullet("Vous SUIVEZ l'avancement à chaque point d'étape (le B2P).");
bullet("Vous ÉDITEZ des rapports propres pour la commission ou la soutenance.");

h1("Section 2", "Le vocabulaire essentiel");
p("À lire en premier : tout le reste en découle. Ce sont VOS mots, ceux de la méthode FGF.");
kv("LT", "Lot de Tâches - la brique de base du planning. Porte une durée, des liens, des ressources et un budget.");
kv("PTO", "Provision pour Tâches Oubliées - un matelas de sécurité budgété (durée nulle). On peut en mettre plusieurs.");
kv("TH", "Tâche Hamac - une tâche de synthèse qui REGROUPE plusieurs LT (ex. Maçonnerie = fondations + dalle + murs).");
kv("Jalon", "Point de contrôle à durée nulle (J1 à J9, 9 au maximum). Ex. Définition terminée, Dalle coulée.");
kv("B2P", "Le rythme FGF : le point d'étape récurrent. B2P0 = lancement, puis B2P1, B2P2... La cadence est CALCULÉE automatiquement selon la durée du projet.");
kv("PI", "Planning Initial - la photo de référence du planning, figée. Le avant auquel on compare le pendant.");
kv("BàD", "Budget à Date - budget de référence + ses variations.");
kv("VA", "Valeur Acquise - BàD multiplié par l'avancement %. Ce qu'on a vraiment produit en valeur.");
kv("CP", "Coût Prévisionnel à terminaison - Dépenses + reste à faire. Là où on va finir.");
kv("Intensité", "Combien d'une ressource sur un LT : 0,25 = un quart de chef de projet, 2,00 = deux développeurs.");
kv("Marge", "Le retard qu'une tâche peut prendre SANS décaler la fin. Marge = 0 -> tâche CRITIQUE.");
note("Le réflexe : LT = la brique - TH = le regroupement - Jalon = le point de contrôle - B2P = le rendez-vous de suivi.");

h1("Section 3", "Se repérer : les deux barres de menu");
h3("1) La barre sombre tout en haut (niveau global, tous projets)");
p("Portefeuille - Portfolio+ - Alertes - Rapports - API - Paramètres - Nouveau projet - Recherche (Ctrl+K) - Déconnexion.");
h3("2) La barre verte du projet (quand vous êtes DANS un projet)");
p("12 onglets : Tableau de bord - Planning - Look-ahead - Potentiel-tâches - Analyse - Ressources - Référentiels - Bilans B2P - Risques - Soutenance - Activité - Paramètres.");
p("Juste au-dessus de ces onglets, un bandeau vert foncé rappelle toujours : le nom du projet, son code, son statut, sa santé (vert / orange / rouge), la date de début, la fin prévisionnelle, le responsable, et des boutons d'export rapides (PDF, Excel, CSV, SVG Gantt, JSON).");

h1("Section 4", "Le parcours type, de A à Z");
p("Le fil rouge se lit en cinq temps :");
bullet("1. Nouveau projet (on décrit) - l'assistant en 6 étapes. Le planning naît tout seul.");
bullet("2. Planning (on ajuste) - on vérifie le Gantt, on glisse des barres, on affine les liens.");
bullet("3. Désigner comme PI (on fige le avant) - le trait noir de référence apparaît.");
bullet("4. Bilans B2P (on pointe) - à chaque point d'étape, on note l'avancement et les décisions.");
bullet("5. Soutenance (on présente) - un clic, le PDF marché public part en commission.");

h1("Section 5", "Les écrans globaux (la barre du haut)");
h3("Portefeuille");
p("Votre page d'accueil : la liste de TOUS vos projets, avec statut, santé, avancement, budget et fin prévue. Les projets archivés sont à part, et un compteur signale les projets à risque. On y importe aussi un planning existant (MS Project / XML) et on nivelle les ressources de tout l'espace.");
h3("Portfolio+ (la tour de contrôle)");
p("La vue multi-projets pour un PMO. Son atout : elle détecte les CONFLITS entre projets - une même ressource sur-sollicitée sur deux chantiers au même moment.");
h3("Alertes - Early Warning System");
p("Votre radar. Tout ce qui cloche sur le portefeuille, classé en critique / avertissement / info. Un clic sur une alerte vous emmène directement sur le planning concerné. Si tout va bien : Aucun signal actif.");
h3("Rapports");
p("Centre d'exports niveau portefeuille : vos documents (PDF, Excel, CSV...) projet par projet, sans entrer dans chacun.");
h3("API");
p("La documentation technique pour brancher Cheetah Time à d'autres outils. À ignorer si vous ne faites pas d'intégration informatique.");
h3("Paramètres (global)");
p("Réglages de l'espace de travail : devise, fuseau, personnalisation CheetahSoft, notifications (Slack / Teams / Jira) et sécurité (double authentification MFA).");
h3("Nouveau projet");
p("C'est l'écran le plus important - il est détaillé dans la section suivante.");

h1("Section 6", "L'assistant Nouveau projet (6 étapes)");
p("C'est ici que vous DÉCRIVEZ le projet. Tout en bas, une barre récapitule en temps réel (nombre de LT, PTO, jalons, budget). Le bouton vert Créer le projet lance le calcul.");
h3("Étape 1 - Identité");
p("Nom du projet, phase, UNITÉ DE TEMPS (jours, semaines... - c'est dans cette unité que vous saisirez les durées), client / maîtrise d'ouvrage, date de début et date de fin initiale.");
h3("Étape 2 - Ressources");
p("Vous listez vos ressources (R01, R02...). Pour chacune : nom, heures/jour (7 h par défaut) et jours travaillés (Lun -> Ven par défaut, cliquables). Les jours fériés du calendrier projet s'appliquent automatiquement.");
h3("Étape 3 - Lots de Tâches (le cœur)");
p("Pour chaque LT : code, nom, durée, budget. Puis deux sous-lignes : les PRÉDÉCESSEURS (de qui dépend ce LT, avec le type de lien FD / DD / FF / DF et un délai plus ou moins) et les RESSOURCES (qui travaille dessus, avec son intensité). Le bouton + PTO ajoute une provision de sécurité.");
note("FD = Fin -> Début (le plus courant). Un délai positif = on attend ; un délai négatif = on chevauche.");
h3("Étape 4 - Jalons (J1 à J9)");
p("Vos points de contrôle à durée nulle (Définition terminée, Dalle coulée). Maximum 9. Ils peuvent eux aussi avoir des prédécesseurs.");
h3("Étape 5 - Tâches Hamac");
p("Vous regroupez des LT sous une synthèse (ex. Maçonnerie englobe fondations + dalle + murs). Un LT n'appartient qu'à une seule TH. C'est ce qui donne la hiérarchie du planning.");
h3("Étape 6 - Planning B2P");
p("La cadence est calculée automatiquement selon la durée du projet : un projet de 3 à 6 mois -> un B2P toutes les 2 semaines ; de 1 à 2 ans -> tous les 2 mois, etc. Vous obtenez B2P0 (lancement) puis B2P1, B2P2... Si vous modifiez une date à la main et vous éloignez de la règle, un avertissement orange vous le signale (mais vous laisse libre).");
note("Ces dates B2P sont identiques côté Cheetah Cost : c'est le pont entre la lentille délai et la lentille coût.");

h1("Section 7", "Les 12 onglets du projet, un par un");

h2("1) Tableau de bord");
p("À quoi ça sert : le verdict en 10 secondes.");
p("Ce que vous voyez : la Vue Direction, le calendrier des bilans B2P, des cartes d'indicateurs, le Cockpit de coûts FGF (BàD, VA, Dépenses, CPI, SPI, EAC, VAC...), un bloc Livraison (budget, coût réel, avancement, valeur acquise, référentiel actif), le chemin critique, les jalons à venir et les signaux de variance par tâche.");
p("À retenir : la page du patron pressé. Vert = bien, orange = surveiller, rouge = agir.");

h2("2) Planning (l'atelier principal)");
p("À quoi ça sert : construire et ajuster le planning visuellement.");
p("Ce que vous voyez : un écran à 3 modes, commutables en un clic - Grille / Gantt / Inspecteur. La Grille est le tableau des tâches (WBS, nom, début, fin, durée, marge). Le Gantt affiche les barres dans le temps : on GLISSE une barre pour la déplacer, on TIRE ses bords pour changer la durée, on déplace les jalons (losanges). L'Inspecteur montre tous les détails d'une tâche (au plus tôt / tard, mode auto ou manuel, formule de charge, marges, contraintes, coûts, VP / VA).");
p("Les boutons clés : ajouter une tâche racine / sœur / enfant / jalon ; Désigner comme PI (fige le planning de référence, trait noir + suivi B2P en rouge pour le réalisé et vert pour la prévision) ; densité (Ctrl+1/2/3), filtre, bascule Baseline, bascule Critique.");
note("C'est ici que vous passez 80 % de votre temps. Le Gantt n'est PAS décoratif : il recalcule réellement.");

h2("3) Look-ahead (4 semaines)");
p("À quoi ça sert : la vue chantier, imprimable, pour le conducteur de travaux.");
p("Ce que vous voyez : un tableau des tâches des 4 prochaines semaines (qui, quand) avec un statut En retard / À risque / OK et sa raison.");
p("À retenir : qu'est-ce qu'on fait dans les semaines qui viennent - concret, terrain.");

h2("4) Potentiel-tâches (réseau PERT)");
p("À quoi ça sert : voir la LOGIQUE du projet, sans l'axe du temps.");
p("Ce que vous voyez : un diagramme de boîtes reliées par des flèches ; le chemin critique apparaît en rouge. En dessous, la table de tous les liens (type, prédécesseur, successeur, décalage, critique oui / non).");
p("À retenir : est-ce que mon enchaînement tient debout ? Idéal pour discuter la logique, pas les dates.");

h2("5) Analyse (ordonnancement avancé)");
p("À quoi ça sert : prévoir et challenger le planning avec des outils statistiques.");
bullet("Earned Schedule : SPI_t (performance de délai), date de fin prédite, glissement prédit.");
bullet("Monte Carlo (1 500 simulations) : l'histogramme des dates de fin possibles avec P10 / P50 / P80 / P90 - la fameuse date qu'on promet au client (P80) - et les tâches les plus souvent critiques.");
bullet("Courbe en S : prévu / réalisé / prévision.");
bullet("Simulateur what-if FGF : et si ce LT glisse de 5 jours, ça coûte combien ?");
p("À retenir : l'onglet pour anticiper et arbitrer avec des chiffres solides.");

h2("6) Ressources");
p("À quoi ça sert : gérer les personnes, équipes et équipements, et leur charge.");
p("Ce que vous voyez : par ressource, la charge hebdomadaire, les affectations, les SURCHARGES (en rouge). On ajoute une ressource (Personne / Équipe / Équipement), on règle son calendrier, et on saisit les feuilles de temps (heures réellement passées).");
p("À retenir : c'est ici qu'on repère - Untel est à 130 %, il faut lisser.");

h2("7) Référentiels (baselines)");
p("À quoi ça sert : figer des photos du planning et comparer.");
p("Ce que vous voyez : un bouton Capturer un référentiel, l'historique des photos (date, charge gelée, coût gelé, statut), la possibilité d'en ACTIVER une, et une analyse des écarts (delta début / fin / charge / coût vs aujourd'hui).");
p("À retenir : le référentiel actif débloque la Valeur Acquise. C'est votre avant officiel.");

h2("8) Bilans B2P (le rituel FGF - lentille délai)");
p("À quoi ça sert : faire le point à chaque rendez-vous B2P.");
p("Ce que vous voyez : un sélecteur de B2P (les passés sont cochés, ceux avec une note sont marqués). Pour le B2P choisi : l'avancement global, le glissement projet, un Rapport de synthèse (BàD, Dépenses, CP, Écart final - le volet coût vient de la coûtenance), une revue lot par lot (avancement, fin prévue, glissement, statut) et une note de bilan éditable pour consigner les décisions.");
note("C'est le cœur de la méthode : le rendez-vous où l'on regarde la vérité en face, lot par lot.");

h2("9) Risques");
p("À quoi ça sert : tenir les registres de pilotage.");
p("Ce que vous voyez : le registre des risques, les incidents / problèmes et les demandes de changement. La traçabilité - indispensable en marché public.");

h2("10) Soutenance");
p("À quoi ça sert : produire le livrable à présenter en commission.");
p("Ce que vous voyez : un PDF marché public en 6 pages (tableau de bord, planning de référence vs actuel, courbe en S, tableau des écarts FGF, points d'alerte, ressources), plus des exports Gantt SVG et Excel multi-onglets. Un encart résume les chiffres courants (avancement, fin prévue / contractuelle, SPI_t, chemin critique, surcharges).");
p("À retenir : un clic = un dossier propre, format soutenance, prêt à poser sur la table.");

h2("11) Activité");
p("À quoi ça sert : la collaboration et la mémoire du projet.");
p("Ce que vous voyez : commentaires sur les tâches, mentions @email, pièces jointes, et le journal d'activité (qui a fait quoi, quand).");

h2("12) Paramètres (projet)");
p("À quoi ça sert : régler ce projet précis.");
p("Ce que vous voyez : Section 1 Informations générales (statut, santé), Section 2 Calendrier du projet, Section 3 Modèle de projet, Section 4 Zone de danger (archiver / supprimer). On y choisit aussi la stratégie de nivellement (priorité puis marge, marge puis priorité, ou délai minimal).");

h1("Section 8", "Les petits plus qui font gagner du temps");
bullet("Recherche Ctrl+K : la palette de commandes - sauter à n'importe quel projet ou onglet en tapant deux lettres.");
bullet("Mode réunion : plein écran pour présenter proprement (Échap pour sortir).");
bullet("Assistant IA : un bouton flottant dans chaque projet pour poser une question sur votre planning.");
bullet("Rafraîchissement live : la page se met à jour seule (toutes les 30 s) si un collègue modifie en même temps.");
bullet("Exports : toujours à portée de clic dans le bandeau du projet (PDF, Excel, CSV, SVG Gantt, JSON).");

h1("Section 9", "Un scénario concret de bout en bout");
p("Réhabilitation d'un groupe scolaire :");
bullet("1. Nouveau projet : vous saisissez 8 LT (démolition, fondations, maçonnerie...), 2 ressources, 4 jalons et une TH Gros œuvre. Le logiciel propose B2P0 + 6 B2P (toutes les 2 semaines).");
bullet("2. Planning : vous vérifiez le Gantt, vous rallongez un LT de 2 jours en tirant la barre, puis vous cliquez Désigner comme PI. Le trait noir de référence apparaît.");
bullet("3. Trois semaines plus tard, Bilans B2P : vous sélectionnez B2P2, vous voyez que la maçonnerie glisse de +3 j, vous écrivez la note - renfort équipe décidé.");
bullet("4. Analyse : le Monte Carlo confirme une fin P80 au 14 novembre. Vous testez un what-if : rattraper coûte 4 200 EUR.");
bullet("5. Soutenance : un clic, le PDF 6 pages part en commission.");
sp(6);
note("Avec ce guide, Cheetah Time n'a plus aucun secret. Bonne navigation, François.");

/* ─── Pieds de page ─── */
pages.forEach((pg, i) => {
  if (i === 0) return;
  line(pg, "0.86 0.88 0.86", 0.8, LM, 60, RIGHT, 60);
  emitText(pg, 1, 8, MUT, LM, 48, "Cheetah Time - Guide utilisateur (methode FGF)");
  emitText(pg, 1, 8, MUT, RIGHT - 46, 48, "Page " + (i + 1) + " / " + pages.length);
});

/* ─── Assemblage PDF ─── */
const objs = [];
objs.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
const kids = pages.map((_, i) => 6 + i * 2);
objs.push(`2 0 obj << /Type /Pages /Kids [${kids.map((n) => n + " 0 R").join(" ")}] /Count ${pages.length} >> endobj`);
objs.push("3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj");
objs.push("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> endobj");
objs.push("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >> endobj");
pages.forEach((pg, i) => {
  const num = 6 + i * 2, cnum = 7 + i * 2;
  const content = pg.gfx.join("\n") + "\nBT\n" + pg.txt.join("\n") + "\nET";
  objs.push(`${num} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${cnum} 0 R >> endobj`);
  objs.push(`${cnum} 0 obj << /Length ${Buffer.byteLength(content, "latin1")} >> stream\n${content}\nendstream endobj`);
});

let pdf = "%PDF-1.4\n";
const offsets = [0];
for (const o of objs){ offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += o + "\n"; }
const xref = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
for (const off of offsets.slice(1)) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "..", "Guide-Cheetah-Time-Francois.pdf");
fs.writeFileSync(out, Buffer.from(pdf, "latin1"));
console.log("OK ->", out, "(" + pages.length + " pages, " + Buffer.byteLength(pdf, "latin1") + " octets)");
