// @healthradar/core — validators/cifras-respuesta.js
// ─────────────────────────────────────────────────────────
// Verificación post-hoc de las cifras de la respuesta del chat (plan RAG híbrido v2.3, paso 5).
//
// Idea: el modelo solo debería citar números que le dimos (casos, clima, boletines, boletines
// recuperados por búsqueda semántica) o que se derivan de ellos de forma simple (suma, diferencia,
// promedio, variación porcentual) CUYOS OPERANDOS aparecen también en la respuesta ("pasó de A a B,
// un aumento de C"). Un número que no sale de ahí es una posible alucinación y la respuesta lleva
// una advertencia (`advertencia_cifras`) para que el analista lo revise. Los derivados se limitan a
// operandos de la respuesta a propósito: combinando todos los números del contexto casi cualquier
// cifra inventada calzaría por casualidad.
//
// Reglas de lectura (español/inglés, "1,250" ambiguo → se aceptan ambas lecturas):
//   - "24,552,263" / "24.552.263"         → miles
//   - "1.250,5" / "1,250.5"               → el último separador es el decimal
//   - "12,5" / "12.5"                     → decimal
//   - "1,250" / "1.250"                   → 1250 o 1,25 (se acepta si alguna lectura coincide)
//   - "18 mil", "1,2 millones", "12 %"    → sufijos
// No se revisan: enteros sueltos < 100 (semanas, "3 departamentos"), años 2000–2099 sin separador
// (salvo que sean un conteo: "2025 casos"), números pegados a letras (H1N1, SE22, CIE-10).
// Puro: sin n8n, sin PostgreSQL, sin red.

'use strict';

