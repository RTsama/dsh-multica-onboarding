import type { ComponentType } from 'react'
import { MulticaOnboarding } from './Onboarding.js'
import { MulticaSettings } from './Settings.js'
import { installStyles } from './styles.js'

export const inject = ['slots']

interface SlotContext {
  effect(callback: () => (() => void), label?: string): void
  slots: {
    inject(name: string, callback: () => (() => void)): () => void
    register(
      options: { name: string; id: string; order?: number; label?: string },
      component: ComponentType<any>,
    ): () => void
  }
}

export function apply(ctx: SlotContext): void {
  ctx.effect(installStyles, 'dsh-multica-onboarding: stylesheet')
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'multica',
    order: 10,
  }, MulticaOnboarding))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'multica',
    order: 30,
    label: 'Multica',
  }, MulticaSettings))
}
