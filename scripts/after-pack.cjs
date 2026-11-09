// Hook electron-builder : après l'empaquetage de l'app, copie le bundle
// Next.js "standalone" en fs BRUT dans resources/app (aucun filtre, donc
// node_modules et .next sont bien inclus — contrairement à extraResources).
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- hook electron-builder, CommonJS imposé */
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const projectDir = context.packager.projectDir;
  const src = path.join(projectDir, ".next", "standalone");
  const dest = path.join(context.appOutDir, "resources", "app");

  if (!fs.existsSync(path.join(src, "server.js"))) {
    throw new Error("[after-pack] .next/standalone/server.js introuvable — lance desktop:build + desktop:assemble.");
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });

  const hasNext = fs.existsSync(path.join(dest, "node_modules", "next"));
  const hasStatic = fs.existsSync(path.join(dest, ".next", "static"));
  console.log(`[after-pack] serveur copié -> ${path.relative(projectDir, dest)} (next=${hasNext}, static=${hasStatic})`);
  if (!hasNext) throw new Error("[after-pack] node_modules/next manquant après copie.");
};
