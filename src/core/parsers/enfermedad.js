// @healthradar/core — parsers/enfermedad.js
// ─────────────────────────────────────────────────────────
// Detecta qué enfermedad(es) pregunta el analista, por keywords, sin tokens de IA.
// Extraído del nodo "Detectar enfermedad en la pregunta" del workflow NLQ.

'use strict';

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
 * @param {string} pregunta - Texto en lenguaje natural del analista
 * @returns {{ incluir_dengue: boolean, incluir_eda: boolean,
 *             incluir_ira_neumonia: boolean, incluir_ira_no_neumonia: boolean,
 *             enfermedades_activas: string[], criterio_enfermedad: string }}
 */
function detectarEnfermedad(pregunta) {
  const texto = (pregunta || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const mencionaDengue = /dengue/.test(texto);
  const mencionaEda = /\beda\b|diarrea|diarreic/.test(texto);
  const mencionaNeumonia = /neumonia/.test(texto);
  const mencionaIraGeneral = /\bira\b|respirator/.test(texto);

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
  };
}

module.exports = { detectarEnfermedad };
