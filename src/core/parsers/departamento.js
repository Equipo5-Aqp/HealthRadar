// @healthradar/core — parsers/departamento.js
// ─────────────────────────────────────────────────────────
// Detecta si la pregunta del analista menciona un departamento peruano.
// Extraído del nodo "Detectar departamento en la pregunta" del workflow NLQ.

'use strict';

const DEPARTAMENTOS = {
  'amazonas': '01', 'ancash': '02', 'apurimac': '03', 'arequipa': '04',
  'ayacucho': '05', 'cajamarca': '06', 'callao': '07', 'cusco': '08',
  'huancavelica': '09', 'huanuco': '10', 'ica': '11', 'junin': '12',
  'la libertad': '13', 'lambayeque': '14', 'lima': '15', 'loreto': '16',
  'madre de dios': '17', 'moquegua': '18', 'pasco': '19', 'piura': '20',
  'puno': '21', 'san martin': '22', 'tacna': '23', 'tumbes': '24', 'ucayali': '25',
};

/**
 * Detecta si la pregunta menciona un departamento peruano.
 *
 * @param {string} pregunta - Texto en lenguaje natural del analista
 * @returns {{ departamento_detectado: string|null, codigo_departamento: string|null }}
 */
function detectarDepartamento(pregunta) {
  const texto = (pregunta || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let departamentoDetectado = null;
  let codigoDetectado = null;

  for (const [nombre, codigo] of Object.entries(DEPARTAMENTOS)) {
    const nombreSinTildes = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (texto.includes(nombreSinTildes)) {
      departamentoDetectado = nombre;
      codigoDetectado = codigo;
      break;
    }
  }

  return {
    departamento_detectado: departamentoDetectado,
    codigo_departamento: codigoDetectado,
  };
}

module.exports = { detectarDepartamento, DEPARTAMENTOS };
