import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres.rztlnskviqavppecnbgr:Kosong%40001122@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function test() {
  const res = await pool.query('SELECT value FROM system_setting WHERE key = $1', ['backend_tunnel_url']);
  console.log('Query with SSL:', res.rows[0]);
}

test().finally(() => pool.end());
