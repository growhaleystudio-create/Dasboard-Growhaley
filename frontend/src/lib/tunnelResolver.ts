import pg from 'pg';

let cachedUrl: string | null = null;
let lastFetched = 0;
const CACHE_TTL_MS = 5000; // 5 seconds cache

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres.rztlnskviqavppecnbgr:Kosong%40001122@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';
let pool: pg.Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: dbUrl,
      max: 3,
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}

export async function getActiveBackendUrl(): Promise<string> {
  const now = Date.now();
  if (cachedUrl && now - lastFetched < CACHE_TTL_MS) {
    return cachedUrl;
  }

  try {
    const p = getPool();
    const res = await p.query<{ value: string }>("SELECT value FROM system_setting WHERE key = 'backend_tunnel_url'");
    if (res.rows[0]?.value) {
      cachedUrl = res.rows[0].value.replace(/\/+$/, '');
      lastFetched = now;
      return cachedUrl;
    }
  } catch {
    // fallback
  }

  return (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BACKEND_API_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}
