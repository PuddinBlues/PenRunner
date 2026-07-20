import PDFDocument from "pdfkit";
import type { ScoreCardDoc, TableDoc } from "./model.js";

// ---------------------------------------------------------------------------
// Renderer pdfkit SOTTILE: consuma il document-model (già coi numeri dal
// motore) e impagina. Nessun conto qui. Ritorna un Buffer PDF.
// Il badge di stato è testuale (parola), leggibile anche in fotocopia b/n.
// ---------------------------------------------------------------------------

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function header(doc: PDFKit.PDFDocument, model: TableDoc | ScoreCardDoc) {
  doc.fontSize(18).fillColor("#0F172A").text(model.title);
  if (model.subtitle) doc.fontSize(12).fillColor("#64748B").text(model.subtitle);
  if (model.statusBadge) {
    doc
      .moveDown(0.3)
      .fontSize(11)
      .fillColor(model.official ? "#15803D" : "#B45309")
      .text(`[ ${model.statusBadge} ]`);
  }
  doc.moveDown(0.5);
}

export async function renderTable(model: TableDoc): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const done = collect(doc);
  header(doc, model);

  const startX = 40;
  const widths = [50, 200, 180, 80];
  doc.fontSize(10).fillColor("#334155");
  let y = doc.y;
  model.columns.forEach((c, i) => {
    doc.text(c, startX + sum(widths, i), y, { width: widths[i], continued: false });
  });
  y += 16;
  doc.moveTo(startX, y).lineTo(555, y).strokeColor("#CBD5E1").stroke();
  y += 6;

  doc.fillColor("#0F172A");
  for (const row of model.rows) {
    row.forEach((cell, i) => {
      doc.text(cell, startX + sum(widths, i), y, { width: widths[i] });
    });
    y += 16;
    if (y > 780) {
      doc.addPage();
      y = 40;
    }
    doc.y = y;
  }

  doc.moveDown(1).fontSize(9).fillColor("#64748B");
  for (const note of model.footNotes) doc.text(note);
  doc.moveDown(0.5).fillColor("#94A3B8").fontSize(8).text(model.liveNote);

  doc.end();
  return done;
}

export async function renderScoreCard(model: ScoreCardDoc): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const done = collect(doc);
  header(doc, model);

  doc.fontSize(10).fillColor("#334155");
  doc.text(`${model.header.event} · ${model.header.class}`);
  doc.text(`${model.header.pattern} · ${model.header.judge}`);
  doc.moveDown(0.5);

  // colonne = passi del pattern (righe PENALTY + SCORE, come la card reale)
  let y = doc.y;
  const startX = 40;
  doc.fontSize(9).fillColor("#64748B");
  doc.text("#", startX, y, { width: 24 });
  doc.text("Maneuver", startX + 24, y, { width: 320 });
  doc.text("Penalty", startX + 344, y, { width: 80 });
  doc.text("Score", startX + 424, y, { width: 80 });
  y += 14;
  doc.moveTo(startX, y).lineTo(555, y).strokeColor("#CBD5E1").stroke();
  y += 5;
  doc.fillColor("#0F172A").fontSize(10);
  for (const m of model.maneuvers) {
    doc.text(String(m.position), startX, y, { width: 24 });
    doc.text(m.label, startX + 24, y, { width: 320 });
    doc.text(m.penalty, startX + 344, y, { width: 80 });
    doc.text(m.quality, startX + 424, y, { width: 80 });
    y = doc.y + 4;
  }
  doc.moveDown(0.5).fontSize(10).fillColor("#334155");
  doc.text(`Run penalty: ${model.runPenalty}`);
  doc.fontSize(16).fillColor("#0F172A").text(`Total: ${model.total}`);
  doc.moveDown(0.5).fontSize(10).fillColor("#64748B").text(model.signatureLine);
  // legenda qualità (BR-21), identica alla card reale
  doc
    .moveDown(0.5)
    .fontSize(8)
    .fillColor("#94A3B8")
    .text("−1½ Extremely Poor · −1 Poor · −½ Poor · 0 Correct · +½ Good · +1 Very Good · +1½ Excellent");
  doc.moveDown(0.3).text(model.liveNote);

  doc.end();
  return done;
}

function sum(arr: number[], upto: number): number {
  let s = 0;
  for (let i = 0; i < upto; i++) s += arr[i] ?? 0;
  return s;
}
