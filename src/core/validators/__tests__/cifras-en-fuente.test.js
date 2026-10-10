'use strict';
const { verificarCifrasContraFuente, numerosDelTexto } = require('../cifras-en-fuente');
const { validarResumenBoletin } = require('../resumen-boletin');

// Extracto real del Boletín Epidemiológico SE 26-2025 (texto del PDF, tablas anexas).
const FUENTE_SE26 = [
  'Tabla 1. Enfermedades/eventos sujetos a vigilancia epidemiológica, semana epidemiológica 26, años 2024-2025',
  'Dengue sin signos de alarma               838         27      227584       2754            0 675,26            119       551       22492      7266            0   87,49',
  'Dengue con signos de alarma               121          2        23498        74            0   69,10            26        83        4405      1113            0   16,22',
  'Dengue grave                                2          0          680         2          245    2,00             1         2         131        16           47    0,43',
  'Muerte materna directa                      4                      81                     81                     3                    52                     52',
  'Ofidismo                                   42          0         1186         0            6    3,48            39         0        1181         0            5    3,47',
  'Total dengue 29758 35423 104,15',
  'Perú    23168      680343          345          9397               5215           37    689740      21977      643290         292          9974             5879           19    653264',
  'Perú    47940      972276        944          11945            4023           97    984221       45927      911037       869          14337             5098           67   925374',
  'En la SE 25 - 2025 se notificaron 329 casos sospechosos de enfermedades febriles eruptivas: 206 casos de sarampión',
].join('\n');

describe('numerosDelTexto', () => {
  test('reconoce enteros con y sin separador de miles', () => {
    const s = numerosDelTexto('35 792 casos; 35.792; 35,792; 35792; 1 250');
    expect(s.has(35792)).toBe(true);
    expect(s.has(1250)).toBe(true);
  });
  test('texto vacío o no string no rompe', () => {
    expect(numerosDelTexto(undefined).size).toBe(0);
    expect(numerosDelTexto('').size).toBe(0);
  });
});

describe('verificarCifrasContraFuente', () => {
  test('cifras que sí están en el PDF → sin problemas', () => {
    const r = verificarCifrasContraFuente(
      { dengue_total: 35423, dengue_sin_alarma: 29758, eda_total: 653264, ira_total: 925374, ira_neumonias: 14337 },
      'Dengue 35 423 casos', FUENTE_SE26);
    expect(r.omitido).toBe(false);
    expect(r.cifrasSinFuente).toEqual([]);
    expect(r.textoSinFuente).toEqual([]);
  });

  test('caso real SE 26: ira_neumonias=56337 no existe en el PDF y se señala', () => {
    const r = verificarCifrasContraFuente({ ira_total: 925374, ira_neumonias: 56337 }, '869 037 IRAS no neumonías', FUENTE_SE26);
    expect(r.cifrasSinFuente).toEqual(['ira_neumonias=56337']);
    expect(r.textoSinFuente).toEqual([869037]);
  });

  test('limitación conocida: un número real de otra columna (119, 1186) NO se detecta', () => {
    const r = verificarCifrasContraFuente({ dengue_defunciones: 119, ofidismo_total: 1186 }, '', FUENTE_SE26);
    expect(r.cifrasSinFuente).toEqual([]);
  });

  test('las cifras chicas del texto (< 1000) no se verifican', () => {
    const r = verificarCifrasContraFuente({}, 'Hubo 77 defunciones y 3,4 veces más', FUENTE_SE26);
    expect(r.textoSinFuente).toEqual([]);
  });

  test('no cuenta la línea [CIFRAS] como texto del resumen', () => {
    const r = verificarCifrasContraFuente({ ira_neumonias: 56337 }, 'Texto\n[CIFRAS: ira_neumonias=56337]', FUENTE_SE26);
    expect(r.textoSinFuente).toEqual([]);
  });

  test('fuente vacía o muy corta → omitido (no se rechaza por no poder leer el PDF)', () => {
    expect(verificarCifrasContraFuente({ a: 1 }, '', '').omitido).toBe(true);
    expect(verificarCifrasContraFuente({ a: 1 }, '', 'corto').omitido).toBe(true);
    expect(verificarCifrasContraFuente({ a: 1 }, '', undefined).omitido).toBe(true);
  });
});

describe('validarResumenBoletin con textoFuente', () => {
  const resumen = cifras => `SEMANA EPIDEMIOLOGICA: 26\nDengue: 35 423 casos.\n[CIFRAS: ${cifras}]`;

  test('rechaza un resumen con una cifra que no está en el PDF', () => {
    expect(() => validarResumenBoletin(resumen('dengue_total=35423; ira_neumonias=56337'), 'gemini', 26, { textoFuente: FUENTE_SE26 }))
      .toThrow(/ira_neumonias=56337/);
  });

  test('acepta cuando todas las cifras están en el PDF', () => {
    const r = validarResumenBoletin(resumen('dengue_total=35423; ira_neumonias=14337'), 'gemini', 26, { textoFuente: FUENTE_SE26 });
    expect(r.cifras.ira_neumonias).toBe(14337);
    expect(r.advertencias).toEqual([]);
  });

  test('si no se pasa textoFuente, el comportamiento anterior no cambia', () => {
    expect(() => validarResumenBoletin(resumen('dengue_total=35423; ira_neumonias=56337'), 'gemini', 26)).not.toThrow();
  });

  test('PDF ilegible → advertencia, no rechazo', () => {
    const r = validarResumenBoletin(resumen('dengue_total=35423'), 'gemini', 26, { textoFuente: '' });
    expect(r.advertencias.join(' ')).toMatch(/no se verificaron las cifras contra la fuente/);
  });

  test('cifras del texto sin fuente generan advertencia, no rechazo', () => {
    const r = validarResumenBoletin(`SEMANA EPIDEMIOLOGICA: 26\nIRA: 869 037 episodios.\n[CIFRAS: dengue_total=35423]`, 'gemini', 26, { textoFuente: FUENTE_SE26 });
    expect(r.advertencias.join(' ')).toMatch(/869 037/);
  });
});
