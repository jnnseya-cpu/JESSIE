/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared package is TypeScript source consumed across the workspace.
  transpilePackages: ['@jessie-os/shared'],
  poweredByHeader: false,
};

export default nextConfig;
