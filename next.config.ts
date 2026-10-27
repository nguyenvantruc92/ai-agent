import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['xlsx', 'pdf-parse', 'pino', 'pg', '@langchain/langgraph-checkpoint-postgres'],
};

export default nextConfig;
