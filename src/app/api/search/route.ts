import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { consolidatePersonas, Persona } from '@/lib/dedupePersonas';

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

  try {
    // CASO 1: sin texto de búsqueda -> listado alfabético de todas las personas
    // (opcionalmente filtrado por hospital). Incluye a quienes no tienen cédula.
    if (q === '') {
      let query = supabase.from('personas_rescatadas').select('*');
      if (hospital !== '') {
        query = query.ilike('hospital', `%${hospital}%`);
      }
      query = query.order('nombre', { ascending: true }).limit(1000);

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching data:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const result = sortByName(dedupeForDisplay((data || []) as Persona[]));
      return NextResponse.json({ data: result, listing: true, total: result.length });
    }

    // CASO 2: búsqueda por nombre o cédula.
    let query = supabase.from('personas_rescatadas').select('*');

    // Para la cédula nos quedamos SOLO con los dígitos. Así "14.072.268",
    // "14072268" o "V-14.072.268" buscan todos la cédula 14072268.
    const digits = q.replace(/\D/g, '');
    // Escapamos comas y paréntesis para no romper la sintaxis del filtro .or() de PostgREST.
    const safeQ = q.replace(/[(),]/g, ' ');

    const orParts = [`nombre.ilike.%${safeQ}%`];
    // Solo buscamos por cédula si hay suficientes dígitos (evita coincidir con todo).
    if (digits.length >= 4) {
      orParts.push(`cedula.ilike.%${digits}%`);
    }

    query = query.or(orParts.join(','));

    if (hospital !== '') {
      query = query.ilike('hospital', `%${hospital}%`);
    }

    query = query.limit(100);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching data:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = sortByName(dedupeForDisplay((data || []) as Persona[]));
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
