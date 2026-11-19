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
      console.log('[Vercel] Loading server bundle...');
      let serverModule;
      try {
        serverModule = require('./_bundle.js');
      } catch (_e) {
        serverModule = require('../apps/server/dist/bundle.js');
      }

      cachedApp = serverModule.app || serverModule.default;
      if (!cachedApp) {
        throw new Error('No app export found. Keys: ' + Object.keys(serverModule || {}).join(', '));
      }
      console.log('[Vercel] Server bundle loaded successfully');
    }
    return cachedApp(req, res);
  } catch (err) {
    console.error('[Vercel] Function Error:', err?.message);
    console.error('[Vercel] Stack:', err?.stack);
    return res.status(500).json({
      error: 'Backend initialization failed',
      message: err?.message,
      type: err?.constructor?.name,
    });
  }
};
