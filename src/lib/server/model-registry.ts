import type { ModelPreset } from '@/lib/generation-contracts';

const internalModels = {
  auto: undefined,
  fast: 'gpt-5.4-mini',
  best: 'gpt-5.5',
} as const satisfies Record<ModelPreset, string | undefined>;

export function resolveModelPreset(preset: ModelPreset) {
  return internalModels[preset];
}
