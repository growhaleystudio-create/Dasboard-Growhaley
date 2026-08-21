import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres.rztlnskviqavppecnbgr:Kosong%40001122@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres' });

async function main() {
  const r = await pool.query('SELECT * FROM system_setting');
  console.log('System settings in Supabase:', r.rows);
}

main().finally(() => pool.end());
