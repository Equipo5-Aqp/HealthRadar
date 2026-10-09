// @healthradar/core — parsers/respuesta-llm.js
// ─────────────────────────────────────────────────────────
// Lee la respuesta de una API de chat compatible con OpenAI
// (POST /v1/chat/completions) y la deja con la forma que ya consume el flujo:
// { output, tokens }.
//
// Casos reales que contempla:
//  - content null/vacío: pasa con modelos de razonamiento (GLM) cuando el
//    razonamiento consume max_tokens → output '' → el flujo pasa al siguiente modelo;
//  - content como arreglo de partes [{type:'text', text}];
//  - cuerpo no JSON (por ejemplo una página de error) → output '';
//  - usage con el consumo REAL de tokens (Phoenix deja de estimar).

'use strict';

function textoDeContenido(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((parte) => (typeof parte === 'string' ? parte : parte && typeof parte.text === 'string' ? parte.text : ''))
      .join('');
  }
  return '';
}

/**
 * Algunos modelos (Kimi K3 en la API gratuita) devuelven a veces la MISMA respuesta dos veces seguidas,
 * pegada ("...dengue.Para la SE 22..."). Si el texto es exactamente X + separador de espacios + X,
 * se deja una sola copia. Textos cortos o que no se repiten exactamente no se tocan.
 *
 * @param {string} texto
 * @returns {string}
 */
function colapsarRepeticion(texto) {
  const t = typeof texto === 'string' ? texto.trim() : '';
  if (t.length < 40) return t;
  for (let sep = 0; sep <= 3; sep++) {
    if ((t.length - sep) % 2 !== 0) continue;
    const mitad = (t.length - sep) / 2;
    const a = t.slice(0, mitad);
    const medio = t.slice(mitad, mitad + sep);
    const b = t.slice(mitad + sep);
    if (a === b && medio.trim() === '') return a.trim();
  }
  return t;
}

/**
 * @param {object|string} respuesta - cuerpo de la respuesta HTTP ya parseado
 * @returns {{ output: string, tokens: {prompt:number, completion:number}|null,
 *            finishReason: string|null, modeloRespuesta: string|null }}
 */
function extraerRespuestaLlm(respuesta) {
  const r = respuesta && typeof respuesta === 'object' ? respuesta : {};
  const choice = Array.isArray(r.choices) ? r.choices[0] : undefined;
  const mensaje = choice && choice.message ? choice.message : {};
  const output = colapsarRepeticion(textoDeContenido(mensaje.content));

  const u = r.usage || {};
  const prompt = Number(u.prompt_tokens);
  const completion = Number(u.completion_tokens);
  const tokens = Number.isFinite(prompt) && Number.isFinite(completion) ? { prompt, completion } : null;

  return {
    output,
    tokens,
    finishReason: choice && choice.finish_reason ? String(choice.finish_reason) : null,
    modeloRespuesta: typeof r.model === 'string' ? r.model : null,
  };
}

module.exports = { extraerRespuestaLlm, colapsarRepeticion };
