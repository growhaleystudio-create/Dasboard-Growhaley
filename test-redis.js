const { Redis } = require('ioredis');
const redis = new Redis('redis://default:wZQU0Gwna95zLMgoDn1pfO8lBkSyfqDp@turbopolished-volleyball-hopeful-61751.db.redis.io:10930', { connectTimeout: 3000, maxRetriesPerRequest: 1 });
redis.on('error', (err) => { console.error('Redis Error:', err.message); process.exit(1); });
redis.on('connect', () => { console.log('Redis connected'); process.exit(0); });
setTimeout(() => { console.log('Redis timeout'); process.exit(1); }, 5000);
