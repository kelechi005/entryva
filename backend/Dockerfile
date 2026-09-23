FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
RUN npm config set fetch-timeout 600000 \
 && npm config set fetch-retries 5 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && for i in 1 2 3; do \
      npm ci && break; \
      echo "npm ci failed (attempt $i/3), retrying in 10s..."; \
      sleep 10; \
      if [ "$i" = "3" ]; then exit 1; fi; \
    done

FROM base AS build
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN for i in 1 2 3; do \
      npx prisma generate && break; \
      echo "prisma generate failed (attempt $i/3), retrying in 10s..."; \
      sleep 10; \
      if [ "$i" = "3" ]; then exit 1; fi; \
    done
RUN npm run build
# Drop devDependencies (typescript, @nestjs/cli, jest, eslint, prisma CLI,
# etc.) from node_modules before it's copied into the runtime image below
# — they're only needed to produce `dist/`, not to run it. This doesn't
# touch node_modules/.prisma (the generated client from the step above):
# npm prune only removes packages absent from package.json's dependency
# tree, and .prisma isn't a package entry at all.
RUN npm prune --omit=dev

FROM base AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
# Run as an unprivileged user rather than root — standard hardening,
# same pattern as frontend/Dockerfile.
RUN addgroup -g 1001 -S nestjs && adduser -S nestjs -u 1001
# node_modules must come from the BUILD stage, not deps — `deps` only has
# the packages `npm ci` installed, before `prisma generate` ran on top of
# them in `build`. Copying from `deps` here would silently ship a
# container with no generated Prisma client (node_modules/.prisma) at
# all — it would fail at the first real query, not at startup.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY package.json ./
USER nestjs
EXPOSE 4000
CMD ["node", "dist/src/main.js"]
