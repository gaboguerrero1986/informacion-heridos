import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function POST(request: Request) {
  try {
    // Basic auth check
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
      return NextResponse.json({ success: false, message: 'No autorizado' }, { status: 401 });
    }

    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ success: false, message: 'Consulta SQL no proporcionada' }, { status: 400 });
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ success: false, message: 'DATABASE_URL no configurada en .env.local' }, { status: 500 });
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    const result = await pool.query(query);
    await pool.end();

    return NextResponse.json({ 
      success: true, 
      message: 'Consulta ejecutada correctamente', 
      rowCount: result.rowCount 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
