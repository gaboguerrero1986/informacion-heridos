import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (password === adminPassword) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: 'Contraseña incorrecta' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Error procesando solicitud' }, { status: 500 });
  }
}