const MAX_EN_ADVERTENCIA = 5;
const RE_NUMERO = /(?<![\p{L}\p{N}_]|\p{L}-)(\d{1,3}(?:[.,  \x20]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?![\p{N}])/gu;
const RE_NUMERO_SIN_ESPACIO = new RegExp(RE_NUMERO.source.replace('\\x20', ''), 'gu');
const RE_SUFIJO = /^\s{0,1}(mil\b|millones?\b|mill\b|%)/i;
const RE_CONTEO = /^\s{0,1}(casos|pacientes|personas|muertes|defunciones|hospitalizad|episodios|notificaciones)/i;

const aTexto = (v) => (v === undefined || v === null ? '' : String(v));

/** Lee un token numérico y devuelve sus lecturas posibles con los decimales de cada una. */
function parsear(token) {
  // Con espacio (común, fino o duro) el espacio es separador de miles; lo que quede ('.' o ',') es decimal
  if (/[  \x20]/.test(token)) {
    const sin = token.replace(/[  \x20]/g, '');
    const k = sin.search(/[.,]/);
    return k === -1
      ? [{ valor: Number(sin), decimales: 0 }]
      : [{ valor: Number(sin.slice(0, k) + '.' + sin.slice(k + 1)), decimales: sin.length - k - 1 }];
  }
  const crudo = token;
  const seps = [...crudo].map((c, i) => (c === '.' || c === ',' ? i : -1)).filter((i) => i >= 0);
  const num = (s) => Number(s);

  if (seps.length === 0) return [{ valor: num(crudo), decimales: 0 }];

  const tipos = new Set(seps.map((i) => crudo[i]));
  const ultimo = seps[seps.length - 1];
  const tras = crudo.length - ultimo - 1;
  const quitar = (s) => s.replace(/[.,]/g, '');

  // Dos tipos distintos: el último separador es el decimal, el otro es de miles.
  if (tipos.size === 2) {
    return [{ valor: num(quitar(crudo.slice(0, ultimo)) + '.' + crudo.slice(ultimo + 1)), decimales: tras }];
  }
  // Un solo tipo repetido: miles ("24,552,263").
  if (seps.length > 1) return [{ valor: num(quitar(crudo)), decimales: 0 }];

  // Un solo separador. Tres dígitos después y 1–3 antes (sin ceros al inicio): ambiguo.
  const antes = crudo.slice(0, ultimo);
  if (tras === 3 && antes.length <= 3 && !antes.startsWith('0')) {
    return [
      { valor: num(quitar(crudo)), decimales: 0 },                // 1,250 → 1250
      { valor: num(antes + '.' + crudo.slice(ultimo + 1)), decimales: 3 }, // 1,250 → 1.25
    ];
  }
  return [{ valor: num(antes + '.' + crudo.slice(ultimo + 1)), decimales: tras }];
}

/**
 * Extrae todos los números de un texto.
 * @param {string} texto
 * @returns {Array<{texto:string, candidatos:Array<{valor:number, decimales:number}>, factor:number,
 *                  porcentaje:boolean, anio:boolean}>}
 */
function extraerNumeros(texto, opciones = {}) {
  const t = aTexto(texto);
  const juntar = opciones.juntarEspacios !== false;
  const salida = [];
  for (const m of t.matchAll(juntar ? RE_NUMERO : RE_NUMERO_SIN_ESPACIO)) {
    const token = m[1];
    const resto = t.slice(m.index + token.length);
    const suf = resto.match(RE_SUFIJO);
    const sufijo = suf ? suf[1].toLowerCase() : '';
    const factor = sufijo === 'mil' ? 1e3 : sufijo.startsWith('mill') ? 1e6 : 1;
    const porcentaje = sufijo === '%';
    const candidatos = parsear(token)
      .map((c) => ({ valor: c.valor * factor, decimales: c.decimales }))
      .filter((c) => Number.isFinite(c.valor));
    if (candidatos.length === 0) continue;

    // Año: 2000–2099 sin separador, sin sufijo y que no sea un conteo ("2025 casos")
    const anio = /^20\d{2}$/.test(token) && !sufijo && !RE_CONTEO.test(resto);
    const texto_ = token + (suf ? (suf[0].startsWith(' ') ? ' ' : '') + suf[1] : '');
    // "22 100 casos" puede ser 22100 o dos números sueltos (22 y 100): se guardan las partes por si la unión no calza
    const alternativa = juntar && token.includes(' ') ? extraerNumeros(token, { juntarEspacios: false }) : null;
    salida.push({ texto: texto_, candidatos, factor, porcentaje, anio, alternativa });
  }
  return salida;
}

const tolerancia = (c, factor) => 0.5 * Math.pow(10, -c.decimales) * factor + 1e-9;

/** ¿El candidato coincide con algún valor válido (redondeo permitido)? */
function coincide(c, factor, validos) {
  const tol = tolerancia(c, factor);
  for (const w of validos) if (Math.abs(c.valor - w) <= tol) return true;
  return false;
}

const MAX_SUMANDOS = 12;   // 2^12 subconjuntos como máximo

/** ¿Es la suma de algún subconjunto (de 2 o más) de los valores? (total = suma de categorías) */
function esSumaDeSubconjunto(v, tol, valores) {
  const xs = valores.slice(0, MAX_SUMANDOS);
  const total = 1 << xs.length;
  for (let mascara = 1; mascara < total; mascara++) {
    if ((mascara & (mascara - 1)) === 0) continue;   // un solo elemento: no es suma
    let suma = 0;
    for (let i = 0; i < xs.length; i++) if (mascara & (1 << i)) suma += xs[i];
    if (Math.abs(suma - v) <= tol) return true;
  }
  return false;
}

/** ¿Se obtiene con una operación simple entre valores ya verificados de la respuesta? */
function esDerivado(c, factor, porcentaje, validos) {
  const v = c.valor;
  // En un cálculo el modelo suele redondear ("aproximadamente 4,800" por 4,809): se tolera hasta 1 %
  const tol = Math.max(tolerancia(c, factor), 0.01 * Math.abs(v));
  if (esSumaDeSubconjunto(v, tol, validos)) return true;   // incluye la suma de dos
  for (let i = 0; i < validos.length; i++) {
    const a = validos[i];
    for (let j = 0; j < validos.length; j++) {
      const b = validos[j];
      if (i < j) {
        if (Math.abs((a + b) / 2 - v) <= tol) return true; // promedio de dos
      }
      if (i !== j && Math.abs(a - b - v) <= tol) return true; // diferencia
      if (porcentaje && b !== 0) {
        if (Math.abs((a - b) / b * 100 - v) <= tol) return true; // variación %
        if (Math.abs(a / b * 100 - v) <= tol) return true;       // proporción %
      }
    }
  }
  return false;
}

/**
 * Valores válidos a partir de textos de contexto y listas explícitas.
 * @returns {number[]} sin repetidos
 */
function construirValidos(contexto, cifrasValidas) {
  const set = new Set();
  const partes = Array.isArray(contexto) ? contexto : [contexto];
  for (const p of partes) {
    for (const n of extraerNumeros(p)) {
      for (const c of n.candidatos) set.add(c.valor);
      for (const sub of n.alternativa || []) for (const c of sub.candidatos) set.add(c.valor);
    }
  }
  for (const v of Array.isArray(cifrasValidas) ? cifrasValidas : []) {
    const x = Number(v);
    if (Number.isFinite(x)) set.add(x);
  }
  return [...set];
}

/**
 * Verifica que las cifras de la respuesta salgan de los datos entregados al modelo.
 *
 * @param {string} textoRespuesta
 * @param {{ contexto?: string|string[], cifrasValidas?: number[], metadatos?: number[],
 *           minimoEntero?: number, permitirDerivados?: boolean }} [opts]
 *        contexto: textos que vio el modelo (boletines, clima, tendencia, RAG, pregunta, historial).
 *        cifrasValidas: números adicionales conocidos (p. ej. filas de SQL).
 *        metadatos: números siempre aceptados (cantidad de boletines, semanas…).
 *        minimoEntero: enteros sin decimales ni % por debajo de este valor no se revisan (100).
 *        permitirDerivados: acepta sumas/diferencias/promedios/variaciones % de pares válidos (true).
 * @returns {{ revisadas:number, sin_respaldo:Array<{texto:string, valor:number}>,
 *             advertencia_cifras:string|null }}
 */
function verificarCifras(textoRespuesta, opts = {}) {
  const minimo = Number.isFinite(opts.minimoEntero) ? opts.minimoEntero : 100;
  const derivados = opts.permitirDerivados !== false;
  const validosCtx = construirValidos(opts.contexto, opts.cifrasValidas);
  const metadatos = (Array.isArray(opts.metadatos) ? opts.metadatos : []).map(Number).filter(Number.isFinite);
  const todos = [...new Set([...validosCtx, ...metadatos])];

  // Pasada 1: cifras de la respuesta que coinciden directamente con el contexto.
  const pendientes = [];
  const verificados = [];
  let revisadas = 0;
  for (const n of extraerNumeros(textoRespuesta)) {
    if (n.anio) continue;
    const esEntero = n.candidatos.every((c) => c.decimales === 0) && !n.porcentaje && n.factor === 1;
    if (esEntero && Math.abs(n.candidatos[0].valor) < minimo) continue;
    revisadas++;
    const c = n.candidatos.find((x) => coincide(x, n.factor, todos));
    if (c) { verificados.push(c.valor); continue; }
    // La unión ("22 100") no calza: se prueban las partes sueltas, que son cifras por sí mismas
    if (n.alternativa && n.alternativa.length > 0) {
      const partes = n.alternativa.map((a) => {
        const entero = a.candidatos.every((x) => x.decimales === 0);
        if (entero && Math.abs(a.candidatos[0].valor) < minimo) return { ok: true };
        const x = a.candidatos.find((y) => coincide(y, a.factor, todos));
        return x ? { ok: true, valor: x.valor } : { ok: false };
      });
      if (partes.every((x) => x.ok)) { for (const x of partes) if (x.valor !== undefined) verificados.push(x.valor); continue; }
    }
    pendientes.push(n);
  }

  // Pasada 2: las que no coinciden pueden ser un cálculo simple entre cifras ya verificadas.
  // Un derivado aceptado pasa a ser operando de los siguientes (total → diferencia con otra semana).
  const operandos = [...new Set(verificados)].filter((v) => v !== 0);
  const vistos = new Set();
  const sinRespaldo = [];
  for (const n of pendientes) {
    if (derivados && operandos.length >= 2) {
      const c = n.candidatos.find((x) => esDerivado(x, n.factor, n.porcentaje, operandos));
      if (c) {
        if (!n.porcentaje && c.valor !== 0 && !operandos.includes(c.valor)) operandos.push(c.valor);
        continue;
      }
    }
    if (vistos.has(n.texto)) continue;
    vistos.add(n.texto);
    sinRespaldo.push({ texto: n.texto, valor: n.candidatos[0].valor });
  }

  let advertencia = null;
  if (sinRespaldo.length > 0) {
    const lista = sinRespaldo.slice(0, MAX_EN_ADVERTENCIA).map((s) => s.texto).join(', ')
      + (sinRespaldo.length > MAX_EN_ADVERTENCIA ? ` y ${sinRespaldo.length - MAX_EN_ADVERTENCIA} más` : '');
    advertencia = `Algunas cifras de esta respuesta no coinciden con los datos consultados (${lista}). Verifícalas antes de usarlas.`;
  }
  return { revisadas, sin_respaldo: sinRespaldo, advertencia_cifras: advertencia };
}

module.exports = { verificarCifras, extraerNumeros };
