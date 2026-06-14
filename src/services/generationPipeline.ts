import type { GeneratedImage, LayerRect, LayerType, SizeTemplate } from '../types/poster';
import { applyFamilyStrategy, sortSizesForGeneration } from '../config/sizeFamilies';
import { getAiModelSettings, isAiEnabled } from '../config/aiModel';
import { buildAdaptationPrompt, describeKeptElements } from './promptBuilder';
import { generatePosterImage } from './imageGenerator';
import { describeError, logger } from '../utils/logger';

export type GenerationStage = 'prepare' | 'generate' | 'done';

export interface GenerationProgress {
  current: number;
  total: number;
  sizeName: string;
  stage: GenerationStage;
}

/** 本图生成上下文：特殊要求 + qwen-vl 提取的原文案与核心元素 + 清晰度 */
export interface PromptContext {
  imageInstruction?: string;
  masterTexts?: string[];
  masterElements?: string[];
  /** 超采样目标像素（清晰度），越大越清晰但越慢 */
  targetPixels?: number;
}

/** 该尺寸需要保留的元素类型：优先截图框选规格，否则用全部已标记图层 */
function resolveKeptTypes(size: SizeTemplate, layers: LayerRect[]): LayerType[] {
  if (size.elementSpec?.layerIds.length) {
    const idSet = new Set(size.elementSpec.layerIds);
    return [...new Set(layers.filter((l) => idSet.has(l.id)).map((l) => l.type))];
  }
  return [...new Set(layers.map((l) => l.type))];
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function ensureAi(): void {
  if (!isAiEnabled()) {
    logger.warn('validate.fail', { rule: 'ai-enabled', reason: '未启用图像模型 / 未配置 api_key' });
    throw new Error('未启用图像模型，请在 ~/.config/llm.yaml 配置 api_key 后重试');
  }
}

interface RenderOneOptions {
  model?: string;
  prompt?: string;
  /** 替换输入给模型的主海报底图 */
  baseImage?: string;
  /** 本图上下文：特殊要求 + 提取的原文案与元素 */
  context?: PromptContext;
}

async function renderOneSize(
  masterDataUrl: string,
  layers: LayerRect[],
  rawSize: SizeTemplate,
  overrides: RenderOneOptions = {},
): Promise<GeneratedImage> {
  const size = applyFamilyStrategy(rawSize, 0, 0);
  const inputImage = overrides.baseImage ?? masterDataUrl;
  const prompt =
    overrides.prompt ??
    buildAdaptationPrompt({
      size,
      keptTypes: resolveKeptTypes(size, layers),
      contentDescription: size.contentDescription,
      imageInstruction: overrides.context?.imageInstruction,
      masterTexts: overrides.context?.masterTexts,
      masterElements: overrides.context?.masterElements,
    });

  const dataUrl = await generatePosterImage(inputImage, prompt, size.width, size.height, {
    model: overrides.model,
    targetPixels: overrides.context?.targetPixels,
  });
  const blob = await dataUrlToBlob(dataUrl);
  return { size, blob, dataUrl };
}

export async function generateAllSizes(
  imageSrc: string,
  _sourceWidth: number,
  _sourceHeight: number,
  layers: LayerRect[],
  sizes: SizeTemplate[],
  context?: PromptContext,
  onProgress?: (progress: GenerationProgress) => void,
): Promise<GeneratedImage[]> {
  ensureAi();
  const orderedSizes = sortSizesForGeneration(sizes);
  const results: GeneratedImage[] = [];

  logger.info('generate.batch.start', {
    total: orderedSizes.length,
    sizes: orderedSizes.map((s) => `${s.name} ${s.width}x${s.height}`),
    layerTypes: [...new Set(layers.map((l) => l.type))],
    layerCount: layers.length,
    targetPixels: context?.targetPixels,
    hasInstruction: Boolean(context?.imageInstruction?.trim()),
    masterTextsCount: context?.masterTexts?.length ?? 0,
    masterElementsCount: context?.masterElements?.length ?? 0,
  });

  for (let index = 0; index < orderedSizes.length; index += 1) {
    const rawSize = orderedSizes[index];
    onProgress?.({ current: index + 1, total: sizes.length, sizeName: rawSize.name, stage: 'prepare' });
    onProgress?.({ current: index + 1, total: sizes.length, sizeName: rawSize.name, stage: 'generate' });

    // 串行：一张一张挨个出图，优先保证生成效果
    logger.info('generate.size.start', {
      index: index + 1,
      total: orderedSizes.length,
      size: `${rawSize.name} ${rawSize.width}x${rawSize.height}`,
    });
    try {
      const result = await renderOneSize(imageSrc, layers, rawSize, { context });
      results.push(result);
      logger.info('generate.size.done', { size: `${rawSize.name} ${rawSize.width}x${rawSize.height}` });
    } catch (error) {
      logger.error('generate.size.error', {
        size: `${rawSize.name} ${rawSize.width}x${rawSize.height}`,
        keptTypes: resolveKeptTypes(applyFamilyStrategy(rawSize, 0, 0), layers),
        error: describeError(error),
      });
      throw error;
    }

    onProgress?.({ current: index + 1, total: sizes.length, sizeName: rawSize.name, stage: 'done' });
  }

  logger.info('generate.batch.done', { count: results.length });
  return results;
}

export interface FineTuneContext {
  sizeId: string;
  sizeName: string;
  /** 生图模型 */
  model: string;
  /** 图生图提示词 */
  prompt: string;
  /** 输入给模型的底图（按目标尺寸铺好的主海报） */
  baseImage: string;
  /** 该尺寸保留的元素说明 */
  keptElements: string;
}

export interface FineTuneOverrides {
  model?: string;
  prompt?: string;
  /** 替换输入底图 */
  baseImage?: string;
  /** 清晰度（超采样目标像素） */
  targetPixels?: number;
}

/** 收集某尺寸当前的模型 / 底图 / 提示词，供精调面板展示 */
export async function buildFineTuneContext(
  imageSrc: string,
  _sourceWidth: number,
  _sourceHeight: number,
  layers: LayerRect[],
  rawSize: SizeTemplate,
  context?: PromptContext,
): Promise<FineTuneContext> {
  const size = applyFamilyStrategy(rawSize, 0, 0);
  const keptTypes = resolveKeptTypes(size, layers);
  const prompt = buildAdaptationPrompt({
    size,
    keptTypes,
    contentDescription: size.contentDescription,
    imageInstruction: context?.imageInstruction,
    masterTexts: context?.masterTexts,
    masterElements: context?.masterElements,
  });

  return {
    sizeId: size.id,
    sizeName: size.name,
    model: getAiModelSettings().image.expandModel,
    prompt,
    baseImage: imageSrc,
    keptElements: describeKeptElements(keptTypes),
  };
}

/** 按精调参数单独生成某个尺寸 */
export async function regenerateSize(
  imageSrc: string,
  _sourceWidth: number,
  _sourceHeight: number,
  layers: LayerRect[],
  rawSize: SizeTemplate,
  overrides: FineTuneOverrides = {},
): Promise<GeneratedImage> {
  ensureAi();
  return renderOneSize(imageSrc, layers, rawSize, {
    model: overrides.model,
    prompt: overrides.prompt,
    baseImage: overrides.baseImage,
    context: { targetPixels: overrides.targetPixels },
  });
}

export function describeGenerationStage(stage: GenerationStage): string {
  switch (stage) {
    case 'prepare':
      return '准备底图与提示词';
    case 'generate':
      return '模型图生图';
    case 'done':
      return '完成';
    default:
      return '处理中';
  }
}
