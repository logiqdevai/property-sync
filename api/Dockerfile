# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install prisma@7.2.0 --no-save

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY prisma ./prisma
COPY prisma.config.ts ./

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
