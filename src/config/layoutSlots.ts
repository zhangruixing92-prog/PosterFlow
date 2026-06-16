import type { ElementSprite, LayerType, PlannedBox, SizeFamily } from '../types/poster';

/** 像素矩形（合成画布坐标） */
interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 文案类元素自上而下的堆叠顺序 */
const TEXT_STACK_ORDER: LayerType[] = ['logo', 'subtitle', 'title', 'cta', 'element'];

/** 各类型在所属区域内的目标宽度占比（保证视觉层级，宽度仅作上限，最终等比缩放） */
const WIDTH_FRACTION: Record<LayerType, number> = {
  logo: 0.32,
  title: 0.86,
  subtitle: 0.7,
  subject: 0.96,
  cta: 0.52,
  element: 0.8,
};

const GAP_FRACTION = 0.04; // 元素间距占画布短边比例

/**
 * 把一组贴片在给定区域内垂直居中堆叠，等比缩放避免溢出，返回归一化布局框。
 */
function stackInZone(
  sprites: ElementSprite[],
  zone: PxRect,
  targetW: number,
  targetH: number,
  gapPx: number,
): PlannedBox[] {
  if (sprites.length === 0) return [];

  // 初次按宽度占比定尺寸
  const items = sprites.map((sprite) => {
    const w = zone.w * (WIDTH_FRACTION[sprite.type] ?? 0.8);
    const h = w / Math.max(0.01, sprite.aspectRatio);
    return { sprite, w, h };
  });

  let gap = gapPx;
  let totalH = items.reduce((sum, it) => sum + it.h, 0) + gap * (items.length - 1);
  // 溢出则整体等比缩小（元素与间距一并缩放，保证缩放后正好放进区域）
  if (totalH > zone.h && totalH > 0) {
    const scale = zone.h / totalH;
    for (const it of items) {
      it.w *= scale;
      it.h *= scale;
    }
    gap *= scale;
    totalH = zone.h;
  }

  let cursorY = zone.y + (zone.h - totalH) / 2;
  return items.map(({ sprite, w, h }) => {
    const x = zone.x + (zone.w - w) / 2;
    const box: PlannedBox = {
      type: sprite.type,
      spriteId: sprite.id,
      x: x / targetW,
      y: cursorY / targetH,
      w: w / targetW,
      h: h / targetH,
    };
    cursorY += h + gap;
    return box;
  });
}

/**
 * 规则兜底布局：按尺寸族把贴片摆到画布上，产出归一化布局框。
 * 仅在 Qwen-VL 布局不可用 / 非法时启用。
 *
 * - portrait：上文案区（logo/副标题/标题/CTA）+ 下主视觉区
 * - landscape：左主视觉区 + 右文案区（无主视觉时文案占满）
 * - square：上文案区 + 下主视觉区
 */
export function computeFallbackLayout(
  family: SizeFamily,
  targetW: number,
  targetH: number,
  sprites: ElementSprite[],
): PlannedBox[] {
  const gapPx = Math.min(targetW, targetH) * GAP_FRACTION;
  const pad = Math.min(targetW, targetH) * 0.06;

  const textSprites = TEXT_STACK_ORDER.flatMap((type) =>
    sprites.filter((s) => s.type === type),
  );
  const subjectSprites = sprites.filter((s) => s.type === 'subject');

  if (family === 'landscape') {
    const hasSubject = subjectSprites.length > 0;
    const splitX = hasSubject ? targetW * 0.5 : targetW;
    const leftZone: PxRect = { x: pad, y: pad, w: splitX - pad * 1.5, h: targetH - pad * 2 };
    const rightZone: PxRect = hasSubject
      ? { x: splitX + pad * 0.5, y: pad, w: targetW - splitX - pad * 1.5, h: targetH - pad * 2 }
      : { x: pad, y: pad, w: targetW - pad * 2, h: targetH - pad * 2 };
    return [
      ...stackInZone(subjectSprites, leftZone, targetW, targetH, gapPx),
      ...stackInZone(textSprites, rightZone, targetW, targetH, gapPx),
    ];
  }

  // portrait / square：上文案下主视觉
  const hasSubject = subjectSprites.length > 0;
  const textH = hasSubject ? targetH * (family === 'square' ? 0.5 : 0.45) : targetH - pad * 2;
  const textZone: PxRect = { x: pad, y: pad, w: targetW - pad * 2, h: textH - pad };
  const subjectZone: PxRect = {
    x: pad,
    y: textH,
    w: targetW - pad * 2,
    h: targetH - textH - pad,
  };
  return [
    ...stackInZone(textSprites, textZone, targetW, targetH, gapPx),
    ...stackInZone(subjectSprites, subjectZone, targetW, targetH, gapPx),
  ];
}
