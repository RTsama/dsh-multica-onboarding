import { describe, expect, it } from 'vitest'
import { normalizeApiUrl, parseConfigureRequest, validateToken } from '../src/host/validation.js'

describe('configuration validation', () => {
  it('normalizes supported API URLs', () => {
    expect(normalizeApiUrl('https://multica.nevis.sina.com.cn/')).toBe('https://multica.nevis.sina.com.cn')
    expect(normalizeApiUrl('http://127.0.0.1:8080/api/')).toBe('http://127.0.0.1:8080/api')
  })

  it.each([
    'file:///tmp/server',
    'https://user:secret@example.com',
    'https://example.com?token=x',
    'https://example.com/#secret',
    'not-a-url',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => normalizeApiUrl(url)).toThrow()
  })

  it.each(['mul_12345678', 'mcn_abcdefghi'])('accepts supported token shape %s', (token) => {
    expect(validateToken(token)).toBe(token)
  })

  it.each(['abc_12345678', 'mul_x', 'mul_has space', 'mul_has\nline'])('rejects token %s', (token) => {
    expect(() => validateToken(token)).toThrow()
  })

  it('requires an explicit daemon choice', () => {
    expect(() => parseConfigureRequest({ serverUrl: 'https://example.com', appUrl: 'https://app.example.com', workspace: '', token: 'mul_12345678' })).toThrow()
    expect(parseConfigureRequest({
      serverUrl: 'https://example.com',
      appUrl: 'https://app.example.com',
      workspace: 'team',
      token: 'mul_12345678',
      startDaemon: false,
    })).toEqual({
      serverUrl: 'https://example.com',
      appUrl: 'https://app.example.com',
      workspace: 'team',
      token: 'mul_12345678',
      startDaemon: false,
    })
  })
})
