import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { GeneralReportData } from '../types';
import { tripRevenueUSD } from './analytics';

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
const EMERALD: RGB = [16, 185, 129];
const RED: RGB = [225, 78, 78];
const AMBER: RGB = [217, 152, 19];
const BLUE: RGB = [37, 99, 235];
const LIGHT: RGB = [241, 245, 249];
const BORDER: RGB = [226, 232, 240];

const PAGE = { w: 595.28, h: 841.89 };
const M = 40;
const CONTENT_W = PAGE.w - M * 2;

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
}

function footer(doc: jsPDF, page: number): void {
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('GDC · Reporte generado automáticamente', M, PAGE.h - 22);
  doc.text(`Página ${page}`, PAGE.w - M, PAGE.h - 22, { align: 'right' });
}

function newPage(ctx: Ctx): void {
  footer(ctx.doc, ctx.page);
  ctx.doc.addPage();
  ctx.page += 1;
  ctx.y = M;
}

function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y + needed > PAGE.h - 50) newPage(ctx);
}

function sectionTitle(ctx: Ctx, text: string): void {
  ensure(ctx, 34);
  ctx.doc.setFillColor(...NAVY);
  ctx.doc.rect(M, ctx.y, 4, 14, 'F');
  ctx.doc.setFont('helvetica', 'bold');
  ctx.doc.setFontSize(12);
  ctx.doc.setTextColor(...NAVY);
  ctx.doc.text(text.toUpperCase(), M + 12, ctx.y + 11);
  ctx.y += 26;
}

function wrap(doc: jsPDF, text: string, width: number): string[] {
  return doc.splitTextToSize(text, width) as string[];
}

