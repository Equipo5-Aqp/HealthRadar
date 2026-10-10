// Proyección equirrectangular escalada por cos(latitud media): suficiente para un país entero y sin librerías.
// Funciones puras: GeoJSON → trazos SVG. Se ejecuta en el navegador.

const polis = (geom) => (geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates])

export function construirMapa(geojson, alto = 640) {
  let lon0 = Infinity, lon1 = -Infinity, lat0 = Infinity, lat1 = -Infinity
  for (const f of geojson.features)
    for (const p of polis(f.geometry))
      for (const anillo of p)
        for (const [lon, lat] of anillo) {
          if (lon < lon0) lon0 = lon
          if (lon > lon1) lon1 = lon
          if (lat < lat0) lat0 = lat
          if (lat > lat1) lat1 = lat
        }
  const k = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180)
  const s = alto / (lat1 - lat0)
  const ancho = (lon1 - lon0) * k * s
  const fx = (lon) => ((lon - lon0) * k * s).toFixed(1)
  const fy = (lat) => ((lat1 - lat) * s).toFixed(1)

  const deps = geojson.features.map((f) => ({
    codigo: f.properties.codigo,
    nombre: f.properties.nombre,
    d: polis(f.geometry)
      .map((p) => p.map((anillo) => 'M' + anillo.map(([lon, lat]) => `${fx(lon)},${fy(lat)}`).join('L') + 'Z').join(''))
      .join(''),
  }))
  return { ancho: Math.round(ancho), alto, deps }
}
