// Tests — filters/clima.js
const { filtrarClima } = require('../clima');

describe('filtrarClima', () => {
  const datos = [
    { anio: 2026, semana_epidemiologica: 18, departamento: 'Lima', temp_max_promedio: 28.5 },
    { anio: 2026, semana_epidemiologica: 19, departamento: 'Lima', temp_max_promedio: 27.3 },
    { anio: 2026, semana_epidemiologica: 20, departamento: 'Lima', temp_max_promedio: 26.1 },
    { anio: 2025, semana_epidemiologica: 50, departamento: 'Lima', temp_max_promedio: 30.0 },
  ];

  test('filtra por periodo específico', () => {
    const periodo = { anio: 2026, semana_desde: 18, semana_hasta: 19 };
    const r = filtrarClima(periodo, datos);
    expect(r).toHaveLength(2);
  });

  test('filtra por ventana multi-año', () => {
    const periodo = { anio: null, semana_desde: 50, semana_hasta: 20, anio_desde: 2025, anio_hasta: 2026 };
    const r = filtrarClima(periodo, datos);
    expect(r.length).toBeGreaterThan(0);
  });

  test('retorna array vacío si no hay coincidencias', () => {
    const periodo = { anio: 2020, semana_desde: 1, semana_hasta: 53 };
    const r = filtrarClima(periodo, datos);
    expect(r).toHaveLength(0);
  });

  test('maneja datos vacíos', () => {
    const periodo = { anio: 2026, semana_desde: 1, semana_hasta: 53 };
    const r = filtrarClima(periodo, []);
    expect(r).toHaveLength(0);
  });

  describe('por departamento', () => {
    const periodo = { anio: 2026, semana_desde: 18, semana_hasta: 20 };
    const filas = [
      { id_departamento: '11', departamento: 'Ica', anio: 2026, semana_epidemiologica: 18, temp_max_promedio: '28.1' },
      { id_departamento: '11', departamento: 'Ica', anio: 2026, semana_epidemiologica: 19, temp_max_promedio: '29.0' },
      { id_departamento: '15', departamento: 'Lima', anio: 2026, semana_epidemiologica: 18, temp_max_promedio: '22.3' },
      { id_departamento: '20', departamento: 'Piura', anio: 2026, semana_epidemiologica: 19, temp_max_promedio: '31.5' },
      { id_departamento: '11', departamento: 'Ica', anio: 2025, semana_epidemiologica: 18, temp_max_promedio: '27.0' },
    ];

    test('con código: solo ese departamento y dentro del periodo', () => {
      const r = filtrarClima(periodo, filas, '11');
      expect(r).toHaveLength(2);
      expect(r.every(f => f.departamento === 'Ica' && f.anio === 2026)).toBe(true);
    });

    test('sin código, null o vacío: los 25 departamentos como siempre', () => {
      expect(filtrarClima(periodo, filas)).toHaveLength(4);
      expect(filtrarClima(periodo, filas, null)).toHaveLength(4);
      expect(filtrarClima(periodo, filas, '')).toHaveLength(4);
      expect(filtrarClima(periodo, filas, [])).toHaveLength(4);
    });

    test('lista de códigos: varios departamentos', () => {
      const r = filtrarClima(periodo, filas, ['20', '15']);
      expect(r.map(f => f.departamento).sort()).toEqual(['Lima', 'Piura']);
    });

    test('el código numérico o sin cero a la izquierda también calza', () => {
      const unaFila = [{ id_departamento: '07', anio: 2026, semana_epidemiologica: 18 }];
      expect(filtrarClima(periodo, unaFila, 7)).toHaveLength(1);
      expect(filtrarClima(periodo, unaFila, '7')).toHaveLength(1);
    });

    test('departamento sin filas en el periodo: array vacío (no cae al promedio nacional)', () => {
      expect(filtrarClima(periodo, filas, '04')).toEqual([]);
    });

    describe('filas sin id_departamento (solo el nombre, como el SELECT de "Get row(s)")', () => {
      const sinId = [
        { departamento: 'Ica', anio: 2026, semana_epidemiologica: 18 },
        { departamento: 'Lima', anio: 2026, semana_epidemiologica: 18 },
        { departamento: 'San Martín', anio: 2026, semana_epidemiologica: 19 },
        { departamento: 'ÁNCASH', anio: 2026, semana_epidemiologica: 19 },
        { departamento: 'Madre de Dios', anio: 2026, semana_epidemiologica: 19 },
      ];

      test('calza por nombre, sin importar tildes ni mayúsculas', () => {
        expect(filtrarClima(periodo, sinId, '11').map(f => f.departamento)).toEqual(['Ica']);
        expect(filtrarClima(periodo, sinId, '22').map(f => f.departamento)).toEqual(['San Martín']);
        expect(filtrarClima(periodo, sinId, '02').map(f => f.departamento)).toEqual(['ÁNCASH']);
        expect(filtrarClima(periodo, sinId, '17').map(f => f.departamento)).toEqual(['Madre de Dios']);
      });

      test('lista de códigos por nombre', () => {
        expect(filtrarClima(periodo, sinId, ['11', '15']).map(f => f.departamento).sort()).toEqual(['Ica', 'Lima']);
      });

      test('si la fila trae id_departamento, manda el id (no el nombre)', () => {
        const mezcla = [{ id_departamento: '15', departamento: 'Ica', anio: 2026, semana_epidemiologica: 18 }];
        expect(filtrarClima(periodo, mezcla, '11')).toEqual([]);
        expect(filtrarClima(periodo, mezcla, '15')).toHaveLength(1);
      });

      test('fila sin id ni nombre: no calza', () => {
        expect(filtrarClima(periodo, [{ anio: 2026, semana_epidemiologica: 18 }], '11')).toEqual([]);
      });
    });

    test('también filtra con ventana por defecto (multi-año)', () => {
      const ventana = { anio: null, anio_desde: 2025, anio_hasta: 2026, semana_desde: 1, semana_hasta: 53 };
      const r = filtrarClima(ventana, filas, '11');
      expect(r).toHaveLength(3);
    });
  });
});
