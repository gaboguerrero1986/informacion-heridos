import { NextResponse } from 'next/server';
import {
  getClientIp,
  checkRateLimit,
  registerFailure,
  registerSuccess,
} from '@/lib/rateLimit';

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const key = `auth:${ip}`;

  // 1. Antes de validar nada, comprobamos si la IP está bloqueada por exceso de intentos.
  const state = checkRateLimit(key);
  if (!state.allowed) {
    const minutos = Math.ceil(state.retryAfter / 60);
    return NextResponse.json(
      {
        success: false,
        message: `Demasiados intentos fallidos. Espera ${minutos} minuto(s) antes de volver a intentar.`,
      },
      { status: 429, headers: { 'Retry-After': String(state.retryAfter) } }
    );
  }

  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminPassword && password === adminPassword) {
      registerSuccess(key); // limpia el contador al acertar
      return NextResponse.json({ success: true });
    }

    // 2. Contraseña incorrecta: registramos el fallo.
    const after = registerFailure(key);

    if (!after.allowed) {
      const minutos = Math.ceil(after.retryAfter / 60);
      return NextResponse.json(
        {
          success: false,
          message: `Demasiados intentos fallidos. Cuenta bloqueada por ${minutos} minuto(s).`,
        },
        { status: 429, headers: { 'Retry-After': String(after.retryAfter) } }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: `Contraseña incorrecta. Te quedan ${after.remaining} intento(s).`,
      },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { success: false, message: 'Error procesando solicitud' },
      { status: 500 }
    );
  }
}
