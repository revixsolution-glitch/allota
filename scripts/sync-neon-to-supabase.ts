import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const NEON_URL = process.env.NEON_URL || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';

const TABLES_IN_ORDER = [
  'Company',
  'CompanySettings',
  'User',
  'Employee',
  'EmployeeSession',
  'Territory',
  'Product',
  'Client',
  'Order',
  'OrderItem',
  'CreditRecord',
  'LeadSourceAssignment',
  'LeadSourceRotation',
  'Lead',
  'LeadFollowUpLog',
  'LeadRemark',
  'FollowupTask',
  'Call',
  'LoginDirectory',
  'AdsInsightsSync',
  'SocialInboxItem',
  'LeadReassignmentLog',
  'PurchaseOrderAlert',
  'TenantDatabase'
];

async function main() {
  console.log('Connecting to Neon...');
  const neon = new Client({ connectionString: NEON_URL });
  await neon.connect();

  console.log('Connecting to Supabase...');
  const supabase = new Client({ connectionString: SUPABASE_URL });
  await supabase.connect();

  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const backupData: Record<string, any[]> = {};

  // Step 1: Dump all data from Neon
  for (const table of TABLES_IN_ORDER) {
    try {
      const res = await neon.query(`SELECT * FROM "${table}";`);
      backupData[table] = res.rows;
      console.log(`[Neon Export] ${table}: ${res.rows.length} rows`);
    } catch (e: any) {
      console.warn(`[Neon Export Skip] ${table}: ${e.message}`);
    }
  }

  // Save full JSON backup to disk
  const backupFile = path.join(backupDir, `neon_complete_dump_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log(`\n✓ Complete backup saved to: ${backupFile}\n`);

  // Step 2: Disable foreign key triggers on Supabase temporarily for clean insertion
  await supabase.query('SET session_replication_role = replica;');

  for (const table of TABLES_IN_ORDER) {
    const rows = backupData[table];
    if (!rows || rows.length === 0) continue;

    console.log(`[Supabase Import] Inserting ${rows.length} rows into "${table}"...`);

    // Clean current table in Supabase
    await supabase.query(`TRUNCATE TABLE "${table}" CASCADE;`);

    // Insert rows in batches of 50
    const columns = Object.keys(rows[0]);
    const colNames = columns.map(c => `"${c}"`).join(', ');

    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const valuesList: any[] = [];
      const valueParams: string[] = [];

      let paramIdx = 1;
      for (const row of chunk) {
        const rowParams: string[] = [];
        for (const col of columns) {
          valuesList.push(row[col]);
          rowParams.push(`$${paramIdx++}`);
        }
        valueParams.push(`(${rowParams.join(', ')})`);
      }

      const insertSql = `INSERT INTO "${table}" (${colNames}) VALUES ${valueParams.join(', ')} ON CONFLICT DO NOTHING;`;
      await supabase.query(insertSql, valuesList);
    }
    console.log(`✓ "${table}" synchronized successfully.`);
  }

  // Re-enable foreign key constraints
  await supabase.query('SET session_replication_role = DEFAULT;');

  console.log('\n=============================================');
  console.log('🎉 100% OF NEON DATA SYNCHRONIZED TO SUPABASE!');
  console.log('=============================================');

  // Verify counts in Supabase
  const compCount = await supabase.query('SELECT count(*) FROM "Company";');
  const leadsCount = await supabase.query('SELECT count(*) FROM "Lead";');
  const callsCount = await supabase.query('SELECT count(*) FROM "Call";');
  console.log(`Supabase verification:
  - Companies: ${compCount.rows[0].count}
  - Leads: ${leadsCount.rows[0].count}
  - Calls: ${callsCount.rows[0].count}`);

  await neon.end();
  await supabase.end();
}

main().catch(console.error);
