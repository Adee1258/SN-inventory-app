// Vercel Serverless Function Handler
process.env.VERCEL = '1';

let cachedApp = null;
let bootError = null;

try {
  const serverModule = require('./_bundle.js');
  cachedApp = serverModule.app;
} catch (err) {
  console.error('[Vercel Boot Error]:', err);
  bootError = err;
}

module.exports = (req, res) => {
  // If boot failed, return the exact diagnostic error
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

  // Pass request to Express
  return cachedApp(req, res);
};
