import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Estadística de visitas para el panel admin: total de personas que han
// entrado y cuántas hoy. Protegido con la contraseña de admin.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
    return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
  }

  try {
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Total de visitas (una por navegador/persona).
    const { count: total, error } = await adminSupabase
      .from('visitas')
      .select('*', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message:
            'No se pudieron leer las visitas. ¿Ya creaste la tabla "visitas" en Supabase? (' +
            error.message +
            ')',
        },
        { status: 500 }
      );
    }

    // Visitas de hoy.
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const { count: hoy } = await adminSupabase
      .from('visitas')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', inicioDia.toISOString());

    return NextResponse.json({ success: true, total: total ?? 0, hoy: hoy ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
