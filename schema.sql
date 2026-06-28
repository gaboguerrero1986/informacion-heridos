-- 1. Habilitar la extensión para búsquedas de texto borrosas/difusas (trigramas)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Crear la tabla principal
CREATE TABLE personas_rescatadas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  cedula TEXT,
  edad TEXT,  -- Cambiado a TEXT porque a veces en excel las edades vienen con letras como 'meses' o 'años'
  procedencia TEXT,
  hospital TEXT,
  nota TEXT,
  estado TEXT DEFAULT 'Registrado',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Crear un índice usando GIN (Generalized Inverted Index) para búsquedas rápidas por trigramas en el nombre
-- Esto es lo que permite que "Jhoan" coincida con "Joan", o que búsquedas parciales funcionen muy rápido.
CREATE INDEX personas_rescatadas_nombre_trgm_idx ON personas_rescatadas USING GIN (nombre gin_trgm_ops);

-- 4. Crear un índice B-Tree estándar para búsquedas exactas por cédula u hospital
CREATE INDEX personas_rescatadas_cedula_idx ON personas_rescatadas (cedula);
CREATE INDEX personas_rescatadas_hospital_idx ON personas_rescatadas (hospital);

-- 5. Configurar Row Level Security (RLS) en Supabase para proteger los datos.
-- Por ahora, permitiremos que cualquiera pueda LEER (SELECT) los datos para el buscador,
-- pero NO podrán INSERTAR, ACTUALIZAR o BORRAR desde la web pública.
ALTER TABLE personas_rescatadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura pública"
ON personas_rescatadas FOR SELECT
TO public
USING (true);

-- 6. Tabla de visitas para la estadística del panel admin.
-- Se registra una fila por navegador (persona) que entra a la página.
-- Solo el backend (service_role) escribe/lee aquí, por eso NO lleva políticas públicas.
CREATE TABLE IF NOT EXISTS visitas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS visitas_visitor_idx ON visitas (visitor_id);
CREATE INDEX IF NOT EXISTS visitas_created_idx ON visitas (created_at);

ALTER TABLE visitas ENABLE ROW LEVEL SECURITY;
