# OneClick: API, worker ve panel tek imajda.
# API, derlenmiş paneli (apps/web/dist) ve /media dosyalarını da sunar.
FROM node:22-bookworm-slim

# openssl: Prisma · ffmpeg: video süresi/boyutu (ffprobe)
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.28.0

WORKDIR /app

# Önce yalnızca bağımlılık tanımları: kod değişince bu katman önbellekten gelir
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @oneclick/shared build \
  && pnpm --filter @oneclick/api build \
  && pnpm --filter @oneclick/web build

ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
