import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import * as xlsx from 'xlsx';

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
    
    const rows = xlsx.utils.sheet_to_json(sheet) as any[];
    
    const recordsToInsert = rows.map(row => {
      const normalizedRow: any = {};
      for (const key in row) {
        // Quitamos tildes, espacios y caracteres especiales para que sea muy fácil hacer match
        const cleanKey = key.trim().toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
        normalizedRow[cleanKey] = row[key];
      }

      const nombreValue = normalizedRow.nombre || normalizedRow.nombres || normalizedRow.name || normalizedRow.nombreyapellido || normalizedRow.nombresyapellidos || normalizedRow.paciente || normalizedRow.herido;

      if (!nombreValue) {
        return null;
      }

      const cedulaRaw = normalizedRow.cedula || normalizedRow.ci || normalizedRow.documento || normalizedRow.identificacion || normalizedRow.dni || normalizedRow.documentodeidentidad || normalizedRow.ceduladeidentidad;
      const cedulaValue = cedulaRaw ? String(cedulaRaw).replace(/[\.\-\s]/g, '') : null;

      const edadValue = normalizedRow.edad || normalizedRow.anos || normalizedRow.age;
      const procedenciaValue = normalizedRow.procedencia || normalizedRow.origen || normalizedRow.direccion || normalizedRow.lugar;
      const notaValue = normalizedRow.nota || normalizedRow.notas || normalizedRow.observacion || normalizedRow.observaciones || normalizedRow.estado || normalizedRow.diagnostico || normalizedRow.detalles;

      return {
        nombre: String(nombreValue),
        cedula: cedulaValue,
        edad: edadValue ? String(edadValue) : null,
        procedencia: procedenciaValue ? String(procedenciaValue) : null,
        nota: notaValue ? String(notaValue) : null,
        hospital: hospitalName,
        estado: 'Registrado'
      };
    }).filter(record => record !== null);

    if (recordsToInsert.length === 0) {
      return NextResponse.json({ success: false, message: 'No se encontraron registros válidos en el archivo' }, { status: 400 });
    }

    // Usar la API de Supabase para insertar
    // Nota: Como estamos en backend, lo ideal sería inicializar un cliente supabase con SUPABASE_SERVICE_ROLE_KEY
    // pero si RLS permite inserciones o si lo hacemos con service_role, funcionará.
    // Inicialicemos temporalmente con service_role para asegurar que sobrepasa el RLS:
    const { createClient } = require('@supabase/supabase-js');
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await adminSupabase.from('personas_rescatadas').insert(recordsToInsert);

    if (error) {
      throw error;
    }

    return NextResponse.json({ 
      success: true, 
      message: `Se insertaron ${recordsToInsert.length} registros correctamente.`,
      count: recordsToInsert.length
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
