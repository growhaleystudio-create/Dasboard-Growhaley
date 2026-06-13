import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
import { TeamAiSettingsService } from './src/auth/team-ai-settings-service.js';
import { TeamAiSettingsRepository } from './src/repository/team-ai-settings-repository.js';
import { providerKindFromBaseUrl } from './src/content/provider-key-routing.js';
import { createCredentialVault } from './src/auth/credential-vault.js';
import { env } from './src/config/env.js';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new TeamAiSettingsRepository(pool);
  const vault = createCredentialVault(process.env as any);
  const svc = new TeamAiSettingsService(repo, vault);
  
  const res = await pool.query('SELECT id FROM team LIMIT 1');
  const teamId = res.rows[0]?.id;
  if (!teamId) {
    console.log("No teams found");
    process.exit(1);
  }
  
  const apiKey = await svc.loadApiKey(teamId, 'image_generation');
  const rawBaseUrl = await svc.loadApiBaseUrl(teamId, 'image_generation');
  
  console.log("Image API Key found:", !!apiKey);
  console.log("Image Base URL:", rawBaseUrl);
  
  if (!apiKey || !rawBaseUrl) {
    console.log("API Key or Base URL is missing. Returning fallback.");
    const FALLBACK_IMAGE_MODELS = [
      { id: 'gpt-image-1', name: 'GPT Image 1 (OpenAI-compatible)' },
      { id: 'gpt-image-2', name: 'GPT Image 2 (OpenAI-compatible)' },
      { id: 'imagen-3.0-generate-002', name: 'Imagen 3.0 Generate 002' },
      { id: 'dall-e-3', name: 'DALL-E 3' },
    ];
    console.log(JSON.stringify(FALLBACK_IMAGE_MODELS, null, 2));
    process.exit(0);
  }
  
  const providerKind = providerKindFromBaseUrl(rawBaseUrl);
  console.log("Provider Kind:", providerKind);
  
  if (providerKind === 'google') {
    const url = `${rawBaseUrl}/v1beta/models?key=${apiKey}`;
    console.log("Fetching from:", url.replace(apiKey, '***'));
    const fetchRes = await fetch(url);
    const data = await fetchRes.json();
    console.log(JSON.stringify(data.models?.map((m: any) => m.name), null, 2));
  } else {
    const url = `${rawBaseUrl}/v1/models`;
    console.log("Fetching from:", url);
    const fetchRes = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` }});
    const data = await fetchRes.json();
    console.log(JSON.stringify(data.data?.map((m: any) => m.id), null, 2));
  }
  
  await pool.end();
}

main().catch(console.error);
