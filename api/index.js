// Vercel Serverless Function — CommonJS wrapper
// The server dist is ESM (NodeNext), so we use dynamic import()
// which works perfectly from CommonJS files in Node.js >= 12

module.exports = async (req, res) => {
  try {
    const { app } = await import('../apps/server/dist/index.js');
    return app(req, res);
  } catch (err) {
    console.error('Serverless handler boot error:', err);
    res.status(500).json({
      error: 'Server boot failed',
      details: String(err),
      stack: err?.stack,
    });
  }
};
