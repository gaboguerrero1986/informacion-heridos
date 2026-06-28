import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configuración pública de solo lectura (ej. el correo de contacto).
export async function GET() {
  try {
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data } = await adminSupabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'contact_email')
      .limit(1);

    const fromDb = data && data[0] ? data[0].valor : '';
    // Si no hay nada en la base, usamos la variable de entorno como respaldo.
    const contactEmail = (fromDb || process.env.NEXT_PUBLIC_CONTACT_EMAIL || '').trim();

    return NextResponse.json({ contactEmail });
  } catch {
    return NextResponse.json({ contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || '' });
  }
}
