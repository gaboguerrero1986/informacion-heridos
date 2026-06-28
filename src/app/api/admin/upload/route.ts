import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as xlsx from 'xlsx';
import { parseRescatados } from '@/lib/parseRescatados';
import { canonicalizeHospital, uniqueHospitalNames } from '@/lib/normalizeHospital';
import { consolidatePersonas, Persona } from '@/lib/dedupePersonas';

export async function POST(request: Request) {
  try {
    // Basic auth check
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
      return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const hospitalName = formData.get('hospital') as string;

    if (!file || !hospitalName) {
      return NextResponse.json({ success: false, message: 'Faltan datos (archivo u hospital)' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Leemos la hoja como matriz (sin asumir que la cabecera está en la fila 0)
    // y dejamos que el parser detecte cabecera, mapee columnas y limpie la basura.
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

    // Inicializamos el cliente con service_role para saltar el RLS (escritura desde backend).
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Unificamos el nombre del hospital con los que ya existen en la base.
    const { data: hospRows } = await adminSupabase
      .from('personas_rescatadas')
      .select('hospital')
      .not('hospital', 'is', null);
    const existingHospitals = uniqueHospitalNames((hospRows || []).map((r) => r.hospital));
    const canonicalHospital = canonicalizeHospital(hospitalName.trim(), existingHospitals);

    // 2. Parseamos el Excel usando ya el nombre unificado del hospital.
    const { records, stats, error: parseError } = parseRescatados(rows, canonicalHospital);

    if (parseError) {
      return NextResponse.json({ success: false, message: parseError }, { status: 400 });
    }

    if (records.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No se encontraron registros válidos en el archivo.' },
        { status: 400 }
      );
    }

    // 3. Traemos los registros que ya existen de ese hospital y consolidamos duplicados.
    const { data: existingRows } = await adminSupabase
      .from('personas_rescatadas')
      .select('*')
      .eq('hospital', canonicalHospital);

    const { inserts, updates, mergedCount } = consolidatePersonas(
      (existingRows || []) as Persona[],
      records as Persona[]
    );

    // 4. Escribimos: insertamos los nuevos y actualizamos los que se enriquecieron.
    const cols = (p: Persona, withId: boolean) => ({
      ...(withId && p.id ? { id: p.id } : {}),
      nombre: p.nombre,
      cedula: p.cedula,
      edad: p.edad,
      procedencia: p.procedencia,
      nota: p.nota,
      hospital: p.hospital,
      estado: p.estado,
    });

    if (inserts.length > 0) {
      const { error } = await adminSupabase
        .from('personas_rescatadas')
        .insert(inserts.map((p) => cols(p, false)));
      if (error) throw error;
    }

    if (updates.length > 0) {
      const { error } = await adminSupabase
        .from('personas_rescatadas')
        .upsert(updates.map((p) => cols(p, true)), { onConflict: 'id' });
      if (error) throw error;
    }

    const detectados = Object.keys(stats.detectedColumns).join(', ') || 'ninguna';
    const omitidas = stats.skipped > 0 ? ` ${stats.skipped} fila(s) omitidas por no tener nombre válido.` : '';
    const fusionados = mergedCount > 0 ? ` ${mergedCount} duplicado(s) fusionado(s) con registros existentes.` : '';

    return NextResponse.json({
      success: true,
      message:
        `Hospital unificado como "${canonicalHospital}". ` +
        `${inserts.length} registro(s) nuevo(s) insertado(s),${updates.length > 0 ? ` ${updates.length} actualizado(s),` : ''}` +
        `${fusionados}${omitidas} Columnas detectadas: ${detectados}.`,
      count: inserts.length,
      merged: mergedCount,
      updated: updates.length,
      hospital: canonicalHospital,
      stats,
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
