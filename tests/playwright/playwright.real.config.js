// Sistema REAL: micro frontends detrás de nginx (puerto 3000), con login obligatorio.
// playwright.config.js y healthradar.spec.js pertenecen al mock de Sprint 1 y no se tocan.
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const ESTADO = path.join(__dirname, '.auth', 'estado.json');

module.exports = defineConfig({
  testDir: './',
  fullyParallel: false,
  workers: 1, // el NLQ tarda ~20 s y tiene cuota limitada: un test a la vez
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.HR_BASE_URL || 'http://20.9.78.118:3000',
    trace: 'retain-on-failure',
    screenshot: 'on',
  },
  projects: [
    // 1) Inicia sesión una vez con la cuenta de prueba y guarda la cookie.
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    // 2) Chat: usa la sesión guardada.
    {
      name: 'consulta',
      testMatch: /healthradar-real\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: ESTADO },
    },
    // 3) Control de acceso: sin sesión; los tests que la necesitan hacen su propio login.
    {
      name: 'acceso',
      testMatch: /healthradar-acceso\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});