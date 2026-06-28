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

    // Algoritmo de desduplicación
    const dedupMap = new Map();

    (data || []).forEach((item) => {
      // Llave única basada en el nombre exacto y el hospital
      const key = `${item.nombre.toLowerCase().trim()}_${item.hospital?.toLowerCase().trim() || ''}`;

      if (!dedupMap.has(key)) {
        dedupMap.set(key, { ...item }); // Clonamos para poder modificarlo
      } else {
        const existing = dedupMap.get(key);
        
        // 1. Si el nuevo tiene cédula y el viejo no, el nuevo gana la posición principal
        if (item.cedula && !existing.cedula) {
          // Traspasamos datos viejos al nuevo si el nuevo no los tiene
          if (!item.edad && existing.edad) item.edad = existing.edad;
          if (!item.nota && existing.nota) item.nota = existing.nota;
          dedupMap.set(key, { ...item });
        } 
        // 2. Si el viejo ya tenía cédula o ambos son iguales, solo enriquecemos los datos que falten
        else {
          if (!existing.edad && item.edad) existing.edad = item.edad;
          if (!existing.procedencia && item.procedencia) existing.procedencia = item.procedencia;
          if (item.nota && item.nota !== existing.nota) {
            existing.nota = existing.nota ? `${existing.nota} | ${item.nota}` : item.nota;
          }
        }
      }
    });

    const dedupedData = Array.from(dedupMap.values());

    return NextResponse.json({ data: dedupedData });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
