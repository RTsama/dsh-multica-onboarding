import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('DSH package contract', () => {
  it('pins every DSH peer to rc.2 and marks peers optional', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      peerDependencies: Record<string, string>
      peerDependenciesMeta: Record<string, { optional?: boolean }>
      dsh: { client: { inject: string[]; platform: string } }
    }
    for (const [name, version] of Object.entries(pkg.peerDependencies)) {
      if (name.startsWith('@deepseek-ai/dsh-')) expect(version).toBe('0.1.1-rc.2')
      expect(pkg.peerDependenciesMeta[name]?.optional).toBe(true)
    }
    expect(pkg.dsh.client).toEqual({
      inject: ['@deepseek-ai/dsh-client-ui-settings'],
      platform: 'web',
    })
  })
})
