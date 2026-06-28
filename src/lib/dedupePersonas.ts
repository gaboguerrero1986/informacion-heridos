// Evita que el mismo paciente quede registrado dos veces en el mismo hospital.
// Cuando se sube un Excel o se registra a mano, se compara contra lo que ya
// existe (del mismo hospital) y contra los demás registros del propio lote:
//   - Si coincide la cédula, o coincide el nombre (cuando falta la cédula),
//     se trata como la misma persona.
//   - Se fusiona en un solo registro, priorizando el que tiene cédula y
//     rellenando los datos que falten (edad, procedencia, nota...).

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

/** Clave de nombre para comparar (sin acentos, mayúsculas ni espacios extra). */
export function personName(n: string): string {
  return normalizeText(n);
}

/**
 * Vuelca los datos de `extra` sobre `base` sin perder información.
 * Devuelve true si `base` cambió.
 */
export function mergePersona(base: Persona, extra: Persona): boolean {
  let changed = false;

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

type Entry = { rec: Persona; isNew: boolean; dirty: boolean };

export type ConsolidateResult = {
  inserts: Persona[]; // registros nuevos a insertar
  updates: Persona[]; // registros existentes (con id) que cambiaron y hay que actualizar
  mergedCount: number; // cuántos entrantes se fusionaron con otro (duplicados evitados)
};

/**
 * Consolida una lista de registros entrantes contra los que ya existen.
 * No modifica los registros existentes que no cambian.
 */
export function consolidatePersonas(existing: Persona[], incoming: Persona[]): ConsolidateResult {
  const byCedula = new Map<string, Entry>();
  const byName = new Map<string, Entry>();
  const all: Entry[] = [];

  const indexEntry = (e: Entry) => {
    if (e.rec.cedula && !byCedula.has(e.rec.cedula)) byCedula.set(e.rec.cedula, e);
    const nk = personName(e.rec.nombre);
    if (nk && !byName.has(nk)) byName.set(nk, e);
  };

  // 1. Cargamos lo que ya existe en la base.
  for (const row of existing) {
    const e: Entry = { rec: { ...row }, isNew: false, dirty: false };
    all.push(e);
    indexEntry(e);
  }

  // 2. Procesamos los entrantes, fusionando cuando coinciden.
  let mergedCount = 0;
  for (const r of incoming) {
    const match =
      (r.cedula ? byCedula.get(r.cedula) : undefined) || byName.get(personName(r.nombre));

    if (match) {
      const changed = mergePersona(match.rec, r);
      if (changed && !match.isNew) match.dirty = true;
      mergedCount++;
      // Si acaba de ganar cédula, lo indexamos también por cédula.
      if (match.rec.cedula && !byCedula.has(match.rec.cedula)) {
        byCedula.set(match.rec.cedula, match);
      }
    } else {
      const e: Entry = { rec: { ...r }, isNew: true, dirty: false };
      all.push(e);
      indexEntry(e);
    }
  }

  return {
    inserts: all.filter((e) => e.isNew).map((e) => e.rec),
    updates: all.filter((e) => !e.isNew && e.dirty).map((e) => e.rec),
    mergedCount,
  };
}
