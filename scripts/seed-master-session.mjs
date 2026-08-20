import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres.rztlnskviqavppecnbgr:Kosong%40001122@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'
});

async function main() {
  const now = new Date();
  const forever = new Date('2099-12-31T23:59:59Z');
  
  // Upsert master admin session
  await pool.query(`
    INSERT INTO session (id, user_id, team_id, role, created_at, last_activity_at, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE
    SET last_activity_at = $6, expires_at = $7
  `, ['master-admin-session-growhaley', 'cacfd70c-c87d-40bd-b740-2c351956b623', '2934a5c1-aaee-4d77-9314-22d587d9c636', 'admin', now, now, forever]);

  console.log('✅ Permanent master admin session is live!');
  const res = await pool.query('SELECT * FROM session WHERE id = $1', ['master-admin-session-growhaley']);
  console.log('Session row:', res.rows[0]);
}

main().catch(console.error).finally(() => pool.end());
