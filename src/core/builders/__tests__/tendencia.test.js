// Tests — builders/tendencia.js
const { armarTextoTendencia } = require('../tendencia');

describe('armarTextoTendencia', () => {
  test('retorna vacío si predicción no activada', () => {
    expect(armarTextoTendencia({ activar_prediccion: false }, [])).toBe('');
  });

  test('retorna vacío si decision es null', () => {
    expect(armarTextoTendencia(null, [])).toBe('');
  });

  test('genera bloque para dengue', () => {
    const decision = {
      activar_prediccion: true,
      nivel_agregacion: 'departamento',
      departamento_detectado: 'loreto',
      incluir_dengue: true, incluir_eda: false,
      incluir_ira_neumonia: false, incluir_ira_no_neumonia: false,
    };
    const filas = [
      { enfermedad: 'dengue', anio: 2023, semana: 10, total_casos: 150,
        temp_max_promedio: 32.5, temp_min_promedio: 22.1, precipitacion_total: 12.3, humedad_promedio: 85.0 },
    ];
    const r = armarTextoTendencia(decision, filas);
    expect(r).toContain('Dengue');
    expect(r).toContain('loreto');
    expect(r).toContain('150 casos');
  });

  test('combina IRA cuando ambas están activas', () => {
    const decision = {
      activar_prediccion: true,
      nivel_agregacion: 'nacional',
      incluir_dengue: false, incluir_eda: false,
      incluir_ira_neumonia: true, incluir_ira_no_neumonia: true,
    };
    const filas = [
      { enfermedad: 'ira_neumonia', anio: 2023, semana: 10, total_casos: 100,
        temp_max_promedio: null, temp_min_promedio: null, precipitacion_total: null, humedad_promedio: null },
      { enfermedad: 'ira_no_neumonia', anio: 2023, semana: 10, total_casos: 200,
        temp_max_promedio: null, temp_min_promedio: null, precipitacion_total: null, humedad_promedio: null },
    ];
    const r = armarTextoTendencia(decision, filas);
    expect(r).toContain('combinadas');
    expect(r).toContain('300 casos'); // 100 + 200
  });

  test('muestra "no se encontraron casos" cuando filas vacías', () => {
    const decision = {
      activar_prediccion: true,
      nivel_agregacion: 'nacional',
      incluir_dengue: true, incluir_eda: false,
      incluir_ira_neumonia: false, incluir_ira_no_neumonia: false,
    };
    const r = armarTextoTendencia(decision, []);
    expect(r).toContain('no se encontraron casos');
  });
});
