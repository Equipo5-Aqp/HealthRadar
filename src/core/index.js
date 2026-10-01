// @healthradar/core — Capa de decisiones pura (ADR-012)
// ─────────────────────────────────────────────────────────
// Punto de entrada único. n8n hace: const core = require('@healthradar/core');
// Ningún módulo depende de n8n, PostgreSQL, Next.js ni ningún framework.

// Parsers — detección sin LLM
const { detectarPeriodo, resolverVentana } = require('./parsers/periodo');
const { detectarDepartamento } = require('./parsers/departamento');
const { detectarEnfermedad } = require('./parsers/enfermedad');
const { extraerNivelRiesgo } = require('./parsers/riesgo');
const { extraerLinksBoletines } = require('./parsers/boletines-dge');

// Decisions — reglas de activación
const { decidirPrediccion } = require('./decisions/activar-prediccion');

// Filters — filtrado de datos
const { filtrarBoletines } = require('./filters/boletines');
const { filtrarClima } = require('./filters/clima');
const { filtrarNuevos } = require('./filters/boletines-nuevos');

// Builders — armado de contexto para LLM
const { construirContextoPrompt } = require('./builders/contexto-prompt');
const { armarTextoTendencia } = require('./builders/tendencia');
const { construirTrazaPhoenix, estimarTokens } = require('./builders/traza-phoenix');
const { generarListaAnios } = require('./builders/lista-anios');
const { calcularRangoFechasSemana } = require('./builders/rango-semana');
const { construirErrorNlq } = require('./builders/error-nlq');
const { generarDepartamentos } = require('./builders/departamentos');
const { agruparPorSemanaEpi } = require('./builders/clima-semanal');

// Validators — validación de outputs de LLM
const { validarResumenBoletin, detectarInconsistenciasCifras } = require('./validators/resumen-boletin');
const { extraerCifras, quitarMarcadorCifras } = require('./parsers/cifras-boletin');
const { validarFiltrosConsulta } = require('./validators/filtros-consulta');

// Presentación — constantes compartidas con el frontend
const presentacion = {
  riesgo: require('./presentacion/riesgo'),
  modelo: require('./presentacion/modelo'),
  errores: require('./presentacion/errores'),
};

// Metadata
const pkg = require('./package.json');

module.exports = {
  // Parsers
  detectarPeriodo,
  resolverVentana,
  detectarDepartamento,
  detectarEnfermedad,
  extraerNivelRiesgo,
  extraerLinksBoletines,

  // Decisions
  decidirPrediccion,

  // Filters
  filtrarBoletines,
  filtrarClima,
  filtrarNuevos,

  // Builders
  construirContextoPrompt,
  armarTextoTendencia,
  construirTrazaPhoenix,
  construirErrorNlq,
  estimarTokens,
  generarListaAnios,
  calcularRangoFechasSemana,
  generarDepartamentos,
  agruparPorSemanaEpi,

  // Validators
  validarResumenBoletin,
  detectarInconsistenciasCifras,
  extraerCifras,
  quitarMarcadorCifras,
  validarFiltrosConsulta,

  // Presentación
  presentacion,
  modeloPorAgente: presentacion.modelo.modeloPorAgente,

  // Metadata
  version: () => pkg.version,
};
