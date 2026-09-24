// @healthradar/core — Capa de decisiones pura (ADR-012)
// ─────────────────────────────────────────────────────────
// Punto de entrada único. n8n hace: const core = require('@healthradar/core');
// Ningún módulo depende de n8n, PostgreSQL, Next.js ni ningún framework.

// Parsers — detección sin LLM
const { detectarPeriodo, resolverVentana } = require('./parsers/periodo');
const { detectarDepartamento } = require('./parsers/departamento');
const { detectarEnfermedad } = require('./parsers/enfermedad');
const { extraerNivelRiesgo } = require('./parsers/riesgo');

// Decisions — reglas de activación
const { decidirPrediccion } = require('./decisions/activar-prediccion');

// Filters — filtrado de datos
const { filtrarBoletines } = require('./filters/boletines');
const { filtrarClima } = require('./filters/clima');

// Builders — armado de contexto para LLM
const { construirContextoPrompt } = require('./builders/contexto-prompt');
const { armarTextoTendencia } = require('./builders/tendencia');

// Validators — validación de outputs de LLM
const { validarResumenBoletin } = require('./validators/resumen-boletin');

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

  // Decisions
  decidirPrediccion,

  // Filters
  filtrarBoletines,
  filtrarClima,

  // Builders
  construirContextoPrompt,
  armarTextoTendencia,

  // Validators
  validarResumenBoletin,

  // Presentación
  presentacion,

  // Metadata
  version: () => pkg.version,
};
