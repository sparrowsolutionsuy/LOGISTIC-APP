import { GoogleGenerativeAI } from '@google/generative-ai';
import type { RemitoExtracted, RemitoConfidenceLevel, RemitoExtractionResult } from '../types';

const EXTRACTION_PROMPT = `
Analizá esta imagen de un remito de transporte de carga de Uruguay.
Extraé la información y respondé ÚNICAMENTE con un JSON válido, sin markdown ni texto adicional.

El JSON debe tener EXACTAMENTE esta estructura:
{
  "fecha": "YYYY-MM-DD o null si no encontrás",
  "origen": "ciudad o localidad de origen o null",
  "destino": "ciudad o localidad de destino o null",
  "contenido": "descripción del producto/carga o null",
  "pesoKg": número en kilogramos (convertí toneladas si es necesario) o null,
  "proveedor": "nombre del remitente/proveedor o null",
  "numeroRemito": "número o código del remito o null",
  "confianza": {
    "fecha": "high/medium/low",
    "origen": "high/medium/low",
    "destino": "high/medium/low",
    "contenido": "high/medium/low",
    "pesoKg": "high/medium/low",
    "proveedor": "high/medium/low",
    "numeroRemito": "high/medium/low"
  },
  "rawText": "todo el texto visible en el documento"
}

Reglas:
- Si el peso está en toneladas, convertilo a kg (multiplicar por 1000)
- Las fechas deben estar en formato YYYY-MM-DD
- Para ciudades uruguayas, normalizá la ortografía (Paysandú, Río Negro, etc.)
- Si un campo no es visible o está ilegible, poné null
- La confianza "high" = texto claramente legible, "medium" = parcialmente legible, "low" = inferido o dudoso
`;

function parseConfidence(v: unknown): RemitoConfidenceLevel {
  if (v === 'high' || v === 'medium' || v === 'low') {
    return v;
  }
  return 'low';
}

function strOrNull(v: unknown): string | null {
  if (v == null) {
    return null;
  }
  const s = String(v).trim();
  if (s === '' || s.toLowerCase() === 'null') {
    return null;
  }
  return s;
}

export async function extractRemitoData(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<RemitoExtractionResult> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

  if (!apiKey?.trim()) {
    console.warn('[Remito] VITE_GEMINI_API_KEY no configurada — usando extracción simulada');
    return getMockExtraction();
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent([
      EXTRACTION_PROMPT,
      {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      },
    ]);

    const responseText = result.response.text().trim();
    const cleanJson = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleanJson) as Record<string, unknown>;
    const conf = (parsed.confianza && typeof parsed.confianza === 'object'
      ? (parsed.confianza as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    const pesoRaw = parsed.pesoKg;
    const pesoNum =
      pesoRaw != null && pesoRaw !== '' && Number.isFinite(Number(pesoRaw)) ? Number(pesoRaw) : null;

    const extracted: RemitoExtracted = {
      fecha: {
        value: strOrNull(parsed.fecha),
        confidence: parseConfidence(conf.fecha),
      },
      origen: {
        value: strOrNull(parsed.origen),
        confidence: parseConfidence(conf.origen),
      },
      destino: {
        value: strOrNull(parsed.destino),
        confidence: parseConfidence(conf.destino),
      },
      contenido: {
        value: strOrNull(parsed.contenido),
        confidence: parseConfidence(conf.contenido),
      },
      pesoKg: {
        value: pesoNum,
        confidence: parseConfidence(conf.pesoKg),
      },
      proveedor: {
        value: strOrNull(parsed.proveedor),
        confidence: parseConfidence(conf.proveedor),
      },
      numeroRemito: {
        value: strOrNull(parsed.numeroRemito),
        confidence: parseConfidence(conf.numeroRemito),
      },
      rawText: parsed.rawText != null ? String(parsed.rawText) : '',
    };

    return { success: true, data: extracted };
  } catch (err) {
    console.error('[Remito] Error en extracción:', err);
    return {
      success: false,
      error:
        err instanceof SyntaxError
          ? 'No se pudo interpretar la respuesta de IA. Ingresá los datos manualmente.'
          : 'Error al procesar el remito. Verificá tu conexión e intentá nuevamente.',
    };
  }
}

function getMockExtraction(): RemitoExtractionResult {
  return {
    success: true,
    data: {
      fecha: { value: new Date().toISOString().split('T')[0], confidence: 'high' },
      origen: { value: 'Paysandú', confidence: 'high' },
      destino: { value: 'Montevideo', confidence: 'high' },
      contenido: { value: 'Soja a granel', confidence: 'medium' },
      pesoKg: { value: 28000, confidence: 'high' },
      proveedor: { value: 'Agro Demo S.A.', confidence: 'medium' },
      numeroRemito: { value: 'R-2026-0042', confidence: 'high' },
      rawText: '[Datos simulados — configurá VITE_GEMINI_API_KEY para extracción real]',
    },
  };
}
