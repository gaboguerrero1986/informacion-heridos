// Lógica de búsqueda compartida por el frontend (/api/search) y la API pública
// (/api/v1/search). Centralizar esto evita duplicar el manejo del límite de
// 1000 filas de Supabase, la deduplicación y la paginación.

import { supabase } from './supabaseClient';
import { consolidatePersonas, Persona } from './dedupePersonas';
import { normalizeText } from './normalizeHospital';

export type SearchParams = {
  /** Texto libre: busca por nombre y, si parece cédula, también por cédula. */
  q?: string;
  /** Búsqueda explícita por cédula (se usan solo los dígitos). */
  cedula?: string;
  /** Búsqueda explícita por nombre y/o apellido. */
  nombre?: string;
  /** Filtro opcional por hospital (insensible a acentos y mayúsculas). */
  hospital?: string;
  page?: number;
  pageSize?: number;
};

export type SearchResult = {
  data: Persona[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** true cuando no se buscó nada y se devuelve el listado completo. */
  listing: boolean;
};

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
    const key = normalizeText(r.hospital || '');
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

/**
 * Busca personas por nombre/apellido y/o cédula, deduplica y pagina.
 * Si no se pasa ningún término de búsqueda, devuelve el listado completo en
 * orden alfabético.
 */
export async function searchPersonas(params: SearchParams): Promise<SearchResult> {
  const pageSize = Math.min(Math.max(Math.trunc(params.pageSize ?? 20) || 20, 1), 100);
  const page = Math.max(Math.trunc(params.page ?? 1) || 1, 1);

  const q = (params.q || '').trim();
  const hospital = (params.hospital || '').trim();

  // Término de nombre: explícito (nombre=) o el texto libre (q=).
  const nameTerm = (params.nombre || q).trim();
  // Término de cédula: explícito (cedula=) o el texto libre (q=), solo dígitos.
  const cedulaDigits = (params.cedula || q).replace(/\D/g, '');

  // Construimos el filtro .or() de PostgREST según lo que haya.
  const orParts: string[] = [];
  if (nameTerm.length >= 2) {
    const safeName = nameTerm.replace(/[(),]/g, ' '); // no romper el filtro .or()
    orParts.push(`nombre.ilike.%${safeName}%`);
  }
  if (cedulaDigits.length >= 4) {
    orParts.push(`cedula.ilike.%${cedulaDigits}%`);
  }

  const listing = orParts.length === 0;

  let rows: Persona[];
  if (listing) {
    // Sin términos de búsqueda -> listado completo, alfabético.
    rows = await fetchAll(() =>
      supabase.from('personas_rescatadas').select('*').order('nombre', { ascending: true })
    );
  } else {
    rows = await fetchAll(() =>
      supabase.from('personas_rescatadas').select('*').or(orParts.join(','))
    );
  }

  // Filtro por hospital en JS, insensible a acentos y mayúsculas.
  if (hospital !== '') {
    const hKey = normalizeText(hospital);
    rows = rows.filter((r) => normalizeText(r.hospital || '') === hKey);
  }

  // Deduplicar + ordenar todo el conjunto, y recién entonces paginar.
  const full = sortByName(dedupeForDisplay(rows));
  const total = full.length;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageData = full.slice(start, start + pageSize);

  return {
    data: pageData,
    total,
    page: safePage,
    pageSize,
    totalPages,
    listing,
  };
}
