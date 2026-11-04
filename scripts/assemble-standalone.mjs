// Prépare .next/standalone pour l'empaquetage Electron :
//  - copie public/           -> .next/standalone/public
//  - copie .next/static/     -> .next/standalone/.next/static
//  - retire quelques fichiers non-runtime pour alléger l'installateur
// (étapes officielles du mode "output: standalone" de Next.js)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
const serverEntry = path.join(standalone, "server.js");

if (!fs.existsSync(serverEntry)) {
  console.error("[assemble] .next/standalone/server.js introuvable.");
  console.error("[assemble] Lance d'abord :  npm run desktop:build");
  process.exit(1);
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) { console.warn("[assemble] absent, ignoré :", from); return; }
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  console.log("[assemble] copié :", path.relative(root, from), "->", path.relative(root, to));
}

copyDir(path.join(root, "public"), path.join(standalone, "public"));
copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));

// Nettoyage : fichiers/dossiers tracés à la racine mais inutiles au runtime
// (et qui peuvent gonfler énormément l'installateur).
const junk = [
  "build",
  "electron",
  "Guide-Cheetah-Time-Francois.pdf",
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "DESIGN.md",
  "package-lock.json",
  "tsconfig.tsbuildinfo",
  "backups",            // snapshots locaux créés à l'exécution (jamais à empaqueter)
  "data",               // store de dev éventuel
];
for (const name of junk) {
  const p = path.join(standalone, name);
  try { if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); console.log("[assemble] retiré :", name); } } catch { /* ignore */ }
}

// Retire TOUT dossier de sortie de build tracé par erreur (dist-desktop, dist-desktop-bNN…)
// + tout fichier « chemin aplati » parasite (ex. C:Users…extracted.txt).
try {
  for (const entry of fs.readdirSync(standalone)) {
    if (entry.startsWith("dist-desktop") || /^[A-Za-z]:Users/.test(entry)) {
      fs.rmSync(path.join(standalone, entry), { recursive: true, force: true });
      console.log("[assemble] retiré (parasite) :", entry);
    }
  }
} catch { /* ignore */ }

console.log("[assemble] Bundle standalone prêt pour Electron.");
