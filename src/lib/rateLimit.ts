// Rate limiter en memoria para frenar ataques de fuerza bruta en el login admin.
// Nota: es un limitador por instancia (no compartido entre regiones/instancias).
// En Vercel con Fluid Compute las instancias se reutilizan, así que funciona como
// una primera capa de defensa. Para algo distribuido y duro, conviene respaldarlo
// en una tabla de Supabase o en Upstash Redis.

type Attempt = {
  count: number; // intentos fallidos dentro de la ventana actual
  first: number; // timestamp del primer intento de la ventana
  lockedUntil: number; // timestamp hasta el cual está bloqueado (0 = no bloqueado)
};

const store = new Map<string, Attempt>();

// Configuración
const WINDOW_MS = 15 * 60 * 1000; // ventana de conteo: 15 minutos
const MAX_ATTEMPTS = 5; // intentos fallidos permitidos antes de bloquear
const LOCKOUT_MS = 15 * 60 * 1000; // duración del bloqueo: 15 minutos

// Limpieza perezosa para que el Map no crezca indefinidamente.
let lastCleanup = Date.now();
function cleanupIfNeeded(now: number) {
  if (now - lastCleanup < WINDOW_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    const expired = now - entry.first > WINDOW_MS && entry.lockedUntil <= now;
    if (expired) store.delete(key);
  }
}

/** Obtiene la IP del cliente a partir de las cabeceras del proxy (Vercel). */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export type RateLimitState = {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // segundos hasta poder reintentar (solo si está bloqueado)
};

/** Consulta el estado actual sin registrar un intento. */
export function checkRateLimit(key: string): RateLimitState {
  const now = Date.now();
  cleanupIfNeeded(now);

  const entry = store.get(key);
  if (!entry) {
    return { allowed: true, remaining: MAX_ATTEMPTS, retryAfter: 0 };
  }

  // ¿Sigue bloqueado?
  if (entry.lockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }

  // La ventana expiró: reiniciamos.
  if (now - entry.first > WINDOW_MS) {
    store.delete(key);
    return { allowed: true, remaining: MAX_ATTEMPTS, retryAfter: 0 };
  }

  return {
    allowed: true,
    remaining: Math.max(0, MAX_ATTEMPTS - entry.count),
    retryAfter: 0,
  };
}

/** Registra un intento fallido y aplica el bloqueo si se supera el máximo. */
export function registerFailure(key: string): RateLimitState {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now - entry.first > WINDOW_MS) {
    entry = { count: 1, first: now, lockedUntil: 0 };
  } else {
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_MS;
    }
  }
  store.set(key, entry);

  if (entry.lockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }
  return { allowed: true, remaining: Math.max(0, MAX_ATTEMPTS - entry.count), retryAfter: 0 };
}

/** Limpia el registro tras un login exitoso. */
export function registerSuccess(key: string): void {
  store.delete(key);
}
