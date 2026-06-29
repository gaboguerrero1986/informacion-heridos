// Cabeceras CORS para la API pública. Se permite cualquier origen porque la
// idea es que terceros (otras webs, apps de ayuda) puedan consultar el buscador
// desde el navegador. Los datos que devuelve son los mismos que ya se muestran
// públicamente en la página, así que abrir el origen no expone nada nuevo.

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/** Mezcla las cabeceras CORS con otras adicionales. */
export function withCors(extra: Record<string, string> = {}): Record<string, string> {
  return { ...CORS_HEADERS, ...extra };
}
