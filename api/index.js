// Vercel Serverless Function Entry Point
// Loads the esbuild bundle (all workspace packages included inline)

let cachedApp = null;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!cachedApp) {
      console.log('[Vercel] Loading bundle...');
      // Use require() since bundle.js is CommonJS (esbuild format: cjs)
      const serverModule = require('../apps/server/dist/bundle.js');
      cachedApp = serverModule.app || serverModule.default;
      if (!cachedApp) throw new Error('No app export. Keys: ' + Object.keys(serverModule).join(', '));
      console.log('[Vercel] Bundle loaded OK');
    }
    return cachedApp(req, res);
  } catch (err) {
    console.error('[Vercel] ERROR:', err?.message);
    console.error('[Vercel] STACK:', err?.stack);
    return res.status(500).json({
      error: err?.message,
      type: err?.constructor?.name,
    });
  }
};
