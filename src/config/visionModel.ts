import type { LayerType } from '../types/poster';

export interface VisionModelSettings {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  apiKey: string;
  configPath: string;
}

export function getVisionModelSettings(): VisionModelSettings {
  const baseUrl =
    import.meta.env.VITE_VISION_BASE_URL ||
    'https://dashscope.aliyuncs.com/compatible-mode/v1';
  return {
    enabled: import.meta.env.VITE_VISION_ENABLED === 'true',
    provider: import.meta.env.VITE_VISION_PROVIDER || 'aliyun',
    model: import.meta.env.VITE_VISION_MODEL || 'qwen3-vl-plus',
    baseUrl: import.meta.env.DEV
      ? '/dashscope-api/compatible-mode/v1'
      : baseUrl,
    maxTokens: Number(import.meta.env.VITE_VISION_MAX_TOKENS || '2000'),
    apiKey: import.meta.env.VITE_DASHSCOPE_API_KEY || '',
    configPath: import.meta.env.VITE_LLM_CONFIG_PATH || '~/.config/llm.yaml',
  };
}

export function isVisionModelConfigured(): boolean {
  const settings = getVisionModelSettings();
  return settings.enabled && Boolean(settings.apiKey);
}

export interface VisionSizeAnalysis {
  includedLayers: LayerType[];
  layoutHint: 'left-decor-right-text' | 'top-text-bottom-decor' | 'center-stack' | 'auto';
  description: string;
  reasoning?: string;
}
