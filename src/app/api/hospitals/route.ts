import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { uniqueHospitalNames } from '@/lib/normalizeHospital';

export async function GET() {
  try {
    // Traemos TODOS los valores de hospital en bloques de 1000 (límite de Supabase
    // por petición). Si un hospital tiene miles de filas, sin esto solo
    // aparecerían unos pocos hospitales en el filtro.
    const CHUNK = 1000;
    const MAX_CHUNKS = 50;
    const valores: (string | null)[] = [];

    for (let i = 0; i < MAX_CHUNKS; i++) {
      const from = i * CHUNK;
      const { data, error } = await supabase
        .from('personas_rescatadas')
        .select('hospital')
        .not('hospital', 'is', null)
        .neq('hospital', '')
        .order('hospital', { ascending: true })
        .range(from, from + CHUNK - 1);

      if (error) {
        console.error('Error fetching hospitals:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const batch = data || [];
      valores.push(...batch.map((r) => r.hospital as string));
      if (batch.length < CHUNK) break;
    }

    // Unificamos sin distinguir mayúsculas NI acentos ("Periférico" = "Periferico").
    const uniqueHospitals = uniqueHospitalNames(valores).sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );

    return NextResponse.json({ data: uniqueHospitals });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
