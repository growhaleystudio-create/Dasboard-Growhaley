import pg from 'pg';

const connectionString = 'postgresql://postgres.rztlnskviqavppecnbgr:Kosong%40001122@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({ connectionString });

export async function setTunnelUrl(url) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO system_setting (key, value, updated_at)
    VALUES ('backend_tunnel_url', $1, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
  `, [url]);

  console.log(`[Tunnel Sync] Saved active tunnel URL to Supabase: ${url}`);
}

if (process.argv[1]?.endsWith('setup-tunnel-sync.mjs')) {
  setTunnelUrl('https://test.ngrok.dev').then(() => pool.end());
}
