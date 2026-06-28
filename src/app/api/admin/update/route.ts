import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
      return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { id, nombre, cedula, edad, procedencia, hospital, nota, estado } = body;

    if (!id || !nombre || !hospital) {
      return NextResponse.json({ success: false, message: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Limpiamos la cédula si la enviaron
    const cedulaClean = cedula ? String(cedula).replace(/[\.\-\s]/g, '') : null;

    const record = {
      nombre: String(nombre).trim(),
      cedula: cedulaClean,
      edad: edad ? String(edad).trim() : null,
      procedencia: procedencia ? String(procedencia).trim() : null,
      hospital: String(hospital).trim(),
      nota: nota ? String(nota).trim() : null,
      estado: estado ? String(estado).trim() : 'Registrado'
    };

    const { error } = await adminSupabase
      .from('personas_rescatadas')
      .update(record)
      .eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, message: 'Registro actualizado correctamente' });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
