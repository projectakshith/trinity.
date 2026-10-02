import path from 'node:path';
import type { NextConfig } from 'next';

const workspaceRoot = path.join(import.meta.dirname, '..');

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['morpheus'],
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  devIndicators: false,
  allowedDevOrigins: ['127.0.0.1', '192.168.*.*', '10.*.*.*', '100.*.*.*', '**.ts.net'],
};

export default config;
