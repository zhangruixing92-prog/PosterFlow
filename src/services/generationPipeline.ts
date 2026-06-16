import type { AssetBundle, GeneratedImage, LayerRect, LayerType, SizeTemplate } from '../types/poster';
import {
  applyFamilyStrategy,
  getFamilyPreset,
  getSizeFamily,
  sortSizesForGeneration,
} from '../config/sizeFamilies';
import { getAiModelSettings, isAiEnabled } from '../config/aiModel';
import { buildAdaptationPrompt, buildBackgroundPrompt, describeKeptElements } from './promptBuilder';
import { extractAssets } from './assetExtractor';
import { generateBackground } from './backgroundGenerator';
import { planLayout } from './layoutPlanner';
import { composePoster } from '../engines/compositor';
import { generatePosterImage } from './imageGenerator';
import { describeError, logger } from '../utils/logger';

/** Phase 2：默认走「背景生成 + 本地合成」解耦路线；置 false 回退旧整图重绘（A/B 用） */
const COMPOSITION_ENABLED = true;

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

/**
 * 选出该尺寸要贴回的元素贴片：
 * - 命中 keptTypes；
 * - 无显式框选时，按尺寸族预设过滤（横版/方版自动去主视觉，避免裁切人物）。
 */
function selectKeptSprites(size: SizeTemplate, assets: AssetBundle, keptTypes: LayerType[]) {
  let sprites = assets.sprites.filter((s) => keptTypes.includes(s.type));
  if (!size.elementSpec?.layerIds.length) {
    const allowed = getFamilyPreset(getSizeFamily(size)).layers;
    sprites = sprites.filter((s) => allowed.includes(s.type));
  }
  return sprites;
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
  /** 替换输入给模型的底图（合成路线下视为背景底板） */
  baseImage?: string;
  /** 本图上下文：特殊要求 + 提取的原文案与元素 */
  context?: PromptContext;
}

/** 合成路线：背景生成 → Qwen-VL 布局 → 本地合成 */
async function renderOneSizeComposed(
  masterDataUrl: string,
  masterWidth: number,
  masterHeight: number,
  assets: AssetBundle,
  layers: LayerRect[],
  rawSize: SizeTemplate,
  overrides: RenderOneOptions = {},
): Promise<GeneratedImage> {
  const size = applyFamilyStrategy(rawSize, masterWidth, masterHeight);
  const keptTypes = resolveKeptTypes(size, layers);
  const keptSprites = selectKeptSprites(size, assets, keptTypes);
  const backgroundPlate = overrides.baseImage ?? assets.backgroundPlate;
  const bgPrompt = overrides.prompt ?? buildBackgroundPrompt(size);

  const background = await generateBackground(backgroundPlate, bgPrompt, size.width, size.height, {
    model: overrides.model,
    targetPixels: overrides.context?.targetPixels,
  });

  const layout = await planLayout({
    masterImageDataUrl: masterDataUrl,
    sizeName: size.name,
    sizeWidth: size.width,
    sizeHeight: size.height,
    family: getSizeFamily(size),
    sprites: keptSprites,
  });

  logger.info('compose.size', {
    size: `${size.name} ${size.width}x${size.height}`,
    sprites: keptSprites.map((s) => s.type),
    layoutSource: layout.source,
  });

  const dataUrl = await composePoster({
    background: background.dataUrl,
    sprites: keptSprites,
    boxes: layout.boxes,
    targetWidth: size.width,
    targetHeight: size.height,
  });
  const blob = await dataUrlToBlob(dataUrl);
  return { size, blob, dataUrl };
}

