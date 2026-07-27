FROM oven/bun:1 AS base
WORKDIR /repo

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN cd apps/web && bun run build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/web
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./.next/static
COPY --from=build /repo/apps/web/public ./public
EXPOSE 3000
CMD ["bun", "run", "server.js"]
