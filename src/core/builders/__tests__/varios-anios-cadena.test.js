// Prueba de la cadena completa del chat (los mismos pasos que los nodos de Conexion) con preguntas de varios años:
// pregunta → periodo → departamento/enfermedad → decisión → boletines + clima + tendencia → mensaje al modelo.
const core = require('../../index');

const {
  detectarPeriodo, resolverVentana, detectarDepartamento, detectarEnfermedad, decidirPrediccion,
  filtrarBoletines, filtrarClima, armarTextoTendencia, armarTextoTendenciaBoletines,
  construirContextoPrompt, construirMensajesChat,
} = core;

// Boletines procesados: 2025 SE 1..29 (con cifras acumuladas), como en producción hoy.
const resumenBoletin = (s) => `Resumen del boletin SE ${s}.\n[CIFRAS: dengue_total=${1000 * s}; eda_total=${30000 * s}; ira_total=${40000 * s}; ira_neumonias=${600 * s}]`;
const BOLETINES = Array.from({ length: 29 }, (_, i) => ({ anio: 2025, semana_epidemiologica: i + 1, resumen: resumenBoletin(i + 1) }));

// Clima: 2 departamentos por semana, 2015..2025 (2025 hasta la SE 29).
const CLIMA = [];
for (let anio = 2015; anio <= 2025; anio++) {
  for (let semana = 1; semana <= (anio === 2025 ? 29 : 52); semana++) {
    for (const dep of ['15', '20']) CLIMA.push({ anio, semana_epidemiologica: semana, id_departamento: dep, temp_max_promedio: '28.0', temp_min_promedio: '18.0', precipitacion_total: '3.0' });
  }
}

// Lo que devolvería Postgres para la consulta de tendencia: una fila por semana entre anio_desde y anio_hasta.
function filasPostgres(decision) {
  const filas = [];
  for (let anio = decision.anio_desde; anio <= decision.anio_hasta; anio++) {
    for (let semana = 1; semana <= 52; semana++) {
      if (anio * 100 + semana < decision.anio_desde * 100 + decision.semana_desde) continue;
      if (anio * 100 + semana > decision.anio_hasta * 100 + decision.semana_hasta) continue;
      filas.push({ enfermedad: 'dengue', anio, semana, total_casos: 100 + semana, temp_max_promedio: 28, temp_min_promedio: 18, precipitacion_total: 3, humedad_promedio: 70 });
    }
  }
  return filas;
}

// Replica la cadena de nodos de Conexion.
function correr(pregunta) {
  const deteccion = detectarPeriodo(pregunta);
  const periodo = resolverVentana(deteccion, BOLETINES);
  const depto = detectarDepartamento(pregunta);
  const enf = detectarEnfermedad(pregunta);
  const decision = decidirPrediccion(periodo, depto, enf);
  const boletines = filtrarBoletines(periodo, BOLETINES).filter(b => !b._sin_boletines);
  const clima = filtrarClima(periodo, CLIMA);
  let tendencia = decision.activar_prediccion ? armarTextoTendencia(decision, decision.activar_prediccion ? filasPostgres(decision).filter(f => enf.incluir_dengue) : []) : '';
  if (!tendencia) tendencia = armarTextoTendenciaBoletines(BOLETINES, periodo, enf);
  const ctx = construirContextoPrompt(boletines, clima, periodo, tendencia);
  const mensajes = construirMensajesChat({
    promptSistema: 'Eres un asistente de vigilancia epidemiologica.',
    criterioPeriodo: ctx.criterio_periodo, cantidadBoletines: ctx.cantidad_boletines,
    textoBoletines: ctx.texto_boletines, textoClima: ctx.texto_clima, textoTendencia: ctx.texto_tendencia, pregunta,
  });
  const prompt = mensajes[mensajes.length - 1].content;
  return { periodo, decision, boletines, clima, ctx, prompt };
}

describe('cadena del chat — "dengue en 2023 y 2024"', () => {
  const r = correr('dengue en 2023 y 2024');

  test('el periodo es el rango completo y no la ventana de 12 semanas', () => {
    expect(r.periodo).toMatchObject({ anio: null, anio_desde: 2023, anio_hasta: 2024, semana_desde: 1, semana_hasta: 53, rango_anios: true });
    expect(r.ctx.criterio_periodo).toBe('varios anios: 2023 a 2024');
  });

  test('se consulta Postgres de 2023 a 2024 a nivel nacional', () => {
    expect(r.decision).toMatchObject({ activar_prediccion: true, nivel_agregacion: 'nacional', anio_desde: 2023, anio_hasta: 2024, semana_desde: 1, semana_hasta: 53, rango_anios: true });
  });

  test('sin boletines de esos años: el modelo recibe el aviso, no boletines de 2025', () => {
    expect(r.boletines).toHaveLength(0);
    expect(r.ctx.cantidad_boletines).toBe(0);
    expect(r.prompt).toContain('No hay boletin epidemiologico con resumen disponible');
    expect(r.prompt).not.toContain('Boletin SE 29-2025');
  });

  test('la tendencia trae las 104 semanas y el total de cada año', () => {
    expect(r.ctx.texto_tendencia.split('\n').filter(l => l.startsWith('SE '))).toHaveLength(104);
    expect(r.ctx.texto_tendencia).toContain('Resumen por anio:');
    expect(r.ctx.texto_tendencia).toMatch(/2023: \d+ casos en el anio/);
    expect(r.ctx.texto_tendencia).toMatch(/2024: \d+ casos en el anio/);
  });

  test('el clima trae las 104 semanas de esos dos años (y nada de otros)', () => {
    const l = r.ctx.texto_clima.split('\n');
    expect(l).toHaveLength(104);
    expect(l.every(x => /-2023:|-2024:/.test(x))).toBe(true);
  });

  test('el mensaje al modelo tiene un tamaño razonable', () => {
    expect(r.prompt.length).toBeLessThan(30000);
  });
});

