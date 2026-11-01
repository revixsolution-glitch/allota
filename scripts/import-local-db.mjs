import fs from "fs";
import pg from "pg";

const { Client } = pg;
const localClient = new Client({
  connectionString: process.env.DATABASE_URL || "postgresql://allota_admin@localhost:5432/pharma_crm"
});

async function importAll() {
  await localClient.connect();
  console.log("Connected to local PostgreSQL on Hostinger!");

  const rawData = fs.readFileSync("/var/backups/allota/supabase_final_cutover.json", "utf8");
  const backup = JSON.parse(rawData);

  // Disable constraints temporarily for bulk import
  await localClient.query("SET session_replication_role = 'replica';");

  // Step 1: Truncate all tables at once beforehand
  const tableNames = Object.keys(backup.tables).filter(t => backup.tables[t] && backup.tables[t].length > 0);
  console.log(`Truncating ${tableNames.length} tables before insert...`);
  const truncateSql = `TRUNCATE TABLE ${tableNames.map(t => `"${t}"`).join(", ")} CASCADE;`;
  await localClient.query(truncateSql);
  console.log("Truncate complete.");

  // Step 2: Insert data table by table
  let totalImported = 0;
  for (const [table, rows] of Object.entries(backup.tables)) {
    if (!rows || rows.length === 0) continue;

    const cols = Object.keys(rows[0]);
    const colList = cols.map(c => `"${c}"`).join(", ");

    for (const r of rows) {
      const vals = cols.map(c => r[c]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const query = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;
      await localClient.query(query, vals);
    }

    totalImported += rows.length;
    console.log(` - Table ${table}: imported ${rows.length} rows`);
  }

  // Re-enable constraints
  await localClient.query("SET session_replication_role = 'origin';");
  console.log(`\nIMPORT COMPLETE! Total rows imported: ${totalImported}`);

  // Step 3: Verify all table row counts
  console.log("\n--- Verification Summary ---");
  let verifiedTotal = 0;
  for (const table of tableNames) {
    const res = await localClient.query(`SELECT COUNT(*) FROM "${table}"`);
    const count = parseInt(res.rows[0].count, 10);
    verifiedTotal += count;
    console.log(` - ${table}: ${count} rows`);
  }
  console.log(`Total verified rows in PostgreSQL 16: ${verifiedTotal}`);

  await localClient.end();
}

importAll().catch(err => {
  console.error("Import error:", err);
  process.exit(1);
});
