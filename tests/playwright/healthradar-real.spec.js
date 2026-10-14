const { test, expect } = require('@playwright/test');

// Micro frontend de consulta: basePath '/consulta' (nginx reparte /, /consulta y /historicos).
const RUTA_API = '**/consulta/api/consulta';
const PREGUNTA = 'Como esta el dengue en Peru';

const campo = (page) => page.getByRole('textbox', { name: 'Escribe tu pregunta' });
const botonEnviar = (page) => page.getByRole('button', { name: 'Enviar', exact: true });
const log = (page) => page.getByRole('log');
const respuestasBot = (page) => log(page).locator('.msg-bot:not(.escribiendo):not(.error)');
const alertas = (page) => log(page).getByRole('alert');

async function abrirChat(page) {
  await page.goto('/consulta');
  await expect(campo(page)).toBeVisible();
}

async function preguntar(page, texto) {
  await campo(page).fill(texto);
  await botonEnviar(page).click();
}

function simular200(page, cuerpo) {
  return page.route(RUTA_API, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpo) }));
}

const OK = { output: 'Respuesta de prueba.', modelo_usado: 'moonshotai/kimi-k3', nivel_riesgo: null, advertencia_cifras: null };

test.describe('HealthRadar · Consulta (sistema real)', () => {

  // ---- Feature 1: el chat responde (usa el NLQ real y consume cuota) ----
  test('[vivo] el chat responde una consulta real y muestra el modelo', { tag: '@live' }, async ({ page }) => {
    test.setTimeout(120_000);
    await abrirChat(page);
    await preguntar(page, PREGUNTA);
    await expect(log(page).getByRole('status')).toBeVisible();
        // Espera cualquier mensaje del bot (respuesta o error) y luego distingue cuál fue.
    await expect(log(page).locator('.msg-bot:not(.escribiendo)').first()).toBeVisible({ timeout: 90_000 });
    const textoError = (await alertas(page).allTextContents()).join(' | ');
    expect(textoError, 'el sistema devolvió un error en lugar de una respuesta').toBe('');
    await expect(respuestasBot(page).first()).toContainText('Modelo:');
    await expect(log(page).getByRole('status')).toHaveCount(0);
  });

  test('[mock] con la caja vacía o solo espacios, "Enviar" está deshabilitado y no hay petición', async ({ page }) => {
    let llamadas = 0;
    await page.route(RUTA_API, (route) => { llamadas++; return route.abort(); });
    await abrirChat(page);
    await expect(botonEnviar(page)).toBeDisabled();
    await campo(page).fill('   ');
    await expect(botonEnviar(page)).toBeDisabled();
    expect(llamadas).toBe(0);
  });

  // ---- Feature 2: badge del modelo ----
  test('[mock] la respuesta muestra "Modelo: Kimi K3"', async ({ page }) => {
    await simular200(page, OK);
    await abrirChat(page);
    await preguntar(page, PREGUNTA);
    await expect(respuestasBot(page).first()).toContainText('Modelo: Kimi K3');
  });

  test('[mock] sin modelo_usado no se muestra el badge de modelo', async ({ page }) => {
    await simular200(page, { ...OK, modelo_usado: null });
    await abrirChat(page);
    await preguntar(page, PREGUNTA);
    await expect(respuestasBot(page).first()).toContainText('Respuesta de prueba.');
    await expect(respuestasBot(page).first()).not.toContainText('Modelo:');
  });

  // ---- Feature 3: indicador de riesgo ----
  for (const [nivel, etiqueta] of [['alto', 'Riesgo alto'], ['medio', 'Riesgo medio'], ['bajo', 'Riesgo bajo']]) {
    test(`[mock] nivel_riesgo "${nivel}" muestra la insignia "${etiqueta}"`, async ({ page }) => {
      await simular200(page, { ...OK, nivel_riesgo: nivel });
      await abrirChat(page);
      await preguntar(page, PREGUNTA);
      await expect(respuestasBot(page).first().getByText(etiqueta)).toBeVisible();
    });
  }

  for (const valor of [null, 'critico']) {
    test(`[mock] nivel_riesgo ${JSON.stringify(valor)} no muestra insignia de riesgo`, async ({ page }) => {
      await simular200(page, { ...OK, nivel_riesgo: valor });
      await abrirChat(page);
      await preguntar(page, PREGUNTA);
      await expect(respuestasBot(page).first()).toContainText('Respuesta de prueba.');
      await expect(respuestasBot(page).first().locator('.badge-riesgo')).toHaveCount(0);
    });
  }

  // ---- Feature 4: errores diferenciados ----
  const ERRORES = [
    {
      nombre: 'IA saturada (503)', titulo: 'Los modelos de IA no están disponibles',
      simular: (page) => page.route(RUTA_API, (route) => route.fulfill({
        status: 503, contentType: 'application/json',
        body: JSON.stringify({ error: true, codigo: 'MOCK', mensaje: 'Los proveedores de IA no están disponibles en este momento. Intenta de nuevo en unos segundos.' }),
      })),
    },
    {
      nombre: 'sin red', titulo: 'Sin conexión con el servidor',
      simular: (page) => page.route(RUTA_API, (route) => route.abort('failed')),
    },
    {
      nombre: 'error del servidor (500)', titulo: 'El servicio no respondió',
      simular: (page) => page.route(RUTA_API, (route) => route.fulfill({ status: 500, contentType: 'text/plain', body: 'error' })),
    },
  ];

  for (const e of ERRORES) {
    test(`[mock] error diferenciado: ${e.nombre}`, async ({ page }) => {
      await e.simular(page);
      await abrirChat(page);
      await preguntar(page, PREGUNTA);
      await expect(alertas(page)).toContainText(e.titulo);
      for (const otro of ERRORES.filter((x) => x !== e)) {
        await expect(alertas(page)).not.toContainText(otro.titulo);
      }
    });
  }

  // ---- Feature 5: conversación (memoria por sessionId; no existe señal visual de contexto) ----
  test('[mock] la segunda pregunta reutiliza el sessionId y queda en el historial', async ({ page }) => {
    const sesiones = [];
    await page.route(RUTA_API, (route) => {
      sesiones.push(route.request().postDataJSON().sessionId);
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...OK, output: `Respuesta de prueba ${sesiones.length}` }),
      });
    });
    await abrirChat(page);
    await preguntar(page, PREGUNTA);
    await expect(respuestasBot(page)).toHaveCount(1);
    await preguntar(page, 'Y en Lima?');
    await expect(respuestasBot(page)).toHaveCount(2);

    expect(sesiones).toHaveLength(2);
    expect(sesiones[0]).toBeTruthy();
    expect(sesiones[1]).toBe(sesiones[0]);

    const historial = page.getByRole('complementary', { name: 'Historial de consultas' });
    await expect(historial.getByRole('button', { name: PREGUNTA })).toBeVisible();
    await expect(historial.getByRole('button', { name: 'Y en Lima?' })).toBeVisible();
  });

  test('[mock] "Nueva conversación" limpia el chat y el historial', async ({ page }) => {
    await simular200(page, OK);
    await abrirChat(page);
    await preguntar(page, PREGUNTA);
    await expect(respuestasBot(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Nueva conversación' }).click();
    await expect(respuestasBot(page)).toHaveCount(0);
    await expect(page.getByText('Aún no hay preguntas en esta conversación.')).toBeVisible();
  });
});