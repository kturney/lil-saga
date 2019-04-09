/* eslint-disable @typescript-eslint/no-var-requires */
const typescript = require('rollup-plugin-typescript2');
const pkg = require('./package.json');
/* eslint-enable @typescript-eslint/no-var-requires */

module.exports = {
  input: 'src/lil-saga.ts',
  output: [
    {
      file: pkg.main,
      format: 'cjs'
    },
    {
      file: pkg.module,
      format: 'es'
    }
  ],
  external: [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {})
  ],
  plugins: [
    typescript({
      cacheRoot: require('path').join(require('os').tmpdir(), '.rpt2_cache'),
      typescript: require('typescript')
    })
  ]
};
