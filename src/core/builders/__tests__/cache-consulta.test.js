'use strict';
const {
  normalizarPregunta, huellaPrompt, claveCache, prepararBusquedaCache, prepararGuardadoCache,
  construirRespuestaCache, VERSION_CACHE, TTL_HORAS, MAX_ENTRADAS, MAX_PREGUNTA_NORMALIZADA, MAX_RESPUESTA,
} = require('../cache-consulta');
const core = require('../../index');

const PROMPT = 'Eres un analista epidemiologico...';
const RESP = { output: 'Dengue: 120 casos en la SE 22.', nivel_riesgo: 'medio', modelo_usado: 'gemini-3.5-flash-lite', proveedor: 'google', agente: 4 };
const guardar = (extra = {}) => prepararGuardadoCache({
  pregunta: '¿Cuántos casos de dengue hubo en la SE 22?', prompt: PROMPT, respuesta: RESP,
  hayHistorial: false, versionDatos: 'abc123', ...extra,
});

describe('normalizarPregunta', () => {
  test('quita tildes, mayúsculas, signos y espacios de más', () => {
    expect(normalizarPregunta('  ¿Cuántos CASOS de dengue hubo en la SE 22?  ')).toBe('cuantos casos de dengue hubo en la se 22');
  });
  test('la misma pregunta con distinta escritura da lo mismo', () => {
    expect(normalizarPregunta('Cuantos casos de dengue hubo en la SE-22?'))
      .toBe(normalizarPregunta('¿cuántos casos de dengue hubo en la se 22'));
  });
  test('números distintos siguen siendo distintos', () => {
    expect(normalizarPregunta('semana 22 de 2025')).not.toBe(normalizarPregunta('semana 23 de 2025'));
  });
  test('no texto -> cadena vacía', () => {
    for (const v of [undefined, null, 42, {}, []]) expect(normalizarPregunta(v)).toBe('');
  });
});

describe('huellaPrompt', () => {
  test('estable, distinta si cambia el prompt, vacía sin prompt', () => {
    expect(huellaPrompt(PROMPT)).toBe(huellaPrompt(PROMPT));
    expect(huellaPrompt(PROMPT)).toHaveLength(16);
    expect(huellaPrompt(PROMPT + '!')).not.toBe(huellaPrompt(PROMPT));
    expect(huellaPrompt('')).toBe('');
    expect(huellaPrompt(undefined)).toBe('');
  });
});

describe('claveCache', () => {
  test('SHA-256 en hexadecimal (64) y estable', () => {
    const k = claveCache('casos de dengue en 2025', PROMPT);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(claveCache('Casos de dengue en 2025?', PROMPT)).toBe(k);
  });
  test('cambia con la pregunta y con el prompt', () => {
    const k = claveCache('casos de dengue en 2025', PROMPT);
    expect(claveCache('casos de dengue en 2024', PROMPT)).not.toBe(k);
    expect(claveCache('casos de dengue en 2025', PROMPT + ' nuevo')).not.toBe(k);
  });
  test('pregunta no cacheable -> clave vacía', () => {
    expect(claveCache('', PROMPT)).toBe('');
    expect(claveCache('cuantos casos hubo ayer', PROMPT)).toBe('');
    expect(claveCache('a'.repeat(MAX_PREGUNTA_NORMALIZADA + 1), PROMPT)).toBe('');
  });
  test('palabras relativas: hoy, ayer, esta semana, semana pasada…', () => {
    for (const q of ['como estamos hoy', 'que paso ayer', 'casos esta semana', 'comparado con la semana pasada', 'este mes', 'mes pasado', 'ahora',
      'como va el dengue en la semana actual', 'casos de la semana en curso', 'como esta el dengue actualmente', 'casos en este momento', 'dengue ahorita']) {
      expect(claveCache(q, PROMPT)).toBe('');
    }
  });
  test('«semana» a secas o «pasado» en otro sentido sí se cachean', () => {
    expect(claveCache('casos de la semana 22', PROMPT)).not.toBe('');
    expect(claveCache('casos del año pasado en arequipa', PROMPT)).not.toBe('');
  });
  test('«situación actual» y «última semana» dependen solo del último boletín: sí se cachean', () => {
    expect(claveCache('cual es la situacion actual del dengue', PROMPT)).not.toBe('');
    expect(claveCache('casos de la ultima semana', PROMPT)).not.toBe('');
  });
  test('VERSION_CACHE entra a la clave', () => {
    expect(typeof VERSION_CACHE).toBe('string');
  });
});

