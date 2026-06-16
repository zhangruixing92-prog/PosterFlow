import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

export interface ImageModelConfig {
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

function readYamlSection(content: string, sectionName: string): string {
  const match = content.match(new RegExp(`^${sectionName}:\\s*\\n((?:[ \\t].+\\n?)+)`, 'm'));
  return match?.[1] ?? '';
}

function parseUserLlmYaml(content: string): { apiKey: string; model: string } {
  const aliyunBlock = readYamlSection(content, 'aliyun');
  const apiKey = readYamlValue(aliyunBlock, 'api_key') || readYamlValue(content, 'api_key');
  const model =
    readYamlListFirst(aliyunBlock, 'model') || readYamlListFirst(content, 'model') || 'qwen3-vl-plus';
  return { apiKey, model };
}

function parseYhmxConfig(content: string): { apiKey: string; baseUrl: string } {
  const yhmxBlock = readYamlSection(content, 'yhmx');
  return {
    apiKey: readYamlValue(yhmxBlock, 'api_key'),
    baseUrl: readYamlValue(yhmxBlock, 'base_url') || 'https://yhmx.work',
  };
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
  let yhmxApiKey = '';
  let yhmxBaseUrl = imageBlock.base_url || 'https://yhmx.work';

  try {
    const userRaw = fs.readFileSync(configPath, 'utf-8');
    const parsed = parseUserLlmYaml(userRaw);
    apiKey = parsed.apiKey;
    if (parsed.model) userModel = parsed.model;
    const yhmx = parseYhmxConfig(userRaw);
    yhmxApiKey = yhmx.apiKey;
    if (yhmx.baseUrl) yhmxBaseUrl = yhmx.baseUrl;
  } catch (error) {
    console.warn(`[PosterFlow] 无法读取 ${configPath}:`, (error as Error).message);
  }

  const imageProvider = imageBlock.provider || 'yhmx';
  const imageApiKey = imageProvider === 'yhmx' ? yhmxApiKey : apiKey;

  return {
    provider,
    visionModel: userModel,
    visionBaseUrl: baseUrl,
    maxTokens,
    apiKey,
    configPath,
    enabled: Boolean(apiKey) && Boolean(imageApiKey),
    image: {
      provider: imageProvider,
      outpaintModel: imageBlock.outpaint_model || 'gpt-image-2-all',
      expandModel: imageBlock.expand_model || 'gpt-image-2-all',
      baseUrl: yhmxBaseUrl,
      generationEndpoint: imageBlock.generation_endpoint || '/v1/images/generations',
      editEndpoint: imageBlock.edit_endpoint || '/v1/images/edits',
      resolution: imageBlock.resolution || '2k',
      outpaintEndpoint: imageBlock.outpaint_endpoint || '/v1/images/generations',
      expandEndpoint: imageBlock.expand_endpoint || '/v1/images/generations',
      taskEndpoint: imageBlock.task_endpoint || '/api/v1/tasks',
      expandPrompt:
        imageBlock.expand_prompt ||
        '基于主海报提取的纯装饰/背景区域做尺寸适配与背景延展。严格保持原海报的品牌调性、色彩、光影、材质和装饰元素风格一致；只自然补全边缘背景与空白区域，让画面适配目标尺寸。输入图不含文字、Logo、产品、人物；不要新增、改写或复制任何文字、Logo、产品、人物、按钮或图形元素；不要改变已有主体内容，不要生成边框、水印、伪影。',
      pollIntervalMs: Number(imageBlock.poll_interval_ms || '2500'),
      taskTimeoutMs: Number(imageBlock.task_timeout_ms || '120000'),
      apiKey: imageApiKey,
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
