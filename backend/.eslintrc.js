module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    // No `project` here deliberately: type-aware rules need a fully
    // type-checked program, which needs a generated Prisma client (see
    // jest.config.js's comment on the same underlying network
    // constraint). Non-type-aware rules still catch real bugs (unused
    // vars, floating promises via the base rule, etc.) without that
    // dependency.
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules'],
  rules: {
    // This codebase leans on inferred/implicit `any` in a few
    // Prisma-transaction callbacks (see README's known gaps) rather than
    // threading generated types through every call site — real cleanup,
    // but not a lint-blocking one.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
