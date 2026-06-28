import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as xlsx from 'xlsx';
import { parseRescatados } from '@/lib/parseRescatados';

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

    const { records, stats, error: parseError } = parseRescatados(rows, hospitalName.trim());

    if (parseError) {
      return NextResponse.json({ success: false, message: parseError }, { status: 400 });
    }

    if (records.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No se encontraron registros válidos en el archivo.' },
        { status: 400 }
      );
    }

    // Inicializamos el cliente con service_role para saltar el RLS (escritura desde backend).
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await adminSupabase.from('personas_rescatadas').insert(records);

    if (error) {
      throw error;
    }

    const detectados = Object.keys(stats.detectedColumns).join(', ') || 'ninguna';
    const omitidas = stats.skipped > 0 ? ` (${stats.skipped} fila(s) omitidas por no tener nombre válido)` : '';

    return NextResponse.json({
      success: true,
      message: `Se insertaron ${records.length} registros${omitidas}. Columnas detectadas: ${detectados}.`,
      count: records.length,
      stats,
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
