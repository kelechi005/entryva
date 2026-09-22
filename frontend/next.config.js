const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  // Service workers are awkward in dev (stale caches across hot reload),
  // and the whole point here is production resilience, so it's off in
  // development. Test the real behavior with `npm run build && npm start`.
  disable: process.env.NODE_ENV === 'development',
  register: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      // Deliberately NEVER cache /api/ responses in the service worker.
      // CLAUDE.md §9.5's offline gate-verification design already has a
      // correct, security-reviewed answer for "no connectivity": a
      // signed, hash-only IndexedDB manifest (offline/manifest.ts) that
      // re-verifies every entry's signature on every read, plus an
      // idempotent sync queue. Letting the service worker also cache or
      // intercept API calls would create a second, unreviewed offline
      // code path for the exact same problem — e.g. silently serving a
      // stale verification response instead of going through the app's
      // own offline logic. This rule keeps the service worker's job
      // narrowly scoped to "let the page shell load with zero
      // connectivity," which is the actual gap it's here to close.
      {
        urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
        handler: 'NetworkOnly',
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Traces the minimal set of files/deps actually needed to run the app
  // into .next/standalone, so the Docker runtime image (see
  // frontend/Dockerfile) doesn't need a full node_modules at all — just
  // that folder plus .next/static and public/. Meaningfully smaller
  // image, and nothing to keep in sync manually.
  output: 'standalone',
};

module.exports = withPWA(nextConfig);
