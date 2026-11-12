FROM node:26.13.1-alpine3.24@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS base

RUN apk update && apk add --no-cache libc6-compat

# Node 26 no longer bundles Corepack/Yarn; Yarn itself stays repository-pinned.
RUN npm install --global corepack@0.36.0 && corepack enable

RUN mkdir -p /app && chown node:node /app
USER 1000

WORKDIR /app

FROM base AS builder

COPY --chown=node:node . .

RUN npx --yes turbo@2.1.2 prune --scope=storefront --docker

FROM base AS installer

COPY --chown=node:node --from=builder /app/out/json/ .
COPY --chown=node:node --from=builder /app/out/yarn.lock yarn.lock
COPY --chown=node:node --from=builder /app/.yarnrc.yml .yarnrc.yml
COPY --chown=node:node --from=builder /app/.yarn .yarn

RUN yarn install --immutable

COPY --chown=node:node --from=builder /app/out/full/ .

RUN yarn turbo build --filter=storefront && \
    yarn workspaces focus --all --production && \
    rm -rf node_modules/.cache .yarn/cache

FROM base AS runner

COPY --chown=node:node --from=installer /app/ .

USER 1000

WORKDIR /app/apps/storefront

ENV PORT=80

CMD ["yarn", "start"]