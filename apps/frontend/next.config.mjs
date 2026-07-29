/** @type {import('next').NextConfig} */
const nextConfig = {
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
