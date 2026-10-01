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

  describe('clima: nunca debe salir NaN en el texto', () => {
    const periodo = { criterio_usado: 'test' };
    const fila = (semana, max, min, prec, anio = 2023) => ({
      anio, semana_epidemiologica: semana, temp_max_promedio: max, temp_min_promedio: min, precipitacion_total: prec,
    });

    test('NUMERIC de Postgres llega como texto: se promedia como número', () => {
      const r = construirContextoPrompt([], [fila(5, '24.00', '16.00', '2.00'), fila(5, '26.00', '18.00', '4.00')], periodo, '');
      expect(r.texto_clima).toBe('SE 5-2023: temp. max promedio nacional 25.0°C, temp. min promedio 17.0°C, precipitacion promedio 3.0mm');
    });

    test('los null no cuentan como 0: se promedian solo los departamentos con dato', () => {
      const r = construirContextoPrompt([], [fila(5, '20.00', null, null), fila(5, null, null, null), fila(5, '30.00', null, null)], periodo, '');
      expect(r.texto_clima).toContain('temp. max promedio nacional 25.0°C');
    });

    test('sin ningún dato → "sin dato", no NaN ni 0', () => {
      const r = construirContextoPrompt([], [fila(5, null, undefined, ''), fila(5, 'abc', NaN, null)], periodo, '');
      expect(r.texto_clima).toBe('SE 5-2023: temp. max promedio nacional sin dato, temp. min promedio sin dato, precipitacion promedio sin dato');
      expect(r.texto_clima).not.toMatch(/NaN/);
    });

    test('una métrica sin dato no arrastra a las demás', () => {
      const r = construirContextoPrompt([], [fila(9, '27.5', '18.5', null)], periodo, '');
      expect(r.texto_clima).toContain('temp. max promedio nacional 27.5°C');
      expect(r.texto_clima).toContain('precipitacion promedio sin dato');
    });

    test('varias semanas siguen ordenadas', () => {
      const r = construirContextoPrompt([], [fila(10, 1, 1, 1), fila(2, 1, 1, 1), fila(1, 1, 1, 1, 2024)], periodo, '');
      expect(r.texto_clima.split('\n').map(l => l.match(/^SE (\d+-\d+)/)[1])).toEqual(['2-2023', '10-2023', '1-2024']);
    });
  });
  describe('marcador [CIFRAS: ...] de Fase B', () => {
    test('no llega al prompt del chat', () => {
      const boletines = [{
        anio: 2025, semana_epidemiologica: 10,
        resumen: 'SEMANA EPIDEMIOLOGICA: 10\nDengue: 18 663 casos.\n[CIFRAS: dengue_total=18663]',
      }];
      const r = construirContextoPrompt(boletines, [], { criterio_usado: 'x' }, '');
      expect(r.texto_boletines).toContain('Dengue: 18 663 casos.');
      expect(r.texto_boletines).not.toContain('CIFRAS');
    });
  });
});
