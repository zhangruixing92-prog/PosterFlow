import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { loadLlmConfig } from './config/loadLlmConfig';

const llm = loadLlmConfig();

if (!llm.enabled) {
  console.warn(`[PosterFlow] 未找到 API Key，AI 生成未启用。请配置 ${llm.configPath}`);
}

/** 把模型返回的 OSS 结果图通过本地代理下载，绕过其无 CORS 头的限制 */
function imageProxyPlugin(): Plugin {
  return {
    name: 'posterflow-img-proxy',
    configureServer(server) {
      server.middlewares.use('/img-proxy', async (req, res) => {
        const target = new URL(req.url ?? '', 'http://localhost').searchParams.get('url');
        if (!target) {
          res.statusCode = 400;
          res.end('missing url');
          return;
        }
        try {
          const upstream = await fetch(target);
          const buffer = Buffer.from(await upstream.arrayBuffer());
          res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/png');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(buffer);
        } catch (error) {
          res.statusCode = 502;
          res.end(`proxy error: ${(error as Error).message}`);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), imageProxyPlugin()],
  server: {
    port: 5000,
    strictPort: true,
    proxy: {
      '/dashscope-api': {
        target: 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dashscope-api/, ''),
      },
    },
  },
  define: {
    'import.meta.env.VITE_AI_ENABLED': JSON.stringify(String(llm.enabled)),
    'import.meta.env.VITE_VISION_ENABLED': JSON.stringify(String(llm.enabled)),
    'import.meta.env.VITE_VISION_PROVIDER': JSON.stringify(llm.provider),
    'import.meta.env.VITE_VISION_MODEL': JSON.stringify(llm.visionModel),
    'import.meta.env.VITE_VISION_BASE_URL': JSON.stringify(llm.visionBaseUrl),
    'import.meta.env.VITE_VISION_MAX_TOKENS': JSON.stringify(String(llm.maxTokens)),
    'import.meta.env.VITE_DASHSCOPE_API_KEY': JSON.stringify(llm.apiKey),
    'import.meta.env.VITE_LLM_CONFIG_PATH': JSON.stringify(llm.configPath),
    'import.meta.env.VITE_IMAGE_OUTPAINT_MODEL': JSON.stringify(llm.image.outpaintModel),
    'import.meta.env.VITE_IMAGE_EXPAND_MODEL': JSON.stringify(llm.image.expandModel),
    'import.meta.env.VITE_IMAGE_OUTPAINT_ENDPOINT': JSON.stringify(llm.image.outpaintEndpoint),
    'import.meta.env.VITE_IMAGE_EXPAND_ENDPOINT': JSON.stringify(llm.image.expandEndpoint),
    'import.meta.env.VITE_IMAGE_TASK_ENDPOINT': JSON.stringify(llm.image.taskEndpoint),
    'import.meta.env.VITE_IMAGE_EXPAND_PROMPT': JSON.stringify(llm.image.expandPrompt),
    'import.meta.env.VITE_IMAGE_POLL_INTERVAL_MS': JSON.stringify(String(llm.image.pollIntervalMs)),
    'import.meta.env.VITE_IMAGE_TASK_TIMEOUT_MS': JSON.stringify(String(llm.image.taskTimeoutMs)),
  },
});
