import { loadEnv, type Env } from '../config/env.js';

export function getSupabaseUrl(env: Env): string {
  if (env.SUPABASE_URL) return env.SUPABASE_URL;

  try {
    const dbUrl = new URL(env.DATABASE_URL);
    // Case 1: username is postgres.project-id
    const usernameParts = dbUrl.username.split('.');
    if (usernameParts.length > 1) {
      return `https://${usernameParts[1]}.supabase.co`;
    }
    // Case 2: hostname has supabase (e.g. project-id.supabase.co)
    if (dbUrl.hostname.includes('supabase')) {
      const hostnameParts = dbUrl.hostname.split('.');
      const projectId = hostnameParts.find(p => p.length === 20 && /^[a-z0-9]+$/i.test(p));
      if (projectId) {
        return `https://${projectId}.supabase.co`;
      }
    }
  } catch {
    // ignore
  }

  // Fallback default project ID
  return 'https://ioqazptafolroxwgkera.supabase.co';
}

/**
 * Uploads a file buffer to Supabase Storage using native REST API.
 * If credentials are missing or the upload fails, it falls back to a Data URI
 * or a placeholder URL in development to ensure the app continues working.
 */
export async function uploadToSupabaseStorage(
  fileName: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string> {
  const env = loadEnv();
  const supabaseUrl = getSupabaseUrl(env);
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketName = env.SUPABASE_BUCKET || 'content-assets';

  if (!apiKey) {
    console.warn(
      `⚠️ SUPABASE_SERVICE_ROLE_KEY is not defined. Falling back to Data URI for file: ${fileName}`
    );
    return fallbackResponse(fileName, fileBuffer, contentType);
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${fileName}`;

  try {
    // 1. Attempt to upload the file to Supabase Storage
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': contentType,
        // x-upsert header allows overwriting existing files
        'x-upsert': 'true',
      },
      body: fileBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase Storage responded with status ${response.status}: ${errorText}`);
    }

    // 2. Return the public URL for the file
    // Assumes bucket has public access enabled.
    return `${supabaseUrl}/storage/v1/object/public/${bucketName}/${fileName}`;
  } catch (error: any) {
    console.error(`❌ Supabase Storage Upload failed: ${error.message}`);
    console.warn('Falling back to Data URI to prevent application crash.');
    return fallbackResponse(fileName, fileBuffer, contentType);
  }
}

function fallbackResponse(fileName: string, fileBuffer: Buffer, contentType: string): string {
  const base64 = fileBuffer.toString('base64');
  return `data:${contentType};base64,${base64}`;
}
