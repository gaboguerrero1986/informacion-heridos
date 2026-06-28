// Parser tolerante para los Excel de hospitales/refugios.
// Cada documento lo hace una persona distinta, así que los encabezados, el orden
// de las columnas y los valores "vacíos" varían muchísimo. Esta función:
//   1. Detecta automáticamente la fila de cabecera (no asume que sea la primera).
//   2. Mapea columnas a nuestros campos usando una lista de sinónimos.
//   3. Limpia valores basura tipo "S/D", "N/A", "-" y los convierte en null.
//   4. Valida la cédula (solo dígitos, longitud plausible).
//   5. Detecta si la persona es menor de edad por las observaciones.

export type RescatadoRecord = {
  nombre: string;
  cedula: string | null;
  edad: string | null;
  procedencia: string | null;
  nota: string | null;
  hospital: string;
  estado: string;
};

export type ParseResult = {
  records: RescatadoRecord[];
  stats: {
    totalRows: number; // filas de datos consideradas (tras la cabecera)
    inserted: number; // registros válidos generados
    skipped: number; // filas descartadas (sin nombre válido)
    headerRowIndex: number; // índice de la fila usada como cabecera
    detectedColumns: Record<string, number>; // campo -> índice de columna
  };
  error?: string;
};

// Sinónimos ya normalizados (minúsculas, sin acentos, sin caracteres especiales).
const FIELD_SYNONYMS: Record<keyof Omit<RescatadoRecord, 'hospital' | 'estado'>, string[]> = {
  nombre: [
    'nombre', 'nombres', 'nombrecompleto', 'name', 'nombreyapellido',
    'nombreyapellidos', 'nombresyapellidos', 'apellidosynombres',
    'apellidosynombre', 'paciente', 'herido', 'persona', 'victima', 'rescatado',
  ],
  cedula: [
    'cedula', 'ci', 'ceduladeidentidad', 'documento', 'documentodeidentidad',
    'identificacion', 'dni', 'nrocedula', 'numerodecedula', 'nrodecedula', 'cilegal',
  ],
  edad: ['edad', 'anos', 'age', 'edadaproximada', 'edadanos'],
  procedencia: [
    'procedencia', 'origen', 'direccion', 'lugar', 'ciudad', 'sector',
    'localidad', 'municipio', 'parroquia', 'estado2',
  ],
  nota: [
    'nota', 'notas', 'observacion', 'observaciones', 'obs', 'estado',
    'diagnostico', 'detalles', 'condicion', 'comentario', 'comentarios', 'descripcion',
  ],
};

// Valores que en la práctica significan "no hay dato".
const EMPTY_TOKENS = new Set([
  '', 'sd', 'na', 'ninguno', 'ninguna', 'nodisponible', 'sininformacion',
  'sininfo', 'sinnombre', 'nodata', 'null', 'undefined', 'x', 'xx', 'xxx',
]);

const MINOR_REGEX = /\b(menor|menor de edad|infante|ni[nñ]o|ni[nñ]a|beb[eé]|lactante|recien nacido)\b/i;

/** Normaliza un encabezado para compararlo con los sinónimos. */
function normalizeKey(key: unknown): string {
  return String(key)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, ''); // quita tildes (combinantes), espacios y símbolos
}

/** Convierte un valor de celda en texto limpio, o null si es basura/placeholder. */
function cleanValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;

  // Normalizamos para comparar contra los tokens vacíos (quita /, ., -, espacios).
  const norm = text.toLowerCase().replace(/[\s/.\-_]/g, '');
  if (EMPTY_TOKENS.has(norm)) return null;

  return text;
}

/** Devuelve solo los dígitos de la cédula si parece un documento real. */
function cleanCedula(value: unknown): string | null {
  const text = cleanValue(value);
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  // Una cédula real tiene al menos 5 dígitos; así descartamos "S/D (MENOR)", etc.
  if (digits.length < 5) return null;
  return digits;
}