describe('prepararBusquedaCache', () => {
  test('pregunta normal: consulta con la clave y la sesión recortada', () => {
    const r = prepararBusquedaCache({ pregunta: 'casos de eda en 2025', sessionId: '  s-1  ', prompt: PROMPT });
    expect(r).toEqual({ clave: claveCache('casos de eda en 2025', PROMPT), consultar: true, session_id: 's-1' });
  });
  test('pregunta no cacheable o vacía: no consulta', () => {
    expect(prepararBusquedaCache({ pregunta: 'y hoy?', sessionId: 's', prompt: PROMPT })).toMatchObject({ consultar: false, clave: '' });
    expect(prepararBusquedaCache()).toEqual({ clave: '', consultar: false, session_id: '' });
  });
  test('sin sesión: consulta igual (la primera pregunta sin sessionId también es suelta)', () => {
    expect(prepararBusquedaCache({ pregunta: 'casos de eda en 2025', prompt: PROMPT })).toMatchObject({ consultar: true, session_id: '' });
  });
});

describe('prepararGuardadoCache', () => {
  test('respuesta sana a primera pregunta: se guarda con lista blanca de campos', () => {
    const g = guardar({ respuesta: { ...RESP, _verificacion: { revisadas: 3 }, tokens: 999, advertencia_cifras: null } });
    expect(g).toMatchObject({ guardar: true, motivo: null, version_datos: 'abc123', ttl_horas: TTL_HORAS, max_entradas: MAX_ENTRADAS });
    expect(g.clave).toBe(claveCache('¿Cuántos casos de dengue hubo en la SE 22?', PROMPT));
    expect(g.pregunta).toBe('cuantos casos de dengue hubo en la se 22');
    expect(JSON.parse(g.respuesta_json)).toEqual(RESP);
  });
  test('con historial -> no se guarda', () => {
    expect(guardar({ hayHistorial: true })).toMatchObject({ guardar: false, motivo: 'con_historial' });
  });
  test('hayHistorial sin informar -> no se guarda (ante la duda)', () => {
    expect(guardar({ hayHistorial: undefined })).toMatchObject({ guardar: false, motivo: 'con_historial' });
  });
  test('sin versión de datos (falló la búsqueda) -> no se guarda', () => {
    expect(guardar({ versionDatos: '' })).toMatchObject({ guardar: false, motivo: 'sin_version_datos' });
    expect(guardar({ versionDatos: undefined })).toMatchObject({ guardar: false, motivo: 'sin_version_datos' });
  });
  test('respuesta vacía, larga, con advertencia o con error -> no se guarda', () => {
    expect(guardar({ respuesta: { ...RESP, output: '   ' } }).motivo).toBe('sin_respuesta');
    expect(guardar({ respuesta: undefined }).motivo).toBe('sin_respuesta');
    expect(guardar({ respuesta: { ...RESP, output: 'x'.repeat(MAX_RESPUESTA + 1) } }).motivo).toBe('respuesta_larga');
    expect(guardar({ respuesta: { ...RESP, advertencia_cifras: 'Revisa 250' } }).motivo).toBe('respuesta_con_advertencia');
    expect(guardar({ respuesta: { ...RESP, error: true } }).motivo).toBe('respuesta_con_advertencia');
  });
  test('la verificación de cifras falló (salió sin revisar) -> no se guarda; si corrió bien, sí', () => {
    expect(guardar({ respuesta: { ...RESP, _verificacion: { revisadas: 0, sin_respaldo: 0, fallo: true } } }).motivo).toBe('verificacion_fallida');
    expect(guardar({ respuesta: { ...RESP, _verificacion: { revisadas: 2, sin_respaldo: 0, fallo: false } } }).guardar).toBe(true);
  });
  test('pregunta no cacheable -> no se guarda', () => {
    expect(guardar({ pregunta: '' }).motivo).toBe('sin_pregunta');
    expect(guardar({ pregunta: 'como va el dengue hoy' }).motivo).toBe('tiempo_relativo');
  });
  test('cuando no se guarda, los parámetros del INSERT quedan neutros', () => {
    expect(guardar({ hayHistorial: true })).toMatchObject({ clave: '', pregunta: '', version_datos: '', respuesta_json: '{}' });
  });
  test('TTL propio válido se respeta; inválido vuelve al de siempre', () => {
    expect(guardar({ ttlHoras: 6 }).ttl_horas).toBe(6);
    for (const t of [0, -1, 1.5, '12', null]) expect(guardar({ ttlHoras: t }).ttl_horas).toBe(TTL_HORAS);
  });
  test('sin nivel de riesgo (null) también se guarda y conserva el null', () => {
    const g = guardar({ respuesta: { ...RESP, nivel_riesgo: null } });
    expect(JSON.parse(g.respuesta_json).nivel_riesgo).toBeNull();
  });
  test('sin argumentos no revienta', () => {
    expect(prepararGuardadoCache()).toMatchObject({ guardar: false, motivo: 'sin_pregunta' });
  });
});

