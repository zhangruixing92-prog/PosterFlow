import type { ElementSprite, PlannedBox, SizeFamily } from '../types/poster';
import { computeFallbackLayout } from '../config/layoutSlots';
import { planLayoutWithVision } from './qwenVision';
import { isVisionModelConfigured } from '../config/visionModel';
import { describeError, logger } from '../utils/logger';

export interface PlanLayoutRequest {
  masterImageDataUrl: string;
  sizeName: string;
  sizeWidth: number;
  sizeHeight: number;
  family: SizeFamily;
  sprites: ElementSprite[];
}

export interface PlanLayoutResult {
  boxes: PlannedBox[];
  source: 'vision' | 'fallback';
}

const BOUND_TOLERANCE = 0.02;
const MAX_OVERLAP_RATIO = 0.35;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 把布局框夹回画布内（轻微越界时收缩，而非丢弃） */
function clampBox(box: PlannedBox): PlannedBox {
  const w = Math.min(box.w, 1);
  const h = Math.min(box.h, 1);
  const x = clamp01(Math.min(box.x, 1 - w));
  const y = clamp01(Math.min(box.y, 1 - h));
  return { ...box, x, y, w, h };
}

function intersectionRatio(a: PlannedBox, b: PlannedBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  const minArea = Math.max(1e-6, Math.min(a.w * a.h, b.w * b.h));
  return inter / minArea;
}

/** 校验 Qwen-VL 布局是否可用：覆盖全部贴片、不严重越界、不严重重叠 */
function validateVisionBoxes(boxes: PlannedBox[], sprites: ElementSprite[]): boolean {
  if (boxes.length < sprites.length) return false;
  const covered = new Set(boxes.map((b) => b.spriteId));
  if (!sprites.every((s) => covered.has(s.id))) return false;

  for (const b of boxes) {
    if (b.w <= 0 || b.h <= 0) return false;
    if (b.x < -BOUND_TOLERANCE || b.y < -BOUND_TOLERANCE) return false;
    if (b.x + b.w > 1 + BOUND_TOLERANCE || b.y + b.h > 1 + BOUND_TOLERANCE) return false;
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (intersectionRatio(boxes[i], boxes[j]) > MAX_OVERLAP_RATIO) return false;
    }
  }
  return true;
}

/**
 * 布局规划：优先用 Qwen-VL，校验通过则采用（夹边后），否则回退规则槽位。
 * 永不让模型决定像素，仅决定坐标。
 */
export async function planLayout(req: PlanLayoutRequest): Promise<PlanLayoutResult> {
  const fallback = (): PlanLayoutResult => ({
    boxes: computeFallbackLayout(req.family, req.sizeWidth, req.sizeHeight, req.sprites),
    source: 'fallback',
  });

  if (req.sprites.length === 0) return fallback();
  if (!isVisionModelConfigured()) {
    logger.info('layout.plan.fallback', { reason: 'vision-disabled' });
    return fallback();
  }

  try {
    const boxes = await planLayoutWithVision({
      masterImageDataUrl: req.masterImageDataUrl,
      sizeName: req.sizeName,
      sizeWidth: req.sizeWidth,
      sizeHeight: req.sizeHeight,
      family: req.family,
      elements: req.sprites.map((s) => ({ id: s.id, type: s.type, aspectRatio: s.aspectRatio })),
    });
    if (!validateVisionBoxes(boxes, req.sprites)) {
      logger.warn('layout.plan.fallback', { reason: 'vision-invalid', returned: boxes.length });
      return fallback();
    }
    logger.info('layout.plan.vision', { count: boxes.length });
    return { boxes: boxes.map(clampBox), source: 'vision' };
  } catch (error) {
    logger.warn('layout.plan.fallback', { reason: 'vision-error', error: describeError(error) });
    return fallback();
  }
}
