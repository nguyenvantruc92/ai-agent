import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['xlsx', 'pdf-parse', 'pino', 'pg', '@langchain/langgraph-checkpoint-postgres'],
  // `next dev` (webpack) must not watch runtime data: the logger appends to data/logs on every request, and each write
  // made the dev server refresh the open page (a chat widget could restart in the middle of a conversation).
  webpack(config, { dev }) {
    if (dev) config.watchOptions = { ...config.watchOptions, ignored: ['**/node_modules/**', '**/.git/**', '**/.next/**', '**/data/**'] };
    return config;
  },
};

export default nextConfig;
