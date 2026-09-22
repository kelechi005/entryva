/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    // isolatedModules: transpile-only, skip full type-checking here.
    // Without a real `npx prisma generate` (needs network access to
    // binaries.prisma.sh, which this sandbox can't reach), @prisma/client
    // has no generated model types and full type-checking fails on every
    // file that imports Prisma model types — not a real app bug, just a
    // byproduct of no client being generated. Run `npm run test` for real
    // (type-checked) test runs once `prisma generate` has succeeded.
    '^.+\\.(t|j)s$': ['ts-jest', { isolatedModules: true }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
