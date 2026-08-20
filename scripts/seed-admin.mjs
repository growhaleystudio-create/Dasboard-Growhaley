import argon2 from 'argon2';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../backend/.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  const client = await pool.connect();
  try {
    const emails = ['growhaleystudio@gmail.com', 'alvin@growhaley.com'];
    const password = 'Kosong@001122';
    const passwordHash = await argon2.hash(password);

    console.log('Menghubungkan ke Supabase...');

    // Buat team default jika belum ada
    let teamRes = await client.query('SELECT id FROM team LIMIT 1');
    let teamId;
    if (teamRes.rows.length === 0) {
      const newTeam = await client.query(
        "INSERT INTO team (name) VALUES ('Growhaley Studio') RETURNING id"
      );
      teamId = newTeam.rows[0].id;
      console.log('Team baru dibuat:', teamId);
    } else {
      teamId = teamRes.rows[0].id;
      console.log('Team yang sudah ada:', teamId);
    }

    for (const email of emails) {
      // Cek apakah user sudah ada
      const userRes = await client.query(
        'SELECT id FROM app_user WHERE email = $1',
        [email]
      );

      let userId;
      if (userRes.rows.length === 0) {
        const newUser = await client.query(
          'INSERT INTO app_user (email, password_hash) VALUES ($1, $2) RETURNING id',
          [email, passwordHash]
        );
        userId = newUser.rows[0].id;
        console.log(`User dibuat: ${email} (${userId})`);
      } else {
        userId = userRes.rows[0].id;
        await client.query(
          'UPDATE app_user SET password_hash = $1, failed_login_count = 0, locked_until = NULL WHERE id = $2',
          [passwordHash, userId]
        );
        console.log(`User diupdate: ${email} (${userId})`);
      }

      // Pastikan membership admin aktif
      await client.query(
        `INSERT INTO user_membership (team_id, user_id, role, status)
         VALUES ($1, $2, 'admin', 'active')
         ON CONFLICT (team_id, user_id)
         DO UPDATE SET role = 'admin', status = 'active'`,
        [teamId, userId]
      );
      console.log(`Membership admin aktif untuk: ${email}`);
    }

    console.log('\n✅ SEEDING SELESAI! Akun siap digunakan untuk login.');
  } catch (err) {
    console.error('Error saat seeding:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
