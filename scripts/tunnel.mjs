import ngrok from '@ngrok/ngrok';

async function start() {
  const authtoken = process.env.NGROK_AUTHTOKEN || '3IBGsq9uEpuu4zpcb7xoJGGSf29_2x76XB6fqzRD9Zbhu7sRo';

  try {
    const listener = await ngrok.forward({
      addr: 3000,
      authtoken,
    });
    console.log(`\n======================================================`);
    console.log(`🚀 NGROK TUNNEL AKTIF: ${listener.url()}`);
    console.log(`======================================================\n`);
    console.log(`Silakan masukkan URL di atas ke Vercel NEXT_PUBLIC_API_URL\n`);
  } catch (err) {
    console.error('Gagal menjalankan ngrok tunnel:', err);
  }
}

start();
