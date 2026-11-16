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
      FIREBASE_PROJECT_ID: bindings.text('campsell-ea245'),
      WEB_ORIGINS: bindings.text('https://campusgigs-97y.pages.dev,https://campusgigspere.pages.dev,http://localhost:5173,http://localhost:5174'),
    },
  },
});
