FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
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
# Next.js inlines every NEXT_PUBLIC_* var into the client bundle at BUILD
# time, not at container start — an env_file/`docker run -e` on the
# runtime container has no effect on a value already baked into the
# compiled JS. This has to be a build ARG so CI can pass the real
# production API URL when it builds the image (see
# .github/workflows/ci.yml and DEPLOYMENT.md). Defaults to localhost so
# `docker build` still works untouched for local testing.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
# Run as an unprivileged user rather than root inside the container.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# `output: 'standalone'` (next.config.js) traces the minimal server +
# deps Next.js actually needs into .next/standalone — no full
# node_modules copy required here, unlike the old Dockerfile. .next/
# static and public/ (which includes the PWA's generated sw.js) still
# have to be copied in separately; standalone mode deliberately doesn't
# bundle them since they're served as static files, not through the
# Node server.
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
