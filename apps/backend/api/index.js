// The Vercel function. Plain JavaScript on purpose: it requires the
// compiled output in ../dist, so Vercel's TypeScript pipeline never has to
// resolve the workspace — the build command has already done that.
let serverPromise;

module.exports = async (req, res) => {
  serverPromise ??= require('../dist/serverless').createServer();
  const server = await serverPromise;
  server(req, res);
};
