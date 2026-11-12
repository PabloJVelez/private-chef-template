FROM node:24.22.1-alpine AS base

RUN apk update && apk add --no-cache libc6-compat

RUN mkdir -p /app && chown node:node /app
USER 1000

WORKDIR /app

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
