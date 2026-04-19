import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIInsight, Client, Trip } from '../types';
import { BASE_GDC } from '../constants';

export const generateLogisticsInsights = async (
  trips: Trip[],
  clients: Client[]
): Promise<AIInsight[]> => {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

    if (!apiKey) {
      console.warn('Gemini API Key missing');
      return [
        {
          title: 'Configuración Requerida',
          description:
            'Agregue su API Key de Gemini en el archivo .env para obtener insights.',
          type: 'info',
        },
      ];
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const activeTrips = trips.filter(
      (t) => t.estado === 'En Tránsito' || t.estado === 'Pendiente'
    );

    const prompt = `
      Actúa como un Gerente de Logística Experto para GDC (Transporte de Carga en Uruguay).
      Nuestra Base Operativa está en: ${BASE_GDC.nombre} (Lat: ${BASE_GDC.lat}, Lng: ${BASE_GDC.lng}).
      
      Analiza los siguientes datos y proporciona 3 sugerencias breves y estratégicas para optimizar la logística.
      PRIORIDAD: Optimizar "viajes de retorno" (backhaul) que minimicen el desvío hacia la base en ${BASE_GDC.nombre} desde los puntos de destino actuales.
      
      Clientes Disponibles (Ubicaciones):
      ${JSON.stringify(
        clients.map((c) => ({
          nombre: c.nombreComercial,
          loc: c.localidad,
          dep: c.departamento,
          lat: c.latitud,
          lng: c.longitud,
        }))
      )}
      
      Viajes Activos (Donde quedarán los camiones):
      ${JSON.stringify(
        activeTrips.map((t) => ({
          id: t.id,
          origen: t.origen,
          destino: t.destino,
          carga: t.contenido,
        }))
      )}
      
      Devuelve SOLO un array JSON válido con la siguiente estructura:
      [
        { "title": "Título corto", "description": "Explicación de 1 frase", "type": "optimization" | "alert" | "info" }
      ]
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      return [];
    }

    return JSON.parse(text) as AIInsight[];
  } catch (error) {
    console.error('Error fetching Gemini insights:', error);
    return [
      {
        title: 'Error de IA',
        description: 'Verifique su conexión o el límite de su API Key.',
        type: 'alert',
      },
    ];
  }
};
