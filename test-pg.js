const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.ioqazptafolroxwgkera:Growhaley1995*@aws-1-ap-south-1.pooler.supabase.com:6543/postgres', statement_timeout: 3000 });
client.connect()
  .then(() => { console.log('PG connected'); return client.query('SELECT 1'); })
  .then(() => { console.log('PG query OK'); process.exit(0); })
  .catch((err) => { console.error('PG Error:', err.message); process.exit(1); });
setTimeout(() => { console.log('PG timeout'); process.exit(1); }, 5000);
