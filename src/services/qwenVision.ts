import { getVisionModelSettings, type VisionSizeAnalysis } from '../config/visionModel';
import type { LayerType, PlannedBox, SizeFamily } from '../types/poster';
import { LAYER_TYPE_LABELS } from '../types/poster';
import { describeError, logger } from '../utils/logger';

const VALID_LAYER_TYPES: LayerType[] = ['logo', 'title', 'subtitle', 'subject', 'cta'];
const VALID_LAYOUT_HINTS = [
  'left-decor-right-text',
  'top-text-bottom-decor',
  'center-stack',
  'auto',
] as const;

function parseJSONSafe<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (fenced) return JSON.parse(fenced[1]) as T;
    const objectMatch = text.match(/\{[\s\S]+\}/);
    if (objectMatch) return JSON.parse(objectMatch[0]) as T;
    throw new Error('模型返回格式无法解析');
  }
}

function normalizeLayerTypes(raw: unknown): LayerType[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is LayerType =>
    typeof item === 'string' && VALID_LAYER_TYPES.includes(item as LayerType),
  );
}

function normalizeLayoutHint(raw: unknown): VisionSizeAnalysis['layoutHint'] {
  if (typeof raw === 'string' && VALID_LAYOUT_HINTS.includes(raw as VisionSizeAnalysis['layoutHint'])) {
    return raw as VisionSizeAnalysis['layoutHint'];
  }
  return 'auto';
}

async function callVisionModelRaw(
  settings: ReturnType<typeof getVisionModelSettings>,
  prompt: string,
  images: string[],
  modelOverride?: string,
): Promise<string> {
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: modelOverride?.trim() || settings.model,
      max_tokens: settings.maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      (errorBody as { error?: { message?: string }; message?: string }).error?.message ||
      (errorBody as { message?: string }).message ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('视觉模型未返回内容');
  return content;
}

function buildLayerGuide(markedLayerTypes: LayerType[]): string {
  return markedLayerTypes.map((type) => `- ${type}: ${LAYER_TYPE_LABELS[type]}`).join('\n');
}

export interface AnalyzeSizeReferenceInput {
  masterImageDataUrl: string;
  referenceCropDataUrl: string;
  sizeName: string;
  sizeWidth: number;
  sizeHeight: number;
  sizeMode: string;
  markedLayerTypes: LayerType[];
  contentDescription?: string;
}

/** 粘贴截图时：判断该尺寸应包含哪些主海报元素（仅用于元素标记，不参与生成） */
export async function analyzeSizeReferenceWithVision(
  input: AnalyzeSizeReferenceInput,
): Promise<VisionSizeAnalysis> {
  const settings = getVisionModelSettings();
  if (!settings.enabled || !settings.apiKey) {
    throw new Error(`视觉模型未配置，请在 ${settings.configPath} 设置 api_key`);
  }

  const layerGuide = buildLayerGuide(input.markedLayerTypes);
  const prompt = `你是资深视觉设计师，负责把一张主视觉海报适配到不同运营尺寸。

【图1】主海报（完整）
【图2】该尺寸需要的元素参考截图

目标尺寸：${input.sizeName}（${input.sizeWidth}×${input.sizeHeight}，模式 ${input.sizeMode}）

主海报已标记的图层类型：
${layerGuide || '- 暂无标记'}

请根据图2判断该尺寸需要保留哪些主海报元素，并推荐布局方向。
- includedLayers 只能从 [logo, title, subtitle, subject, cta] 里选
- layoutHint 只能是 left-decor-right-text、top-text-bottom-decor、center-stack、auto

只返回 JSON：
{ "includedLayers": ["logo","title","cta"], "layoutHint": "left-decor-right-text", "description": "简短说明", "reasoning": "一句话" }`;

  const content = await callVisionModelRaw(settings, prompt, [
    input.masterImageDataUrl,
    input.referenceCropDataUrl,
  ]);
  const parsed = parseJSONSafe<Partial<VisionSizeAnalysis>>(content);
  return {
    includedLayers: normalizeLayerTypes(parsed.includedLayers),
    layoutHint: normalizeLayoutHint(parsed.layoutHint),
    description: typeof parsed.description === 'string' ? parsed.description : '',
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
  };
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
}

