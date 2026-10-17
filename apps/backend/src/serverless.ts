import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './setup';

/**
 * The API, as a serverless function.
 *
 * `main.ts` starts a server that listens on a port. That is the right
 * shape for a container and the wrong one for Vercel, which never calls
 * `listen` — it hands a request and a response to an exported function
 * and waits. `setup.ts` claimed "on Vercel the platform's NestJS support
 * finds `src/main.ts`, builds it, and runs the same listening server as
 * a function". There is no such support. Vercel has no NestJS preset, so
 * the backend project had a build command, no output directory and no
 * function — nothing the platform could serve — and every backend
 * deployment since 19 August 2026 failed.
 *
 * Both entry points configure the application through the same
 * `configureApp`, so the prefix, the validation pipe, the CORS rule and
 * the security headers cannot drift between how it runs locally and how
 * it runs in production. The only difference is the last line: one
 * listens, one returns the request handler.
 */

type RequestLike = unknown;

/** The slice of the Node response the failure path needs. */
interface ResponseLike {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

type NodeHandler = (req: RequestLike, res: ResponseLike) => void;

/**
 * Built once per warm instance.
 *
 * A rejected promise is cleared rather than kept, because a cached
 * failure would turn one bad cold start — a database asleep, a secret
 * not yet propagated — into an instance that refuses every request for
 * as long as the platform keeps it alive.
 */
let instance: Promise<NodeHandler> | null = null;

async function build(): Promise<NodeHandler> {
  // rawBody for the same reason as main.ts: the Stripe webhook signature
  // is computed over the exact bytes Stripe sent.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    rawBody: true,
    bodyParser: false,
  });
  configureApp(app);

  /*
   * `init` rather than `listen`. It runs the full lifecycle — which is
   * what applies the migrations, under the advisory lock DbService takes
   * precisely so concurrent instances take turns — and then stops short
   * of binding a socket.
   *
   * No shutdown hooks: the platform freezes and thaws an instance
   * between requests rather than signalling it, so a handler registered
   * on SIGTERM would close the pool at a moment nobody chose.
   */
  await app.init();

  return app.getHttpAdapter().getInstance() as NodeHandler;
}

/** What Vercel invokes. Every path, including the `/api` prefix. */
export default function handler(req: RequestLike, res: ResponseLike): void {
  if (instance === null) {
    instance = build().catch((error: unknown) => {
      instance = null;
      throw error;
    });
  }

  void instance.then(
    (app) => app(req, res),
    (error: unknown) => {
      /*
       * A cold start that failed has no Nest application, so no filter,
       * no interceptor and no logger — nothing that would otherwise turn
       * this into a response. Left alone the request simply never
       * answers, and a timeout is the one failure that tells whoever is
       * looking nothing at all.
       */
      console.error('API failed to start', error);
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'Service Unavailable',
          statusCode: 503,
          message: 'The API could not start. This is a deployment fault, not a bad request.',
        }),
      );
    },
  );
}

export { handler };
