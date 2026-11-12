import { generateKeyPairSync } from 'node:crypto';

const jwt = require('jsonwebtoken');

describe('JWT authentication on the pinned Node runtime', () => {
  const secret = 'disposable-node-runtime-test-secret';

  it('signs and verifies HMAC tokens and rejects changed signatures and keys', () => {
    const token = jwt.sign({ sub: 'fixture-admin' }, secret, { algorithm: 'HS256' });
    expect(jwt.verify(token, secret, { algorithms: ['HS256'] }).sub).toBe('fixture-admin');
    const [header, payload, signature] = token.split('.');
    const changed = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
    expect(() => jwt.verify(`${header}.${payload}.${changed}`, secret)).toThrow('invalid signature');
    expect(() => jwt.verify(`${header}.${payload}.AA`, secret)).toThrow('invalid signature');
    expect(() => jwt.verify(token, 'wrong-key')).toThrow('invalid signature');
  });

  it('rejects expired tokens and an unexpected signing algorithm', () => {
    const expired = jwt.sign({ sub: 'fixture-admin', exp: 1 }, secret);
    expect(() => jwt.verify(expired, secret)).toThrow('jwt expired');
    const token = jwt.sign({ sub: 'fixture-admin' }, secret);
    expect(() => jwt.verify(token, secret, { algorithms: ['RS256'] })).toThrow('invalid algorithm');
  });

  it.each(['RS256', 'ES256'])('verifies %s using Node crypto keys', (algorithm) => {
    const keys = algorithm === 'RS256'
      ? generateKeyPairSync('rsa', { modulusLength: 2048 })
      : generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const token = jwt.sign({ sub: 'fixture-admin' }, keys.privateKey, { algorithm });
    expect(jwt.verify(token, keys.publicKey, { algorithms: [algorithm] }).sub).toBe('fixture-admin');
  });
});
