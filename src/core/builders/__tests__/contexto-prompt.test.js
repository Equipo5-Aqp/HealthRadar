// Tests — builders/contexto-prompt.js
const { construirContextoPrompt, avisoSinBoletines } = require('../contexto-prompt');

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

  test('sin boletines: texto_boletines trae un aviso explícito (no queda vacío)', () => {
    const r = construirContextoPrompt([], [], { criterio_usado: 'semana especifica: SE 5-2026' }, '');
    expect(r.cantidad_boletines).toBe(0);
    expect(r.texto_boletines).toBe(avisoSinBoletines('semana especifica: SE 5-2026'));
    expect(r.texto_boletines).toContain('No hay boletin epidemiologico con resumen disponible');
    expect(r.texto_boletines).toContain('SE 5-2026');
    expect(r.texto_boletines).toContain('No inventes');
  });

  test('avisoSinBoletines funciona sin criterio o sin periodo', () => {
    expect(avisoSinBoletines()).toMatch(/para este periodo\. No inventes/);
    expect(construirContextoPrompt([], [], {}, '').texto_boletines).toBe(avisoSinBoletines());
  });

  test('con boletines NO aparece el aviso', () => {
    const r = construirContextoPrompt([{ anio: 2025, semana_epidemiologica: 5, resumen: 'Texto.' }], [], { criterio_usado: 'x' }, '');
    expect(r.texto_boletines).not.toContain('No hay boletin');
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

  describe('clima con departamento', () => {
    const periodo = { criterio_usado: 'x' };
    const climaIca = [
      { anio: 2026, semana_epidemiologica: 21, temp_max_promedio: '28.1', temp_min_promedio: '17.0', precipitacion_total: '0.0' },
      { anio: 2026, semana_epidemiologica: 22, temp_max_promedio: '29.4', temp_min_promedio: '17.8', precipitacion_total: '0.2' },
    ];

    test('con departamento detectado el texto dice "en Ica" y no "nacional"', () => {
      const r = construirContextoPrompt([], climaIca, periodo, '', { departamento_detectado: 'ica', codigo_departamento: '11' });
      expect(r.texto_clima).toBe(
        'SE 21-2026: temp. max promedio en Ica 28.1°C, temp. min promedio 17.0°C, precipitacion promedio 0.0mm\n' +
        'SE 22-2026: temp. max promedio en Ica 29.4°C, temp. min promedio 17.8°C, precipitacion promedio 0.2mm'
      );
      expect(r.texto_clima).not.toContain('nacional');
    });

    test('nombres compuestos: San Martin, La Libertad, Madre de Dios', () => {
      const texto = (nombre) => construirContextoPrompt([], climaIca, periodo, '', { departamento_detectado: nombre }).texto_clima;
      expect(texto('san martin')).toContain('promedio en San Martin ');
      expect(texto('la libertad')).toContain('promedio en La Libertad ');
      expect(texto('madre de dios')).toContain('promedio en Madre de Dios ');
    });

    test('acepta el nombre suelto en vez del objeto de detectarDepartamento', () => {
      const r = construirContextoPrompt([], climaIca, periodo, '', 'piura');
      expect(r.texto_clima).toContain('promedio en Piura 28.1°C');
    });

    test('sin departamento (undefined, null, vacío) sigue diciendo "nacional", igual que antes', () => {
      const base = construirContextoPrompt([], climaIca, periodo, '').texto_clima;
      expect(base).toContain('promedio nacional 28.1°C');
      for (const sinDepto of [undefined, null, '', {}, { departamento_detectado: null, codigo_departamento: null }]) {
        expect(construirContextoPrompt([], climaIca, periodo, '', sinDepto).texto_clima).toBe(base);
      }
    });

    test('periodo de más de 2 años: la línea por año también dice "en Ica"', () => {
      const clima = [];
      for (let anio = 2020; anio <= 2023; anio++) {
        for (let sem = 1; sem <= 52; sem++) {
          clima.push({ anio, semana_epidemiologica: sem, temp_max_promedio: '25.0', temp_min_promedio: '15.0', precipitacion_total: '1.0' });
        }
      }
      const r = construirContextoPrompt([], clima, periodo, '', { departamento_detectado: 'ica' });
      expect(r.texto_clima).toContain('Anio 2020 (promedio de 52 semanas): temp. max promedio en Ica 25.0°C');
      expect(r.texto_clima).not.toContain('nacional');

      const nacional = construirContextoPrompt([], clima, periodo, '');
      expect(nacional.texto_clima).toContain('temp. max promedio nacional 25.0°C');
    });

    test('integración: filtrarClima + construirContextoPrompt no mezcla departamentos', () => {
      const { filtrarClima } = require('../../filters/clima');
      const filas = [
        { id_departamento: '11', anio: 2026, semana_epidemiologica: 21, temp_max_promedio: '28.0', temp_min_promedio: '17.0', precipitacion_total: '0.0' },
        { id_departamento: '15', anio: 2026, semana_epidemiologica: 21, temp_max_promedio: '20.0', temp_min_promedio: '15.0', precipitacion_total: '2.0' },
        { id_departamento: '20', anio: 2026, semana_epidemiologica: 21, temp_max_promedio: '32.0', temp_min_promedio: '21.0', precipitacion_total: '4.0' },
      ];
      const ventana = { anio: 2026, semana_desde: 21, semana_hasta: 21 };
      const ica = construirContextoPrompt([], filtrarClima(ventana, filas, '11'), periodo, '', { departamento_detectado: 'ica' });
      expect(ica.texto_clima).toBe('SE 21-2026: temp. max promedio en Ica 28.0°C, temp. min promedio 17.0°C, precipitacion promedio 0.0mm');

      const todos = construirContextoPrompt([], filtrarClima(ventana, filas), periodo, '');
      expect(todos.texto_clima).toContain('temp. max promedio nacional 26.7°C');
    });
  });
});
