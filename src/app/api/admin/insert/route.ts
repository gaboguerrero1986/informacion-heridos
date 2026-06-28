import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Verificación de autenticación básica
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
      return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { nombre, cedula, edad, procedencia, hospital, nota } = body;

    if (!nombre || !hospital) {
      return NextResponse.json({ success: false, message: 'Nombre y Hospital son obligatorios' }, { status: 400 });
    }

    const { createClient } = require('@supabase/supabase-js');
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const cedulaClean = cedula ? String(cedula).replace(/[\.\-\s]/g, '') : null;

    const record = {
      nombre: String(nombre).trim(),
      cedula: cedulaClean,
      edad: edad ? String(edad).trim() : null,
      procedencia: procedencia ? String(procedencia).trim() : null,
      hospital: String(hospital).trim(),
      nota: nota ? String(nota).trim() : null,
      estado: 'Registrado'
    };

    const { error } = await adminSupabase.from('personas_rescatadas').insert([record]);

    if (error) {
      throw error;
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Persona añadida correctamente'
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
