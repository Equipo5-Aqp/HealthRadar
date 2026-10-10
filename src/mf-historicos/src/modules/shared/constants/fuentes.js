// Fuentes de información = las 4 tablas de casos que valida el core (validarFiltrosConsulta).
export const FUENTES = [
  { valor: 'dengue',          etiqueta: 'Dengue' },
  { valor: 'eda',             etiqueta: 'EDA' },
  { valor: 'ira_neumonia',    etiqueta: 'IRA · Neumonía' },
  { valor: 'ira_no_neumonia', etiqueta: 'IRA · No neumonía' },
]

// Los casos por departamento llegan solo hasta 2024 (el flujo no tiene 2025–2026 a ese nivel).
export const ANIO_MIN_CASOS = 2010
export const ANIO_MAX_CASOS = 2024

export const etiquetaFuente = (valor) => FUENTES.find((f) => f.valor === valor)?.etiqueta || ''
