'use strict';
const { generarListaAnios } = require('../lista-anios');

describe('generarListaAnios', () => {
  test('por defecto va de 2025 al año actual (reloj inyectado)', () => {
    expect(generarListaAnios({ ahora: new Date('2026-09-28T12:00:00Z') })).toEqual([2025, 2026]);
    expect(generarListaAnios({ ahora: new Date('2027-01-05T12:00:00Z') })).toEqual([2025, 2026, 2027]);
  });
  test('en 2025 solo devuelve 2025', () => {
    expect(generarListaAnios({ ahora: new Date('2025-03-01T00:00:00Z') })).toEqual([2025]);
  });
  test('respeta desde/hasta explícitos', () => {
    expect(generarListaAnios({ desde: 2023, hasta: 2025 })).toEqual([2023, 2024, 2025]);
    expect(generarListaAnios({ desde: 2024, hasta: 2024 })).toEqual([2024]);
  });
  test('sin argumentos usa el reloj real y no falla', () => {
    const r = generarListaAnios();
    expect(r[0]).toBe(2025);
    expect(r[r.length - 1]).toBe(new Date().getUTCFullYear());
  });
  test.each([
    [{ desde: 2026, hasta: 2025 }],
    [{ desde: 1999, hasta: 2025 }],
    [{ desde: 2025, hasta: 2101 }],
    [{ desde: 2025.5, hasta: 2026 }],
    [{ desde: '2025', hasta: 2026 }],
  ])('rechaza rango inválido %j', (o) => {
    expect(() => generarListaAnios(o)).toThrow('Rango de anios invalido');
  });
});
