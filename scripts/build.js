const { spawnSync } = require('child_process')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
const demoDir = path.join(rootDir, 'demo')
const webpackCli = require.resolve('webpack/bin/webpack.js')

const inheritedNodeOptions = process.env.NODE_OPTIONS || ''
const legacyFlag = '--openssl-legacy-provider'
const nodeOptions = inheritedNodeOptions.includes(legacyFlag)
  ? inheritedNodeOptions
  : [inheritedNodeOptions, legacyFlag].filter(Boolean).join(' ')

const result = spawnSync(
  process.execPath,
  [
    webpackCli,
    '--config',
    'webpack.config.js',
    '--env.production',
  ],
  {
    cwd: demoDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
    },
  }
)

if (result.error) {
  throw result.error
}

process.exit(result.status === null ? 1 : result.status)
