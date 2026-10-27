FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS app
COPY . .
RUN pnpm build
EXPOSE 3000
CMD ["pnpm", "start"]
