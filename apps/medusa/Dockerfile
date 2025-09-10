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

# Copy the compiled server output
COPY --chown=node:node --from=installer /app/apps/medusa/.medusa/server /app/server

# Also copy client assets so Admin can be served if present
COPY --chown=node:node --from=installer /app/apps/medusa/.medusa/client /app/server/.medusa/client

WORKDIR /app/server
EXPOSE 9000

# Normalize admin output: mirror client to admin if admin is absent
RUN if [ -f /app/server/.medusa/client/index.html ] && [ ! -f /app/server/.medusa/admin/index.html ]; then \
      mkdir -p /app/server/.medusa/admin && cp -a /app/server/.medusa/client/. /app/server/.medusa/admin/; \
    fi

# Install server runtime dependencies (from .medusa/server/package.json)
# Avoid running lifecycle scripts (prepare/postinstall) during build, and relax peers
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps --no-audit --no-fund

# Non-root
USER node

# Start compiled server
CMD ["npm", "start"]
