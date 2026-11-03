'use strict';

const { construirFrescura, UMBRAL_BOLETINES_DIAS, UMBRAL_CLIMA_DIAS } = require('../frescura');

// SE 36-2025 termina el 2025-09-06.
const base = () => ({
  boletin_procesado: { anio: 2025, semana: 36, fecha_publicacion: '2025-09-12' },
  ultimo_descubierto: { anio: 2025, semana: 36, fecha_publicacion: '2025-09-12' },
  pendientes: 0,
  clima: { anio: 2025, semana: 36 },
  cargas: [
    { dataset: 'DENGUE', hasta_anio: 2024, ultima_carga: '2026-09-20 10:15:00' },
    { dataset: 'EDA', hasta_anio: 2024, ultima_carga: '2026-09-22 08:00:00' },
    { dataset: 'IRA_NEUMONIA', hasta_anio: 2023, ultima_carga: '2026-09-21 09:00:00' },
  ],
});

describe('construirFrescura · datos al día', () => {
  test('boletín reciente, clima reciente, casos históricos', () => {
    const f = construirFrescura(base(), '2025-09-20');
    expect(f.estado).toBe('al_dia');
    expect(f.generado_en).toBe('2025-09-20');
    expect(f.boletines).toEqual({
      estado: 'al_dia', anio: 2025, semana: 36, fecha_publicacion: '2025-09-12', fecha_aproximada: false, dias: 8,
      pendientes: 0, ultimo_descubierto: { anio: 2025, semana: 36 }, umbral_dias: UMBRAL_BOLETINES_DIAS,
    });
    expect(f.clima).toEqual({ estado: 'al_dia', anio: 2025, semana: 36, fecha_fin: '2025-09-06', dias: 14, umbral_dias: UMBRAL_CLIMA_DIAS });
    expect(f.casos.estado).toBe('historico');
    expect(f.casos.hasta_anio).toBe(2024);
    expect(f.casos.ultima_carga).toBe('2026-09-22');
    expect(f.casos.datasets).toHaveLength(3);
    expect(f.mensaje).toBe('Boletines hasta la SE 36-2025 (publicado hace 8 días) · Clima hasta la SE 36-2025 · Casos históricos hasta 2024');
  });

  test('acepta Date como hoy y como fecha de publicación; semana_epidemiologica como clave', () => {
    const d = base();
    d.boletin_procesado = { anio: '2025', semana_epidemiologica: '36', fecha_publicacion: new Date('2025-09-12T05:00:00Z') };
    const f = construirFrescura(d, new Date('2025-09-20T23:30:00Z'));
    expect(f.boletines.dias).toBe(8);
    expect(f.boletines.semana).toBe(36);
    expect(f.generado_en).toBe('2025-09-20');
  });

  test('«hace 1 día» en singular', () => {
    const f = construirFrescura(base(), '2025-09-13');
    expect(f.boletines.dias).toBe(1);
    expect(f.mensaje).toContain('publicado hace 1 día)');
  });

  test('una fecha futura cuenta como 0 días', () => {
    expect(construirFrescura(base(), '2025-09-01').boletines.dias).toBe(0);
  });
});

describe('construirFrescura · umbral de 21 días', () => {
  test('21 días: al día · 22 días: desactualizado', () => {
    expect(construirFrescura(base(), '2025-10-03').boletines.estado).toBe('al_dia');        // 12-sep + 21
    expect(construirFrescura(base(), '2025-10-04').boletines.estado).toBe('desactualizado'); // 12-sep + 22
  });

  test('boletines desactualizados → estado general desactualizado y el mensaje lo dice primero', () => {
    const f = construirFrescura(base(), '2026-11-02');
    expect(f.boletines.estado).toBe('desactualizado');
    expect(f.clima.estado).toBe('desactualizado');
    expect(f.estado).toBe('desactualizado');
    expect(f.mensaje.startsWith('Datos desactualizados. Boletines hasta la SE 36-2025 (publicado hace ')).toBe(true);
  });

  test('solo el clima desactualizado también marca el estado general', () => {
    const d = base();
    d.clima = { anio: 2025, semana: 20 };
    const f = construirFrescura(d, '2025-09-14');
    expect(f.boletines.estado).toBe('al_dia');
    expect(f.clima.estado).toBe('desactualizado');
    expect(f.estado).toBe('desactualizado');
  });
});

