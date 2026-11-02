// @healthradar/core — parsers/enfermedad.js
// ─────────────────────────────────────────────────────────
// Detecta qué enfermedad(es) pregunta el analista, por keywords, sin tokens de IA.
// Extraído del nodo "Detectar enfermedad en la pregunta" del workflow NLQ.

'use strict';

// Enfermedades que traen los boletines pero no tienen serie propia en la base (texto sin tildes ni mayúsculas).
const OTRAS_ENFERMEDADES = /malaria|paludismo|sarampion|rubeola|paralisis flacida|\bpfa\b|ofidismo|mordedura de serpiente|\bmuertes? maternas?\b|mortalidad materna/;

/**
 * Detecta qué enfermedad(es) se mencionan en la pregunta del analista.
 *
 * Reglas:
 *  - "dengue" → solo dengue
 *  - "eda", "diarrea", "diarreica" → solo EDA
 *  - "neumonia" (con o sin tilde) → solo IRA neumonía (no combinada)
 *  - "ira" o "respiratoria/o" sin "neumonía" → IRA combinada (ambas)
 *  - Sin keywords → las 4 fuentes activas
 *
 * Adem\u00e1s informa (sin cambiar lo anterior):
 *  - enfermedad_especifica: true si la pregunta nombra dengue, EDA o IRA.
 *  - otra_enfermedad_mencionada: true si nombra una enfermedad de los boletines que no tiene serie
 *    propia (malaria, sarampi\u00f3n, rub\u00e9ola, PFA, ofidismo, muerte materna). Con esto la tendencia y el
 *    nivel de riesgo de boletines no se arman con dengue/EDA/IRA cuando la pregunta es de otra cosa.
 *
 * @param {string} pregunta - Texto en lenguaje natural del analista (si no es texto, se trata como vac\u00edo)
 * @returns {{ incluir_dengue: boolean, incluir_eda: boolean,
 *             incluir_ira_neumonia: boolean, incluir_ira_no_neumonia: boolean,
 *             enfermedades_activas: string[], criterio_enfermedad: string,
 *             enfermedad_especifica: boolean, otra_enfermedad_mencionada: boolean }}
 */
function detectarEnfermedad(pregunta) {
  const texto = (typeof pregunta === 'string' ? pregunta : '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const mencionaDengue = /dengue/.test(texto);
  const mencionaEda = /\beda\b|diarrea|diarreic/.test(texto);
  const mencionaNeumonia = /neumonia/.test(texto);
  const mencionaIraGeneral = /\bira\b|respirator/.test(texto);
  const mencionaOtra = OTRAS_ENFERMEDADES.test(texto);

  let incluirDengue = false;
  let incluirEda = false;
  let incluirIraNeumonia = false;
  let incluirIraNoNeumonia = false;

  const algunaDetectada = mencionaDengue || mencionaEda || mencionaNeumonia || mencionaIraGeneral;

  if (!algunaDetectada) {
    incluirDengue = true;
    incluirEda = true;
    incluirIraNeumonia = true;
    incluirIraNoNeumonia = true;
  } else {
    if (mencionaDengue) incluirDengue = true;
    if (mencionaEda) incluirEda = true;
    if (mencionaNeumonia) {
      incluirIraNeumonia = true;
    } else if (mencionaIraGeneral) {
      incluirIraNeumonia = true;
      incluirIraNoNeumonia = true;
    }
  }

  const enfermedadesActivas = [];
  if (incluirDengue) enfermedadesActivas.push('dengue');
  if (incluirEda) enfermedadesActivas.push('eda');
  if (incluirIraNeumonia) enfermedadesActivas.push('ira_neumonia');
  if (incluirIraNoNeumonia) enfermedadesActivas.push('ira_no_neumonia');

  return {
    incluir_dengue: incluirDengue,
    incluir_eda: incluirEda,
    incluir_ira_neumonia: incluirIraNeumonia,
    incluir_ira_no_neumonia: incluirIraNoNeumonia,
    enfermedades_activas: enfermedadesActivas,
    criterio_enfermedad: algunaDetectada
      ? `detectadas: ${enfermedadesActivas.join(', ')}`
      : 'sin enfermedad especifica detectada: se consultan las 4',
    enfermedad_especifica: algunaDetectada,
    otra_enfermedad_mencionada: mencionaOtra,
  };
}

module.exports = { detectarEnfermedad };
