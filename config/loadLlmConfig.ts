import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

export interface ImageModelConfig {
  outpaintModel: string;
  expandModel: string;
  outpaintEndpoint: string;
  expandEndpoint: string;
  taskEndpoint: string;
  expandPrompt: string;
  pollIntervalMs: number;
  taskTimeoutMs: number;
}

export interface LlmConfig {
  provider: string;
  visionModel: string;
  visionBaseUrl: string;
  maxTokens: number;
  apiKey: string;
  configPath: string;
  enabled: boolean;
  image: ImageModelConfig;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function expandHome(filePath: string): string {
  return filePath.startsWith('~/') ? path.join(os.homedir(), filePath.slice(2)) : filePath;
}

function readYamlValue(content: string, key: string): string {
  const match = content.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
}

function readYamlListFirst(content: string, key: string): string {
  const block = content.match(new RegExp(`${key}:\\s*\\n(?:\\s*-\\s*(.+\\S)\\s*\\n?)+`, 'm'));
  if (block) {
    const item = block[0].match(/^\s*-\s*(.+)$/m);
    if (item?.[1]) return item[1].trim();
  }
  return readYamlValue(content, key);
}

function readYamlBlock(content: string, blockName: string): Record<string, string> {
  const match = content.match(new RegExp(`${blockName}:\\s*\\n((?:\\s+.+\n?)+)`));
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const item = line.match(/^\s+([\w_]+):\s*(.+)$/);
    if (item) result[item[1]] = item[2].trim();
  }
  return result;
}

function parseUserLlmYaml(content: string): { apiKey: string; model: string } {
  const apiKey = readYamlValue(content, 'api_key');
  const model = readYamlListFirst(content, 'model') || 'qwen3-vl-plus';
  return { apiKey, model };
}

/** 读取项目 config/llm.config.yaml + 用户 ~/.config/llm.yaml */
export function loadLlmConfig(): LlmConfig {
  const projectConfigPath = path.join(__dirname, 'llm.config.yaml');
  const projectRaw = fs.readFileSync(projectConfigPath, 'utf-8');
  const visionBlock = readYamlBlock(projectRaw, 'vision');
  const imageBlock = readYamlBlock(projectRaw, 'image');

  const configPath = expandHome(readYamlValue(projectRaw, 'config_path') || '~/.config/llm.yaml');
  const provider = visionBlock.provider || 'aliyun';
  const projectModel = visionBlock.model || 'qwen3-vl-plus';
  const baseUrl =
    visionBlock.base_url || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const maxTokens = Number(visionBlock.max_tokens || '2000');

  let apiKey = '';
  let userModel = projectModel;

  try {
    const userRaw = fs.readFileSync(configPath, 'utf-8');
    const parsed = parseUserLlmYaml(userRaw);
    apiKey = parsed.apiKey;
    if (parsed.model) userModel = parsed.model;
  } catch (error) {
    console.warn(`[PosterFlow] 无法读取 ${configPath}:`, (error as Error).message);
  }

  return {
    provider,
    visionModel: userModel,
    visionBaseUrl: baseUrl,
    maxTokens,
    apiKey,
    configPath,
    enabled: Boolean(apiKey),
    image: {
      outpaintModel: imageBlock.outpaint_model || 'wan2.7-image',
      expandModel: imageBlock.expand_model || 'wan2.7-image',
      outpaintEndpoint:
        imageBlock.outpaint_endpoint || '/api/v1/services/aigc/image2image/out-painting',
      expandEndpoint:
        imageBlock.expand_endpoint || '/api/v1/services/aigc/image2image/image-synthesis',
      taskEndpoint: imageBlock.task_endpoint || '/api/v1/tasks',
      expandPrompt:
        imageBlock.expand_prompt ||
        '基于主海报提取的纯装饰/背景区域做尺寸适配与背景延展。严格保持原海报的品牌调性、色彩、光影、材质和装饰元素风格一致；只自然补全边缘背景与空白区域，让画面适配目标尺寸。输入图不含文字、Logo、产品、人物；不要新增、改写或复制任何文字、Logo、产品、人物、按钮或图形元素；不要改变已有主体内容，不要生成边框、水印、伪影。',
      pollIntervalMs: Number(imageBlock.poll_interval_ms || '2500'),
      taskTimeoutMs: Number(imageBlock.task_timeout_ms || '120000'),
    },
  };
}

/** @deprecated use loadLlmConfig */
export function loadVisionModelConfig() {
  const config = loadLlmConfig();
  return {
    provider: config.provider,
    model: config.visionModel,
    baseUrl: config.visionBaseUrl,
    maxTokens: config.maxTokens,
    apiKey: config.apiKey,
    configPath: config.configPath,
    enabled: config.enabled,
  };
}
