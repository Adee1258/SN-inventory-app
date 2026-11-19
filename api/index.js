// Vercel Serverless Function Entry Point
// CommonJS wrapper — uses dynamic import() to load the ESM/CJS server dist

let cachedApp = null;

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!cachedApp) {
      console.log('[Vercel] Loading Express app...');
      console.log('[Vercel] DATABASE_URL set:', !!process.env.DATABASE_URL);
      console.log('[Vercel] JWT_SECRET set:', !!process.env.JWT_SECRET);
      console.log('[Vercel] NODE_ENV:', process.env.NODE_ENV);

      const mod = await import('../apps/server/dist/index.js');
      cachedApp = mod.app || mod.default;

      if (!cachedApp) {
        throw new Error('No "app" export found in server dist/index.js. Available keys: ' + Object.keys(mod).join(', '));
      }
      console.log('[Vercel] Express app loaded successfully');
    }

    return cachedApp(req, res);
  } catch (err) {
    console.error('[Vercel] BOOT ERROR:', err?.message);
    console.error('[Vercel] Stack:', err?.stack);
    return res.status(500).json({
      error: 'Server boot failed',
      message: err?.message,
      type: err?.constructor?.name,
    });
  }
};
