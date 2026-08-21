async function testOsm(keyword, location) {
  console.log(`Testing OSM Nominatim for: "${keyword}" in "${location}"`);
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${keyword} ${location}`)}&format=json&addressdetails=1&limit=20`;
  
  const res = await fetch(nominatimUrl, {
    headers: {
      'User-Agent': 'LeadsGeneratorScraper/1.0 (contact@growhaley.com)'
    }
  });

  console.log('Nominatim status:', res.status);
  const data = await res.json();
  console.log(`Found ${data.length} places from Nominatim:`);
  data.slice(0, 8).forEach((p, i) => {
    console.log(`[${i+1}] Name: ${p.name || p.display_name?.split(',')[0]} | Type: ${p.type} | Address: ${p.display_name}`);
  });
}

testOsm('hotel', 'bali');
