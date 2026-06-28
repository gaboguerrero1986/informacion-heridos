import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  try {
    // Para obtener hospitales únicos en Supabase sin escribir RPC de SQL complejo,
    // usamos una llamada regular, pero a la hora de renderizar podemos deducir únicos en el cliente o acá.
    // Dado que Supabase JS no tiene un "SELECT DISTINCT" directo sin RPC nativo,
    // seleccionaremos todos los hospitales no nulos y los filtraremos en Node.js.
    // Si la DB crece muchísimo (decenas de miles), convendría un RPC.
    
    const { data, error } = await supabase
      .from('personas_rescatadas')
      .select('hospital')
      .not('hospital', 'is', null)
      .neq('hospital', '');

    if (error) {
      console.error('Error fetching hospitals:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Extraer y normalizar nombres únicos, ignorando case (capitalizando la primera letra por estética)
    const uniqueHospitalsMap = new Map<string, string>();
    
    data.forEach(item => {
      const h = item.hospital as string;
      const key = h.trim().toLowerCase();
      // Guardar la primera versión capitalizada que encontremos
      if (!uniqueHospitalsMap.has(key)) {
        uniqueHospitalsMap.set(key, h.trim());
      }
    });

    const uniqueHospitals = Array.from(uniqueHospitalsMap.values()).sort();

    return NextResponse.json({ data: uniqueHospitals });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
