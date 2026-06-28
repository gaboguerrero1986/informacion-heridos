import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { canonicalizeHospital, uniqueHospitalNames } from '@/lib/normalizeHospital';
import { consolidatePersonas, Persona } from '@/lib/dedupePersonas';

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

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Unificamos el nombre del hospital con los existentes.
    const { data: hospRows } = await adminSupabase
      .from('personas_rescatadas')
      .select('hospital')
      .not('hospital', 'is', null);
    const existingHospitals = uniqueHospitalNames((hospRows || []).map((r) => r.hospital));
    const canonicalHospital = canonicalizeHospital(String(hospital).trim(), existingHospitals);

    const cedulaClean = cedula ? String(cedula).replace(/[\.\-\s]/g, '') : null;

    const record: Persona = {
      nombre: String(nombre).trim(),
      cedula: cedulaClean,
      edad: edad ? String(edad).trim() : null,
      procedencia: procedencia ? String(procedencia).trim() : null,
      hospital: canonicalHospital,
      nota: nota ? String(nota).trim() : null,
      estado: 'Registrado',
    };

    // 2. Consolidamos contra los registros existentes del mismo hospital.
    const { data: existingRows } = await adminSupabase
      .from('personas_rescatadas')
      .select('*')
      .eq('hospital', canonicalHospital);

    const { inserts, updates, mergedCount } = consolidatePersonas(
      (existingRows || []) as Persona[],
      [record]
    );

    if (updates.length > 0) {
      const p = updates[0];
      const { error } = await adminSupabase
        .from('personas_rescatadas')
        .update({
          nombre: p.nombre,
          cedula: p.cedula,
          edad: p.edad,
          procedencia: p.procedencia,
          nota: p.nota,
          hospital: p.hospital,
          estado: p.estado,
        })
        .eq('id', p.id!);
      if (error) throw error;
    } else if (inserts.length > 0) {
      const { error } = await adminSupabase.from('personas_rescatadas').insert([record]);
      if (error) throw error;
    }

    const message =
      mergedCount > 0
        ? `Ya existía un registro de esta persona en "${canonicalHospital}"; se fusionó en uno solo con sus datos.`
        : `Persona añadida correctamente en "${canonicalHospital}".`;

    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
