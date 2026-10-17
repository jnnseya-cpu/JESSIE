/*
 * The one file Vercel looks for.
 *
 * Vercel builds a Serverless Function for every file under `api/`, and
 * `vercel.json` rewrites every path to this one, so the whole API is a
 * single function rather than one per route. That is deliberate: Nest
 * boots the entire application graph on the first request, so splitting
 * it across functions would pay that cost once per route instead of
 * once per instance.
 *
 * Plain CommonJS on purpose. Everything real is in `src/serverless.ts`
 * and compiled to `dist/` by the build command before this file is
 * traced; a `.ts` file here would be compiled a second time, by a
 * different compiler, without `emitDecoratorMetadata` — and Nest's
 * dependency injection is `emitDecoratorMetadata`.
 */
module.exports = require('../dist/serverless').handler;
