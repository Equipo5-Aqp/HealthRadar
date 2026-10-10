'use strict';

const {
  normalizarSessionId,
  normalizarHistorial,
  construirPromptUsuario,
  construirMensajesChat,
  construirCuerpoChat,
  prepararGuardadoHistorial,
  normalizarRequestId,
  ENCABEZADO_RAG,
} = require('../mensajes-chat');

const base = {
  promptSistema: 'PROMPT',
  criterioPeriodo: 'SE 9 de 2025',
  cantidadBoletines: 1,
  textoBoletines: 'BOLETIN',
  textoClima: 'CLIMA',
  textoTendencia: '',
  pregunta: '¿Cuántos casos?',
};

describe('normalizarSessionId', () => {
  test('recorta a 64 y quita espacios', () => {
    expect(normalizarSessionId('  abc  ')).toBe('abc');
    expect(normalizarSessionId('x'.repeat(100))).toHaveLength(64);
  });
  test('sin valor devuelve cadena vacía', () => {
    expect(normalizarSessionId(undefined)).toBe('');
    expect(normalizarSessionId(null)).toBe('');
  });
  test('convierte números a texto', () => {
    expect(normalizarSessionId(123)).toBe('123');
  });
});

describe('normalizarHistorial', () => {
  const fila = (rol, contenido) => ({ rol, contenido });
  test('entrada inválida devuelve []', () => {
    expect(normalizarHistorial(undefined)).toEqual([]);
    expect(normalizarHistorial('x')).toEqual([]);
    expect(normalizarHistorial([], { maxVueltas: 0 })).toEqual([]);
  });
  test('convierte rol/contenido a role/content', () => {
    expect(normalizarHistorial([fila('user', 'hola'), fila('assistant', 'qué tal')])).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'qué tal' },
    ]);
  });
  test('descarta filas vacías, nulas o con rol desconocido', () => {
    const r = normalizarHistorial([null, fila('system', 'x'), fila('user', '   '), fila('user', 'ok'), fila('assistant', 'resp')]);
    expect(r).toEqual([{ role: 'user', content: 'ok' }, { role: 'assistant', content: 'resp' }]);
  });
  test('se queda con las últimas N vueltas', () => {
    const filas = [];
    for (let i = 1; i <= 5; i++) filas.push(fila('user', 'p' + i), fila('assistant', 'r' + i));
    const r = normalizarHistorial(filas, { maxVueltas: 2 });
    expect(r.map((m) => m.content)).toEqual(['p4', 'r4', 'p5', 'r5']);
  });
  test('siempre empieza con mensaje de usuario', () => {
    const r = normalizarHistorial([fila('assistant', 'huérfana'), fila('user', 'p'), fila('assistant', 'r')]);
    expect(r[0].role).toBe('user');
    expect(r).toHaveLength(2);
  });
  test('recorta cada mensaje largo', () => {
    const r = normalizarHistorial([fila('user', 'a'.repeat(50))], { maxCaracteres: 10 });
    expect(r[0].content).toHaveLength(10);
    expect(r[0].content.endsWith('…')).toBe(true);
  });
  test('usa los valores por defecto (3 vueltas, 1000 caracteres)', () => {
    const filas = [];
    for (let i = 1; i <= 6; i++) filas.push(fila('user', 'p' + i), fila('assistant', 'r' + i));
    expect(normalizarHistorial(filas)).toHaveLength(6);
    expect(normalizarHistorial([fila('user', 'z'.repeat(2000))])[0].content).toHaveLength(1000);
  });
});

describe('construirPromptUsuario', () => {
  test('reproduce el texto exacto que armaba el AI Agent (sin tendencia)', () => {
    expect(construirPromptUsuario(base)).toBe(
      'PROMPT\n\nEl analista pregunto por el siguiente periodo: SE 9 de 2025 (1 boletin(es) encontrados para ese periodo).' +
      '\n\nResumenes de los boletines epidemiologicos de ese periodo:\nBOLETIN' +
      '\n\nDatos climaticos (promedio nacional) de las mismas semanas:\nCLIMA' +
      '\n\nEl analista pregunta lo siguiente:\n¿Cuántos casos?'
    );
  });
  test('incluye la tendencia cuando existe', () => {
    const t = construirPromptUsuario({ ...base, textoTendencia: 'TEND' });
    expect(t).toContain('Tendencia de casos historica para el departamento mencionado:\nTEND\n\nEl analista pregunta lo siguiente:');
  });
  test('valores ausentes no imprimen undefined ni null', () => {
    const t = construirPromptUsuario({ promptSistema: 'P', pregunta: 'q' });
    expect(t).not.toMatch(/undefined|null/);
  });
});

describe('construirMensajesChat', () => {
  test('sin historial: un solo mensaje de usuario con el prompt completo', () => {
    const m = construirMensajesChat(base);
    expect(m).toHaveLength(1);
    expect(m[0].role).toBe('user');
    expect(m[0].content.startsWith('PROMPT')).toBe(true);
  });
  test('con historial: va antes del mensaje actual', () => {
    const m = construirMensajesChat({ ...base, historial: [{ rol: 'user', contenido: 'p1' }, { rol: 'assistant', contenido: 'r1' }] });
    expect(m.map((x) => x.role)).toEqual(['user', 'assistant', 'user']);
    expect(m[0].content).toBe('p1');
  });
  test('falla claro si falta el prompt', () => {
    expect(() => construirMensajesChat({ ...base, promptSistema: '' })).toThrow(/SYSTEM_PROMPT_CONEXION/);
    expect(() => construirMensajesChat({ ...base, promptSistema: undefined })).toThrow(/SYSTEM_PROMPT_CONEXION/);
  });
});