describe('cadena del chat — otras formas de pedirlo', () => {
  test('"compara 2023 con 2024 en Piura": mismo rango, filtrado a Piura', () => {
    const r = correr('compara el dengue de 2023 con 2024 en Piura');
    expect(r.periodo.rango_anios).toBe(true);
    expect(r.decision).toMatchObject({ nivel_agregacion: 'departamento', codigo_departamento: '20', anio_desde: 2023, anio_hasta: 2024 });
  });

  test('"de 2015 a 2024": 10 años, el mensaje NO crece con los años', () => {
    const r = correr('evolución del dengue de 2015 a 2024');
    expect(r.periodo).toMatchObject({ anio_desde: 2015, anio_hasta: 2024, rango_anios: true });
    expect(r.ctx.texto_tendencia).toContain('periodo de 10 anios');
    expect(r.ctx.texto_tendencia.split('\n').filter(l => /^\d{4}: /.test(l))).toHaveLength(10);
    expect(r.ctx.texto_clima.split('\n').filter(l => l.startsWith('Anio '))).toHaveLength(10);
    expect(r.prompt.length).toBeLessThan(12000);
  });

  test('"2024 y 2025": Postgres hasta 2024 + los boletines de 2025', () => {
    const r = correr('dengue en 2024 y 2025');
    expect(r.decision).toMatchObject({ activar_prediccion: true, anio_desde: 2024, anio_hasta: 2024 });
    expect(r.boletines).toHaveLength(29);
    expect(r.boletines.every(b => b.anio === 2025)).toBe(true);
    expect(r.ctx.texto_tendencia).not.toContain('Resumen por anio'); // las filas de Postgres son de un solo año
  });

  test('"2025 y 2026": solo boletines, la tendencia sale de los boletines', () => {
    const r = correr('dengue en 2025 y 2026');
    expect(r.decision.activar_prediccion).toBe(false);
    expect(r.boletines).toHaveLength(29);
    expect(r.ctx.texto_tendencia).toMatch(/^Tendencia historica de casos de Dengue a nivel nacional/);
    expect(r.ctx.texto_tendencia).toContain('SE 29-2025');
  });

  test('"2027 y 2028": sin datos, el aviso queda explícito y no se inventa tendencia', () => {
    const r = correr('dengue en 2027 y 2028');
    expect(r.boletines).toHaveLength(0);
    expect(r.ctx.texto_tendencia).toBe('');
    expect(r.prompt).toContain('No hay boletin epidemiologico con resumen disponible');
  });
});

describe('cadena del chat — lo de siempre no cambia', () => {
  test('un solo año (2024): misma tendencia semanal, sin resumen por año', () => {
    const r = correr('casos de dengue en 2024');
    expect(r.periodo.rango_anios).toBeUndefined();
    expect(r.decision.rango_anios).toBeUndefined();
    expect(r.ctx.texto_tendencia).not.toContain('Resumen por anio');
    expect(r.ctx.texto_tendencia.split('\n').filter(l => l.startsWith('SE '))).toHaveLength(52);
  });

  test('sin periodo: ventana de las últimas 12 semanas y boletines recientes', () => {
    const r = correr('cómo está el dengue');
    expect(r.periodo.criterio_usado).toBe('ventana por defecto: ultimas 12 semanas hasta SE 29-2025');
    expect(r.boletines).toHaveLength(12);
  });

  test('pregunta de malaria en 2025: boletines, pero sin tendencia (no habrá nivel de riesgo)', () => {
    const r = correr('casos de malaria en la SE 29 de 2025');
    expect(r.boletines).toHaveLength(1);
    expect(r.ctx.texto_tendencia).toBe('');
  });

  test('dengue en Piura publicado en 2024: el departamento es Piura, no Ica', () => {
    const r = correr('situación epidemiológica del dengue en Piura publicada para 2024');
    expect(r.decision).toMatchObject({ nivel_agregacion: 'departamento', codigo_departamento: '20' });
  });
});
