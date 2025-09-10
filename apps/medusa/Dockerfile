# Base image
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /app

# Prune to the medusa workspace (turbo)
FROM base AS builder
COPY . .
RUN npx --yes turbo@2.1.2 prune --scope=medusa --docker

# Install dependencies for pruned workspace and build medusa
FROM base AS installer
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/yarn.lock ./yarn.lock
COPY --from=builder /app/.yarnrc.yml ./.yarnrc.yml
COPY --from=builder /app/.yarn ./.yarn
RUN yarn install --immutable
COPY --from=builder /app/out/full/ .

# Build medusa via turbo (fallback to direct in case turbo pipeline isn't configured)
RUN yarn turbo build --filter=medusa || yarn workspace medusa build

# Reduce image size
RUN rm -rf node_modules/.cache .yarn/cache || true

# Runtime image: run compiled server only
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat && corepack enable
ENV NODE_ENV=production

# Bring pruned workspace and yarn config
WORKDIR /app
# Copy pruned workspace files
COPY --from=builder /app/out/full/ ./
COPY --from=installer /app/.yarnrc.yml ./.yarnrc.yml
COPY --from=installer /app/.yarn ./.yarn
COPY --from=installer /app/yarn.lock ./yarn.lock

# Copy built artifacts (.medusa) from installer
COPY --from=installer /app/apps/medusa/.medusa /app/apps/medusa/.medusa

# Install only medusa workspace runtime deps
RUN yarn workspaces focus medusa --production

# Normalize admin output in workspace artifacts
RUN if [ -f apps/medusa/.medusa/client/index.html ] && [ ! -f apps/medusa/.medusa/admin/index.html ]; then \
      mkdir -p apps/medusa/.medusa/admin && cp -a apps/medusa/.medusa/client/. apps/medusa/.medusa/admin/; \
    fi

# Ensure Medusa CLI can load a JS config (production install may not include ts-node)
RUN if [ -f apps/medusa/.medusa/server/medusa-config.js ]; then \
      cp apps/medusa/.medusa/server/medusa-config.js apps/medusa/medusa-config.js; \
    fi

WORKDIR /app/apps/medusa
EXPOSE 9000

# Non-root
USER node

# Start from workspace (apply migrations, then start)
CMD ["yarn", "start:prod"]
