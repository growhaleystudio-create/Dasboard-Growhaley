import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres.rztlnskviqavppecnbgr:Kosong%40001122@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'
});

async function createSessionTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      user_id UUID NOT NULL,
      team_id UUID NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  console.log('✅ session table created');
  await pool.end();
}

createSessionTable().catch(e => { console.error(e); pool.end(); });
