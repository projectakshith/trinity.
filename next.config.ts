import path from 'node:path';
import type { NextConfig } from 'next';

/* morpheus/client is TypeScript source in a sibling repo (symlinked), so it must be compiled here and sit inside the bundler root. */
const workspaceRoot = path.join(import.meta.dirname, '..');

const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  transpilePackages: ['morpheus'],
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  devIndicators: false,
  /* Lets the dev server be opened from a phone on the LAN or over Tailscale. */
  allowedDevOrigins: ['127.0.0.1', '192.168.*.*', '10.*.*.*', '100.*.*.*', '**.ts.net'],
};

export default config;
