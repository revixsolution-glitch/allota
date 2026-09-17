import { NextResponse } from "next/server";
import { Pool } from "pg";
import { cleanBackupSql } from "@/lib/clean-backup-sql";

export const dynamic = "force-dynamic";

export async function GET() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const client = await pool.connect();
    try {
      await client.query(cleanBackupSql);
      
      return NextResponse.json({
        success: true,
        message: "Database schema and all demo data restored successfully onto Neon!",
        accounts: {
          superAdmin: { email: "superadmin@pharmacrm.com", pass: "superadmin123" },
          clientAdmin: { email: "admin@pharmacrm.test", pass: "admin123" },
          employee: { email: "employee@pharmacrm.test", pass: "employee123" },
        }
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  } finally {
    await pool.end();
  }
}
