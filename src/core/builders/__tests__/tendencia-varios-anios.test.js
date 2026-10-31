// Tests — builders/tendencia.js: preguntas de varios años ("2023 y 2024", "de 2015 a 2024")
const { armarTextoTendencia } = require('../tendencia');

// Una fila por semana (1..52) de cada año. casos = (anio - 2000) * 10 + semana, salvo que se indique otra función.
function filas(anios, enfermedad = 'dengue', casosDe = (a, s) => (a - 2000) * 10 + s) {
  const out = [];
  for (const anio of anios) {
    for (let semana = 1; semana <= 52; semana++) {
      out.push({ enfermedad, anio, semana, total_casos: casosDe(anio, semana), temp_max_promedio: 30, temp_min_promedio: 20, precipitacion_total: 5, humedad_promedio: 70 });
    }
  }
  return out;
}
const totalAnio = (a) => { let t = 0; for (let s = 1; s <= 52; s++) t += (a - 2000) * 10 + s; return t; };

const DECISION = (extra = {}) => ({
  activar_prediccion: true, nivel_agregacion: 'nacional', anio_desde: 2023, anio_hasta: 2024, semana_desde: 1, semana_hasta: 53,
  incluir_dengue: true, incluir_eda: false, incluir_ira_neumonia: false, incluir_ira_no_neumonia: false,
  enfermedades_activas: ['dengue'], ...extra,
});
const lineasSemana = (t) => t.split('\n').filter(l => l.startsWith('SE '));

describe('armarTextoTendencia — dos años', () => {
  const t = armarTextoTendencia(DECISION({ rango_anios: true }), filas([2023, 2024]));

  test('conserva el detalle semanal de los dos años', () => {
    const l = lineasSemana(t);
    expect(l).toHaveLength(104);
    expect(l[0]).toMatch(/^SE 1-2023: 231 casos/);
    expect(l[103]).toMatch(/^SE 52-2024: 292 casos/);
  });

  test('agrega el total de cada año, el máximo semanal y su semana', () => {
    expect(t).toContain('Resumen por anio:');
    expect(t).toContain(`2023: ${totalAnio(2023)} casos en el anio (maximo semanal: 282 casos en la SE 52-2023)`);
    expect(t).toContain(`2024: ${totalAnio(2024)} casos en el anio (maximo semanal: 292 casos en la SE 52-2024)`);
  });

  test('el encabezado sigue empezando igual que siempre', () => {
    expect(t).toMatch(/^Tendencia historica de casos de Dengue a nivel nacional/);
    expect(t).toContain('(datos oficiales hasta 2024):');
  });
});

describe('armarTextoTendencia — tres años o más', () => {
  const t = armarTextoTendencia(DECISION({ rango_anios: true, anio_desde: 2015 }), filas([2015, 2016, 2017, 2018, 2019, 2022, 2023, 2024]));

  test('no lista todas las semanas: solo las últimas 6', () => {
    const l = lineasSemana(t);
    expect(l).toHaveLength(6);
    expect(l[0]).toMatch(/^SE 47-2024/);
    expect(l[5]).toMatch(/^SE 52-2024/);
  });

  test('trae una línea de resumen por cada año y avisa que es un resumen', () => {
    expect(t).toContain('periodo de 8 anios: se muestra el resumen por anio y las ultimas 6 semanas');
    for (const a of [2015, 2016, 2017, 2018, 2019, 2022, 2023, 2024]) {
      expect(t).toContain(`${a}: ${totalAnio(a)} casos en el anio`);
    }
  });

  test('el texto queda corto (no crece con los años)', () => {
    expect(t.length).toBeLessThan(2500);
  });
});

describe('armarTextoTendencia — lo demás queda igual', () => {
  test('dos años de filas SIN rango_anios (ventana por defecto): mismo texto de siempre, sin resumen', () => {
    const t = armarTextoTendencia(DECISION(), filas([2023, 2024]));
    expect(t).not.toContain('Resumen por anio');
    expect(lineasSemana(t)).toHaveLength(104);
  });

  test('un solo año aunque venga rango_anios (p. ej. 2024–2026 acotado a 2024): sin resumen', () => {
    const t = armarTextoTendencia(DECISION({ rango_anios: true, anio_desde: 2024 }), filas([2024]));
    expect(t).not.toContain('Resumen por anio');
    expect(lineasSemana(t)).toHaveLength(52);
  });

  test('sin filas: mismo aviso de siempre', () => {
    const t = armarTextoTendencia(DECISION({ rango_anios: true }), []);
    expect(t).toContain('no se encontraron casos historicos registrados en el periodo consultado (hasta 2024)');
  });

  test('predicción no activada: texto vacío', () => {
    expect(armarTextoTendencia({ activar_prediccion: false, rango_anios: true }, filas([2023, 2024]))).toBe('');
  });
});

describe('armarTextoTendencia — detalles del resumen por año', () => {
  test('los casos que llegan como texto desde Postgres (bigint) se suman bien', () => {
    const f = filas([2023, 2024]).map(x => ({ ...x, total_casos: String(x.total_casos) }));
    const t = armarTextoTendencia(DECISION({ rango_anios: true }), f);
    expect(t).toContain(`2023: ${totalAnio(2023)} casos en el anio`);
  });

  test('empate en el máximo: gana la primera semana', () => {
    const f = filas([2023, 2024], 'dengue', () => 10);
    const t = armarTextoTendencia(DECISION({ rango_anios: true }), f);
    expect(t).toContain('2023: 520 casos en el anio (maximo semanal: 10 casos en la SE 1-2023)');
  });

  test('semanas en 0 cuentan como 0 y no rompen el máximo', () => {
    const f = filas([2023, 2024], 'dengue', (a, s) => (a === 2023 ? 0 : s));
    const t = armarTextoTendencia(DECISION({ rango_anios: true }), f);
    expect(t).toContain('2023: 0 casos en el anio (maximo semanal: 0 casos en la SE 1-2023)');
    expect(t).toContain('2024: 1378 casos en el anio (maximo semanal: 52 casos en la SE 52-2024)');
  });

  test('IRA combinada: suma neumonía + no neumonía por semana y luego por año', () => {
    const f = [...filas([2023, 2024], 'ira_neumonia', () => 1), ...filas([2023, 2024], 'ira_no_neumonia', () => 9)];
    const d = DECISION({ rango_anios: true, incluir_dengue: false, incluir_ira_neumonia: true, incluir_ira_no_neumonia: true });
    const t = armarTextoTendencia(d, f);
    expect(t).toContain('2023: 520 casos en el anio (maximo semanal: 10 casos en la SE 1-2023)');
    expect(t).toContain('2024: 520 casos en el anio');
  });

  test('varias enfermedades: cada bloque trae su propio resumen por año', () => {
    const f = [...filas([2023, 2024], 'dengue', () => 1), ...filas([2023, 2024], 'eda', () => 2)];
    const t = armarTextoTendencia(DECISION({ rango_anios: true, incluir_eda: true }), f);
    expect(t.match(/Resumen por anio:/g)).toHaveLength(2);
    expect(t).toContain('2023: 52 casos en el anio');
    expect(t).toContain('2023: 104 casos en el anio');
  });
});