function drawCover(ctx: Ctx, data: GeneralReportData): void {
  const { doc } = ctx;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE.w, 150, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('GDC · TRANSPORTE DE CARGA', M, 46);
  doc.setFontSize(24);
  doc.text(data.title, M, 84);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(200, 214, 234);
  doc.text(data.periodLabel, M, 110);
  const gen = new Date(data.generatedAt).toLocaleString('es-UY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.setFontSize(9);
  doc.text(`Generado: ${gen}`, M, 130);
  ctx.y = 172;
}

function kpiGrid(
  ctx: Ctx,
  cards: { label: string; value: string; sub?: string; tone?: RGB }[]
): void {
  const cols = 3;
  const gap = 12;
  const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cardH = 56;
  cards.forEach((c, i) => {
    const col = i % cols;
    if (col === 0) {
      ensure(ctx, cardH + gap);
      if (i > 0) ctx.y += cardH + gap;
    }
    const x = M + col * (cardW + gap);
    const top = ctx.y;
    ctx.doc.setFillColor(...LIGHT);
    ctx.doc.setDrawColor(...BORDER);
    ctx.doc.roundedRect(x, top, cardW, cardH, 6, 6, 'FD');
    if (c.tone) {
      ctx.doc.setFillColor(...c.tone);
      ctx.doc.rect(x, top, 4, cardH, 'F');
    }
    ctx.doc.setFont('helvetica', 'normal');
    ctx.doc.setFontSize(7.5);
    ctx.doc.setTextColor(...MUTED);
    ctx.doc.text(c.label.toUpperCase(), x + 12, top + 16);
    ctx.doc.setFont('helvetica', 'bold');
    ctx.doc.setFontSize(14);
    ctx.doc.setTextColor(...NAVY);
    ctx.doc.text(c.value, x + 12, top + 36);
    if (c.sub) {
      ctx.doc.setFont('helvetica', 'normal');
      ctx.doc.setFontSize(7.5);
      ctx.doc.setTextColor(...SLATE);
      ctx.doc.text(c.sub, x + 12, top + 49);
    }
  });
  ctx.y += cardH + 8;
}

function bulletBox(
  ctx: Ctx,
  title: string,
  items: string[],
  tone: RGB
): void {
  if (items.length === 0) return;
  sectionTitle(ctx, title);
  items.forEach((it) => {
    const lines = wrap(ctx.doc, it, CONTENT_W - 30);
    const boxH = lines.length * 12 + 12;
    ensure(ctx, boxH + 6);
    const top = ctx.y;
    ctx.doc.setFillColor(tone[0], tone[1], tone[2]);
    ctx.doc.setDrawColor(tone[0], tone[1], tone[2]);
    // marcador
    ctx.doc.circle(M + 7, top + 7, 2.5, 'F');
    ctx.doc.setFont('helvetica', 'normal');
    ctx.doc.setFontSize(9.5);
    ctx.doc.setTextColor(...SLATE);
    ctx.doc.text(lines, M + 18, top + 8);
    ctx.y += boxH;
  });
  ctx.y += 6;
}

function marginColor(pct: number): RGB {
  if (pct > 20) return EMERALD;
  if (pct >= 5) return AMBER;
  return RED;
}

/** Construye el documento PDF completo del reporte. */
export function buildReportPdf(
  data: GeneralReportData,
  fmt: (n: number) => string,
  charts: ChartImage[] = []
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const ctx: Ctx = { doc, y: M, page: 1 };

  drawCover(ctx, data);

  // Resumen ejecutivo
  sectionTitle(ctx, 'Análisis ejecutivo');
  const summaryLines = wrap(doc, data.aiSummary, CONTENT_W - 24);
  const sumH = summaryLines.length * 13 + 20;
  ensure(ctx, sumH);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(M, ctx.y, CONTENT_W, sumH, 6, 6, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...SLATE);
  doc.text(summaryLines, M + 12, ctx.y + 16);
  ctx.y += sumH + 14;

  // KPIs principales
  sectionTitle(ctx, 'Indicadores principales');
  const cmp = data.comparison;
  const deltaStr = (v: number, pp = false) =>
    cmp.available ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}${pp ? ' pp' : '%'} ${cmp.label}` : undefined;
  kpiGrid(ctx, [
    { label: 'Ingresos generados', value: fmt(data.totalGenerado), sub: deltaStr(cmp.revenueDelta), tone: BLUE },
    { label: 'Ingresos cobrados', value: fmt(data.totalCobrado), sub: `${data.collectionRate.toFixed(0)}% de cobranza`, tone: EMERALD },
    { label: 'Pendiente de cobro', value: fmt(data.totalPendiente), sub: 'Facturado sin cobrar', tone: AMBER },
    { label: 'Costos totales', value: fmt(data.totalCostos), sub: deltaStr(cmp.costsDelta), tone: RED },
    { label: 'Margen neto', value: fmt(data.netMargin), sub: deltaStr(cmp.marginDelta), tone: marginColor(data.marginPct) },
    { label: 'Margen %', value: `${data.marginPct.toFixed(1)}%`, sub: deltaStr(cmp.marginPctDeltaPp, true), tone: marginColor(data.marginPct) },
    { label: 'Viajes', value: String(data.totalTrips), sub: `${data.completedTrips} completados`, tone: NAVY },
    { label: 'Ticket promedio', value: fmt(data.avgTicket), sub: 'Ingreso por viaje', tone: NAVY },
    { label: 'Costo por km', value: fmt(data.costPerKm), sub: `${Math.round(data.totalKm).toLocaleString('es-UY')} km`, tone: NAVY },
  ]);

  // Gráficos
  if (charts.length > 0) {
    sectionTitle(ctx, 'Tendencias y distribución');
    charts.forEach((ch) => {
      const imgW = CONTENT_W;
      const imgH = Math.min(230, imgW * ch.ratio);
      ensure(ctx, imgH + 24);
      if (ch.title) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...NAVY);
        doc.text(ch.title, M, ctx.y + 4);
        ctx.y += 12;
      }
      try {
        doc.addImage(ch.dataUrl, 'PNG', M, ctx.y, imgW, imgH, undefined, 'FAST');
      } catch (e) {
        console.warn('[pdfReport] addImage error:', e);
      }
      ctx.y += imgH + 14;
    });
  }

  // Destacados
  sectionTitle(ctx, 'Destacados del período');
  autoTable(doc, {
    startY: ctx.y,
    margin: { left: M, right: M },
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: 5, textColor: SLATE },
    columnStyles: { 0: { fontStyle: 'bold', textColor: NAVY, cellWidth: 150 } },
    body: [
      ['Mejor cliente', `${data.topClient.name} — ${fmt(data.topClient.revenue)} (${data.topClient.trips} viajes)`],
      ['Ruta destacada', `${data.topRoute.route} — ${fmt(data.topRoute.revenue)} (${data.topRoute.count} viajes)`],
      ['Producto top', `${data.topProduct.name} — ${fmt(data.topProduct.revenue)} (${data.topProduct.tons.toFixed(1)} t)`],
      ['Mejor margen', `${data.bestMarginTrip.id} (${data.bestMarginTrip.client}) — ${data.bestMarginTrip.marginPct.toFixed(1)}%`],
      ['Menor margen', `${data.worstMarginTrip.id} (${data.worstMarginTrip.client}) — ${data.worstMarginTrip.marginPct.toFixed(1)}%`],
    ],
  });
  ctx.y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  // Costos por categoría
  if (data.costsByCategory.length > 0) {
    sectionTitle(ctx, 'Desglose de costos por categoría');
    autoTable(doc, {
      startY: ctx.y,
      margin: { left: M, right: M },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 5 },
      head: [['Categoría', 'Total (USD eq.)', '% del total']],
      body: data.costsByCategory.map((r) => [
        r.category,
        fmt(r.total),
        `${r.pct.toFixed(1)}%`,
      ]),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    });
    ctx.y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  // Top clientes
  if (data.clientBreakdown.length > 0) {
    sectionTitle(ctx, 'Ingresos por cliente');
    autoTable(doc, {
      startY: ctx.y,
      margin: { left: M, right: M },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 5 },
      head: [['Cliente', 'Viajes', 'Ingresos', '% del total']],
      body: data.clientBreakdown.map((c) => [
        c.name,
        String(c.trips),
        fmt(c.revenue),
        `${data.totalGenerado > 0 ? ((c.revenue / data.totalGenerado) * 100).toFixed(1) : '0.0'}%`,
      ]),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });
    ctx.y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  }

  // Detalle de viajes (limitado)
  if (data.trips.length > 0) {
    sectionTitle(ctx, 'Detalle de viajes');
    const rows = data.trips.slice(0, 40);
    autoTable(doc, {
      startY: ctx.y,
      margin: { left: M, right: M },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 3.5, overflow: 'ellipsize' },
      head: [['ID', 'Fecha', 'Cliente', 'Ruta', 'Ingreso', 'Costos', 'Margen %']],
      body: rows.map((t) => {
        const ing = tripRevenueUSD(t);
        const pct = ing > 0 ? ((ing - t.totalCosts) / ing) * 100 : 0;
        return [
          t.id,
          t.fecha,
          t.clientName,
          `${t.origen} → ${t.destino}`,
          fmt(ing),
          fmt(t.totalCosts),
          ing > 0 ? `${pct.toFixed(1)}%` : '—',
        ];
      }),
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    });
    ctx.y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
    if (data.trips.length > rows.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      ensure(ctx, 16);
      doc.text(`Mostrando ${rows.length} de ${data.trips.length} viajes.`, M, ctx.y);
      ctx.y += 16;
    }
  }

  // Alertas y recomendaciones
  bulletBox(ctx, 'Alertas y riesgos', data.aiAlerts, RED);
  bulletBox(ctx, 'Recomendaciones y oportunidades', data.aiRecommendations, BLUE);

  footer(doc, ctx.page);
  return doc;
}

export function reportFileName(data: GeneralReportData): string {
  const slug = data.scope === 'historico' ? 'historico' : (data.rangeEnd || 'periodo');
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
