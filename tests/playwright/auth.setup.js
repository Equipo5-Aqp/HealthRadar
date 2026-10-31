const path = require('path');
const { test: setup, expect } = require('@playwright/test');

const ESTADO = path.join(__dirname, '.auth', 'estado.json');

setup('iniciar sesión con la cuenta de prueba', async ({ request }) => {
  const email = process.env.HR_USER;
  const password = process.env.HR_PASS;
  if (!email || !password) {
    throw new Error('Faltan HR_USER y HR_PASS en esta terminal.');
  }
  const r = await request.post('/api/auth/login', { data: { email, password } });
  expect(r.status(), 'login con la cuenta de prueba').toBe(200);
  expect((await r.json()).ok).toBe(true);
  await request.storageState({ path: ESTADO });
});