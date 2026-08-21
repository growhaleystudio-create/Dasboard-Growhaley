import ngrok from '@ngrok/ngrok';
import { setTunnelUrl } from './setup-tunnel-sync.mjs';

async function start() {
  const authtoken = process.env.NGROK_AUTHTOKEN || '3IBGsq9uEpuu4zpcb7xoJGGSf29_2x76XB6fqzRD9Zbhu7sRo';

  try {
    const listener = await ngrok.forward({
      addr: 3000,
      authtoken,
    });
    const url = listener.url();
    console.log(`\n======================================================`);
    console.log(`🚀 NGROK TUNNEL AKTIF: ${url}`);
    console.log(`======================================================\n`);

    try {
      await setTunnelUrl(url);
    } catch (e) {
      console.warn('Could not sync tunnel URL to Supabase:', e.message);
    }

    // Keep process running indefinitely
    process.stdin.resume();
    await new Promise(() => {});
  } catch (err) {
    console.error('Gagal menjalankan ngrok tunnel:', err);
  }
}

start();
