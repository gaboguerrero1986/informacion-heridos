import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Guarda la configuración editable desde el panel admin (ej. correo de contacto).
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.contactEmail || '').trim();

    // Permitimos vaciarlo (para ocultar el botón) o un correo válido.
    if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, message: 'El correo no tiene un formato válido.' },
        { status: 400 }
      );
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await adminSupabase.from('configuracion').upsert(
      { clave: 'contact_email', valor: email, updated_at: new Date().toISOString() },
      { onConflict: 'clave' }
    );

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message:
            'No se pudo guardar. ¿Ya creaste la tabla "configuracion" en Supabase? (' +
            error.message +
            ')',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: email ? 'Correo de contacto guardado.' : 'Correo de contacto eliminado (el botón quedará oculto).',
      contactEmail: email,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
