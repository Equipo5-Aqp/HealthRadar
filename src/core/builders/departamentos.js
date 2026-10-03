// @healthradar/core — builders/departamentos.js
// ─────────────────────────────────────────────────────────
// Fase B: los 25 puntos (departamentos) para los que se pide clima a Open-Meteo.
// Coordenadas = centroides de la migración 005 (departamento.latitud/longitud).
// fn_insertar_dato_climatico resuelve el departamento por cercanía a estas coordenadas,
// por eso Callao y Lima son puntos DISTINTOS (nunca se clona uno del otro).

'use strict';

const DEPARTAMENTOS_COORDENADAS = Object.freeze([
  { codigo: '01', departamento: 'Amazonas', latitud: -6.23, longitud: -77.87 },
  { codigo: '02', departamento: 'Áncash', latitud: -9.53, longitud: -77.53 },
  { codigo: '03', departamento: 'Apurímac', latitud: -13.63, longitud: -72.88 },
  { codigo: '04', departamento: 'Arequipa', latitud: -16.4, longitud: -71.54 },
  { codigo: '05', departamento: 'Ayacucho', latitud: -13.16, longitud: -74.22 },
  { codigo: '06', departamento: 'Cajamarca', latitud: -7.16, longitud: -78.51 },
  { codigo: '07', departamento: 'Callao', latitud: -12.05, longitud: -77.12 },
  { codigo: '08', departamento: 'Cusco', latitud: -13.53, longitud: -71.97 },
  { codigo: '09', departamento: 'Huancavelica', latitud: -12.78, longitud: -74.97 },
  { codigo: '10', departamento: 'Huánuco', latitud: -9.93, longitud: -76.24 },
  { codigo: '11', departamento: 'Ica', latitud: -14.07, longitud: -75.73 },
  { codigo: '12', departamento: 'Junín', latitud: -12.07, longitud: -75.21 },
  { codigo: '13', departamento: 'La Libertad', latitud: -8.11, longitud: -79.03 },
  { codigo: '14', departamento: 'Lambayeque', latitud: -6.77, longitud: -79.84 },
  { codigo: '15', departamento: 'Lima', latitud: -12.05, longitud: -77.04 },
  { codigo: '16', departamento: 'Loreto', latitud: -3.75, longitud: -73.25 },
  { codigo: '17', departamento: 'Madre de Dios', latitud: -12.6, longitud: -69.19 },
  { codigo: '18', departamento: 'Moquegua', latitud: -17.19, longitud: -70.93 },
  { codigo: '19', departamento: 'Pasco', latitud: -10.68, longitud: -76.26 },
  { codigo: '20', departamento: 'Piura', latitud: -5.19, longitud: -80.63 },
  { codigo: '21', departamento: 'Puno', latitud: -15.84, longitud: -70.02 },
  { codigo: '22', departamento: 'San Martín', latitud: -6.49, longitud: -76.37 },
  { codigo: '23', departamento: 'Tacna', latitud: -18.01, longitud: -70.25 },
  { codigo: '24', departamento: 'Tumbes', latitud: -3.57, longitud: -80.45 },
  { codigo: '25', departamento: 'Ucayali', latitud: -8.38, longitud: -74.55 },
]);

/**
 * @param {{anio?:number, semana_epidemiologica?:number, fecha_inicio?:string, fecha_fin?:string}} [rango]
 *   Datos de la semana; se copian a cada departamento para el siguiente nodo.
 * @returns {object[]} 25 elementos: { codigo, departamento, latitud, longitud, ...rango }
 */
function generarDepartamentos(rango = {}) {
  const { anio, semana_epidemiologica, fecha_inicio, fecha_fin } = rango;
  return DEPARTAMENTOS_COORDENADAS.map((d) => ({
    ...d, anio, semana_epidemiologica, fecha_inicio, fecha_fin,
  }));
}

module.exports = { generarDepartamentos, DEPARTAMENTOS_COORDENADAS };
