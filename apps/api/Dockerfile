FROM oven/bun:1 AS base
WORKDIR /repo

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
RUN bun install --frozen-lockfile

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN cd packages/db && bunx prisma generate
RUN cd apps/api && bun build src/index.ts --outdir dist --target bun

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/db ./packages/db
COPY --from=build /repo/apps/api/dist ./apps/api/dist
EXPOSE 3001
CMD ["bun", "run", "apps/api/dist/index.js"]
