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

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Detecta si la pregunta menciona un departamento peruano.
 *
 * El nombre se busca como PALABRA COMPLETA: "ica" no debe salir de "epidemiológica" ni de "publicada".
 * Si se mencionan varios departamentos, se toma el que aparece primero en la pregunta.
 *
 * @param {string} pregunta - Texto en lenguaje natural del analista (si no es texto, se trata como vacío)
 * @returns {{ departamento_detectado: string|null, codigo_departamento: string|null }}
 */
function detectarDepartamento(pregunta) {
  const texto = sinTildes((typeof pregunta === 'string' ? pregunta : '').toLowerCase());

  let mejor = null; // { nombre, codigo, indice }
  for (const [nombre, codigo] of Object.entries(DEPARTAMENTOS)) {
    // Letras y dígitos como límite: el texto ya no trae tildes, así que "ñ" quedó como "n".
    const coincidencia = new RegExp(`(?<![a-z0-9])${sinTildes(nombre)}(?![a-z0-9])`).exec(texto);
    if (coincidencia && (mejor === null || coincidencia.index < mejor.indice)) {
      mejor = { nombre, codigo, indice: coincidencia.index };
    }
  }

  return {
    departamento_detectado: mejor ? mejor.nombre : null,
    codigo_departamento: mejor ? mejor.codigo : null,
  };
}

module.exports = { detectarDepartamento, DEPARTAMENTOS };
