import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/luthfierlambang/Documents/Leads Generator/backend/.env' });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to Supabase database.');

    const teamId = '11365b70-5e56-4d74-9adf-bdce6d14c10c';

    // Check connectors for the team
    const res = await client.query(
      `SELECT * FROM team_connector WHERE team_id = $1`,
      [teamId]
    );
    console.log('Connectors in DB:', res.rows);

    // Let's insert/upsert 'google' connector as 'available'
    console.log("Upserting 'google' connector status to 'available'...");
    await client.query(
      `INSERT INTO team_connector (team_id, source_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, source_id)
       DO UPDATE SET status = $3`,
      [teamId, 'google', 'available']
    );
    console.log('Upsert successful!');

    // Check again
    const finalRes = await client.query(
      `SELECT * FROM team_connector WHERE team_id = $1`,
      [teamId]
    );
    console.log('Final Connectors in DB:', finalRes.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
