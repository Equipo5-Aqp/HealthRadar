// Tests — parsers/enfermedad.js: otras enfermedades de los boletines y entradas que no son texto
const { detectarEnfermedad } = require('../enfermedad');

describe('detectarEnfermedad — otra enfermedad mencionada', () => {
  test.each([
    'casos de malaria en 2025',
    'Paludismo en Loreto',
    'sarampión en 2025',
    'casos de rubéola',
    'parálisis flácida aguda',
    'casos de PFA',
    'ofidismo en la selva',
    'mordedura de serpiente',
    'muerte materna directa',
    'muertes maternas en 2025',
    'mortalidad materna',
  ])('"%s" se marca como otra enfermedad', (pregunta) => {
    const r = detectarEnfermedad(pregunta);
    expect(r.otra_enfermedad_mencionada).toBe(true);
    expect(r.enfermedad_especifica).toBe(false);
  });

  test('lo que ya devolvía no cambia (con otra enfermedad siguen activas las 4 fuentes)', () => {
    const r = detectarEnfermedad('casos de malaria en 2025');
    expect(r.enfermedades_activas).toEqual(['dengue', 'eda', 'ira_neumonia', 'ira_no_neumonia']);
    expect(r.criterio_enfermedad).toBe('sin enfermedad especifica detectada: se consultan las 4');
  });

  test('dengue, EDA e IRA siguen siendo enfermedad específica y no "otra"', () => {
    for (const q of ['dengue', 'casos de EDA', 'IRA en 2025', 'neumonía', 'diarreas', 'infecciones respiratorias']) {
      const r = detectarEnfermedad(q);
      expect(r.enfermedad_especifica).toBe(true);
      expect(r.otra_enfermedad_mencionada).toBe(false);
    }
  });

  test('mezcla: dengue y malaria → específica y otra a la vez', () => {
    const r = detectarEnfermedad('dengue y malaria en 2025');
    expect(r.enfermedad_especifica).toBe(true);
    expect(r.otra_enfermedad_mencionada).toBe(true);
    expect(r.enfermedades_activas).toEqual(['dengue']);
  });

  test('pregunta general: ni específica ni otra', () => {
    const r = detectarEnfermedad('cómo estamos esta semana');
    expect(r.enfermedad_especifica).toBe(false);
    expect(r.otra_enfermedad_mencionada).toBe(false);
  });

  test('palabras parecidas no cuentan ("pfa" dentro de otra palabra)', () => {
    expect(detectarEnfermedad('el pfaffian de la matriz').otra_enfermedad_mencionada).toBe(false);
  });

  test('entradas que no son texto se tratan como vacías (no lanzan)', () => {
    for (const v of [123, {}, ['dengue'], true, null, undefined, '']) {
      const r = detectarEnfermedad(v);
      expect(r.enfermedades_activas).toEqual(['dengue', 'eda', 'ira_neumonia', 'ira_no_neumonia']);
      expect(r.enfermedad_especifica).toBe(false);
      expect(r.otra_enfermedad_mencionada).toBe(false);
    }
  });
});
