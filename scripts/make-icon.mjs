// Génère build/icon.ico à partir du VRAI logo CheetahSoft (public/cheetahsoft-logo.jpg).
// On recadre sur l'emblème central (disque vert + guépard orange) en retirant l'anneau de
// texte, illisible à taille d'icône. Sortie : PNG 256×256 emballé en .ico (Vista+).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const S = 256;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public", "cheetahsoft-logo.jpg");

// Logo complet (anneau vert + « CheetahSoft / Project Management Software » + guépard),
// simplement mis à l'échelle : c'est la marque telle quelle, reconnaissable en icône.
const png = await sharp(src)
  .resize(S, S, { fit: "contain", background: "#ffffff" })
  .flatten({ background: "#ffffff" })
  .png()
  .toBuffer();

// ─── Emballage .ico (une entrée PNG 256×256) ───
const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; // largeur 0 = 256
entry[1] = 0; // hauteur 0 = 256
entry[4] = 1; // plans
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(6 + 16, 12);
const ico = Buffer.concat([dir, entry, png]);

fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.writeFileSync(path.join(root, "build", "icon.ico"), ico);
// Aperçu PNG pour contrôle visuel.
fs.writeFileSync(path.join(root, "build", "icon-preview.png"), png);
console.log(`OK -> build/icon.ico ${ico.length} octets (logo CheetahSoft, emblème guépard)`);
