import { defineConfig } from 'tsdown'

const clientExternals = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
])

export default defineConfig([
  {
    name: 'dsh-multica-onboarding/host',
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    dts: false,
    sourcemap: true,
    clean: true,
    deps: {
      neverBundle: () => false,
      alwaysBundle: () => true,
    },
    outputOptions: { entryFileNames: 'index.js' },
  },
  {
    name: 'dsh-multica-onboarding/client',
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: (specifier: string) => clientExternals.has(specifier),
      alwaysBundle: (specifier: string) => !clientExternals.has(specifier),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: "window.__ModuleLoader__.load({ id: 'dsh-multica-onboarding', factory: (require) => {",
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
