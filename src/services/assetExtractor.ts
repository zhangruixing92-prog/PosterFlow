import type { AssetBundle, CropRect, ElementSprite, LayerRect } from '../types/poster';
import { loadImage } from '../utils/canvas';

/** 把 rect 夹到图像边界内，避免越界裁切 */
function clampRect(rect: LayerRect, imgW: number, imgH: number): CropRect {
  const x = Math.max(0, Math.min(rect.x, imgW));
  const y = Math.max(0, Math.min(rect.y, imgH));
  const width = Math.max(1, Math.min(rect.width, imgW - x));
  const height = Math.max(1, Math.min(rect.height, imgH - y));
  return { x, y, width, height };
}

/** 从主图裁切出元素贴片 PNG（Phase1 矩形裁切，无透明） */
function cropSprite(img: HTMLImageElement, rect: CropRect): string {
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布上下文');
  ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return canvas.toDataURL('image/png');
}

/**
 * 用元素区四周邻域的平均色填充该区域，得到「抹除元素」的背景底板。
 * Phase1 的近似实现；Phase2 可替换为真正的 inpaint。
 */
function fillRectWithSurroundingColor(
  ctx: CanvasRenderingContext2D,
  rect: CropRect,
  imgW: number,
  imgH: number,
): void {
  const band = Math.max(2, Math.round(Math.min(rect.width, rect.height) * 0.08));
  const sx = Math.max(0, rect.x - band);
  const sy = Math.max(0, rect.y - band);
  const sw = Math.min(imgW - sx, rect.width + band * 2);
  const sh = Math.min(imgH - sy, rect.height + band * 2);
  if (sw <= 0 || sh <= 0) return;

  const sample = ctx.getImageData(sx, sy, sw, sh).data;
  // 内框（元素本体）相对采样区的偏移，用于只统计「环带」像素
  const innerL = rect.x - sx;
  const innerT = rect.y - sy;
  const innerR = innerL + rect.width;
  const innerB = innerT + rect.height;

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let py = 0; py < sh; py += 1) {
    for (let px = 0; px < sw; px += 1) {
      const inside = px >= innerL && px < innerR && py >= innerT && py < innerB;
      if (inside) continue; // 跳过元素本体，只取四周环带
      const idx = (py * sw + px) * 4;
      r += sample[idx];
      g += sample[idx + 1];
      b += sample[idx + 2];
      count += 1;
    }
  }
  if (count === 0) return;
  ctx.fillStyle = `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

/**
 * 资产切片：从主海报 + 已标记图层切出元素贴片，并生成抹除元素后的背景底板。
 *
 * - 元素贴片为固定资产，永不进入图像模型、永不被非等比拉伸；
 * - 背景底板用于 Phase2 的背景扩展（outpaint）。
 */
export async function extractAssets(
  masterDataUrl: string,
  layers: LayerRect[],
  masterWidth: number,
  masterHeight: number,
): Promise<AssetBundle> {
  const img = await loadImage(masterDataUrl);
  const imgW = masterWidth || img.naturalWidth || img.width;
  const imgH = masterHeight || img.naturalHeight || img.height;

  const sprites: ElementSprite[] = layers.map((layer) => {
    const srcRect = clampRect(layer, imgW, imgH);
    return {
      id: layer.id,
      type: layer.type,
      dataUrl: cropSprite(img, srcRect),
      srcRect,
      aspectRatio: srcRect.width / srcRect.height,
      hasAlpha: false,
    };
  });

  // 背景底板：先画原图，再抹除各元素区
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = imgW;
  bgCanvas.height = imgH;
  const bgCtx = bgCanvas.getContext('2d');
  if (!bgCtx) throw new Error('无法创建画布上下文');
  bgCtx.drawImage(img, 0, 0, imgW, imgH);
  for (const layer of layers) {
    fillRectWithSurroundingColor(bgCtx, clampRect(layer, imgW, imgH), imgW, imgH);
  }
  const backgroundPlate = bgCanvas.toDataURL('image/png');

  return { sprites, backgroundPlate };
}
