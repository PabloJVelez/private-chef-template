const { transformSync } = require('@swc/core');
module.exports = { process(source, filename) { return transformSync(source, {
  filename, jsc: { target: 'es2020', parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' }, sourceMaps: 'inline',
}); } };
