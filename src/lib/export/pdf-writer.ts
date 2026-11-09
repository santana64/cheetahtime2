/**
 * Écriture PDF minimale, sans dépendance, avec les ACCENTS FRANÇAIS
 * (Helvetica en WinAnsiEncoding : é è à ç ô œ € « » — …) et des primitives
 * de dessin (rectangles, traits, texte) pour les graphiques du rapport.
 */

const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89,
  "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
  "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/** Texte → octets WinAnsi (les caractères hors jeu sont translittérés). */
export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (WIN_ANSI_EXTRA[ch] != null) out += String.fromCharCode(WIN_ANSI_EXTRA[ch]);
    else if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) out += ch;
    else if (ch === "→") out += "->";
    else if (ch === "←") out += "<-";
    else if (ch === "≤") out += "<=";
    else if (ch === "≥") out += ">=";
    else if (ch === "−") out += "-";
    else if (ch === "·") out += String.fromCharCode(0xb7);
    else if (ch === "✓") out += "v";
    else if (ch === " " || ch === " ") out += " ";
    else out += ch.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?");
  }
  return out;
}

function escape(text: string) {
  return toWinAnsi(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export type Rgb = [number, number, number];

export function hex(color: string): Rgb {
  const c = color.replace("#", "");
  return [parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255];
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

export class PdfPage {
  ops: string[] = [];
  constructor(public width: number, public height: number) {}

  /** y depuis le HAUT de la page (plus naturel pour la mise en page). */
  private Y(y: number) {
    return this.height - y;
  }

  rect(x: number, y: number, w: number, h: number, fill?: string, stroke?: string, lineWidth = 0.6) {
    const parts: string[] = ["q"];
    if (fill) parts.push(`${hex(fill).map(f).join(" ")} rg`);
    if (stroke) parts.push(`${hex(stroke).map(f).join(" ")} RG ${f(lineWidth)} w`);
    parts.push(`${f(x)} ${f(this.Y(y + h))} ${f(w)} ${f(h)} re`);
    parts.push(fill && stroke ? "B" : fill ? "f" : "S");
    parts.push("Q");
    this.ops.push(parts.join(" "));
  }

  line(x1: number, y1: number, x2: number, y2: number, color = "#94a3b8", width = 0.6, dash?: number[]) {
    this.ops.push(
      `q ${hex(color).map(f).join(" ")} RG ${f(width)} w ${dash ? `[${dash.join(" ")}] 0 d` : ""} ${f(x1)} ${f(this.Y(y1))} m ${f(x2)} ${f(this.Y(y2))} l S Q`,
    );
  }

  polygon(points: [number, number][], fill: string) {
    const [first, ...rest] = points;
    this.ops.push(
      `q ${hex(fill).map(f).join(" ")} rg ${f(first[0])} ${f(this.Y(first[1]))} m ${rest
        .map(([x, y]) => `${f(x)} ${f(this.Y(y))} l`)
        .join(" ")} h f Q`,
    );
  }

  text(x: number, y: number, value: string, size = 9, options: { bold?: boolean; color?: string; align?: "left" | "right" | "center"; maxWidth?: number } = {}) {
    let str = value;
    if (options.maxWidth) str = truncate(str, options.maxWidth, size, options.bold);
    const w = textWidth(str, size, options.bold);
    const dx = options.align === "right" ? -w : options.align === "center" ? -w / 2 : 0;
    this.ops.push(
      `BT /${options.bold ? "F2" : "F1"} ${f(size)} Tf ${hex(options.color ?? "#0f172a").map(f).join(" ")} rg ${f(x + dx)} ${f(this.Y(y))} Td (${escape(str)}) Tj ET`,
    );
  }
}

/** Largeur approchée (Helvetica) — suffisante pour tronquer proprement. */
export function textWidth(text: string, size: number, bold = false) {
  let units = 0;
  for (const ch of text) {
    if ("il.,:;'|!".includes(ch)) units += 0.28;
    else if ("mwMW".includes(ch)) units += 0.83;
    else if (ch === " ") units += 0.28;
    else if (/[A-Z]/.test(ch)) units += 0.67;
    else if (/[0-9]/.test(ch)) units += 0.56;
    else units += 0.52;
  }
  return units * size * (bold ? 1.06 : 1);
}

export function truncate(text: string, maxWidth: number, size: number, bold = false) {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && textWidth(`${out}…`, size, bold) > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

export function buildPdf(pages: PdfPage[], info: { title: string; author?: string }): Buffer {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add("");
  const pagesObj = add("");
  const font1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const font2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const page of pages) {
    const content = page.ops.join("\n");
    const contentObj = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    const pageObj = add(
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentObj} 0 R >>`,
    );
    kids.push(pageObj);
  }
  const infoObj = add(`<< /Title (${escape(info.title)}) /Author (${escape(info.author ?? "Cheetah Time")}) /Producer (Cheetah Time) >>`);
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R /Lang (fr-FR) >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
