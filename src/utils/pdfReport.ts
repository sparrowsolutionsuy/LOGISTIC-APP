import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { GeneralReportData } from '../types';
import { tripRevenueUSD } from './analytics';
import { NOTO_SANS_BOLD_B64, NOTO_SANS_REGULAR_B64 } from './pdfFontData';
import { fmtPerKm } from './reportData';

export interface ChartImage {
  title: string;
  dataUrl: string;
  /** Relación de aspecto (alto/ancho) para escalar en el PDF. */
  ratio: number;
}

type RGB = [number, number, number];

const NAVY: RGB = [15, 39, 71];
const SLATE: RGB = [71, 85, 105];
const MUTED: RGB = [148, 163, 184];
const RED: RGB = [225, 78, 78];
const BLUE: RGB = [37, 99, 235];
const BORDER: RGB = [226, 232, 240];

const PAGE = { w: 595.28, h: 841.89 };
/** Slightly wider margins for readability. */
const M = 44;
const CONTENT_W = PAGE.w - M * 2;
const LINE_HEIGHT_FACTOR = 1.3;
const FONT = 'NotoSans';

const METHODOLOGY_LINE =
  'Costos = suma de costos registrados en el período (DB_Costos)';

function fuelRefLine(data: GeneralReportData): string | null {
  if (!(data.fuelImputedRef > 0)) return null;
  const fmt = (n: number) =>
    n.toLocaleString('es-UY', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return `Combustible imputado (ref.): ${fmt(data.fuelImputedRef)} — no entra al margen de período`;
}

/** Serializa un <svg> (p.ej. de Recharts) a PNG data URL sin html2canvas. */
export async function svgToPngDataUrl(svg: SVGSVGElement, scale = 2): Promise<ChartImage | null> {
  try {
    const rect = svg.getBoundingClientRect();
    const width = rect.width || Number(svg.getAttribute('width')) || 600;
    const height = rect.height || Number(svg.getAttribute('height')) || 300;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    // Fondo blanco para que el PNG no sea transparente sobre el PDF.
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    const xml = new XMLSerializer().serializeToString(clone);
    const svg64 = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg load failed'));
    });
    img.src = svg64;
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { title: '', dataUrl: canvas.toDataURL('image/png'), ratio: height / width };
  } catch (e) {
    console.warn('[pdfReport] svgToPngDataUrl error:', e);
    return null;
  }
}

interface Ctx {
  doc: jsPDF;
  y: number;
  page: number;
  periodShort: string;
}

function registerFonts(doc: jsPDF): void {
  doc.addFileToVFS('NotoSans-Regular.ttf', NOTO_SANS_REGULAR_B64);
  doc.addFileToVFS('NotoSans-Bold.ttf', NOTO_SANS_BOLD_B64);
  doc.addFont('NotoSans-Regular.ttf', FONT, 'normal');
  doc.addFont('NotoSans-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');
}

function setFont(doc: jsPDF, style: 'normal' | 'bold' = 'normal', size?: number): void {
  doc.setFont(FONT, style);
  if (size != null) doc.setFontSize(size);
}

function footer(doc: jsPDF, page: number, periodShort: string): void {
  setFont(doc, 'normal', 8);
  doc.setTextColor(...MUTED);
  const left = periodShort ? `GDC · ${periodShort}` : 'GDC';
  doc.text(left, M, PAGE.h - 24);
  doc.text(`Página ${page}`, PAGE.w - M, PAGE.h - 24, { align: 'right' });
}

function newPage(ctx: Ctx): void {
  footer(ctx.doc, ctx.page, ctx.periodShort);
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = M;
}

function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y + needed > PAGE.h - 54) newPage(ctx);
}

function sectionTitle(ctx: Ctx, text: string): void {
  ensure(ctx, 36);
  ctx.doc.setFillColor(...NAVY);
  ctx.doc.rect(M, ctx.y, 4, 14, 'F');
  setFont(ctx.doc, 'bold', 12);
  ctx.doc.setTextColor(...NAVY);
  ctx.doc.text(text.toUpperCase(), M + 12, ctx.y + 11);
  ctx.y += 28;
}

