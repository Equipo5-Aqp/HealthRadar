// Datasets de casos (valores = lista cerrada que acepta el webhook /tendencia; ver validarFiltrosConsulta en core).
export const ENFERMEDADES = [
  { valor: 'dengue',          etiqueta: 'Dengue' },
  { valor: 'eda',             etiqueta: 'EDA' },
  { valor: 'ira_neumonia',    etiqueta: 'IRA · Neumonía' },
  { valor: 'ira_no_neumonia', etiqueta: 'IRA · No neumonía' },
]

// Los registros de casos por departamento llegan hasta 2024 (los de 2025 en adelante solo existen como boletines).
export const ANIO_MIN_CASOS = 2010
export const ANIO_MAX_CASOS = 2024
