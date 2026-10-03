'use strict';
const { agruparPorSemanaEpi } = require('../clima-semanal');

function dias(inicio, n, valores = {}) {
  const time = [];
  for (let i = 0; i < n; i++) time.push(new Date(Date.parse(inicio) + i * 86400000).toISOString().slice(0, 10));
  const serie = (v) => time.map((_, i) => (Array.isArray(v) ? v[i] : v));
  return {
    time,
    temperature_2m_max: serie('tmax' in valores ? valores.tmax : 25),
    temperature_2m_min: serie('tmin' in valores ? valores.tmin : 15),
    temperature_2m_mean: serie('tmean' in valores ? valores.tmean : 20),
    precipitation_sum: serie('prec' in valores ? valores.prec : 1),
    relative_humidity_2m_mean: serie('hum' in valores ? valores.hum : 80),
  };
}

describe('agruparPorSemanaEpi', () => {
  test('una semana completa domingo–sábado: promedios y suma de precipitación', () => {
    const r = agruparPorSemanaEpi(dias('2026-07-05', 7, { tmax: [20, 21, 22, 23, 24, 25, 26], prec: [0, 1, 2, 0, 0, 0.5, 0] }));
    expect(r).toEqual([{
      anio: 2026, semana: 27, dias: 7,
      temp_max_promedio: 23, temp_min_promedio: 15, temp_mean_promedio: 20,
      precipitacion_total: 3.5, humedad_promedio: 80,
    }]);
  });

  test('redondea a 1 decimal', () => {
    const r = agruparPorSemanaEpi(dias('2026-07-05', 7, { tmax: [20, 20, 20, 20, 20, 20, 21] }));
    expect(r[0].temp_max_promedio).toBe(20.1);
  });

  test('descarta semanas incompletas de los bordes por defecto', () => {
    const r = agruparPorSemanaEpi(dias('2026-07-01', 14)); // miércoles a martes: ninguna semana completa
    expect(r.map((s) => s.semana)).toEqual([27]); // 5-jul a 11-jul es la única completa
    expect(agruparPorSemanaEpi(dias('2026-07-01', 14), { soloCompletas: false }).map((s) => [s.semana, s.dias])).toEqual([[26, 4], [27, 7], [28, 3]]);
  });

  test('semana con año epidemiológico distinto al calendario (cruce de año)', () => {
    const r = agruparPorSemanaEpi(dias('2023-12-31', 7));
    expect(r).toHaveLength(1);
    expect([r[0].anio, r[0].semana]).toEqual([2024, 1]);
  });

  test('filtra por anioMin / anioMax', () => {
    const d = dias('2009-12-27', 21);
    expect(agruparPorSemanaEpi(d).map((s) => [s.anio, s.semana])).toEqual([[2009, 52], [2010, 1], [2010, 2]]);
    expect(agruparPorSemanaEpi(d, { anioMin: 2010 }).map((s) => s.anio)).toEqual([2010, 2010]);
    expect(agruparPorSemanaEpi(d, { anioMax: 2009 }).map((s) => s.anio)).toEqual([2009]);
  });

  test('datos faltantes: usa los días disponibles; si no hay ninguno, null (nunca NaN ni 0)', () => {
    const d = dias('2026-07-05', 7, { tmax: [null, 30, undefined, 30, NaN, 30, 30], hum: null, prec: null });
    const [s] = agruparPorSemanaEpi(d);
    expect(s.temp_max_promedio).toBe(30);
    expect(s.humedad_promedio).toBeNull();
    expect(s.precipitacion_total).toBeNull();
    expect(Number.isNaN(s.humedad_promedio)).toBe(false);
  });

  test('series ausentes en la respuesta → null', () => {
    const [s] = agruparPorSemanaEpi({ time: dias('2026-07-05', 7).time });
    expect(s).toMatchObject({ temp_max_promedio: null, temp_mean_promedio: null, precipitacion_total: null });
  });

  test('varias semanas ordenadas', () => {
    const r = agruparPorSemanaEpi(dias('2026-07-05', 21));
    expect(r.map((s) => s.semana)).toEqual([27, 28, 29]);
  });

  test('respuesta sin daily.time → error claro', () => {
    expect(() => agruparPorSemanaEpi(undefined)).toThrow('Open-Meteo no devolvio datos');
    expect(() => agruparPorSemanaEpi({})).toThrow('Open-Meteo no devolvio datos');
  });
});