function wrap(doc: jsPDF, text: string, width: number): string[] {
  return doc.splitTextToSize(text, width) as string[];
}

function lineHeight(fontSize: number): number {
  return fontSize * LINE_HEIGHT_FACTOR;
}

function boxHeight(lineCount: number, fontSize: number, padY: number): number {
  return Math.max(1, lineCount) * lineHeight(fontSize) + padY * 2;
}

/** Draws a rounded text box sized from wrapped line count so text never clips. */
function drawTextBox(ctx: Ctx, text: string, fontSize = 10, pad = 12): void {
  const { doc } = ctx;
  setFont(doc, 'normal', fontSize);
  const lines = wrap(doc, text, CONTENT_W - pad * 2);
  const h = boxHeight(lines.length, fontSize, pad);
  ensure(ctx, h + 10);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(M, ctx.y, CONTENT_W, h, 6, 6, 'FD');
  doc.setTextColor(...SLATE);
  const baseline = ctx.y + pad + fontSize * 0.8;
  doc.text(lines, M + pad, baseline, { lineHeightFactor: LINE_HEIGHT_FACTOR });
  ctx.y += h + 16;
}

function drawParagraphs(ctx: Ctx, text: string, fontSize = 10): void {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return;
  const pad = 12;
  const gap = 8;
  setFont(ctx.doc, 'normal', fontSize);
  const blocks = paragraphs.map((p) => wrap(ctx.doc, p, CONTENT_W - pad * 2));
  const innerH =
    blocks.reduce((s, lines) => s + boxHeight(lines.length, fontSize, 0), 0) +
    gap * Math.max(0, blocks.length - 1);
  const h = innerH + pad * 2;
  ensure(ctx, h + 10);
  ctx.doc.setFillColor(248, 250, 252);
  ctx.doc.setDrawColor(...BORDER);
  ctx.doc.roundedRect(M, ctx.y, CONTENT_W, h, 6, 6, 'FD');
  ctx.doc.setTextColor(...SLATE);
  let y = ctx.y + pad + fontSize * 0.8;
  blocks.forEach((lines, i) => {
    ctx.doc.text(lines, M + pad, y, { lineHeightFactor: LINE_HEIGHT_FACTOR });
    y += boxHeight(lines.length, fontSize, 0);
    if (i < blocks.length - 1) y += gap;
  });
  ctx.y += h + 16;
}

function drawCover(ctx: Ctx, data: GeneralReportData): void {
  const { doc } = ctx;
  setFont(doc, 'bold', 11);
  const brand = 'GDC · TRANSPORTE DE CARGA';
  setFont(doc, 'bold', 22);
  const titleLines = wrap(doc, data.title, CONTENT_W);
  setFont(doc, 'normal', 12);
  const periodLines = wrap(doc, data.periodLabel, CONTENT_W);
  setFont(doc, 'normal', 8);
  const methodLines = wrap(doc, METHODOLOGY_LINE, CONTENT_W);
  const ref = fuelRefLine(data);
  const refLines = ref ? wrap(doc, ref, CONTENT_W) : [];
  const gen = new Date(data.generatedAt).toLocaleString('es-UY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const padTop = 36;
  const bandH =
    padTop +
    lineHeight(11) +
    10 +
    titleLines.length * lineHeight(22) +
    8 +
    periodLines.length * lineHeight(12) +
    8 +
    lineHeight(9) +
    8 +
    methodLines.length * lineHeight(8) +
    (refLines.length > 0 ? 4 + refLines.length * lineHeight(8) : 0) +
    20;

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE.w, bandH, 'F');

  let y = padTop;
  setFont(doc, 'bold', 11);
  doc.setTextColor(255, 255, 255);
  doc.text(brand, M, y);
  y += lineHeight(11) + 10;

  setFont(doc, 'bold', 22);
  doc.text(titleLines, M, y, { lineHeightFactor: LINE_HEIGHT_FACTOR });
  y += titleLines.length * lineHeight(22) + 8;

  setFont(doc, 'normal', 12);
  doc.setTextColor(200, 214, 234);
  doc.text(periodLines, M, y, { lineHeightFactor: LINE_HEIGHT_FACTOR });
  y += periodLines.length * lineHeight(12) + 8;

  setFont(doc, 'normal', 9);
  doc.text(`Generado: ${gen}`, M, y);
  y += lineHeight(9) + 8;

  setFont(doc, 'normal', 8);
  doc.setTextColor(180, 198, 220);
  doc.text(methodLines, M, y, { lineHeightFactor: LINE_HEIGHT_FACTOR });
  if (refLines.length > 0) {
    y += methodLines.length * lineHeight(8) + 4;
    doc.text(refLines, M, y, { lineHeightFactor: LINE_HEIGHT_FACTOR });
  }

  ctx.y = bandH + 22;
}

