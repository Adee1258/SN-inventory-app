// Vercel Serverless Function Entry Point for Express
// Set VERCEL=1 so app.listen() and persistent sync workers are skipped
process.env.VERCEL = '1';

const { app } = require('./_bundle.js');

module.exports = app;
