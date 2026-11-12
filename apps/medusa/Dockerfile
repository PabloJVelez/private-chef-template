FROM node:26.13.1-alpine3.24@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS base

RUN apk update && apk add --no-cache libc6-compat

# Node 26 no longer bundles Corepack/Yarn; Yarn itself stays repository-pinned.
RUN npm install --global corepack@0.36.0 && corepack enable

RUN mkdir -p /app && chown node:node /app
USER 1000

WORKDIR /app

# Keep the pinned Yarn cache in every stage, including the offline runtime image.
RUN corepack install --global yarn@4.5.0

FROM base AS builder

COPY --chown=node:node . .

RUN npx --yes turbo@2.1.2 prune --scope=medusa --docker

FROM base AS installer

COPY --chown=node:node --from=builder /app/out/json/ .
COPY --chown=node:node --from=builder /app/out/yarn.lock yarn.lock
COPY --chown=node:node --from=builder /app/.yarnrc.yml .yarnrc.yml
COPY --chown=node:node --from=builder /app/.yarn .yarn

RUN yarn install --immutable

COPY --chown=node:node --from=builder /app/out/full/ .

RUN yarn turbo build --filter=medusa && \
    rm -rf node_modules/.cache .yarn/cache


FROM base AS runner

COPY --chown=node:node --from=installer /app/ .

USER 1000

WORKDIR /app/apps/medusa/.medusa/server

ENV PORT=80

CMD ["sh", "-c", "/app/apps/medusa/node_modules/.bin/medusa db:migrate && /app/apps/medusa/node_modules/.bin/medusa start"]
