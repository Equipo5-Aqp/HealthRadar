'use strict';
const { validarCredenciales, normalizarIp, normalizarUserAgent } = require('../credenciales');

describe('validarCredenciales', () => {
  test('normaliza el correo (trim + minúsculas) y deja la contraseña intacta', () => {
    expect(validarCredenciales({ email: '  Ana@Mail.COM ', password: ' Clave 123 ' }))
      .toEqual({ valido: true, email: 'ana@mail.com', password: ' Clave 123 ' });
  });
  test('cuerpo ausente o con tipos incorrectos', () => {
    for (const b of [undefined, null, 'x', 42, {}, { email: 'a@b.co' }, { password: 'x' },
      { email: 1, password: 'x' }, { email: 'a@b.co', password: 5 }, { email: ['a@b.co'], password: 'x' }]) {
      expect(validarCredenciales(b)).toEqual({ valido: false, codigo: 'FORMATO_INVALIDO' });
    }
  });
  test('correo con formato inválido o demasiado largo', () => {
    for (const e of ['', 'abc', 'a@b', 'a b@c.de', '@x.com', `${'a'.repeat(250)}@x.com`]) {
      expect(validarCredenciales({ email: e, password: 'x' }).valido).toBe(false);
    }
  });
  test('contraseña vacía o de más de 128 caracteres', () => {
    expect(validarCredenciales({ email: 'a@b.co', password: '' }).valido).toBe(false);
    expect(validarCredenciales({ email: 'a@b.co', password: 'x'.repeat(129) }).valido).toBe(false);
    expect(validarCredenciales({ email: 'a@b.co', password: 'x'.repeat(128) }).valido).toBe(true);
  });
  test('un resultado inválido no devuelve la contraseña', () => {
    const r = validarCredenciales({ email: 'malo', password: 'secreto-que-no-debe-salir' });
    expect(JSON.stringify(r)).not.toContain('secreto');
  });
});

describe('normalizarIp', () => {
  test('IPv4, IPv6 y X-Forwarded-For (primera)', () => {
    expect(normalizarIp('203.0.113.5')).toBe('203.0.113.5');
    expect(normalizarIp('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizarIp('203.0.113.5, 10.0.0.1')).toBe('203.0.113.5');
  });
  test('valores inválidos devuelven null', () => {
    for (const v of [undefined, null, 5, '', '  ', 'no-es-ip', "1.1.1.1'; DROP", 'a'.repeat(50)]) {
      expect(normalizarIp(v)).toBeNull();
    }
  });
});

describe('normalizarUserAgent', () => {
  test('recorta a 200 y quita caracteres de control', () => {
    expect(normalizarUserAgent('Mozilla\r\n/5.0')).toBe('Mozilla  /5.0');
    expect(normalizarUserAgent('x'.repeat(500))).toHaveLength(200);
  });
  test('vacío o no texto devuelve null', () => {
    for (const v of [undefined, null, 7, '', '   ', '\n\t']) expect(normalizarUserAgent(v)).toBeNull();
  });
});
