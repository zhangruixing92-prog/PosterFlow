export interface ImageModelSettings {
  provider: string;
  outpaintModel: string;
  expandModel: string;
  baseUrl: string;
  generationEndpoint: string;
  editEndpoint: string;
  resolution: string;
  outpaintEndpoint: string;
  expandEndpoint: string;
  taskEndpoint: string;
  expandPrompt: string;
  pollIntervalMs: number;
  taskTimeoutMs: number;
  apiKey: string;
}

export interface AiModelSettings {
  enabled: boolean;
  apiKey: string;
  configPath: string;
  vision: {
    provider: string;
    model: string;
    baseUrl: string;
    maxTokens: number;
  };
  image: ImageModelSettings;
}

export function getAiModelSettings(): AiModelSettings {
  return {
    enabled: import.meta.env.VITE_AI_ENABLED === 'true',
    apiKey: import.meta.env.VITE_DASHSCOPE_API_KEY || '',
    configPath: import.meta.env.VITE_LLM_CONFIG_PATH || '~/.config/llm.yaml',
    vision: {
      provider: import.meta.env.VITE_VISION_PROVIDER || 'aliyun',
      model: import.meta.env.VITE_VISION_MODEL || 'qwen3-vl-plus',
      baseUrl:
        import.meta.env.VITE_VISION_BASE_URL ||
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
      maxTokens: Number(import.meta.env.VITE_VISION_MAX_TOKENS || '2000'),
    },
    image: {
      provider: import.meta.env.VITE_IMAGE_PROVIDER || 'yhmx',
      outpaintModel: import.meta.env.VITE_IMAGE_OUTPAINT_MODEL || 'gpt-image-2-all',
      expandModel: import.meta.env.VITE_IMAGE_EXPAND_MODEL || 'gpt-image-2-all',
      baseUrl: import.meta.env.VITE_IMAGE_BASE_URL || 'https://yhmx.work',
      generationEndpoint:
        import.meta.env.VITE_IMAGE_GENERATION_ENDPOINT || '/v1/images/generations',
      editEndpoint: import.meta.env.VITE_IMAGE_EDIT_ENDPOINT || '/v1/images/edits',
      resolution: import.meta.env.VITE_IMAGE_RESOLUTION || '2k',
      outpaintEndpoint:
        import.meta.env.VITE_IMAGE_OUTPAINT_ENDPOINT || '/v1/images/generations',
      expandEndpoint:
        import.meta.env.VITE_IMAGE_EXPAND_ENDPOINT || '/v1/images/generations',
      taskEndpoint: import.meta.env.VITE_IMAGE_TASK_ENDPOINT || '/api/v1/tasks',
      expandPrompt:
        import.meta.env.VITE_IMAGE_EXPAND_PROMPT ||
        '基于主海报提取的纯装饰/背景区域做尺寸适配与背景延展。严格保持原海报的品牌调性、色彩、光影、材质和装饰元素风格一致；只自然补全边缘背景与空白区域，让画面适配目标尺寸。输入图不含文字、Logo、产品、人物；不要新增、改写或复制任何文字、Logo、产品、人物、按钮或图形元素；不要改变已有主体内容，不要生成边框、水印、伪影。',
      pollIntervalMs: Number(import.meta.env.VITE_IMAGE_POLL_INTERVAL_MS || '2500'),
      taskTimeoutMs: Number(import.meta.env.VITE_IMAGE_TASK_TIMEOUT_MS || '120000'),
      apiKey: import.meta.env.VITE_IMAGE_API_KEY || '',
    },
  };
}

export function isAiEnabled(): boolean {
  const settings = getAiModelSettings();
  return settings.enabled && Boolean(settings.apiKey) && Boolean(settings.image.apiKey);
}

/** 开发环境走 Vite 代理，避免 CORS */
export function getDashScopeRoot(): string {
  return import.meta.env.DEV ? '/dashscope-api' : 'https://dashscope.aliyuncs.com';
}

/** 图生图网关（yhmx） */
export function getImageApiRoot(): string {
  const { baseUrl } = getAiModelSettings().image;
  if (import.meta.env.DEV) return '/yhmx-api';
  return baseUrl.replace(/\/$/, '');
}
