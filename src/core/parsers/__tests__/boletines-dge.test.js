'use strict';
const { extraerLinksBoletines } = require('../boletines-dge');

const fila = (archivo, semana, fecha, veces = 2) => {
  const link = `<a href='https://epipublic.dge.gob.pe/uploads/boletin/${archivo}'>x</a>`;
  return `<tr><td>${link.repeat(veces)}</td><td><span class='periodoVal'>${semana}</span></td>` +
    `<td>${fecha === null ? '' : 'fecha publicacion: ' + fecha}</td></tr>`;
};

describe('extraerLinksBoletines', () => {
  test('extrae url, semana (del periodoVal) y fecha ISO; deduplica el link repetido', () => {
    const html = fila('boletin_2026_10.pdf', 10, '12-04-2026');
    expect(extraerLinksBoletines(html, 2026)).toEqual([{
      url_boletin: 'https://epipublic.dge.gob.pe/uploads/boletin/boletin_2026_10.pdf',
      anio: 2026, semana_epidemiologica: 10, fecha_publicacion: '2026-04-12',
    }]);
  });

  test('la semana sale del periodoVal aunque el nombre del PDF no la traiga', () => {
    const html = fila('boletin_2026_30_112436.pdf', 30, '27-07-2026');
    expect(extraerLinksBoletines(html, 2026)[0].semana_epidemiologica).toBe(30);
  });

  test('semana de un solo dígito', () => {
    expect(extraerLinksBoletines(fila('boletin_20269.pdf', 9, '01-03-2026'), 2026)[0].semana_epidemiologica).toBe(9);
  });

  test('varias filas, en el orden del HTML', () => {
    const html = fila('boletin_a.pdf', 3, '20-01-2026') + fila('boletin_b.pdf', 2, '13-01-2026');
    expect(extraerLinksBoletines(html, 2026).map((b) => b.semana_epidemiologica)).toEqual([3, 2]);
  });

  test('descarta la fila repetida con la misma URL en otra fila', () => {
    const html = fila('boletin_a.pdf', 3, '20-01-2026') + fila('boletin_a.pdf', 3, '20-01-2026');
    expect(extraerLinksBoletines(html, 2026)).toHaveLength(1);
  });

  test('fecha ausente o imposible → null', () => {
    expect(extraerLinksBoletines(fila('boletin_a.pdf', 3, null), 2026)[0].fecha_publicacion).toBeNull();
    expect(extraerLinksBoletines(fila('boletin_a.pdf', 3, '31-02-2026'), 2026)[0].fecha_publicacion).toBeNull();
    expect(extraerLinksBoletines(fila('boletin_a.pdf', 3, '10-13-2026'), 2026)[0].fecha_publicacion).toBeNull();
  });

  test('descarta filas sin link válido, sin semana o con semana imposible', () => {
    const sinSemana = `<tr><a href='https://epipublic.dge.gob.pe/uploads/boletin/boletin_x.pdf'>x</a></tr>`;
    const sinLink = `<tr><span class='periodoVal'>4</span></tr>`;
    const otroDominio = `<tr><a href='https://malicioso.example/uploads/boletin/boletin_x.pdf'>x</a><span class='periodoVal'>4</span></tr>`;
    const noPdf = `<tr><a href='https://epipublic.dge.gob.pe/uploads/boletin/boletin_x.doc'>x</a><span class='periodoVal'>4</span></tr>`;
    const s0 = fila('boletin_c.pdf', 0, '01-01-2026');
    const s54 = fila('boletin_d.pdf', 54, '01-01-2026').replace('>54<', '>54<');
    expect(extraerLinksBoletines(sinSemana + sinLink + otroDominio + noPdf + s0 + s54, 2026)).toEqual([]);
  });

  test('entrada no-string o sin filas → []', () => {
    expect(extraerLinksBoletines(undefined, 2026)).toEqual([]);
    expect(extraerLinksBoletines(null, 2026)).toEqual([]);
    expect(extraerLinksBoletines({ data: 'x' }, 2026)).toEqual([]);
    expect(extraerLinksBoletines('<html>sin tablas</html>', 2026)).toEqual([]);
    expect(extraerLinksBoletines('', 2026)).toEqual([]);
  });
});
