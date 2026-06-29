// Límite de peticiones por IP para la API pública (anti-scraping / abuso).
// Es una ventana deslizante simple en memoria: cuenta cuántas peticiones hizo
// una IP en los últimos RATE_WINDOW_MS y bloquea si supera RATE_MAX.
//
// Igual que el limitador del login, es por instancia (no compartido entre
// regiones). Sirve como primera capa; para algo distribuido conviene Redis.

type Bucket = {
  timestamps: number[]; // marcas de tiempo de las peticiones dentro de la ventana
};

const buckets = new Map<string, Bucket>();

const RATE_WINDOW_MS = 60 * 1000; // ventana: 60 segundos
const RATE_MAX = 60; // máximo de peticiones por IP en la ventana

// Limpieza perezosa para que el Map no crezca indefinidamente.
let lastCleanup = Date.now();
function cleanupIfNeeded(now: number) {
  if (now - lastCleanup < RATE_WINDOW_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.timestamps.every((t) => now - t > RATE_WINDOW_MS)) {
      buckets.delete(key);
    }
  }
}

export type ApiRateLimitState = {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // segundos hasta poder reintentar (solo si se bloqueó)
  limit: number;
};

/** Registra una petición de `key` (normalmente la IP) y dice si se permite. */
export function checkApiRateLimit(key: string): ApiRateLimitState {
  const now = Date.now();
  cleanupIfNeeded(now);

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  // Descartamos las marcas fuera de la ventana.
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < RATE_WINDOW_MS);

  if (bucket.timestamps.length >= RATE_MAX) {
    const oldest = bucket.timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 1000));
    return { allowed: false, remaining: 0, retryAfter, limit: RATE_MAX };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: Math.max(0, RATE_MAX - bucket.timestamps.length),
    retryAfter: 0,
    limit: RATE_MAX,
  };
}
