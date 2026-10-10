// Etiquetas legibles de las columnas de la base (id_caso_dengue, ubigeo, anio, semana…).
const ETIQUETAS = {
  id_caso_dengue: 'ID', id_caso_eda: 'ID', id_caso_ira: 'ID', id_caso_ira_nn: 'ID',
  ubigeo: 'Ubigeo', anio: 'Año', semana: 'Semana', id_diresa: 'DIRESA',
  enfermedad: 'Enfermedad', diagnostic: 'Diagnóstico', edad: 'Edad', tipo_edad: 'Tipo de edad', sexo: 'Sexo',
  grupo_etario: 'Grupo etario', episodios: 'Episodios', hospitalizados: 'Hospitalizados', defunciones: 'Defunciones',
  casos_neumonia: 'Casos de neumonía', casos: 'Casos',
}

// Códigos e identificadores: se muestran tal cual (sin separador de miles).
const SIN_FORMATO = new Set(['id_caso_dengue', 'id_caso_eda', 'id_caso_ira', 'id_caso_ira_nn', 'ubigeo', 'anio', 'semana', 'id_diresa', 'edad'])

export function etiquetaColumna(clave) {
  if (ETIQUETAS[clave]) return ETIQUETAS[clave]
  const t = String(clave).replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const esNumerica = (valor) => typeof valor === 'number' && Number.isFinite(valor)
export const formatearSinMiles = (clave) => SIN_FORMATO.has(clave)