function bulletBox(ctx: Ctx, title: string, items: string[], tone: RGB): void {
  if (items.length === 0) return;
  sectionTitle(ctx, title);
  const fontSize = 9.5;
  items.forEach((it) => {
    setFont(ctx.doc, 'normal', fontSize);
    const lines = wrap(ctx.doc, it, CONTENT_W - 32);
    const boxH = boxHeight(lines.length, fontSize, 6);
    ensure(ctx, boxH + 6);
    const top = ctx.y;
    ctx.doc.setFillColor(tone[0], tone[1], tone[2]);
    ctx.doc.circle(M + 7, top + 8, 2.5, 'F');
    ctx.doc.setTextColor(...SLATE);
    ctx.doc.text(lines, M + 18, top + fontSize * 0.85, { lineHeightFactor: LINE_HEIGHT_FACTOR });
    ctx.y += boxH + 4;
  });
  ctx.y += 8;
}

function afterTable(ctx: Ctx): void {
  ctx.y = (ctx.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
}

function tableDefaults() {
  return {
    margin: { left: M, right: M },
    styles: {
      font: FONT,
      fontStyle: 'normal' as const,
      fontSize: 9,
      cellPadding: 5,
      overflow: 'ellipsize' as const,
      textColor: SLATE,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255] as RGB,
      font: FONT,
      fontStyle: 'bold' as const,
      fontSize: 9,
      overflow: 'ellipsize' as const,
    },
  };
}

