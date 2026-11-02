// Tests — parsers/periodo.js: preguntas de varios años ("2023 y 2024") y entradas que no son texto
const { detectarPeriodo, resolverVentana } = require('../periodo');

const RANGO = (desde, hasta) => ({
  anio: null,
  semana_desde: 1,
  semana_hasta: 53,
  anio_desde: desde,
  anio_hasta: hasta,
  rango_anios: true,
  criterio_usado: `varios anios: ${desde} a ${hasta}`,
});

describe('detectarPeriodo — varios años', () => {
  test.each([
    ['dengue en 2023 y 2024', 2023, 2024],
    ['compara 2023 con 2024', 2023, 2024],
    ['dengue de 2022 a 2024', 2022, 2024],
    ['entre 2022 y 2024', 2022, 2024],
    ['evolución del dengue desde 2015 hasta 2024', 2015, 2024],
    ['casos 2023-2024', 2023, 2024],
    ['casos 2023 - 2024', 2023, 2024],
    ['casos 2023/2024', 2023, 2024],
    ['EDA en 2022, 2023 y 2024', 2022, 2024],
    ['dengue en 2024 comparado con el 2023', 2023, 2024],
    ['dengue en el 2025 frente a 2024', 2024, 2025],
  ])('"%s" → años %i a %i completos', (pregunta, desde, hasta) => {
    expect(detectarPeriodo(pregunta)).toEqual(RANGO(desde, hasta));
  });

  test('un año repetido sigue siendo un solo año', () => {
    const r = detectarPeriodo('dengue 2023 y otra vez 2023');
    expect(r.anio).toBe(2023);
    expect(r.rango_anios).toBeUndefined();
    expect(r.semana_desde).toBe(1);
    expect(r.semana_hasta).toBe(53);
  });

  test('un solo año: sin cambios', () => {
    expect(detectarPeriodo('dengue en 2023')).toMatchObject({ anio: 2023, semana_desde: 1, semana_hasta: 53, criterio_usado: 'anio completo: 2023' });
    expect(detectarPeriodo('dengue en el 2025').anio).toBe(2025);
    expect(detectarPeriodo('dengue 2023').anio).toBe(2023);
  });

  test('semana, mes y rango de meses tienen prioridad y siguen igual (traen su propio año)', () => {
    expect(detectarPeriodo('semana 5 de 2025 frente a 2024')).toMatchObject({ anio: 2025, semana_desde: 5, semana_hasta: 5 });
    expect(detectarPeriodo('marzo de 2024 y 2023').criterio_usado).toBe('mes especifico: marzo 2024');
    expect(detectarPeriodo('entre enero y marzo de 2025').criterio_usado).toBe('rango: enero a marzo 2025');
  });

  test('números que no son años no cuentan (1999, 2009, 5000, 2030)', () => {
    expect(detectarPeriodo('dengue 1999 y 2009').ventana_por_defecto).toBe(12);
    const r = detectarPeriodo('dengue en 2023 con 1999 casos');
    expect(r.anio).toBe(2023);
  });

  test('sin años sigue la ventana por defecto', () => {
    expect(detectarPeriodo('últimas semanas').ventana_por_defecto).toBe(12);
  });
});

describe('resolverVentana — rango de años', () => {
  const boletines = [{ anio: 2025, semana_epidemiologica: 29, resumen: 'x' }];

  test('un rango de años pedido no se reemplaza por la ventana de las últimas 12 semanas', () => {
    const det = detectarPeriodo('dengue en 2023 y 2024');
    expect(resolverVentana(det, boletines)).toEqual(RANGO(2023, 2024));
  });

  test('sin rango_anios, anio_desde/anio_hasta sueltos no cuentan como periodo explícito', () => {
    const r = resolverVentana({ anio: null, anio_desde: 2023, anio_hasta: 2024, semana_desde: null, semana_hasta: null, ventana_por_defecto: 12 }, boletines);
    expect(r.anio_hasta).toBe(2025);
    expect(r.criterio_usado).toMatch(/ventana por defecto/);
  });

  test('la ventana por defecto y el año único se resuelven igual que antes', () => {
    expect(resolverVentana({ anio: 2024, semana_desde: 1, semana_hasta: 53, criterio_usado: 'x' }, boletines).anio).toBe(2024);
    expect(resolverVentana(detectarPeriodo('últimas semanas'), boletines).criterio_usado).toBe('ventana por defecto: ultimas 12 semanas hasta SE 29-2025');
  });
});

describe('detectarPeriodo — entradas que no son texto', () => {
  test.each([[123], [{}], [[]], [true], [null], [undefined], ['']])('%p → ventana por defecto, sin lanzar', (v) => {
    const r = detectarPeriodo(v);
    expect(r.anio).toBeNull();
    expect(r.ventana_por_defecto).toBe(12);
  });
});
