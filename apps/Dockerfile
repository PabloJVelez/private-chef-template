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

# repo root
WORKDIR /app

# copy build output from builder
COPY --from=builder /app ./

# install the deps we run with (keeps node_modules for medusa workspace)
RUN yarn workspaces focus medusa --all

# ⬅️ set cwd to the medusa workspace so the CLI sees ./.medusa/*
WORKDIR /app/apps/medusa

EXPOSE 9000

# sanity checks (fail image build if admin/server artifacts are missing)
RUN test -f .medusa/admin/index.html
RUN test -f .medusa/server/index.cjs

# use the CLI exactly as you want
CMD ["sh","-lc","yarn predeploy || true; yarn start"]