describe('construirFrescura · faltantes', () => {
  test('sin fecha de publicación se usa el fin de la semana (aproximada)', () => {
    const d = base();
    d.boletin_procesado = { anio: 2025, semana: 36, fecha_publicacion: null };
    const f = construirFrescura(d, '2025-09-20');
    expect(f.boletines.fecha_publicacion).toBe('2025-09-06');
    expect(f.boletines.fecha_aproximada).toBe(true);
    expect(f.boletines.dias).toBe(14);
  });

  test('sin fecha y con semana inválida → sin_datos en fecha, pero conserva año y semana', () => {
    const d = base();
    d.boletin_procesado = { anio: 2025, semana: 54, fecha_publicacion: 'no es fecha' };
    const f = construirFrescura(d, '2025-09-20');
    expect(f.boletines.estado).toBe('sin_datos');
    expect(f.boletines.dias).toBeNull();
    expect(f.boletines.fecha_publicacion).toBeNull();
    expect(f.boletines.semana).toBe(54);
  });

  test('sin boletín procesado ni clima ni cargas → sin_datos', () => {
    const f = construirFrescura({}, '2025-09-20');
    expect(f.estado).toBe('sin_datos');
    expect(f.boletines).toMatchObject({ estado: 'sin_datos', anio: null, semana: null, pendientes: 0, ultimo_descubierto: null });
    expect(f.clima).toMatchObject({ estado: 'sin_datos', anio: null });
    expect(f.casos).toEqual({ estado: 'sin_datos', hasta_anio: null, ultima_carga: null, datasets: [] });
    expect(f.mensaje).toBe('Boletines: sin datos · Clima: sin datos');
  });

  test('datos null o inválidos no rompen', () => {
    expect(construirFrescura(null, '2025-09-20').estado).toBe('sin_datos');
    expect(construirFrescura(undefined, undefined).generado_en).toBeNull();
    expect(construirFrescura('texto', 'x').estado).toBe('sin_datos');
  });

  test('hoy inválido: sin días y sin estado, pero devuelve los datos', () => {
    const f = construirFrescura(base(), 'ayer');
    expect(f.generado_en).toBeNull();
    expect(f.boletines.dias).toBeNull();
    expect(f.boletines.estado).toBe('sin_datos');
    expect(f.boletines.anio).toBe(2025);
    expect(f.estado).toBe('sin_datos');
    expect(construirFrescura(base(), new Date('x')).generado_en).toBeNull();
    expect(construirFrescura(base(), 20250920).generado_en).toBeNull();
  });

  test('clima con semana inválida → sin_datos', () => {
    const d = base();
    d.clima = { anio: 2025, semana: 99 };
    expect(construirFrescura(d, '2025-09-20').clima.estado).toBe('sin_datos');
  });
});

describe('construirFrescura · pendientes y casos', () => {
  test('pendientes por procesar y último boletín descubierto (más nuevo que el procesado)', () => {
    const d = base();
    d.ultimo_descubierto = { anio: 2025, semana: 38, fecha_publicacion: '2025-09-26' };
    d.pendientes = '2';
    const f = construirFrescura(d, '2025-09-27');
    expect(f.boletines.pendientes).toBe(2);
    expect(f.boletines.ultimo_descubierto).toEqual({ anio: 2025, semana: 38 });
    expect(f.boletines.semana).toBe(36);
  });

  test('pendientes negativos o texto → 0; descubierto inválido → null', () => {
    const d = base();
    d.pendientes = -3;
    d.ultimo_descubierto = { anio: 'x', semana: 3 };
    const f = construirFrescura(d, '2025-09-20');
    expect(f.boletines.pendientes).toBe(0);
    expect(f.boletines.ultimo_descubierto).toBeNull();
    d.pendientes = 'abc';
    expect(construirFrescura(d, '2025-09-20').boletines.pendientes).toBe(0);
  });

  test('cargas inválidas se descartan; última carga inválida queda en null', () => {
    const d = base();
    d.cargas = [null, { dataset: 5, hasta_anio: 2024 }, { dataset: 'EDA', hasta_anio: 'x' }, { dataset: 'DENGUE', hasta_anio: '2024', ultima_carga: 'raro' }];
    const f = construirFrescura(d, '2025-09-20');
    expect(f.casos.datasets).toEqual([{ dataset: 'DENGUE', hasta_anio: 2024, ultima_carga: null }]);
    expect(f.casos.ultima_carga).toBeNull();
    expect(f.casos.estado).toBe('historico');
  });

  test('cargas que no es un arreglo', () => {
    const d = base();
    d.cargas = 'x';
    expect(construirFrescura(d, '2025-09-20').casos.estado).toBe('sin_datos');
  });
});
