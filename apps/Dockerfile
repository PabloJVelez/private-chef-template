# --- base for installs/builds
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat bash && corepack enable
WORKDIR /app

# Copy Yarn Berry core files first (so installs can cache)
COPY .yarn .yarn
COPY .yarnrc.yml package.json yarn.lock ./

# Copy workspace manifests needed to resolve the Medusa workspace
COPY apps/medusa/package.json apps/medusa/package.json
# If you have other internal packages used by medusa, also copy their package.json files here, e.g.:
# COPY packages/common/package.json packages/common/package.json

# Install deps for just the medusa workspace (including dev deps, to allow build)
RUN yarn workspaces focus medusa --all

# Bring in the rest of the source
COPY . .

# Optional: build if your medusa workspace has a build script
# (won't fail if it doesn't exist)
RUN yarn workspace medusa build || true
# Optional: prisma generate (if your scripts expect it)
RUN yarn workspace medusa prisma:generate || true

# --- production image
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat bash && corepack enable
WORKDIR /app
ENV NODE_ENV=production

# Copy everything from the build stage
COPY --from=base /app ./

# Install only production deps for medusa workspace
RUN yarn workspaces focus medusa --production

EXPOSE 9000

# Run DB migrations then start the server
CMD ["sh","-lc","yarn workspace medusa predeploy || true; yarn workspace medusa start"]