export interface MasterContent {
  /** 主视觉里出现的全部文字（原文、逐条） */
  texts: string[];
  /** 核心视觉元素（产品/人物/图形/背景风格等） */
  elements: string[];
}

/**
 * 用 qwen-vl 提取主视觉海报的核心文字与视觉元素，作为图生图模型的参考与约束，
 * 避免文字被截断或模型臆造无关文案。
 */
export async function extractMasterContent(masterImageDataUrl: string): Promise<MasterContent> {
  const settings = getVisionModelSettings();
  if (!settings.enabled || !settings.apiKey) {
    throw new Error(`视觉模型未配置，请在 ${settings.configPath} 设置 api_key`);
  }

  const prompt = `你是资深视觉设计师与文字识别（OCR）专家。请仔细识别图1主视觉海报中的全部内容：

1. texts：画面中出现的所有文字，逐条列出，严格保持原文、原字、原标点、原顺序（含主标题、副标题、按钮/CTA 文案、标签、角标、底部说明等），不得遗漏、不得翻译、不得改写、不得合并或拆分。
2. elements：核心视觉元素（主体产品/人物/图形/背景风格等），每条用简短中文短语。

只返回 JSON：
{ "texts": ["第一条文案", "第二条文案"], "elements": ["银色SUV轿车", "水墨山水背景"] }`;

  logger.info('vision.extractContent.request', {
    model: settings.model,
    masterBytes: masterImageDataUrl.length,
  });
  try {
    const content = await callVisionModelRaw(settings, prompt, [masterImageDataUrl]);
    const parsed = parseJSONSafe<{ texts?: unknown; elements?: unknown }>(content);
    const result = {
      texts: normalizeStringArray(parsed.texts),
      elements: normalizeStringArray(parsed.elements),
    };
    logger.info('vision.extractContent.ok', { texts: result.texts, elements: result.elements });
    return result;
  } catch (error) {
    logger.error('vision.extractContent.error', {
      model: settings.model,
      error: describeError(error),
    });
    throw error;
  }
}

export interface LayoutElementInput {
  /** 元素贴片 id */
  id: string;
  type: LayerType;
  /** 贴片真实宽高比 = 宽/高，约束模型只能等比缩放 */
  aspectRatio: number;
}

export interface PlanLayoutInput {
  masterImageDataUrl: string;
  sizeName: string;
  sizeWidth: number;
  sizeHeight: number;
  family: SizeFamily;
  elements: LayoutElementInput[];
}

const FAMILY_LAYOUT_BRIEF: Record<SizeFamily, string> = {
  portrait: '竖版：上方文案（Logo/副标题/主标题/CTA），下方主视觉与背景',
  landscape: '横版/Banner：左侧背景延展，右侧文案；主视觉若保留需完整不裁切',
  square: '方版：上方文案区、下方背景，整体均衡',
};

/**
 * 用 qwen-vl 规划目标尺寸下各元素的摆放位置（只输出坐标，不碰像素）。
 * 返回每个元素在目标画布上的归一化布局框（0~1）；高度按贴片真实宽高比重算，
 * 强制等比，避免模型给出非等比尺寸。非法/缺失由 layoutPlanner 校正或回退规则。
 */
