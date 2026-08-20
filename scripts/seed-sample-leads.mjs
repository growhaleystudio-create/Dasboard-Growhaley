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

async function seedLeads() {
  const client = await pool.connect();
  try {
    const teamRes = await client.query('SELECT id FROM team LIMIT 1');
    if (teamRes.rows.length === 0) {
      console.log('No team found');
      return;
    }
    const teamId = teamRes.rows[0].id;
    console.log('Using Team ID:', teamId);

    const sampleLeads = [
      {
        name: 'Kopi Kenangan Senopati',
        publicContact: '081298765432',
        whatsappNumber: '+6281298765432',
        whatsappUrl: 'https://wa.me/6281298765432',
        whatsappVerificationStatus: 'registered',
        location: 'Jakarta Selatan',
        matchedKeywords: ['Cafe', 'Coffee Shop', 'F&B'],
        acquiredSource: 'google_maps',
        profileUrl: 'https://maps.google.com/?cid=123456',
        status: 'New',
        score: 88,
        aiState: 'success',
        aiIntentScore: 92,
        aiInsight: 'Rating 4.8/5. Sangat cocok untuk penawaran kampanye promo digital dan automasi reservasi WhatsApp.'
      },
      {
        name: 'Boutique Hotel Seminyak',
        publicContact: '081387654321',
        whatsappNumber: '+6281387654321',
        whatsappUrl: 'https://wa.me/6281387654321',
        whatsappVerificationStatus: 'registered',
        location: 'Bali',
        matchedKeywords: ['Hotel', 'Hospitality', 'Villa'],
        acquiredSource: 'google_maps',
        profileUrl: 'https://maps.google.com/?cid=789012',
        status: 'Qualified',
        score: 94,
        aiState: 'success',
        aiIntentScore: 95,
        aiInsight: 'Trafik website tinggi namun belum memiliki integrasi booking direct WhatsApp. Peluang konversi tinggi.'
      },
      {
        name: 'Dental Care Aesthetic Bandung',
        publicContact: '081122334455',
        whatsappNumber: '+6281122334455',
        whatsappUrl: 'https://wa.me/6281122334455',
        whatsappVerificationStatus: 'registered',
        location: 'Bandung',
        matchedKeywords: ['Klinik Gigi', 'Healthcare', 'Dental'],
        acquiredSource: 'google_maps',
        profileUrl: 'https://maps.google.com/?cid=345678',
        status: 'New',
        score: 79,
        aiState: 'success',
        aiIntentScore: 82,
        aiInsight: 'Belum memiliki website resmi. Sangat potensial untuk pembuatan landing page profil klinik & jadwal dokter.'
      }
    ];

    for (const lead of sampleLeads) {
      await client.query(
        `INSERT INTO lead (
          team_id, name, public_contact, whatsapp_number, whatsapp_url, whatsapp_verification_status,
          location, matched_keywords, acquired_source, profile_url, status,
          score, ai_state, ai_intent_score, ai_insight, created_at, discovered_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
        [
          teamId,
          lead.name,
          lead.publicContact,
          lead.whatsappNumber,
          lead.whatsappUrl,
          lead.whatsappVerificationStatus,
          lead.location,
          lead.matchedKeywords,
          lead.acquiredSource,
          lead.profileUrl,
          lead.status,
          lead.score,
          lead.aiState,
          lead.aiIntentScore,
          lead.aiInsight,
        ]
      );
      console.log(`Sample lead inserted: ${lead.name}`);
    }

    console.log('\n✅ 3 Sample leads berhasil ditambahkan ke database!');
  } catch (err) {
    console.error('Error inserting sample leads:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seedLeads();
