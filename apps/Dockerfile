# --- base
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat bash && corepack enable
WORKDIR /app

# --- prune the monorepo to just medusa
FROM base AS prune
COPY . .
# scope name must match your package name for the medusa app/package
RUN npx --yes turbo@2.1.2 prune --scope=medusa --docker

# --- install deps for the pruned output
FROM base AS install
# Copy only what always exists after prune
COPY --from=prune /app/out/yarn.lock ./yarn.lock
COPY --from=prune /app/out/json/ .
# If using Yarn v1: install with frozen lockfile
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    else npm ci; fi

# --- build
FROM install AS build
RUN yarn --version || true
RUN if [ -f package.json ]; then \
      if cat package.json | grep -q "\"build\":" ; then yarn build || npm run build; fi; \
    fi

# --- runtime
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# copy pruned app and built artifacts
COPY --from=install /app ./
# expose Medusa on 9000
EXPOSE 9000
# run migrations + start (adjust to your scripts)
CMD [ "sh", "-lc", "yarn predeploy || true && yarn start:standalone || yarn start || node ./dist/index.js" ]
