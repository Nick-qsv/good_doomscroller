FROM node:22-alpine AS base
# Refresh the inherited OpenSSL libraries to the fixed release. Installing
# Python alone can leave the older libraries already present in the base image.
RUN apk add --no-cache --upgrade 'libcrypto3>=3.5.8-r0' 'libssl3>=3.5.8-r0'

FROM base AS dependencies
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app/apps/web
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY --from=dependencies /app/node_modules ./node_modules
COPY apps/web/ ./
COPY packages/anchoring/ /app/packages/anchoring/
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PIPELINE_SOURCE_PATH=/app/pipeline/src

RUN apk add --no-cache python3 \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/scripts/database-config.mjs ./scripts/database-config.mjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/scripts/analytics-prune.mjs ./scripts/analytics-prune.mjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/scripts/import-corpus.mjs ./scripts/import-corpus.mjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/scripts/import-corpus-lib.mjs ./scripts/import-corpus-lib.mjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/scripts/verify-corpus-source.mjs ./scripts/verify-corpus-source.mjs
COPY --chown=nextjs:nodejs pipeline/src ./pipeline/src
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/scripts/archive-editions.mjs ./scripts/archive-editions.mjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/scripts/archive-editions-lib.mjs ./scripts/archive-editions-lib.mjs
COPY --from=dependencies --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres
COPY --chown=nextjs:nodejs packages/db/migrations ./migrations
COPY --chown=nextjs:nodejs corpus/published ./corpus/published
COPY --chown=nextjs:nodejs corpus/retired ./corpus/retired
COPY --chown=nextjs:nodejs docker/web-entrypoint.sh ./web-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["/app/web-entrypoint.sh"]
