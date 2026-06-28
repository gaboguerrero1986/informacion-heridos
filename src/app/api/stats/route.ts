import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// Devuelve cuántos registros hay y cuándo fue la última actualización.
export async function GET() {
  try {
    // Conteo exacto sin traer las filas (head: true).
    const { count, error: countError } = await supabase
      .from('personas_rescatadas')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error contando registros:', countError);
      return NextResponse.json({ total: 0, lastUpdate: null }, { status: 500 });
    }

    // Fecha del registro más reciente.
    const { data } = await supabase
      .from('personas_rescatadas')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    const lastUpdate = data && data[0] ? data[0].created_at : null;

    return NextResponse.json({ total: count ?? 0, lastUpdate });
  } catch (err) {
    console.error('Unexpected error en /api/stats:', err);
    return NextResponse.json({ total: 0, lastUpdate: null }, { status: 500 });
  }
}
