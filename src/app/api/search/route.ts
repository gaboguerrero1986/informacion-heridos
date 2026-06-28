import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { consolidatePersonas, Persona } from '@/lib/dedupePersonas';

// Trae TODAS las filas que cumplan la consulta, en bloques de 1000 (límite de
// Supabase por petición). Así la deduplicación y la paginación son correctas
// aunque haya más de 1000 personas.
async function fetchAll(makeQuery: () => any): Promise<Persona[]> {
  const CHUNK = 1000;
  const MAX_CHUNKS = 50; // tope de seguridad (50.000 filas)
  let from = 0;
  const all: Persona[] = [];

  for (let i = 0; i < MAX_CHUNKS; i++) {
    const { data, error } = await makeQuery().range(from, from + CHUNK - 1);
    if (error) throw error;
    const batch = (data || []) as Persona[];
    all.push(...batch);
    if (batch.length < CHUNK) break;
    from += CHUNK;
  }
  return all;
}

// Deduplica para mostrar: agrupa por hospital y fusiona la misma persona
// (por cédula, o por nombre cuando no hay cédula). Así no aparece dos veces.
function dedupeForDisplay(rows: Persona[]): Persona[] {
  const groups = new Map<string, Persona[]>();
  for (const r of rows) {
    const key = (r.hospital || '').toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const out: Persona[] = [];
  for (const g of groups.values()) {
    const { inserts } = consolidatePersonas([], g);
    out.push(...inserts);
  }
  return out;
}

// Orden alfabético por nombre, sin distinguir mayúsculas ni acentos.
function sortByName(rows: Persona[]): Persona[] {
  return rows.sort((a, b) =>
    (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' })
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const hospital = (searchParams.get('hospital') || '').trim();

  // Paginación: 20 por página por defecto.
  const pageSize = Math.min(Math.max(parseInt(searchParams.get('pageSize') || '20', 10) || 20, 1), 100);
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);

  try {
    let rows: Persona[];

    if (q === '') {
      // CASO 1: sin texto -> listado completo (opcionalmente filtrado por hospital).
      rows = await fetchAll(() => {
        let query = supabase.from('personas_rescatadas').select('*');
        if (hospital !== '') query = query.ilike('hospital', `%${hospital}%`);
        return query.order('nombre', { ascending: true });
      });
    } else {
      // CASO 2: búsqueda por nombre o cédula.
      // La cédula se busca por SOLO dígitos: "14.072.268" / "V-14.072.268" -> 14072268.
      const digits = q.replace(/\D/g, '');
      const safeQ = q.replace(/[(),]/g, ' '); // no romper el filtro .or() de PostgREST
      const orParts = [`nombre.ilike.%${safeQ}%`];
      if (digits.length >= 4) orParts.push(`cedula.ilike.%${digits}%`);
      const orStr = orParts.join(',');

      rows = await fetchAll(() => {
        let query = supabase.from('personas_rescatadas').select('*').or(orStr);
        if (hospital !== '') query = query.ilike('hospital', `%${hospital}%`);
        return query;
      });
    }

    // Deduplicar + ordenar todo el conjunto, y recién entonces paginar.
    const full = sortByName(dedupeForDisplay(rows));
    const total = full.length;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pageData = full.slice(start, start + pageSize);

    return NextResponse.json({
      data: pageData,
      total,
      page: safePage,
      pageSize,
      totalPages,
      listing: q === '',
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
