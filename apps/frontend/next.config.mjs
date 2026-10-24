/**
 * The Content-Security-Policy, and why it is here rather than in
 * `vercel.json`.
 *
 * The five headers in `apps/frontend/vercel.json` are set by the platform,
 * so they exist on a deployment and nowhere else. That is fine for HSTS,
 * which is meaningless over loopback, and wrong for a CSP: a policy that
 * cannot be served locally cannot be tested locally, and the way a CSP
 * fails is by silently blocking something the page needs. This one is set
 * by Next, so `next start` serves it and a browser run exercises the real
 * policy. Nothing here duplicates a header `vercel.json` already sets.
 *
 * `script-src` carries `'unsafe-inline'` and is honest about it. Next
 * injects inline bootstrap and hydration scripts, so a strict policy needs
 * per-request nonces through middleware, which is a larger change than an
 * audit should make. The value in this policy is therefore not script
 * blocking: it is `connect-src`, which stops an injected script
 * exfiltrating to a host of its choosing, plus `object-src`, `base-uri`
 * and `form-action`, which close three injection routes outright.
 *
 * Hosts are derived from `NEXT_PUBLIC_API_BASE_URL`, the same variable
 * `apiBase()` reads, so a policy cannot drift from the API the bundle
 * actually calls — which is the failure that would break every signed-in
 * screen with a console error nobody outside the browser sees.
 */
/*
 * Every origin `apiBase()` can resolve to — not just the configured one.
 *
 * This policy first derived a single origin from
 * `NEXT_PUBLIC_API_BASE_URL`, and that was wrong, because `apiBase()`
 * resolves the API *at runtime from the browser's hostname* and
 * deliberately so: "the deployed site needs no build-time variable to
 * find its own API". The two disagreed exactly when the variable was
 * unset and the page was not served from jessmove.com — `apiBase()`
 * returned `http://localhost:4000/api` while the policy allowed only
 * `https://api.jessmove.com`, so every API call was refused by the
 * policy rather than merely pointed at the wrong host.
 *
 * It was found by a browser run against a build made without the
 * variable: 23 of 43 journeys failed with "Refused to connect to
 * 'http://localhost:4000/api/funnel'". A Vercel preview deployment is
 * that same case. The comment above warned about precisely this drift
 * and the first version of the code did not prevent it, so the fix is to
 * enumerate what `apiBase()` can actually produce and keep the two in
 * step with a test.
 */
const apiOrigins = (() => {
  const origins = new Set(['https://api.jessmove.com']);
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      /* an unparseable value is a deployment error, not a reason to ship
         a policy that blocks the real API as well */
    }
  } else {
    /* The branch `apiBase()` takes when nothing is configured and the
       page is not on jessmove.com. */
    origins.add('http://localhost:4000');
  }
  return [...origins].join(' ');
})();

const dev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  // The two consent-gated measurement vendors, and nothing else. Adding a
  // third host here is the same decision as adding a third vendor.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://connect.facebook.net https://www.googletagmanager.com`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  // `data:` for canvas and generated marks; Vercel Blob and the API host
  // for uploaded avatars and meal photographs.
  `img-src 'self' data: blob: ${apiOrigins} https://*.public.blob.vercel-storage.com`,
  `connect-src 'self' ${apiOrigins} https://www.google-analytics.com https://connect.facebook.net https://www.facebook.com`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: csp }] }];
  },
  reactStrictMode: true,
  // Workspace packages are consumed as built JS, but naming them here keeps
  // source maps and future TS-source consumption working. These were stale
  // (@jessie-os/*) after the rebrand and matched nothing.
  transpilePackages: [
    '@jessmove/shared',
    '@jessmove/body-command',
    '@jessmove/foodlens',
  ],
  poweredByHeader: false,
  // `output: 'standalone'` would produce a smaller image, but in this pnpm
  // workspace it emits a tree whose static assets the server does not resolve.
  // Rather than ship a Dockerfile that cannot be verified here, the image runs
  // the ordinary Next production server. Revisit when it can be tested.
};

export default nextConfig;
