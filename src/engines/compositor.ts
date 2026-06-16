import type { ElementSprite, PlannedBox } from '../types/poster';
import { loadImage } from '../utils/canvas';

export interface ComposeInput {
  /** 背景图（dataUrl 或 url）：已扩展到目标比例的纯背景 */
  background: string;
  /** 元素贴片（固定资产） */
  sprites: ElementSprite[];
  /** 归一化布局框（Qwen-VL 或规则产出） */
  boxes: PlannedBox[];
  targetWidth: number;
  targetHeight: number;
}

/** 在 ctx 上以 cover（等比铺满+居中裁切）绘制背景 */
function drawBackgroundCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
): void {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const scale = Math.max(targetW / sw, targetH / sh);
  const drawW = sw * scale;
  const drawH = sh * scale;
  ctx.drawImage(img, (targetW - drawW) / 2, (targetH - drawH) / 2, drawW, drawH);
}

/** 在归一化框内以 contain（等比缩放+居中）绘制贴片，绝不非等比拉伸 */
function drawSpriteContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: PlannedBox,
  targetW: number,
  targetH: number,
): void {
  const boxX = box.x * targetW;
  const boxY = box.y * targetH;
  const boxW = box.w * targetW;
  const boxH = box.h * targetH;
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const scale = Math.min(boxW / sw, boxH / sh);
  const drawW = sw * scale;
  const drawH = sh * scale;
  const dx = boxX + (boxW - drawW) / 2;
  const dy = boxY + (boxH - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

/**
 * 本地合成：精确 W×H 画布 = 背景(cover) + 元素贴片(按布局框 contain 等比摆放)。
 * 元素与背景均不经过图像模型重绘，全链路零非等比拉伸 → 无变形。
 */
export async function composePoster(input: ComposeInput): Promise<string> {
  const { background, sprites, boxes, targetWidth, targetHeight } = input;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布上下文');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const bgImg = await loadImage(background);
  drawBackgroundCover(ctx, bgImg, targetWidth, targetHeight);

  const spriteById = new Map(sprites.map((s) => [s.id, s]));
  // 按布局框顺序逐个贴：先匹配 spriteId，缺省时按 type 取首个未用贴片
  const usedByType = new Map<string, number>();
  for (const box of boxes) {
    let sprite: ElementSprite | undefined = box.spriteId
      ? spriteById.get(box.spriteId)
      : undefined;
    if (!sprite) {
      const sameType = sprites.filter((s) => s.type === box.type);
      const used = usedByType.get(box.type) ?? 0;
      sprite = sameType[used];
      usedByType.set(box.type, used + 1);
    }
    if (!sprite) continue;
    const img = await loadImage(sprite.dataUrl);
    drawSpriteContain(ctx, img, box, targetWidth, targetHeight);
  }

  return canvas.toDataURL('image/png');
}
