import { NextResponse } from 'next/server';
import { searchPersonas } from '@/lib/searchPersonas';
import { withCors, CORS_HEADERS } from '@/lib/cors';
import { checkApiRateLimit } from '@/lib/apiRateLimit';
import { getClientIp } from '@/lib/rateLimit';

// API pública de búsqueda de personas rescatadas.
//
//   GET /api/v1/search?cedula=14072268
//   GET /api/v1/search?nombre=Juan Perez
//   GET /api/v1/search?q=Juan          (busca por nombre y/o cédula)
//   GET /api/v1/search?hospital=...    (filtro opcional)
//   GET /api/v1/search                 (listado completo, alfabético)
//
// Parámetros de paginación: page (1..N) y pageSize (1..100, por defecto 20).
// Devuelve JSON con CORS abierto para que se pueda consultar desde cualquier web.

// Respuesta al preflight de CORS del navegador.
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  // Límite de peticiones por IP (anti-abuso).
  const ip = getClientIp(request);
  const limit = checkApiRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones. Intenta de nuevo en unos segundos.' },
      {
        status: 429,
        headers: withCors({
          'Retry-After': String(limit.retryAfter),
          'X-RateLimit-Limit': String(limit.limit),
          'X-RateLimit-Remaining': '0',
        }),
      }
    );
  }

  const { searchParams } = new URL(request.url);

  try {
    const result = await searchPersonas({
      q: searchParams.get('q') || '',
      cedula: searchParams.get('cedula') || '',
      nombre: searchParams.get('nombre') || '',
      hospital: searchParams.get('hospital') || '',
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || '20', 10),
    });

    return NextResponse.json(result, {
      headers: withCors({
        'X-RateLimit-Limit': String(limit.limit),
        'X-RateLimit-Remaining': String(limit.remaining),
        'Cache-Control': 'public, max-age=30',
      }),
    });
  } catch (err) {
    console.error('Error en /api/v1/search:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
