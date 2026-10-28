FROM --platform=$BUILDPLATFORM node:22.23-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app
ENV DATABASE_URL="postgresql://evolvia:evolvia@postgres:5432/evolvia?schema=public"
COPY prisma ./prisma
RUN npm run prisma:validate
RUN npm run prisma:generate
RUN find node_modules/.prisma/client -maxdepth 1 \
      -name 'libquery_engine-linux-musl-arm64-openssl-3.0.x.so.node' \
      -print -quit | grep -q .
COPY nest-cli.json tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm run typecheck
RUN npm run build
RUN apk add --no-cache poppler-utils
RUN npm run test:unit
RUN npm prune --omit=dev && npm cache clean --force

FROM node:22.23-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
EXPOSE 4000
CMD ["node", "dist/main.js"]
