// @healthradar/core — decisions/activar-prediccion.js
// ─────────────────────────────────────────────────────────
// Decide si corresponde consultar Postgres para predicción histórica (≤2024).
// Extraído del nodo "Decidir si activar prediccion (Postgres)" del workflow NLQ.

'use strict';

/**
 * Decide si activar la consulta de predicción histórica a PostgreSQL.
 *
 * Se activa si el periodo resuelto toca al menos parcialmente años ≤2024.
 * Si se detectó un departamento, la query se filtrará a ese departamento;
 * si no, se consulta a nivel nacional (25 departamentos sumados).
 *
 * @param {object} periodoResuelto - Output de resolverVentana
 * @param {object} departamentoDetectado - Output de detectarDepartamento
 * @param {object} enfermedadDetectada - Output de detectarEnfermedad
 * @returns {object} Decisión de activación con parámetros para las queries Postgres
 */
function decidirPrediccion(periodoResuelto, departamentoDetectado, enfermedadDetectada) {
  const anioEspecifico = periodoResuelto.anio;
  const hayPeriodoEspecifico = (anioEspecifico !== null && anioEspecifico !== undefined && anioEspecifico !== 'null');

  let anioDesde, anioHasta;
  if (hayPeriodoEspecifico) {
    anioDesde = parseInt(periodoResuelto.anio, 10);
    anioHasta = parseInt(periodoResuelto.anio, 10);
  } else {
    anioDesde = parseInt(periodoResuelto.anio_desde, 10);
    anioHasta = parseInt(periodoResuelto.anio_hasta, 10);
  }

  const tocaHistorico = anioDesde <= 2024;

  if (!tocaHistorico) {
    return {
      activar_prediccion: false,
      motivo: 'el periodo solicitado es 2025 en adelante, cubierto por boletines, no por Postgres',
    };
  }

  const anioHastaAcotado = Math.min(anioHasta, 2024);
  const hayDepartamento = !!(departamentoDetectado && departamentoDetectado.codigo_departamento);

  return {
    activar_prediccion: true,
    codigo_departamento: (departamentoDetectado && departamentoDetectado.codigo_departamento) || null,
    departamento_detectado: (departamentoDetectado && departamentoDetectado.departamento_detectado) || null,
    nivel_agregacion: hayDepartamento ? 'departamento' : 'nacional',
    anio_desde: anioDesde,
    anio_hasta: anioHastaAcotado,
    semana_desde: hayPeriodoEspecifico
      ? parseInt(periodoResuelto.semana_desde, 10)
      : parseInt(periodoResuelto.semana_desde, 10),
    semana_hasta: hayPeriodoEspecifico
      ? parseInt(periodoResuelto.semana_hasta, 10)
      : 53,
    incluir_dengue: enfermedadDetectada.incluir_dengue,
    incluir_eda: enfermedadDetectada.incluir_eda,
    incluir_ira_neumonia: enfermedadDetectada.incluir_ira_neumonia,
    incluir_ira_no_neumonia: enfermedadDetectada.incluir_ira_no_neumonia,
    enfermedades_activas: enfermedadDetectada.enfermedades_activas,
  };
}

module.exports = { decidirPrediccion };
