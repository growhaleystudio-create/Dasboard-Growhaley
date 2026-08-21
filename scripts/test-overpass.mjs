async function testOverpass(category, location) {
  console.log(`Testing Overpass API for: ${category} in ${location}`);
  
  // 1. Geocode location to bounding box or relation
  const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location + ', Indonesia')}&format=json&limit=1`;
  const geoRes = await fetch(geoUrl, {
    headers: { 'User-Agent': 'LeadsGeneratorScraper/1.0 (contact@growhaley.com)' }
  });
  const geoData = await geoRes.json();
  if (!geoData || geoData.length === 0) {
    console.log('Location not found in Nominatim');
    return;
  }

  const [south, north, west, east] = geoData[0].boundingbox;
  console.log(`Location "${location}" bounding box:`, { south, north, west, east });

  // 2. Query Overpass API
  const overpassQuery = `
    [out:json][timeout:25];
    (
      node["tourism"="hotel"](${south},${west},${north},${east});
      way["tourism"="hotel"](${south},${west},${north},${east});
      node["amenity"="hotel"](${south},${west},${north},${east});
      way["amenity"="hotel"](${south},${west},${north},${east});
    );
    out center 20;
  `;

  const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
  const opRes = await fetch(overpassUrl, {
    headers: { 'User-Agent': 'LeadsGeneratorScraper/1.0 (contact@growhaley.com)' }
  });

  console.log('Overpass status:', opRes.status);
  const opData = await opRes.json();
  console.log(`Found ${opData.elements?.length || 0} hotels in ${location}:`);
  
  opData.elements?.slice(0, 10).forEach((el, idx) => {
    const name = el.tags?.name || el.tags?.['name:en'] || el.tags?.brand || 'Unnamed Hotel';
    const phone = el.tags?.phone || el.tags?.['contact:phone'] || el.tags?.['contact:whatsapp'] || el.tags?.['contact:mobile'] || 'N/A';
    const website = el.tags?.website || el.tags?.['contact:website'] || 'N/A';
    const street = el.tags?.['addr:street'] || el.tags?.['addr:city'] || location;
    console.log(`[${idx + 1}] ${name} | Phone: ${phone} | Website: ${website} | Location: ${street}`);
  });
}

testOverpass('hotel', 'Bali');
