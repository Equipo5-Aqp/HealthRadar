// Tests — decisions/activar-prediccion.js
const { decidirPrediccion } = require('../activar-prediccion');

describe('decidirPrediccion', () => {
  const enfermedadTodas = {
    incluir_dengue: true, incluir_eda: true,
    incluir_ira_neumonia: true, incluir_ira_no_neumonia: true,
    enfermedades_activas: ['dengue', 'eda', 'ira_neumonia', 'ira_no_neumonia'],
  };

  test('activa predicción para año ≤2024', () => {
    const periodo = { anio: 2023, semana_desde: 1, semana_hasta: 53, criterio_usado: 'test' };
    const depto = { departamento_detectado: 'loreto', codigo_departamento: '16' };
    const r = decidirPrediccion(periodo, depto, enfermedadTodas);
    expect(r.activar_prediccion).toBe(true);
    expect(r.nivel_agregacion).toBe('departamento');
    expect(r.codigo_departamento).toBe('16');
    expect(r.anio_hasta).toBe(2023);
  });

  test('no activa predicción para 2025+', () => {
    const periodo = { anio: 2026, semana_desde: 1, semana_hasta: 20, criterio_usado: 'test' };
    const depto = { departamento_detectado: null, codigo_departamento: null };
    const r = decidirPrediccion(periodo, depto, enfermedadTodas);
    expect(r.activar_prediccion).toBe(false);
  });

  test('usa nivel nacional sin departamento', () => {
    const periodo = { anio: 2023, semana_desde: 1, semana_hasta: 53, criterio_usado: 'test' };
    const depto = { departamento_detectado: null, codigo_departamento: null };
    const r = decidirPrediccion(periodo, depto, enfermedadTodas);
    expect(r.nivel_agregacion).toBe('nacional');
    expect(r.codigo_departamento).toBeNull();
  });

  test('acota año hasta 2024 si rango cruza a 2025+', () => {
    const periodo = { anio: null, semana_desde: 40, semana_hasta: 10, anio_desde: 2024, anio_hasta: 2025 };
    const depto = { departamento_detectado: null, codigo_departamento: null };
    const r = decidirPrediccion(periodo, depto, enfermedadTodas);
    expect(r.activar_prediccion).toBe(true);
    expect(r.anio_hasta).toBe(2024);
  });

  test('pasa flags de enfermedad correctamente', () => {
    const periodo = { anio: 2020, semana_desde: 1, semana_hasta: 53 };
    const depto = { departamento_detectado: null, codigo_departamento: null };
    const enf = { incluir_dengue: true, incluir_eda: false, incluir_ira_neumonia: false, incluir_ira_no_neumonia: false, enfermedades_activas: ['dengue'] };
    const r = decidirPrediccion(periodo, depto, enf);
    expect(r.incluir_dengue).toBe(true);
    expect(r.incluir_eda).toBe(false);
  });
});
