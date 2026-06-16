import type { BackgroundResult } from '../types/poster';
import { isAiEnabled } from '../config/aiModel';
import { generatePosterImage } from './imageGenerator';
import { coverFitToDataUrl } from '../utils/canvas';
import { describeError, logger } from '../utils/logger';

export interface GenerateBackgroundOptions {
  model?: string;
  /** 超采样目标像素（清晰度） */
  targetPixels?: number;
}

/**
 * 背景扩展：把「已抹除元素的背景底板」延展到目标尺寸。
 *
 * - 图像模型可用：调用 gpt-image-2-all 只扩背景（输入纯背景、提示词禁元素）；
 * - 不可用或失败：回退用背景底板本身做 cover 裁切（纯本地，无变形）。
 *
 * 无论走哪条路，输出都不含被重绘的人物/文字 —— 元素由合成阶段贴回。
 */
export async function generateBackground(
  backgroundPlate: string,
  prompt: string,
  targetWidth: number,
  targetHeight: number,
  options: GenerateBackgroundOptions = {},
): Promise<BackgroundResult> {
  if (isAiEnabled()) {
    try {
      const dataUrl = await generatePosterImage(backgroundPlate, prompt, targetWidth, targetHeight, {
        model: options.model,
        targetPixels: options.targetPixels,
      });
      return { dataUrl, width: targetWidth, height: targetHeight };
    } catch (error) {
      logger.warn('background.generate.fallback', {
        reason: 'model-error',
        target: `${targetWidth}x${targetHeight}`,
        error: describeError(error),
      });
    }
  } else {
    logger.info('background.generate.fallback', { reason: 'ai-disabled' });
  }

  // 本地兜底：背景底板直接 cover 到目标尺寸
  const dataUrl = await coverFitToDataUrl(backgroundPlate, targetWidth, targetHeight);
  return { dataUrl, width: targetWidth, height: targetHeight };
}
