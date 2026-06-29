# API pública — Búsqueda de Rescatados

API de solo lectura para buscar personas registradas en hospitales/refugios por
**cédula** o por **nombre y apellido**. Devuelve JSON y tiene **CORS abierto**,
así que se puede consultar desde cualquier web o app (incluido el navegador).

Los datos que entrega son los mismos que ya se muestran públicamente en la
página, por eso no requiere autenticación.

## Base

```
https://TU-DOMINIO/api/v1
```

Abrir `GET /api/v1` devuelve esta misma documentación en JSON.

## Buscar personas

```
GET /api/v1/search
```

| Parámetro  | Descripción                                                                 |
|------------|------------------------------------------------------------------------------|
| `cedula`   | Busca por cédula. Se usan solo los dígitos: `14.072.268`, `V-14072268` → `14072268`. |
| `nombre`   | Busca por nombre y/o apellido (en cualquier orden).                          |
| `q`        | Texto libre: busca por nombre y, si parece cédula, también por cédula.       |
| `hospital` | Filtro opcional por hospital. No distingue acentos ni mayúsculas.            |
| `page`     | Número de página. Por defecto `1`.                                           |
| `pageSize` | Resultados por página, de `1` a `100`. Por defecto `20`.                     |

Si no se envía ningún término de búsqueda, devuelve el **listado completo** en
orden alfabético (paginado).

### Ejemplos

```bash
# Por cédula
curl "https://TU-DOMINIO/api/v1/search?cedula=14072268"

# Por nombre y apellido
curl "https://TU-DOMINIO/api/v1/search?nombre=Juan%20Perez"

# Texto libre + paginación
curl "https://TU-DOMINIO/api/v1/search?q=Gabriela&page=1&pageSize=20"

# Filtrando por hospital
curl "https://TU-DOMINIO/api/v1/search?nombre=Maria&hospital=Hospital%20Perez%20Carreno"
```

### Respuesta

```json
{
  "data": [
    {
      "id": "uuid",
      "nombre": "Juan Perez",
      "cedula": "14072268",
      "edad": "34",
      "procedencia": "Caracas",
      "hospital": "Hospital Perez Carreño",
      "nota": null,
      "estado": "Estable",
      "created_at": "2026-06-29T12:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1,
  "listing": false
}
```

- `total`: total de resultados (ya deduplicados), no solo los de esta página.
- `totalPages`: cantidad de páginas con el `pageSize` indicado.
- `listing`: `true` cuando se devolvió el listado completo (sin búsqueda).
- `cedula` puede ser `null` cuando la persona no tiene cédula registrada.

## Listar hospitales

```
GET /api/v1/hospitals
```

Devuelve la lista de hospitales/centros únicos, útil para armar el filtro:

```json
{ "data": ["Hospital Perez Carreño", "Hospital Periférico de Catia", "..."] }
```

## Límites

- Hasta **60 peticiones por minuto por IP**. Si se supera, responde `429 Too
  Many Requests` con la cabecera `Retry-After` (segundos para reintentar).
- Las cabeceras `X-RateLimit-Limit` y `X-RateLimit-Remaining` indican el cupo
  restante.

## Notas

- Solo método `GET` (y `OPTIONS` para el preflight de CORS). No se puede crear
  ni modificar datos por esta API.
- La búsqueda no distingue mayúsculas; el nombre se puede buscar en cualquier
  orden ("Parra Gabriela" encuentra "Gabriela Parra").