describe('construirRespuestaCache', () => {
  const ahora = new Date('2026-11-02T12:00:00Z');
  test('acierto: respuesta guardada + desde_cache + edad en minutos', () => {
    const r = construirRespuestaCache({ respuesta: RESP, creado_en: '2026-11-02T10:30:00Z' }, ahora);
    expect(r).toEqual({ ...RESP, desde_cache: true, cache_edad_minutos: 90 });
  });
  test('respuesta guardada como texto JSON también sirve', () => {
    const r = construirRespuestaCache({ respuesta: JSON.stringify(RESP), creado_en: new Date('2026-11-02T11:59:30Z') }, ahora);
    expect(r).toMatchObject({ output: RESP.output, desde_cache: true, cache_edad_minutos: 0 });
  });
  test('solo devuelve los campos del contrato (descarta lo inesperado)', () => {
    const r = construirRespuestaCache({ respuesta: { ...RESP, secreto: 'x' }, creado_en: '2026-11-02T11:00:00Z' }, ahora);
    expect(r).not.toHaveProperty('secreto');
  });
  test('fecha ilegible -> edad null; fecha futura -> 0', () => {
    expect(construirRespuestaCache({ respuesta: RESP, creado_en: 'ayer' }, ahora).cache_edad_minutos).toBeNull();
    expect(construirRespuestaCache({ respuesta: RESP, creado_en: '2026-11-03T00:00:00Z' }, ahora).cache_edad_minutos).toBe(0);
  });
  test('sin ahora usa la hora actual', () => {
    expect(construirRespuestaCache({ respuesta: RESP, creado_en: new Date() }).cache_edad_minutos).toBe(0);
  });
  test('fila vacía, JSON roto o sin texto -> null', () => {
    expect(construirRespuestaCache(null, ahora)).toBeNull();
    expect(construirRespuestaCache({}, ahora)).toBeNull();
    expect(construirRespuestaCache({ respuesta: '{no es json' }, ahora)).toBeNull();
    expect(construirRespuestaCache({ respuesta: { output: '  ' } }, ahora)).toBeNull();
    expect(construirRespuestaCache({ respuesta: 5 }, ahora)).toBeNull();
  });
});

describe('index del core', () => {
  test('exporta las funciones de la caché', () => {
    for (const f of ['prepararBusquedaCache', 'prepararGuardadoCache', 'construirRespuestaCache', 'normalizarPreguntaCache']) {
      expect(typeof core[f]).toBe('function');
    }
  });
});
