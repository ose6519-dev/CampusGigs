import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'campusgigs-api',
    compatibilityDate: '2026-11-15',
    entrypoint: './src/index.ts',
    observability: {
      enabled: true,
      logs: { enabled: true, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    env: {
      DB: bindings.d1({ name: 'campusgigs-db' }),
      MEDIA: bindings.r2({ name: 'campusgigs-media' }),
      FIREBASE_PROJECT_ID: bindings.text('SET_FIREBASE_PROJECT_ID'),
      WEB_ORIGINS: bindings.text('https://campusgigs.pages.dev,http://localhost:5173'),
    },
  },
});