/** Construye el mapa campo -> índice de columna a partir de una fila de cabecera. */
function buildColumnMap(headerRow: unknown[]): Partial<Record<keyof typeof FIELD_SYNONYMS, number>> {
  const map: Partial<Record<keyof typeof FIELD_SYNONYMS, number>> = {};

  headerRow.forEach((cell, colIndex) => {
    const norm = normalizeKey(cell);
    if (!norm) return;
    for (const field of Object.keys(FIELD_SYNONYMS) as (keyof typeof FIELD_SYNONYMS)[]) {
      // Solo asignamos la primera columna que coincida con cada campo.
      if (map[field] === undefined && FIELD_SYNONYMS[field].includes(norm)) {
        map[field] = colIndex;
      }
    }
  });

  return map;
}

/** Cuenta cuántos campos reconoce una fila candidata a cabecera. */
function scoreHeaderRow(row: unknown[]): { score: number; hasNombre: boolean } {
  const map = buildColumnMap(row);
  const fields = Object.keys(map) as (keyof typeof FIELD_SYNONYMS)[];
  return { score: fields.length, hasNombre: map.nombre !== undefined };
}

/**
 * Recibe la hoja como matriz (array de arrays) y el nombre del hospital.
 * Usa xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' }) para obtener `rows`.
 */
export function parseRescatados(rows: unknown[][], hospitalName: string): ParseResult {
  const emptyStats = {
    totalRows: 0,
    inserted: 0,
    skipped: 0,
    headerRowIndex: -1,
    detectedColumns: {} as Record<string, number>,
  };

  if (!rows || rows.length === 0) {
    return { records: [], stats: emptyStats, error: 'El archivo está vacío.' };
  }

  // 1. Buscar la fila de cabecera entre las primeras 15 filas: la que reconozca más campos.
  const limit = Math.min(rows.length, 15);
  let headerRowIndex = -1;
  let best = { score: 0, hasNombre: false };

  for (let i = 0; i < limit; i++) {
    const { score, hasNombre } = scoreHeaderRow(rows[i]);
    // Preferimos filas con columna de nombre y mayor puntaje.
    const better =
      (hasNombre && !best.hasNombre) ||
      (hasNombre === best.hasNombre && score > best.score);
    if (better && score > 0) {
      best = { score, hasNombre };
      headerRowIndex = i;
    }
  }

  if (headerRowIndex === -1 || !best.hasNombre) {
    return {
      records: [],
      stats: emptyStats,
      error:
        'No se reconocieron las columnas. El archivo debe tener una fila de encabezados con al menos una columna de Nombre (ej: "Nombre", "Nombre y Apellido", "Paciente").',
    };
  }

  const colMap = buildColumnMap(rows[headerRowIndex]);
  const dataRows = rows.slice(headerRowIndex + 1);

  const records: RescatadoRecord[] = [];
  let skipped = 0;

  const get = (row: unknown[], field: keyof typeof FIELD_SYNONYMS): unknown => {
    const idx = colMap[field];
    return idx === undefined ? undefined : row[idx];
  };

  for (const row of dataRows) {
    // Saltar filas totalmente vacías.
    if (!row || row.every((c) => cleanValue(c) === null)) continue;

    const nombre = cleanValue(get(row, 'nombre'));
    if (!nombre || !/[a-záéíóúñ]/i.test(nombre)) {
      // Sin nombre legible no sirve para el buscador.
      skipped++;
      continue;
    }

    const cedula = cleanCedula(get(row, 'cedula'));
    let edad = cleanValue(get(row, 'edad'));
    const procedencia = cleanValue(get(row, 'procedencia'));
    const nota = cleanValue(get(row, 'nota'));

    // Detección de menores: si lo dice alguna celda y no hay edad, lo marcamos.
    const rawCedula = get(row, 'cedula');
    const combinedText = [edad, nota, rawCedula ? String(rawCedula) : '']
      .filter(Boolean)
      .join(' ');
    if (!edad && MINOR_REGEX.test(combinedText)) {
      edad = 'Menor de edad';
    }

    records.push({
      nombre,
      cedula,
      edad,
      procedencia,
      nota,
      hospital: hospitalName,
      estado: 'Registrado',
    });
  }

  return {
    records,
    stats: {
      totalRows: dataRows.length,
      inserted: records.length,
      skipped,
      headerRowIndex,
      detectedColumns: colMap as Record<string, number>,
    },
  };
}
