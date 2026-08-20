// scripts/backup.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';

const SUPABASE_URL = 'https://eekyijmucphbmcrvtunb.supabase.co';

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const RETENTION_DAYS = 4;
const BACKUP_BUCKET = 'backups'; 

async function getAllRows(tableName) {
  let allRows = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup-${timestamp}.json`;

  const productos = await getAllRows('productos');
  const transacciones = await getAllRows('transacciones');

  const backupData = {
    fecha: new Date().toISOString(),
    productos,
    transacciones
  };

  const tempFile = `/tmp/${fileName}`;
  await fs.writeFile(tempFile, JSON.stringify(backupData, null, 2));

  const fileBuffer = await fs.readFile(tempFile);
  const { error: uploadError } = await supabase.storage
    .from(BACKUP_BUCKET)
    .upload(fileName, fileBuffer, { contentType: 'application/json' });
  if (uploadError) throw uploadError;

  console.log(`✅ Backup subido: ${fileName}`);

  // Eliminar respaldos antiguos
  const { data: files, error: listError } = await supabase.storage
    .from(BACKUP_BUCKET)
    .list();
  if (listError) throw listError;

  const now = Date.now();
  for (const file of files) {
    if (!file.name.startsWith('backup-')) continue;
    const fileDate = new Date(file.created_at).getTime();
    const ageDays = (now - fileDate) / (1000 * 60 * 60 * 24);
    if (ageDays > RETENTION_DAYS) {
      const { error: deleteError } = await supabase.storage
        .from(BACKUP_BUCKET)
        .remove([file.name]);
      if (deleteError) {
        console.error(`No se pudo eliminar ${file.name}:`, deleteError);
      } else {
        console.log(`🗑️ Eliminado backup antiguo: ${file.name}`);
      }
    }
  }

  await fs.unlink(tempFile);
}

backup().catch(err => {
  console.error('❌ Error durante el backup:', err);
  process.exit(1);
});