/** Construye el documento PDF completo del reporte. */
export function buildReportPdf(
  data: GeneralReportData,
  fmt: (n: number) => string,
  charts: ChartImage[] = []
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  registerFonts(doc);
  const periodShort =
    data.periodLabel.length > 42 ? data.periodLabel.slice(0, 40) + '…' : data.periodLabel;
  const ctx: Ctx = { doc, y: M, page: 1, periodShort };
  const td = tableDefaults();

  // 1. Portada + metodología
  drawCover(ctx, data);

  // 2. Resumen ejecutivo + comentario
  sectionTitle(ctx, 'Resumen ejecutivo');
  drawTextBox(ctx, data.aiSummary, 10, 12);

  if (data.aiCommentary?.trim()) {
    sectionTitle(ctx, 'Comentario');
    drawParagraphs(ctx, data.aiCommentary, 10);
  }

  // 3. P&L corto
  sectionTitle(ctx, 'P&L del período');
  autoTable(doc, {
    startY: ctx.y,
    ...td,
    head: [['Concepto', 'Monto']],
    body: [
      ['Generado', fmt(data.totalGenerado)],
      ['Cobrado', fmt(data.totalCobrado)],
      ['Pendiente', fmt(data.totalPendiente)],
      ['Costos', fmt(data.totalCostos)],
      ['Margen', fmt(data.netMargin)],
      ['Margen %', `${data.marginPct.toFixed(1)}%`],
    ],
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold', textColor: NAVY } },
  });
  afterTable(ctx);

  // 4. Indicadores — per-km con 2 decimales
  sectionTitle(ctx, 'Indicadores');
  const cmp = data.comparison;
  const deltaStr = (v: number, pp = false) =>
    cmp.available ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}${pp ? ' pp' : '%'} ${cmp.label}` : '—';
  const marginPerKm = data.marginPerKm ?? data.revenuePerKm - data.costPerKm;
  autoTable(doc, {
    startY: ctx.y,
    ...td,
    styles: { ...td.styles, fontSize: 8.5, cellPadding: 4.5 },
    headStyles: { ...td.headStyles, fontSize: 8.5 },
    head: [['Indicador', 'Valor', 'Δ / nota']],
    body: [
      ['Viajes', String(data.totalTrips), `${data.completedTrips} completados`],
      [
        'Km recorridos',
        Math.round(data.totalKm).toLocaleString('es-UY'),
        cmp.available ? deltaStr(cmp.tripsDelta) : '—',
      ],
      ['Ticket promedio', fmt(data.avgTicket), 'Ingreso / viaje'],
      ['Costo / km', fmtPerKm(data.costPerKm), deltaStr(cmp.costsDelta)],
      ['Ingreso / km', fmtPerKm(data.revenuePerKm), deltaStr(cmp.revenueDelta)],
      ['Margen / km', fmtPerKm(marginPerKm), 'Ingreso/km − Costo/km'],
      ['Cobranza', `${data.collectionRate.toFixed(1)}%`, fmt(data.totalPendiente) + ' pendiente'],
    ],
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right', textColor: SLATE },
    },
  });
  afterTable(ctx);

  // 5. Insights
  bulletBox(ctx, 'Alertas y riesgos', data.aiAlerts, RED);
  bulletBox(ctx, 'Recomendaciones', data.aiRecommendations, BLUE);

  // 6. Charts solo si hay PNG
  if (charts.length > 0) {
    sectionTitle(ctx, 'Tendencias');
    charts.forEach((ch) => {
      const imgW = CONTENT_W;
      const imgH = Math.min(230, imgW * ch.ratio);
      ensure(ctx, imgH + 24);
      if (ch.title) {
        setFont(doc, 'bold', 9.5);
        doc.setTextColor(...NAVY);
        doc.text(ch.title, M, ctx.y + 4);
        ctx.y += 14;
      }
      try {
        doc.addImage(ch.dataUrl, 'PNG', M, ctx.y, imgW, imgH, undefined, 'FAST');
      } catch (e) {
        console.warn('[pdfReport] addImage error:', e);
      }
      ctx.y += imgH + 16;
    });
  }

  // 7. Top clientes
  if (data.clientBreakdown.length > 0) {
    sectionTitle(ctx, 'Clientes (top)');
    autoTable(doc, {
      startY: ctx.y,
      ...td,
      head: [['Cliente', 'Viajes', 'Ingresos', '% del total']],
      body: data.clientBreakdown.slice(0, 8).map((c) => [
        c.name,
        String(c.trips),
        fmt(c.revenue),
        `${data.totalGenerado > 0 ? ((c.revenue / data.totalGenerado) * 100).toFixed(1) : '0.0'}%`,
      ]),
      columnStyles: {
        0: { cellWidth: 220, overflow: 'ellipsize' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
    });
    afterTable(ctx);
  }

  // 8. Costos registrados
  if (data.costsByCategory.length > 0) {
    sectionTitle(ctx, 'Desglose de costos');
    autoTable(doc, {
      startY: ctx.y,
      ...td,
      head: [['Categoría', 'Total (USD eq.)', '% del total']],
      body: data.costsByCategory.map((r) => [r.category, fmt(r.total), `${r.pct.toFixed(1)}%`]),
      columnStyles: {
        0: { cellWidth: 260, overflow: 'ellipsize' },
        1: { halign: 'right' },
        2: { halign: 'right' },
      },
    });
    afterTable(ctx);
    setFont(doc, 'normal', 7.5);
    doc.setTextColor(...MUTED);
    const notes = [METHODOLOGY_LINE, fuelRefLine(data)].filter(Boolean) as string[];
    for (const note of notes) {
      const methodNote = wrap(doc, note, CONTENT_W);
      ensure(ctx, methodNote.length * lineHeight(7.5) + 4);
      doc.text(methodNote, M, ctx.y, { lineHeightFactor: LINE_HEIGHT_FACTOR });
      ctx.y += methodNote.length * lineHeight(7.5) + 4;
    }
    ctx.y += 8;
  }

  // 9. Destacados
  sectionTitle(ctx, 'Destacados');
  autoTable(doc, {
    startY: ctx.y,
    ...td,
    theme: 'plain',
    styles: { ...td.styles, fontSize: 9.5, cellPadding: 5, overflow: 'ellipsize' },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: NAVY, cellWidth: 130 },
      1: { overflow: 'ellipsize' },
    },
    body: [
      ['Mejor cliente', `${data.topClient.name} — ${fmt(data.topClient.revenue)} (${data.topClient.trips} viajes)`],
      ['Ruta destacada', `${data.topRoute.route} — ${fmt(data.topRoute.revenue)} (${data.topRoute.count} viajes)`],
      ['Producto top', `${data.topProduct.name} — ${fmt(data.topProduct.revenue)} (${data.topProduct.tons.toFixed(1)} t)`],
      [
        'Mejor margen',
        `${data.bestMarginTrip.id} (${data.bestMarginTrip.client}) — ${data.bestMarginTrip.marginPct.toFixed(1)}%`,
      ],
      [
        'Menor margen',
        `${data.worstMarginTrip.id} (${data.worstMarginTrip.client}) — ${data.worstMarginTrip.marginPct.toFixed(1)}%`,
      ],
    ],
  });
  afterTable(ctx);

  // 10. Viajes max 25
  if (data.trips.length > 0) {
    sectionTitle(ctx, 'Detalle de viajes');
    const rows = data.trips.slice(0, 25);
    autoTable(doc, {
      startY: ctx.y,
      ...td,
      styles: { ...td.styles, fontSize: 7.5, cellPadding: 3.5, overflow: 'ellipsize' },
      headStyles: { ...td.headStyles, fontSize: 8 },
      head: [['ID', 'Fecha', 'Cliente', 'Ingreso', 'Margen %']],
      body: rows.map((t) => {
        const ing = tripRevenueUSD(t);
        const pct = ing > 0 ? ((ing - t.totalCosts) / ing) * 100 : 0;
        return [
          t.id,
          t.fecha,
          t.clientName,
          fmt(ing),
          ing > 0 ? `${pct.toFixed(1)}%` : '—',
        ];
      }),
      columnStyles: {
        2: { cellWidth: 160, overflow: 'ellipsize' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });
    afterTable(ctx);
    setFont(doc, 'normal', 8);
    doc.setTextColor(...MUTED);
    ensure(ctx, 16);
    doc.text(`Mostrando ${rows.length} de ${data.trips.length} viajes.`, M, ctx.y);
    ctx.y += 16;
  }

  footer(doc, ctx.page, ctx.periodShort);
  return doc;
}

export function reportFileName(data: GeneralReportData): string {
  const slug = data.scope === 'historico' ? 'historico' : data.rangeEnd || 'periodo';
  return `GDC_${data.title.replace(/\s+/g, '_')}_${slug}.pdf`;
}

export function downloadReportPdf(
  data: GeneralReportData,
  fmt: (n: number) => string,
  charts: ChartImage[] = []
): void {
  const doc = buildReportPdf(data, fmt, charts);
  doc.save(reportFileName(data));
}

/** Devuelve el PDF como base64 (sin el prefijo data:) para enviarlo al backend. */
export function reportPdfBase64(
  data: GeneralReportData,
  fmt: (n: number) => string,
  charts: ChartImage[] = []
): string {
  const doc = buildReportPdf(data, fmt, charts);
  const dataUri = doc.output('datauristring');
  const comma = dataUri.indexOf(',');
  return comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
}
