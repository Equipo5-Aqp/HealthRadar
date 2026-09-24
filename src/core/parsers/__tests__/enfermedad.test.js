// Tests — parsers/enfermedad.js
const { detectarEnfermedad } = require('../enfermedad');

describe('detectarEnfermedad', () => {
  test('detecta dengue', () => {
    const r = detectarEnfermedad('cuantos casos de dengue');
    expect(r.incluir_dengue).toBe(true);
    expect(r.incluir_eda).toBe(false);
    expect(r.enfermedades_activas).toEqual(['dengue']);
  });

  test('detecta EDA por "diarrea"', () => {
    const r = detectarEnfermedad('diarrea aguda en Lima');
    expect(r.incluir_eda).toBe(true);
    expect(r.incluir_dengue).toBe(false);
  });

  test('detecta EDA por "eda"', () => {
    const r = detectarEnfermedad('casos de eda en 2023');
    expect(r.incluir_eda).toBe(true);
  });

  test('detecta neumonía específica', () => {
    const r = detectarEnfermedad('casos de neumonía');
    expect(r.incluir_ira_neumonia).toBe(true);
    expect(r.incluir_ira_no_neumonia).toBe(false);
  });

  test('detecta neumonía con tilde', () => {
    const r = detectarEnfermedad('neumonia en Loreto');
    expect(r.incluir_ira_neumonia).toBe(true);
    expect(r.incluir_ira_no_neumonia).toBe(false);
  });

  test('detecta IRA general → combina ambas', () => {
    const r = detectarEnfermedad('infecciones respiratorias agudas');
    expect(r.incluir_ira_neumonia).toBe(true);
    expect(r.incluir_ira_no_neumonia).toBe(true);
  });

  test('detecta IRA por palabra clave "ira"', () => {
    const r = detectarEnfermedad('casos de ira en 2023');
    expect(r.incluir_ira_neumonia).toBe(true);
    expect(r.incluir_ira_no_neumonia).toBe(true);
  });

  test('sin keyword → activa las 4', () => {
    const r = detectarEnfermedad('que paso la semana pasada');
    expect(r.incluir_dengue).toBe(true);
    expect(r.incluir_eda).toBe(true);
    expect(r.incluir_ira_neumonia).toBe(true);
    expect(r.incluir_ira_no_neumonia).toBe(true);
    expect(r.enfermedades_activas).toHaveLength(4);
  });

  test('maneja input vacío', () => {
    const r = detectarEnfermedad('');
    expect(r.enfermedades_activas).toHaveLength(4);
  });
});
