// Descarga un texto como archivo .csv desde el navegador (no pasa por el servidor).
// El BOM (﻿) al inicio hace que Excel abra el archivo como UTF-8 y se vean bien las tildes y la ñ.
export function descargarCsv(texto, nombre) {
  const url = URL.createObjectURL(new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
