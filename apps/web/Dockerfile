FROM --platform=$BUILDPLATFORM node:22.23-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=optional --no-audit --no-fund

FROM deps AS builder
WORKDIR /app
ARG EVOLVIA_API_INTERNAL_URL=http://api:4000
ENV EVOLVIA_API_INTERNAL_URL=$EVOLVIA_API_INTERNAL_URL
COPY . .
RUN npm run typecheck
RUN npm run build

FROM node:22.23-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
