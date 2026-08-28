import { spawn as nodeSpawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process'

const MAX_CAPTURE_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 15_000

export interface CommandSpec {
  executable: string
  args: readonly string[]
  stdin?: string
  timeoutMs?: number
}

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export type SpawnProcess = (
  executable: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams

export class CommandError extends Error {
  constructor(
    readonly kind: 'not_found' | 'timeout' | 'failed' | 'output_limit',
    readonly exitCode?: number,
  ) {
    super(`command ${kind}`)
  }
}

function appendLimited(current: Buffer[], chunk: Buffer, size: { value: number }): void {
  size.value += chunk.length
  if (size.value > MAX_CAPTURE_BYTES) throw new CommandError('output_limit')
  current.push(chunk)
}

/** Execute one fixed binary without a shell. Sensitive input is accepted only through stdin. */
export function runCommand(spec: CommandSpec, spawnProcess: SpawnProcess = nodeSpawn): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawnProcess(spec.executable, [...spec.args], {
        env: process.env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      reject(new CommandError('not_found'))
      return
    }

    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const stdoutSize = { value: 0 }
    const stderrSize = { value: 0 }
    let settled = false
    let outputFailure: CommandError | undefined

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new CommandError('timeout'))
    }, spec.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    timer.unref()

    const capture = (target: Buffer[], size: { value: number }, chunk: Buffer): void => {
      if (outputFailure !== undefined) return
      try {
        appendLimited(target, chunk, size)
      } catch (error) {
        outputFailure = error as CommandError
        child.kill('SIGKILL')
      }
    }
    child.stdout.on('data', (chunk: Buffer) => { capture(stdout, stdoutSize, chunk) })
    child.stderr.on('data', (chunk: Buffer) => { capture(stderr, stderrSize, chunk) })
    child.once('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new CommandError('not_found'))
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (outputFailure !== undefined) {
        reject(outputFailure)
        return
      }
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      })
    })

    if (spec.stdin === undefined) child.stdin.end()
    else child.stdin.end(spec.stdin, 'utf8')
  })
}