export async function planLayoutWithVision(input: PlanLayoutInput): Promise<PlannedBox[]> {
  const settings = getVisionModelSettings();
  if (!settings.enabled || !settings.apiKey) {
    throw new Error(`视觉模型未配置，请在 ${settings.configPath} 设置 api_key`);
  }

  const elementGuide = input.elements
    .map((el) => `- id="${el.id}" 类型=${LAYER_TYPE_LABELS[el.type]}(${el.type}) 宽高比=${el.aspectRatio.toFixed(3)}`)
    .join('\n');

  const prompt = `你是资深视觉设计师，要把主视觉海报（图1）的固定元素重新排布到一个新尺寸画布上。
你只决定每个元素「放在哪、多大」，不修改任何元素本身的内容。

目标画布：${input.sizeName}（${input.sizeWidth}×${input.sizeHeight}）
版式风格：${FAMILY_LAYOUT_BRIEF[input.family]}

需要排布的元素（必须全部摆放，且只能整体等比缩放）：
${elementGuide}

布局要求：
- 坐标用归一化值（0~1），原点在画布左上角，x 向右、y 向下。
- 每个元素给左上角 x、y 与宽度 w（归一化）。高度由系统按宽高比自动计算，你不必给 h。
- 元素之间不重叠、不超出画布、留白自然合理，符合版式风格与视觉层级。
- 人物/主视觉(subject) 完整呈现、不被裁切。

只返回 JSON 数组，每项形如：
[{"id":"<元素id>","x":0.1,"y":0.05,"w":0.5}, ...]`;

  logger.info('vision.planLayout.request', {
    model: settings.model,
    size: `${input.sizeName} ${input.sizeWidth}x${input.sizeHeight}`,
    family: input.family,
    elementCount: input.elements.length,
  });

  const content = await callVisionModelRaw(settings, prompt, [input.masterImageDataUrl]);
  const parsed = parseJSONSafe<Array<{ id?: unknown; x?: unknown; y?: unknown; w?: unknown }>>(content);
  if (!Array.isArray(parsed)) throw new Error('布局模型返回格式非数组');

  const byId = new Map(input.elements.map((el) => [el.id, el]));
  const ratio = input.sizeWidth / input.sizeHeight;

  const boxes: PlannedBox[] = [];
  for (const item of parsed) {
    const id = typeof item.id === 'string' ? item.id : '';
    const el = byId.get(id);
    if (!el) continue;
    const x = Number(item.x);
    const y = Number(item.y);
    const w = Number(item.w);
    if (![x, y, w].every((n) => Number.isFinite(n)) || w <= 0) continue;
    // 高度按贴片真实宽高比重算，强制等比：h_norm = w_norm * (W/H) / aspectRatio
    const h = (w * ratio) / Math.max(0.01, el.aspectRatio);
    boxes.push({ type: el.type, spriteId: el.id, x, y, w, h });
  }

  logger.info('vision.planLayout.ok', { returned: boxes.length, expected: input.elements.length });
  return boxes;
}

/**
 * 用 qwen-vl 看主海报 + 用户对本图的特殊要求，润色成清晰、可执行的中文要求，
 * 供补充到图生图提示词。
 */
export async function refineImageInstruction(
  masterImageDataUrl: string,
  rawInstruction: string,
): Promise<string> {
  const text = rawInstruction.trim();
  if (!text) return '';

  const settings = getVisionModelSettings();
  if (!settings.enabled || !settings.apiKey) {
    throw new Error(`视觉模型未配置，请在 ${settings.configPath} 设置 api_key`);
  }

  const prompt = `你是资深视觉设计师。图1是一张主视觉海报，接下来要用图像模型把它适配成各种运营尺寸。
用户对本图的适配额外提出了要求（原话）：
「${text}」

请把这条要求润色成一段清晰、具体、可执行、便于和图像生成模型沟通的中文要求：
- 完整保留用户意图，结合图1实际内容把要求说清楚
- 去掉口语、歧义和重复，必要时补充能让模型正确执行的细节
- 不要新增用户没有表达的约束，不要改变其诉求
- 不要解释、不要加引号、不要输出多余内容

只输出润色后的要求文本。`;

  logger.info('vision.refineInstruction.request', { model: settings.model, raw: text });
  try {
    const content = await callVisionModelRaw(settings, prompt, [masterImageDataUrl]);
    const polished = content.trim();
    logger.info('vision.refineInstruction.ok', { polished });
    return polished;
  } catch (error) {
    logger.error('vision.refineInstruction.error', { error: describeError(error) });
    throw error;
  }
}
