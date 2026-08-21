import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres.rztlnskviqavppecnbgr:Kosong%40001122@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres' });

async function main() {
  const teams = await pool.query('SELECT id, name FROM team');
  console.log('All teams:', teams.rows);

  const leadsByTeam = await pool.query('SELECT team_id, count(*) as count FROM lead GROUP BY team_id');
  console.log('Leads count by team:', leadsByTeam.rows);

  const users = await pool.query('SELECT id, email, default_team_id FROM app_user');
  console.log('Users in DB:', users.rows);

  const memberships = await pool.query('SELECT * FROM membership');
  console.log('Memberships:', memberships.rows);
}

main().finally(() => pool.end());
