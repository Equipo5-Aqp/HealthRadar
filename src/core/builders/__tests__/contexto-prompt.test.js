// Tests — builders/contexto-prompt.js
const { construirContextoPrompt } = require('../contexto-prompt');

describe('construirContextoPrompt', () => {
  test('construye contexto con boletines y clima', () => {
    const boletines = [
      { anio: 2026, semana_epidemiologica: 20, resumen: 'Resumen 20' },
      { anio: 2026, semana_epidemiologica: 18, resumen: 'Resumen 18' },
    ];
    const clima = [
      { anio: 2026, semana_epidemiologica: 18, temp_max_promedio: 28.5, temp_min_promedio: 18.0, precipitacion_total: 5.2 },
      { anio: 2026, semana_epidemiologica: 20, temp_max_promedio: 27.3, temp_min_promedio: 17.5, precipitacion_total: 3.1 },
    ];
    const periodo = { criterio_usado: 'test period' };

    const r = construirContextoPrompt(boletines, clima, periodo, '');

    expect(r.cantidad_boletines).toBe(2);
    expect(r.texto_boletines).toContain('SE 18');
    expect(r.texto_boletines).toContain('SE 20');
    // Debe estar ordenado cronológicamente (18 antes que 20)
    expect(r.texto_boletines.indexOf('SE 18')).toBeLessThan(r.texto_boletines.indexOf('SE 20'));
    expect(r.texto_clima).toContain('28.5');
    expect(r.criterio_periodo).toBe('test period');
  });

  test('maneja boletines vacíos', () => {
    const r = construirContextoPrompt([], [], { criterio_usado: 'test' }, '');
    expect(r.cantidad_boletines).toBe(0);
    expect(r.texto_boletines).toBe('');
  });

  test('incluye texto de tendencia si se provee', () => {
    const r = construirContextoPrompt([], [], { criterio_usado: 'test' }, 'Tendencia dengue...');
    expect(r.texto_tendencia).toBe('Tendencia dengue...');
  });
});
