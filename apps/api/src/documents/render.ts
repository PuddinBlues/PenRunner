import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import type { ScoreCardDoc, TableDoc } from "./model.js";

// ---------------------------------------------------------------------------
// Renderer pdfkit SOTTILE: consuma il document-model (già coi numeri dal
// motore) e impagina. Nessun conto qui. Ritorna un Buffer PDF.
// Font: Inter EMBEDDED (assets/fonts, licenza SIL OFL nel repo) — le font
// standard WinAnsi corrompevano i caratteri tipografici dei copy (reperto
// censimento: − → ", ⚠ → &). Il badge di stato resta testuale, leggibile
// anche in fotocopia b/n.
// ---------------------------------------------------------------------------

const FONT_REGULAR = fileURLToPath(
  new URL("../../assets/fonts/Inter-Regular.ttf", import.meta.url),
);
const FONT_BOLD = fileURLToPath(
  new URL("../../assets/fonts/Inter-Bold.ttf", import.meta.url),
);

const PAGE_LEFT = 40;
const PAGE_RIGHT = 555;
const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;

function newDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  doc.registerFont("Inter", FONT_REGULAR);
  doc.registerFont("Inter-Bold", FONT_BOLD);
  doc.font("Inter");
  return doc;
}

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/** Intestazione gerarchica: titolo, riga evento (luogo · data), badge. */
function header(doc: PDFKit.PDFDocument, model: TableDoc | ScoreCardDoc) {
  doc.font("Inter-Bold").fontSize(18).fillColor("#0F172A").text(model.title, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
  if (model.subtitle) {
    doc.font("Inter").fontSize(11).fillColor("#64748B").text(model.subtitle, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
  }
  if (model.statusBadge) {
    doc
      .moveDown(0.3)
      .font("Inter-Bold")
      .fontSize(10.5)
      .fillColor(model.official ? "#15803D" : "#B45309")
      .text(`[ ${model.statusBadge} ]`, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
  }
  doc.font("Inter").moveDown(0.6);
}

/** Note a piede pagina: SEMPRE a piena riga dal margine (mai spezzate a metà colonna). */
function footNotes(doc: PDFKit.PDFDocument, notes: string[], liveNote: string) {
  doc.moveDown(1);
  doc.font("Inter").fontSize(9).fillColor("#64748B");
  for (const note of notes) doc.text(note, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
  doc.moveDown(0.5).fillColor("#94A3B8").fontSize(8).text(liveNote, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
}

export async function renderTable(model: TableDoc): Promise<Buffer> {
  const doc = newDoc();
  const done = collect(doc);
  header(doc, model);

  if (model.emptyNote && model.rows.length === 0) {
    doc.fontSize(11).fillColor("#64748B").text(model.emptyNote, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
  } else {
    // ultima colonna (score/importo) allineata a destra, numeri tabulari
    const widths = [50, 210, 190, 65];
    doc.font("Inter-Bold").fontSize(9).fillColor("#64748B");
    let y = doc.y;
    model.columns.forEach((c, i) => {
      doc.text(c.toUpperCase(), PAGE_LEFT + sum(widths, i), y, {
        width: widths[i],
        align: i === model.columns.length - 1 ? "right" : "left",
      });
    });
    y += 15;
    doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).strokeColor("#CBD5E1").lineWidth(0.5).stroke();
    y += 7;

    doc.font("Inter").fontSize(10).fillColor("#0F172A");
    for (const row of model.rows) {
      row.forEach((cell, i) => {
        doc.text(cell, PAGE_LEFT + sum(widths, i), y, {
          width: widths[i],
          align: i === row.length - 1 ? "right" : "left",
        });
      });
      y += 17;
      if (y > 780) {
        doc.addPage();
        doc.font("Inter");
        y = 40;
      }
    }
    doc.x = PAGE_LEFT;
    doc.y = y;
  }

  footNotes(doc, model.footNotes, model.liveNote);
  doc.end();
  return done;
}

export async function renderScoreCard(model: ScoreCardDoc): Promise<Buffer> {
  const doc = newDoc();
  const done = collect(doc);
  header(doc, model);

  doc.fontSize(10).fillColor("#334155");
  doc.text(`${model.header.event} · ${model.header.class}`, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
  doc.text(`${model.header.pattern} · ${model.header.judge}`, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
  doc.moveDown(0.5);

  // colonne = passi del pattern (righe PENALTY + SCORE, come la card reale)
  let y = doc.y;
  doc.font("Inter-Bold").fontSize(9).fillColor("#64748B");
  doc.text("#", PAGE_LEFT, y, { width: 24 });
  doc.text("MANEUVER", PAGE_LEFT + 24, y, { width: 320 });
  doc.text("PENALTY", PAGE_LEFT + 344, y, { width: 80, align: "right" });
  doc.text("SCORE", PAGE_LEFT + 424, y, { width: 80, align: "right" });
  y += 14;
  doc.moveTo(PAGE_LEFT, y).lineTo(PAGE_RIGHT, y).strokeColor("#CBD5E1").lineWidth(0.5).stroke();
  y += 5;
  doc.font("Inter").fillColor("#0F172A").fontSize(10);
  for (const m of model.maneuvers) {
    doc.text(String(m.position), PAGE_LEFT, y, { width: 24 });
    doc.text(m.label, PAGE_LEFT + 24, y, { width: 320 });
    doc.text(m.penalty, PAGE_LEFT + 344, y, { width: 80, align: "right" });
    doc.text(m.quality, PAGE_LEFT + 424, y, { width: 80, align: "right" });
    y = doc.y + 4;
  }
  doc.x = PAGE_LEFT;
  doc.y = y;
  doc.moveDown(0.5).fontSize(10).fillColor("#334155");
  doc.text(model.runPenalty ? `Run penalty: ${model.runPenalty}` : "", PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
  doc.font("Inter-Bold").fontSize(16).fillColor("#0F172A").text(`Total: ${model.total}`, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
  doc.font("Inter").moveDown(0.5).fontSize(10).fillColor("#64748B").text(model.signatureLine, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
  // legenda qualità (identica alla card reale)
  doc
    .moveDown(0.5)
    .fontSize(8)
    .fillColor("#94A3B8")
    .text(
      "−1½ Extremely Poor · −1 Poor · −½ Poor · 0 Correct · +½ Good · +1 Very Good · +1½ Excellent",
      PAGE_LEFT,
      doc.y,
      { width: PAGE_WIDTH },
    );
  doc.moveDown(0.3).text(model.liveNote, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });

  doc.end();
  return done;
}

function sum(arr: number[], upto: number): number {
  let s = 0;
  for (let i = 0; i < upto; i++) s += arr[i] ?? 0;
  return s;
}
