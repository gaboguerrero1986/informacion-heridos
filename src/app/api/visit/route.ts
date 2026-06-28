import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Registra una visita. El frontend lo llama una sola vez por navegador
// (controlado con localStorage), así contamos personas y no recargas.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const visitorId = body?.visitor_id ? String(body.visitor_id).slice(0, 64) : null;

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await adminSupabase.from('visitas').insert([{ visitor_id: visitorId }]);

    return NextResponse.json({ success: true });
  } catch {
    // No rompemos la página por el contador de visitas.
    return NextResponse.json({ success: true });
  }
}
