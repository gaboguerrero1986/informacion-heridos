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

    // Comprobamos si la búsqueda parece una cédula (solo números o guiones)
    const isCedula = /^[0-9\-]+$/.test(q);

    if (isCedula) {
      // Búsqueda exacta por cédula
      query = query.eq('cedula', q);
    } else {
      // Búsqueda difusa por nombre usando pg_trgm (ilike también funciona bien con trigramas para búsqueda parcial)
      // Supabase por defecto soporta textSearch u operaciones ilike.
      query = query.ilike('nombre', `%${q}%`);
    }

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
