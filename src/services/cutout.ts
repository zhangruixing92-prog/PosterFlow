import { loadImage } from '../utils/canvas';

/**
 * 抠图策略（可插拔）：
 * - 'none'    ：不处理，直接用矩形贴片（当前默认）
 * - 'feather' ：本地边缘羽化，软化矩形硬边（无需外部模型）
 * - 'matting' ：预留——接远程 matting / SAM 做真正透明抠图（Phase4 后续）
 *
 * 注意：本模块目前为惰性能力，未接入生成流水线；接线见 generationPipeline。
 */
export type CutoutStrategy = 'none' | 'feather' | 'matting';

export interface CutoutOptions {
  strategy?: CutoutStrategy;
  /** feather 半径（贴片短边占比，0~0.5），默认 0.06 */
  featherRatio?: number;
}

/**
 * 本地边缘羽化：把贴片四周 radius 像素的 alpha 线性渐隐到 0，
 * 让矩形贴片贴到新背景上时边缘自然过渡，缓解「方块硬边」。
 */
async function featherEdges(dataUrl: string, featherRatio: number): Promise<string> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布上下文');
  ctx.drawImage(img, 0, 0, w, h);

  const radius = Math.max(1, Math.round(Math.min(w, h) * Math.max(0, Math.min(0.5, featherRatio))));
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  for (let y = 0; y < h; y += 1) {
    const dy = Math.min(y, h - 1 - y);
    for (let x = 0; x < w; x += 1) {
      const dx = Math.min(x, w - 1 - x);
      const edge = Math.min(dx, dy);
      if (edge < radius) {
        const idx = (y * w + x) * 4 + 3;
        data[idx] = Math.round(data[idx] * (edge / radius));
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * 对元素贴片应用抠图策略，返回处理后的 dataUrl。
 * matting 暂未实现，回退到原图（待接 SAM / matting API）。
 */
export async function applyCutout(spriteDataUrl: string, options: CutoutOptions = {}): Promise<string> {
  const strategy = options.strategy ?? 'none';
  switch (strategy) {
    case 'feather':
      return featherEdges(spriteDataUrl, options.featherRatio ?? 0.06);
    case 'matting':
      // TODO(Phase4-T4.2): 接远程 matting / SAM 做真正透明抠图
      return spriteDataUrl;
    case 'none':
    default:
      return spriteDataUrl;
  }
}