describe('construirCuerpoChat', () => {
  const messages = [{ role: 'user', content: 'x' }];
  test('arma el cuerpo con valores por defecto', () => {
    expect(construirCuerpoChat({ modelo: 'm', messages })).toEqual({
      model: 'm', messages, max_tokens: 2048, temperature: 0.2, stream: false,
    });
  });
  test('permite cambiar max_tokens y temperatura', () => {
    const c = construirCuerpoChat({ modelo: 'm', messages, maxTokens: 512, temperature: 0 });
    expect(c.max_tokens).toBe(512);
    expect(c.temperature).toBe(0);
  });
  test('valida modelo y mensajes', () => {
    expect(() => construirCuerpoChat({ messages })).toThrow(/modelo/);
    expect(() => construirCuerpoChat({ modelo: 'm', messages: [] })).toThrow(/mensajes/);
    expect(() => construirCuerpoChat({ modelo: 'm' })).toThrow(/mensajes/);
  });
});

describe('prepararGuardadoHistorial', () => {
  test('con sesión, pregunta y respuesta: guardar = true', () => {
    expect(prepararGuardadoHistorial({ sessionId: 's1', pregunta: 'p', respuesta: 'r', requestId: 'req-1' })).toEqual({
      guardar: true, session_id: 's1', request_id: 'req-1', pregunta: 'p', respuesta: 'r',
    });
  });
  test('sin requestId genera un UUID distinto en cada llamada', () => {
    const a = prepararGuardadoHistorial({ sessionId: 's', pregunta: 'p', respuesta: 'r' }).request_id;
    const b = prepararGuardadoHistorial({ sessionId: 's', pregunta: 'p', respuesta: 'r' }).request_id;
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
  test('request_id nunca pasa de 64 caracteres (CHECK de la tabla)', () => {
    expect(prepararGuardadoHistorial({ sessionId: 's', pregunta: 'p', respuesta: 'r', requestId: 'x'.repeat(100) }).request_id).toHaveLength(64);
  });
  test('respuesta vacía: no se guarda nada (tampoco la pregunta sola)', () => {
    const r = prepararGuardadoHistorial({ sessionId: 's', pregunta: 'p', respuesta: '' });
    expect(r.guardar).toBe(false);
  });
  test('sin sessionId no se guarda', () => {
    expect(prepararGuardadoHistorial({ pregunta: 'p', respuesta: 'r' }).guardar).toBe(false);
  });
  test('sin pregunta o sin respuesta no se guarda', () => {
    expect(prepararGuardadoHistorial({ sessionId: 's', pregunta: '', respuesta: 'r' }).guardar).toBe(false);
    expect(prepararGuardadoHistorial({ sessionId: 's', pregunta: 'p', respuesta: '  ' }).guardar).toBe(false);
  });
  test('recorta a 4000 caracteres (límite de la tabla)', () => {
    const r = prepararGuardadoHistorial({ sessionId: 's', pregunta: 'p', respuesta: 'x'.repeat(5000) });
    expect(r.respuesta).toHaveLength(4000);
  });
  test('recorta el sessionId a 64', () => {
    expect(prepararGuardadoHistorial({ sessionId: 'a'.repeat(80), pregunta: 'p', respuesta: 'r' }).session_id).toHaveLength(64);
  });
});

describe('normalizarRequestId', () => {
  test('conserva el valor recibido (sin espacios)', () => {
    expect(normalizarRequestId('  abc ')).toBe('abc');
  });
  test('vacío, nulo o solo espacios generan UUID', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(normalizarRequestId(v)).toHaveLength(36);
    }
  });
});

describe('construirPromptUsuario — búsqueda semántica (textoRag)', () => {
  test('sin textoRag el prompt es idéntico al de siempre', () => {
    const sin = construirPromptUsuario(base);
    expect(construirPromptUsuario({ ...base, textoRag: '' })).toBe(sin);
    expect(construirPromptUsuario({ ...base, textoRag: '   ' })).toBe(sin);
    expect(construirPromptUsuario({ ...base, textoRag: undefined })).toBe(sin);
    expect(sin).not.toContain(ENCABEZADO_RAG);
  });

  test('con textoRag agrega el bloque entre los boletines del periodo y el clima', () => {
    const p = construirPromptUsuario({ ...base, textoRag: '--- Boletin SE 3-2025 ---\nDengue.' });
    expect(p).toContain(ENCABEZADO_RAG + '\n--- Boletin SE 3-2025 ---\nDengue.');
    expect(p.indexOf('BOLETIN')).toBeLessThan(p.indexOf(ENCABEZADO_RAG));
    expect(p.indexOf(ENCABEZADO_RAG)).toBeLessThan(p.indexOf('Datos climaticos'));
  });

  test('construirMensajesChat lo propaga al mensaje de usuario', () => {
    const m = construirMensajesChat({ ...base, textoRag: 'RAGTXT' });
    expect(m[m.length - 1].content).toContain('RAGTXT');
  });
});
