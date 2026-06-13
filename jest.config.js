/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: { module: 'NodeNext', target: 'es2022', moduleResolution: 'NodeNext', skipLibCheck: true } }],
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverage: true,
  // Model C: the shared transport / cache / marker / session / dispatch
  // modules now live in @sharpninja/mcpserver-plugin-core and are covered by
  // that package's own jest suite. Only the opencode host glue (plugin.ts)
  // is measured here; index.ts is a re-export barrel and plugin-api.ts is
  // type-only.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/plugin-api.ts',
  ],
  coverageThreshold: {
    global: {
      // Statements/functions/lines stay high; the branch bar is relaxed to
      // reflect the thin, ternary/optional-chaining-heavy SDK wiring whose
      // defensive fallbacks are guaranteed by the core package upstream.
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
