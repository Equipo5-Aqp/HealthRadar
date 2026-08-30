const { test, expect } = require('@playwright/test');
const path = require('path');

// Ruta al archivo HTML local que simula el frontend de HealthRadar
const url = 'file://' + path.join(__dirname, 'index.html');

test.describe('HealthRadar - Chat NLQ', () => {

  test('Caso feliz: el chat responde a una consulta valida sobre Dengue', async ({ page }) => {
    await page.goto(url);

    await page.getByTestId('chat-input').fill(
      '¿Qué distritos muestran un incremento anómalo de casos de Dengue correlacionado con el aumento de temperatura de la última semana?'
    );
    await page.getByTestId('btn-enviar').click();

    // Mientras procesa, debe mostrarse el indicador de carga
    await expect(page.getByTestId('loading')).toBeVisible();

    // Luego debe aparecer la respuesta con contenido relacionado a Dengue
    const respuesta = page.getByTestId('respuesta-chat');
    await expect(respuesta).toBeVisible({ timeout: 5000 });
    await expect(respuesta).toContainText('Dengue');
  });

  test('Caso borde: query vacio muestra mensaje de error, no se rompe', async ({ page }) => {
    await page.goto(url);

    await page.getByTestId('btn-enviar').click();

    const respuesta = page.getByTestId('respuesta-chat');
    await expect(respuesta).toBeVisible();
    await expect(respuesta).toContainText('Por favor escribe una consulta');
  });

  test('Estado de carga: el indicador de procesamiento desaparece al terminar', async ({ page }) => {
    await page.goto(url);

    await page.getByTestId('chat-input').fill('¿Hay brotes de Influenza en Arequipa?');
    await page.getByTestId('btn-enviar').click();

    await expect(page.getByTestId('loading')).toBeVisible();
    await expect(page.getByTestId('loading')).toBeHidden({ timeout: 5000 });
  });

});
