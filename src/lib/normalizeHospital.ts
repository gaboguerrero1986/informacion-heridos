// Unifica nombres de hospitales escritos de muchas formas distintas.
// Ejemplo: "carreño", "hospital carreño" y "Hospital Perez Carreño" deben
// quedar todos bajo un mismo nombre para que el filtro funcione como uno solo.
//
// Estrategia (auto-agrupar, sin lista fija):
//   1. Se reduce el nombre a sus "palabras distintivas" (se quitan palabras
//      genéricas como "hospital", "clínica", "de", "la", etc.).
//   2. Si esas palabras coinciden (una contiene a la otra) con un hospital que
//      YA existe en la base, se reutiliza esa escritura existente.
//   3. Si no coincide con ninguno, se usa el nombre tal cual (en formato bonito).

// Palabras genéricas que NO distinguen a un hospital de otro.
const HOSPITAL_STOPWORDS = new Set([
  'hospital', 'hosp', 'clinica', 'clinic', 'policlinica', 'poli', 'centro',
  'medico', 'medica', 'asistencial', 'ambulatorio', 'cdi', 'sanitario', 'salud',
  'general', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'a',
]);

// Palabras pequeñas que en formato bonito van en minúscula (salvo al inicio).
const SMALL_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e']);

/** Minúsculas, sin acentos, sin símbolos. Deja solo letras/números/espacios. */
export function normalizeText(s: string): string {
  return String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9\s]/g, ' ') // quita acentos (combinantes) y símbolos
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palabras distintivas de un hospital (sin genéricas ni artículos). */
export function hospitalTokens(name: string): string[] {
  return normalizeText(name)
    .split(' ')
    .filter((t) => t.length > 1 && !HOSPITAL_STOPWORDS.has(t));
}

/** ¿Todas las palabras de `a` están dentro del conjunto `b`? (a ⊆ b) */
function isSubset(a: string[], b: Set<string>): boolean {
  return a.length > 0 && a.every((t) => b.has(t));
}

/** Convierte "hospital perez carreño" en "Hospital Perez Carreño". */
function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w, i) => {
      const norm = normalizeText(w);
      if (i > 0 && SMALL_WORDS.has(norm)) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Devuelve el nombre "oficial" bajo el cual guardar el hospital entrante.
 * @param incoming      nombre tal cual lo escribió el usuario
 * @param existingNames nombres de hospitales que ya existen en la base
 */
export function canonicalizeHospital(incoming: string, existingNames: string[]): string {
  const inTokens = hospitalTokens(incoming);

  // Sin palabras distintivas (ej. solo "Hospital"): no hay con qué agrupar.
  if (inTokens.length === 0) return titleCase(incoming);

  const inSet = new Set(inTokens);

  // Buscamos hospitales existentes cuyas palabras se contengan en cualquier dirección.
  const matches = existingNames.filter((name) => {
    const t = hospitalTokens(name);
    return isSubset(inTokens, new Set(t)) || isSubset(t, inSet);
  });

  if (matches.length > 0) {
    // Nos quedamos con la versión existente más completa (más palabras, luego más larga).
    matches.sort((a, b) => {
      const da = hospitalTokens(a).length;
      const db = hospitalTokens(b).length;
      if (db !== da) return db - da;
      return b.length - a.length;
    });
    return matches[0];
  }

  // Hospital nuevo: lo guardamos en formato bonito.
  return titleCase(incoming);
}

/** Lista de hospitales únicos (sin distinguir mayúsculas/acentos) a partir de filas. */
export function uniqueHospitalNames(values: (string | null | undefined)[]): string[] {
  const map = new Map<string, string>();
  for (const v of values) {
    if (!v) continue;
    const key = normalizeText(v);
    if (key && !map.has(key)) map.set(key, v.trim());
  }
  return Array.from(map.values());
}
