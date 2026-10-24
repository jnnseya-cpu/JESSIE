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
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.jessmove.com/api').origin;
  } catch {
    return 'https://api.jessmove.com';
  }
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
  `img-src 'self' data: blob: ${apiOrigin} https://*.public.blob.vercel-storage.com`,
  `connect-src 'self' ${apiOrigin} https://www.google-analytics.com https://connect.facebook.net https://www.facebook.com`,
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
