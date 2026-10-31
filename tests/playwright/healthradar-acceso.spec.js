const { test, expect } = require('@playwright/test');

const BASE = process.env.HR_BASE_URL || 'http://20.9.78.118:3000';
const HR_USER = process.env.HR_USER;
const HR_PASS = process.env.HR_PASS;
const HAY_CUENTA = Boolean(HR_USER && HR_PASS);
const TOKEN_FALSO = 'a'.repeat(64); // formato válido (64 hex) pero inexistente

test.describe('HealthRadar · Control de acceso (nginx auth_request)', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // sin sesión

  // ---- Páginas protegidas: redirigen al login conservando la ruta ----
  for (const ruta of ['/', '/consulta', '/historicos']) {
    test(`[sin sesión] ${ruta} redirige a /login conservando la ruta`, async ({ request }) => {
      const r = await request.get(ruta, { maxRedirects: 0 });
      expect(r.status()).toBe(302);
      expect(r.headers()['location']).toContain(`/login?next=${ruta}`);
    });
  }

  // ---- APIs protegidas: 401 JSON y no llegan al NLQ (no gastan cuota) ----
  for (const [ruta, data] of [
    ['/consulta/api/consulta', { pregunta: 'x', sessionId: 'qa-acceso' }],
    ['/historicos/api/historicos', { tabla: 'dengue' }],
  ]) {
    test(`[sin sesión] POST ${ruta} responde 401 SIN_SESION`, async ({ request }) => {
      const r = await request.post(ruta, { data });
      expect(r.status()).toBe(401);
      const cuerpo = await r.json();
      expect(cuerpo.error).toBe(true);
      expect(cuerpo.codigo).toBe('SIN_SESION');
    });
  }

  test('[cookie falsa] un token inexistente de formato válido redirige al login', async ({ request }) => {
    const r = await request.get('/consulta', {
      maxRedirects: 0,
      headers: { Cookie: `hr_sesion=${TOKEN_FALSO}` },
    });
    expect(r.status()).toBe(302);
    expect(r.headers()['location']).toContain('/login');
  });

  test('[seguridad] CRLF en la URL no inyecta cabeceras (regresión de $uri)', async ({ request }) => {
    const r = await request.get('/consulta%0d%0aSet-Cookie:%20pwn=1', { maxRedirects: 0 });
    expect(r.status()).toBe(302);
    expect(r.headersArray().some((h) => h.name.toLowerCase() === 'set-cookie')).toBe(false);
  });

  // ---- Rutas públicas ----
  test('[público] /healthz responde "ok" y /login carga sin sesión', async ({ request }) => {
    const h = await request.get('/healthz');
    expect(h.status()).toBe(200);
    expect((await h.text()).trim()).toBe('ok');
    const l = await request.get('/login');
    expect(l.status()).toBe(200);
    expect(await l.text()).toContain('Iniciar sesión');
  });

  // ---- Login: credenciales inválidas (correo inexistente: NO bloquea la cuenta de QA) ----
  test('[login] credenciales inválidas responden 401 CREDENCIALES_INVALIDAS', async ({ request }) => {
    const r = await request.post('/api/auth/login', {
      data: { email: 'no-existe-qa@healthradar.pe', password: 'incorrecta-qa' },
    });
    expect(r.status()).toBe(401);
    expect((await r.json()).codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  test('[login] el formulario vacío muestra aviso y no llama a la API', async ({ page }) => {
    let llamadas = 0;
    await page.route('**/api/auth/login', (route) => { llamadas++; return route.abort(); });
    await page.goto('/login');
    await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Escribe tu correo y tu contraseña.' })).toBeVisible();
    expect(llamadas).toBe(0);
  });

  // ---- Con sesión (cada test crea su propia sesión: logout revoca el token) ----
  test('[con sesión] login por API y /api/auth/sesion devuelve el usuario', async ({ playwright }) => {
    test.skip(!HAY_CUENTA, 'Faltan HR_USER y HR_PASS');
    const ctx = await playwright.request.newContext({ baseURL: BASE });
    const login = await ctx.post('/api/auth/login', { data: { email: HR_USER, password: HR_PASS } });
    expect(login.status()).toBe(200);
    const sesion = await ctx.get('/api/auth/sesion');
    expect(sesion.status()).toBe(200);
    const cuerpo = await sesion.json();
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.usuario.email).toBe(HR_USER);
    await ctx.dispose();
  });

  test('[ui] login por formulario vuelve a /consulta y "Cerrar sesión" devuelve al login', async ({ page }) => {
    test.skip(!HAY_CUENTA, 'Faltan HR_USER y HR_PASS'); test.setTimeout(60_000);
    await page.goto('/consulta');
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByLabel('Correo').fill(HR_USER);
    await page.getByLabel('Contraseña', { exact: true }).fill(HR_PASS);
    await page.getByRole('button', { name: 'Ingresar al sistema' }).click();
    await expect(page).toHaveURL(/\/consulta\/?$/);
    await expect(page.getByRole('textbox', { name: 'Escribe tu pregunta' })).toBeVisible();
    // La barra lateral muestra el correo cuando la página terminó de cargar y la sesión es válida.
    await expect(page.getByText(HR_USER, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await page.goto('/consulta');
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});