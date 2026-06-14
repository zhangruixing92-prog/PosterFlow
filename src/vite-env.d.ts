/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_ENABLED: string;
  readonly VITE_VISION_ENABLED: string;
  readonly VITE_VISION_PROVIDER: string;
  readonly VITE_VISION_MODEL: string;
  readonly VITE_VISION_BASE_URL: string;
  readonly VITE_VISION_MAX_TOKENS: string;
  readonly VITE_DASHSCOPE_API_KEY: string;
  readonly VITE_LLM_CONFIG_PATH: string;
  readonly VITE_IMAGE_OUTPAINT_MODEL: string;
  readonly VITE_IMAGE_EXPAND_MODEL: string;
  readonly VITE_IMAGE_OUTPAINT_ENDPOINT: string;
  readonly VITE_IMAGE_EXPAND_ENDPOINT: string;
  readonly VITE_IMAGE_TASK_ENDPOINT: string;
  readonly VITE_IMAGE_EXPAND_PROMPT: string;
  readonly VITE_IMAGE_POLL_INTERVAL_MS: string;
  readonly VITE_IMAGE_TASK_TIMEOUT_MS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
