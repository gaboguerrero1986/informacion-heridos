// Evita que el mismo paciente quede registrado dos veces en el mismo hospital.
// Cuando se sube un Excel o se registra a mano, se compara contra lo que ya
// existe (del mismo hospital) y contra los demás registros del propio lote:
//   - Si coincide la cédula, es la misma persona.
//   - Si no hay cédula, se comparan los nombres SIN importar el orden y
//     permitiendo que uno esté contenido en el otro. Así "Parra Gabriela",
//     "Gabriela Parra" y "Parra Misel Gabriela" se reconocen como la misma.
//   - Se fusiona en un solo registro: se prioriza el que tiene cédula, se
//     rellenan los datos que falten y se conserva el nombre MÁS COMPLETO
//     (la versión con más palabras), tal cual está escrito.

import { normalizeText } from './normalizeHospital';

export type Persona = {
  id?: string;
  nombre: string;
  cedula: string | null;
  edad: string | null;
  procedencia: string | null;
  nota: string | null;
  hospital: string;
  estado: string;
};

/** Palabras significativas de un nombre (sin acentos, sin iniciales sueltas). */
export function nameTokens(n: string): string[] {
  return normalizeText(n)
    .split(' ')
    .filter((t) => t.length > 1);
}

/**
 * ¿Dos nombres son de la misma persona? Compara las palabras sin importar el
 * orden. Coinciden si tienen exactamente las mismas, o si las de uno (al menos
 * dos) están todas contenidas en el otro.
 */
export function namesMatch(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;

  const setA = new Set(a);
  const setB = new Set(b);

  // Mismas palabras en cualquier orden (ej. "Parra Gabriela" = "Gabriela Parra").
  if (setA.size === setB.size && [...setA].every((t) => setB.has(t))) return true;

  // Una contenida en la otra (ej. "Gabriela Parra" ⊆ "Parra Misel Gabriela").
  // Exigimos al menos 2 palabras en común para no unir gente distinta por un solo nombre.
  const [small, big] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  if (small.size < 2) return false;
  return [...small].every((t) => big.has(t));
}

/** Devuelve el nombre más completo entre dos (más palabras, luego más largo). */
function masCompleto(a: string, b: string): string {
  const ta = nameTokens(a).length;
  const tb = nameTokens(b).length;
  if (tb > ta) return b.trim();
  if (tb === ta && b.trim().length > a.trim().length) return b.trim();
  return a;
}

/**
 * Vuelca los datos de `extra` sobre `base` sin perder información.
 * Devuelve true si `base` cambió.
 */
export function mergePersona(base: Persona, extra: Persona): boolean {
  let changed = false;

  // Nombre: conservamos la versión más completa, tal cual está escrita.
  const mejorNombre = masCompleto(base.nombre, extra.nombre);
  if (mejorNombre !== base.nombre) {
    base.nombre = mejorNombre;
    changed = true;
  }

  if (!base.cedula && extra.cedula) {
    base.cedula = extra.cedula;
    changed = true;
  }
  if (!base.edad && extra.edad) {
    base.edad = extra.edad;
    changed = true;
  }
  if (!base.procedencia && extra.procedencia) {
    base.procedencia = extra.procedencia;
    changed = true;
  }
  if (extra.nota) {
    if (!base.nota) {
      base.nota = extra.nota;
      changed = true;
    } else {
      const existentes = base.nota.split('|').map((s) => s.trim().toLowerCase());
      if (!existentes.includes(extra.nota.trim().toLowerCase())) {
        base.nota = `${base.nota} | ${extra.nota}`;
        changed = true;
      }
    }
  }
  // Si el registro base solo tenía el estado por defecto, tomamos uno más informativo.
  if ((!base.estado || base.estado === 'Registrado') && extra.estado && extra.estado !== 'Registrado') {
    base.estado = extra.estado;
    changed = true;
  }

  return changed;
}

type Entry = { rec: Persona; tokens: string[]; isNew: boolean; dirty: boolean };

export type ConsolidateResult = {
  inserts: Persona[]; // registros nuevos a insertar
  updates: Persona[]; // registros existentes (con id) que cambiaron y hay que actualizar
  mergedCount: number; // cuántos entrantes se fusionaron con otro (duplicados evitados)
};

/**
 * Consolida una lista de registros entrantes contra los que ya existen.
 * Asume que todos son del mismo hospital. No modifica los existentes que no cambian.
 */
export function consolidatePersonas(existing: Persona[], incoming: Persona[]): ConsolidateResult {
  const byCedula = new Map<string, Entry>();
  const entries: Entry[] = [];

  const indexCedula = (e: Entry) => {
    if (e.rec.cedula && !byCedula.has(e.rec.cedula)) byCedula.set(e.rec.cedula, e);
  };

  // 1. Cargamos lo que ya existe en la base.
  for (const row of existing) {
    const e: Entry = { rec: { ...row }, tokens: nameTokens(row.nombre), isNew: false, dirty: false };
    entries.push(e);
    indexCedula(e);
  }

  // Busca la persona que coincide con un registro entrante (cédula primero, luego nombre).
  const findMatch = (r: Persona, rTokens: string[]): Entry | undefined => {
    if (r.cedula && byCedula.has(r.cedula)) return byCedula.get(r.cedula);
    for (const e of entries) {
      if (!namesMatch(rTokens, e.tokens)) continue;
      // Si ambos tienen cédula y son distintas, son personas diferentes.
      if (r.cedula && e.rec.cedula && r.cedula !== e.rec.cedula) continue;
      return e;
    }
    return undefined;
  };

  // 2. Procesamos los entrantes, fusionando cuando coinciden.
  let mergedCount = 0;
  for (const r of incoming) {
    const rTokens = nameTokens(r.nombre);
    const match = findMatch(r, rTokens);

    if (match) {
      const changed = mergePersona(match.rec, r);
      if (changed) {
        match.tokens = nameTokens(match.rec.nombre); // el nombre pudo crecer
        if (!match.isNew) match.dirty = true;
      }
      mergedCount++;
      indexCedula(match); // si ganó cédula, lo indexamos
    } else {
      const e: Entry = { rec: { ...r }, tokens: rTokens, isNew: true, dirty: false };
      entries.push(e);
      indexCedula(e);
    }
  }

  return {
    inserts: entries.filter((e) => e.isNew).map((e) => e.rec),
    updates: entries.filter((e) => !e.isNew && e.dirty).map((e) => e.rec),
    mergedCount,
  };
}
