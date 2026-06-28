import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const hospital = searchParams.get('hospital');

  if (!q) {
    return NextResponse.json({ data: [] });
  }

  try {
    let query = supabase.from('personas_rescatadas').select('*');

    // Limpiamos la búsqueda de puntos, guiones y espacios en caso de que estén buscando una cédula
    const cleanQ = q.replace(/[\.\-\s]/g, '');

    // Buscamos tanto por nombre como por cédula (con ilike para permitir búsquedas parciales)
    // Si el usuario escribe una parte de la cédula o una parte del nombre, lo encontrará.
    query = query.or(`nombre.ilike.%${q}%,cedula.ilike.%${cleanQ}%`);

    if (hospital && hospital.trim() !== '') {
      // Uso de ilike para que sea insensible a mayúsculas
      query = query.ilike('hospital', `%${hospital.trim()}%`);
    }

    // Ordenar por fecha de creación descendente
    query = query.order('created_at', { ascending: false }).limit(50);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching data:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
