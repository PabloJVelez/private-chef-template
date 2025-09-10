# ---------- builder ----------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat bash ca-certificates && update-ca-certificates && corepack enable
WORKDIR /app

# Yarn Berry core so installs can cache
COPY .yarn .yarn
COPY .yarnrc.yml package.json yarn.lock ./

# Workspace manifests so Yarn can resolve medusa quickly
COPY apps/medusa/package.json apps/medusa/package.json
# (add other internal package.json files here if medusa depends on them)

# Install deps for the medusa workspace (dev deps included so we can build)
RUN yarn workspaces focus medusa --all

# Bring in the rest of the source
COPY . .

# Optional: won’t fail if scripts don’t exist
RUN yarn workspace medusa build
RUN yarn workspace medusa prisma:generate || true

# ---------- runtime ----------
FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat bash ca-certificates && update-ca-certificates && corepack enable
WORKDIR /app
ENV NODE_ENV=production

# Pull everything from the builder
COPY --from=builder /app ./

# Keep ALL deps because runtime uses ts-node / devDeps
RUN yarn workspaces focus medusa --all

EXPOSE 9000

# Run DB migrations then start the server
CMD ["sh","-lc","yarn workspace medusa predeploy || true; yarn workspace medusa start"]
