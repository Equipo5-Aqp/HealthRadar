// Tests — builders/contexto-prompt.js: el clima de periodos largos se resume por año
const { construirContextoPrompt } = require('../contexto-prompt');

// Dos departamentos por semana; temp_max = 20 + (anio - 2000) para poder reconocer el año en los promedios.
function clima(anios, semanasPorAnio = 52) {
  const out = [];
  for (const anio of anios) {
    for (let semana = 1; semana <= semanasPorAnio; semana++) {
      for (const dep of ['15', '20']) {
        out.push({ anio, semana_epidemiologica: semana, id_departamento: dep, temp_max_promedio: String(20 + (anio - 2000)), temp_min_promedio: '10.0', precipitacion_total: dep === '15' ? '2.0' : '4.0' });
      }
    }
  }
  return out;
}
const PERIODO = { criterio_usado: 'x' };
const lineasSE = (t) => t.split('\n').filter(l => l.startsWith('SE '));
const lineasAnio = (t) => t.split('\n').filter(l => l.startsWith('Anio '));

describe('construirContextoPrompt — clima de periodos largos', () => {
  test('hasta 2 años: una línea por semana, igual que siempre', () => {
    const c = construirContextoPrompt([], clima([2023, 2024]), PERIODO, '');
    expect(lineasSE(c.texto_clima)).toHaveLength(104);
    expect(lineasAnio(c.texto_clima)).toHaveLength(0);
    expect(c.texto_clima).toContain('SE 1-2023: temp. max promedio nacional 43.0°C, temp. min promedio 10.0°C, precipitacion promedio 3.0mm');
  });

  test('2 años con la semana 53 (106 semanas): todavía en detalle', () => {
    const c = construirContextoPrompt([], clima([2023, 2024], 53), PERIODO, '');
    expect(lineasSE(c.texto_clima)).toHaveLength(106);
  });

  test('3 años o más: una línea por año con el promedio de sus semanas', () => {
    const c = construirContextoPrompt([], clima([2020, 2021, 2022, 2023]), PERIODO, '');
    expect(lineasSE(c.texto_clima)).toHaveLength(0);
    const l = lineasAnio(c.texto_clima);
    expect(l).toHaveLength(4);
    expect(l[0]).toBe('Anio 2020 (promedio de 52 semanas): temp. max promedio nacional 40.0°C, temp. min promedio 10.0°C, precipitacion semanal promedio 3.0mm');
    expect(l[3]).toContain('Anio 2023 (promedio de 52 semanas): temp. max promedio nacional 43.0°C');
  });

  test('las semanas sin dato no cuentan como 0 en el promedio del año', () => {
    const filas = clima([2020, 2021, 2022]);
    for (const f of filas) if (f.anio === 2021 && f.semana_epidemiologica <= 26) { f.temp_max_promedio = null; f.precipitacion_total = null; }
    const l = lineasAnio(construirContextoPrompt([], filas, PERIODO, '').texto_clima);
    expect(l[1]).toContain('temp. max promedio nacional 41.0°C'); // las 26 semanas con dato valen 41
    expect(l[1]).toContain('precipitacion semanal promedio 3.0mm');
  });

  test('un año sin ningún dato de temperatura dice "sin dato"', () => {
    const filas = clima([2020, 2021, 2022]).map(f => (f.anio === 2021 ? { ...f, temp_max_promedio: null } : f));
    const l = lineasAnio(construirContextoPrompt([], filas, PERIODO, '').texto_clima);
    expect(l[1]).toContain('temp. max promedio nacional sin dato');
  });

  test('el texto de 10 años es corto', () => {
    const c = construirContextoPrompt([], clima([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]), PERIODO, '');
    expect(c.texto_clima.length).toBeLessThan(2000);
  });
});
