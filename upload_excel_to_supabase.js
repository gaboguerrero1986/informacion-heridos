require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// Configuración de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Necesitamos el Service Role para saltarnos el RLS al insertar

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltan las variables de entorno de Supabase (.env.local)");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Carpeta donde estarán los excels (por defecto la carpeta 'excels' en el proyecto)
const excelsFolder = path.join(__dirname, 'excels');

async function main() {
  if (!fs.existsSync(excelsFolder)) {
    console.log(`Creando carpeta ${excelsFolder} - Por favor coloca tus archivos excel ahí y vuelve a ejecutar.`);
    fs.mkdirSync(excelsFolder);
    return;
  }

  const files = fs.readdirSync(excelsFolder).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
  
  if (files.length === 0) {
    console.log("No se encontraron archivos Excel en la carpeta 'excels'.");
    return;
  }

  let totalInserted = 0;

  for (const file of files) {
    console.log(`\nProcesando: ${file}...`);
    // El nombre del hospital es el nombre del archivo sin extensión
    const hospitalName = path.parse(file).name;
    
    const filePath = path.join(excelsFolder, file);
    const workbook = xlsx.readFile(filePath);
    
    // Suponemos que los datos están en la primera hoja
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convertir a JSON. Dependiendo de cómo estén las columnas (nombre, cedula, edad, procedencia, nota)
    const rows = xlsx.utils.sheet_to_json(sheet);
    
    console.log(`Se encontraron ${rows.length} filas en ${file}.`);
    
    const recordsToInsert = rows.map(row => {
      // Normalizamos las claves para encontrar "nombre", "cedula", etc.
      // Ya que en Excel pueden venir con mayúsculas o espacios.
      const normalizedRow = {};
      for (const key in row) {
        normalizedRow[key.trim().toLowerCase()] = row[key];
      }

      // Si no hay nombre, ignoramos el registro (es obligatorio)
      if (!normalizedRow.nombre && !normalizedRow.nombres && !normalizedRow.name) {
        return null;
      }

      return {
        nombre: String(normalizedRow.nombre || normalizedRow.nombres || normalizedRow.name || ''),
        cedula: normalizedRow.cedula ? String(normalizedRow.cedula) : null,
        edad: normalizedRow.edad ? String(normalizedRow.edad) : null,
        procedencia: normalizedRow.procedencia ? String(normalizedRow.procedencia) : null,
        nota: normalizedRow.nota ? String(normalizedRow.nota) : null,
        hospital: hospitalName, // Obtenido del nombre del archivo
        estado: 'Registrado'
      };
    }).filter(record => record !== null); // Filtramos los nulos (sin nombre)

    if (recordsToInsert.length === 0) {
      console.log(`No hay registros válidos para insertar en ${file}`);
      continue;
    }

    // Insertar en Supabase (en lotes para evitar sobrecargar)
    const batchSize = 100;
    for (let i = 0; i < recordsToInsert.length; i += batchSize) {
      const batch = recordsToInsert.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from('personas_rescatadas')
        .insert(batch);

      if (error) {
        console.error(`Error al insertar lote en ${file}:`, error.message);
      } else {
        console.log(`Insertados ${batch.length} registros de ${file}`);
        totalInserted += batch.length;
      }
    }
  }

  console.log(`\nProceso completado. Total de registros insertados: ${totalInserted}`);
}

main();
