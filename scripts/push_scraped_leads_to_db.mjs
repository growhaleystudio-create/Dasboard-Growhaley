import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function importLeads(jsonFile) {
  if (!fs.existsSync(jsonFile)) {
    console.error(`❌ File tidak ditemukan: ${jsonFile}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonFile, 'utf8');
  const items = JSON.parse(raw);
  console.log(`📥 Membaca ${items.length} leads dari ${jsonFile}...`);

  const client = await pool.connect();
  try {
    const teamRes = await client.query('SELECT id, name FROM team LIMIT 1');
    if (teamRes.rows.length === 0) {
      console.error('❌ Tidak ada team di database. Buat team terlebih dahulu.');
      return;
    }
    const teamId = teamRes.rows[0].id;
    console.log(`🏢 Menggunakan Team: ${teamRes.rows[0].name} (${teamId})`);

    let inserted = 0;
    let skipped = 0;

    for (const item of items) {
      if (!item.name) continue;

      // Extract phone / WA
      let publicContact = item.phone || null;
      let whatsappNumber = null;
      let whatsappUrl = null;

      if (publicContact) {
        const digits = publicContact.replace(/\D/g, '');
        if (digits.length >= 8) {
          // Normalize Indonesian numbers
          let waDigits = digits;
          if (waDigits.startsWith('0')) {
            waDigits = '62' + waDigits.slice(1);
          } else if (!waDigits.startsWith('62')) {
            waDigits = '62' + waDigits;
          }
          whatsappNumber = `+${waDigits}`;
          whatsappUrl = `https://wa.me/${waDigits}`;
        }
      }

      // Check duplicate by name + team
      const dupCheck = await client.query(
        'SELECT id FROM lead WHERE team_id = $1 AND (name ILIKE $2 OR (public_contact = $3 AND $3 IS NOT NULL)) LIMIT 1',
        [teamId, item.name.trim(), publicContact]
      );

      if (dupCheck.rows.length > 0) {
        console.log(`⏭️  Duplikat dilewati: ${item.name}`);
        skipped++;
        continue;
      }

      // Calculate score based on available data
      let score = 50;
      if (whatsappNumber) score += 20;
      if (item.website) score += 10;
      if (item.rating && parseFloat(item.rating) >= 4.5) score += 10;
      if (item.reviews_count && parseInt(item.reviews_count, 10) > 20) score += 10;

      const keywords = ['Google Maps', item.category || 'Barbershop'].filter(Boolean);

      await client.query(
        `INSERT INTO lead (
          team_id, name, public_contact, whatsapp_number, whatsapp_url, whatsapp_verification_status,
          location, matched_keywords, acquired_source, profile_url, status,
          score, ai_state, ai_intent_score, ai_insight, created_at, discovered_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
        [
          teamId,
          item.name.trim(),
          publicContact,
          whatsappNumber,
          whatsappUrl,
          whatsappNumber ? 'registered' : 'unchecked',
          item.address || null,
          keywords,
          'google_maps_playwright',
          item.maps_url || null,
          'New',
          score,
          'idle',
          null,
          `Rating: ${item.rating || '-'} (${item.reviews_count || 0} reviews). ${item.category || ''}`,
        ]
      );

      console.log(`✅ Berhasil import: ${item.name} (Score: ${score}, WA: ${whatsappNumber || '-'})`);
      inserted++;
    }

    console.log(`\n🎉 Selesai! Ditambahkan: ${inserted} | Duplikat: ${skipped}`);
  } finally {
    client.release();
    await pool.end();
  }
}

const fileArg = process.argv[2] || 'test_barbershop.json';
importLeads(fileArg);
