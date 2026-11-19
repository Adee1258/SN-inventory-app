// Vercel Serverless Function Handler
// Set VERCEL flag BEFORE requiring the bundle so that
// isServerless check inside index.ts resolves to true
// and app.listen() is never called in serverless mode.
process.env.VERCEL = '1';

let cachedApp = null;
let bootError = null;

try {
  const serverModule = require('./_bundle.js');
  cachedApp = serverModule.app;

  if (!cachedApp) {
    throw new Error('app export not found in bundle — check that src/index.ts exports { app }');
  }
} catch (err) {
  console.error('[Vercel Boot Error]:', err);
  bootError = err;
}

module.exports = (req, res) => {
  if (bootError || !cachedApp) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify(
        {
          success: false,
          error: 'SERVER_BOOT_FAILED',
          message: bootError ? bootError.message : 'App export not found in bundle',
          stack: bootError ? bootError.stack : null,
          nodeVersion: process.version,
          envKeys: Object.keys(process.env).filter(
            (k) => !k.includes('SECRET') && !k.includes('PASS')
          ),
        },
        null,
        2
      )
    );
  }

  return cachedApp(req, res);
};
