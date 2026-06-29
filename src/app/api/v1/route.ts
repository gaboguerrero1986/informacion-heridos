import { NextResponse } from 'next/server';
import { withCors, CORS_HEADERS } from '@/lib/cors';

// Índice de la API pública: documenta cómo usarla.
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const base = new URL(request.url).origin;

  return NextResponse.json(
    {
      nombre: 'API pública - Búsqueda de Rescatados',
      version: '1',
      descripcion:
        'Consulta personas registradas en hospitales/refugios por cédula o por nombre y apellido.',
      endpoints: {
        buscar: {
          metodo: 'GET',
          url: `${base}/api/v1/search`,
          parametros: {
            cedula: 'Busca por cédula (se usan solo los dígitos, con o sin puntos / "V-").',
            nombre: 'Busca por nombre y/o apellido.',
            q: 'Texto libre: busca por nombre y, si parece cédula, también por cédula.',
            hospital: 'Filtro opcional por hospital (no distingue acentos ni mayúsculas).',
            page: 'Número de página (por defecto 1).',
            pageSize: 'Resultados por página (1 a 100, por defecto 20).',
          },
          ejemplos: [
            `${base}/api/v1/search?cedula=14072268`,
            `${base}/api/v1/search?nombre=Juan Perez`,
            `${base}/api/v1/search?q=Gabriela&page=1&pageSize=20`,
          ],
        },
        hospitales: {
          metodo: 'GET',
          url: `${base}/api/v1/hospitals`,
          descripcion: 'Lista de hospitales/centros para usar como filtro.',
        },
      },
      limites: 'Hasta 60 peticiones por minuto por IP. Si se supera, responde 429.',
    },
    { headers: withCors() }
  );
}