/** 旧路线：整张主海报喂图像模型重绘（A/B 对照，COMPOSITION_ENABLED=false 时启用） */
async function renderOneSizeLegacy(
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
  sourceWidth: number,
  sourceHeight: number,
  layers: LayerRect[],
  sizes: SizeTemplate[],
  context?: PromptContext,
  onProgress?: (progress: GenerationProgress) => void,
): Promise<GeneratedImage[]> {
  const orderedSizes = sortSizesForGeneration(sizes);
  const results: GeneratedImage[] = [];

  // 合成路线下，AI 不可用也能本地出图（背景底板兜底 + 规则布局）；旧路线必须有 AI
  if (!COMPOSITION_ENABLED) ensureAi();

  // 资产切片只做一次（与尺寸数量无关）
  const assets = COMPOSITION_ENABLED
    ? await extractAssets(imageSrc, layers, sourceWidth, sourceHeight)
    : null;

  logger.info('generate.batch.start', {
    pipeline: COMPOSITION_ENABLED ? 'composition' : 'legacy',
    total: orderedSizes.length,
    sizes: orderedSizes.map((s) => `${s.name} ${s.width}x${s.height}`),
    layerTypes: [...new Set(layers.map((l) => l.type))],
    layerCount: layers.length,
    spriteCount: assets?.sprites.length ?? 0,
    targetPixels: context?.targetPixels,
  });

  for (let index = 0; index < orderedSizes.length; index += 1) {
    const rawSize = orderedSizes[index];
    onProgress?.({ current: index + 1, total: sizes.length, sizeName: rawSize.name, stage: 'prepare' });
    onProgress?.({ current: index + 1, total: sizes.length, sizeName: rawSize.name, stage: 'generate' });

    logger.info('generate.size.start', {
      index: index + 1,
      total: orderedSizes.length,
      size: `${rawSize.name} ${rawSize.width}x${rawSize.height}`,
    });
    try {
      const result =
        COMPOSITION_ENABLED && assets
          ? await renderOneSizeComposed(imageSrc, sourceWidth, sourceHeight, assets, layers, rawSize, {
              context,
            })
          : await renderOneSizeLegacy(imageSrc, layers, rawSize, { context });
      results.push(result);
      logger.info('generate.size.done', { size: `${rawSize.name} ${rawSize.width}x${rawSize.height}` });
    } catch (error) {
      logger.error('generate.size.error', {
        size: `${rawSize.name} ${rawSize.width}x${rawSize.height}`,
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
  /** 背景扩展提示词 */
  prompt: string;
  /** 输入给模型的背景底板（已抹除元素） */
  baseImage: string;
  /** 该尺寸保留的元素说明 */
  keptElements: string;
}

export interface FineTuneOverrides {
  model?: string;
  prompt?: string;
  /** 替换输入底图（合成路线下为背景底板） */
  baseImage?: string;
  /** 清晰度（超采样目标像素） */
  targetPixels?: number;
}

/** 收集某尺寸当前的模型 / 背景底板 / 背景提示词，供精调面板展示 */
export async function buildFineTuneContext(
  imageSrc: string,
  sourceWidth: number,
  sourceHeight: number,
  layers: LayerRect[],
  rawSize: SizeTemplate,
): Promise<FineTuneContext> {
  const size = applyFamilyStrategy(rawSize, sourceWidth, sourceHeight);
  const keptTypes = resolveKeptTypes(size, layers);
  const assets = await extractAssets(imageSrc, layers, sourceWidth, sourceHeight);

  return {
    sizeId: size.id,
    sizeName: size.name,
    model: getAiModelSettings().image.expandModel,
    prompt: buildBackgroundPrompt(size),
    baseImage: assets.backgroundPlate,
    keptElements: describeKeptElements(keptTypes),
  };
}

/** 按精调参数单独生成某个尺寸 */
export async function regenerateSize(
  imageSrc: string,
  sourceWidth: number,
  sourceHeight: number,
  layers: LayerRect[],
  rawSize: SizeTemplate,
  overrides: FineTuneOverrides = {},
): Promise<GeneratedImage> {
  if (!COMPOSITION_ENABLED) {
    ensureAi();
    return renderOneSizeLegacy(imageSrc, layers, rawSize, {
      model: overrides.model,
      prompt: overrides.prompt,
      baseImage: overrides.baseImage,
      context: { targetPixels: overrides.targetPixels },
    });
  }
  const assets = await extractAssets(imageSrc, layers, sourceWidth, sourceHeight);
  return renderOneSizeComposed(imageSrc, sourceWidth, sourceHeight, assets, layers, rawSize, {
    model: overrides.model,
    prompt: overrides.prompt,
    baseImage: overrides.baseImage,
    context: { targetPixels: overrides.targetPixels },
  });
}

export function describeGenerationStage(stage: GenerationStage): string {
  switch (stage) {
    case 'prepare':
      return '准备背景底板与布局';
    case 'generate':
      return '背景扩展 + 本地合成';
    case 'done':
      return '完成';
    default:
      return '处理中';
  }
}
