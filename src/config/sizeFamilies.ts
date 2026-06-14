import type { LayoutMode, SizeFamily, SizeTemplate } from '../types/poster';
import type { LayerType } from '../types/poster';

/** 竖版 / 横版·Banner / 方版 — 同类尺寸共用布局策略，避免跨类裁切人物 */
export type { SizeFamily };

export interface SizeFamilyPreset {
  label: string;
  description: string;
  layoutHint: 'top-text-bottom-decor' | 'left-decor-right-text';
  layers: LayerType[];
  contentDescription: string;
}

export const SIZE_FAMILY_PRESETS: Record<SizeFamily, SizeFamilyPreset> = {
  portrait: {
    label: '竖版',
    description: '偏高竖版：上文案下山水，可保留主视觉人物/产品',
    layoutHint: 'top-text-bottom-decor',
    layers: ['logo', 'title', 'subtitle', 'subject', 'cta'],
    contentDescription: '竖版：Logo + 副标题 + 主标题 + 主视觉 + 底栏，上文案下山水背景',
  },
  landscape: {
    label: '横版 / Banner',
    description: '横版与超宽条：左山水背景 + 右文案，不含主视觉避免裁切人物',
    layoutHint: 'left-decor-right-text',
    layers: ['logo', 'title', 'subtitle', 'cta'],
    contentDescription: '横版：Logo + 副标题 + 主标题 + CTA右区，左山水背景右文案，不要主视觉产品',
  },
  square: {
    label: '方版',
    description: '方版与近方比例：上文案下背景，不含主视觉',
    layoutHint: 'top-text-bottom-decor',
    layers: ['logo', 'title', 'subtitle', 'cta'],
    contentDescription: '方版：Logo + 副标题 + 主标题 + CTA，上文案下山水背景，不要主视觉产品',
  },
};

/** 生成时按类别顺序处理，同类尺寸布局一致 */
export const SIZE_FAMILY_GENERATION_ORDER: SizeFamily[] = ['portrait', 'square', 'landscape'];

const SIZE_FAMILY_BY_ID: Record<string, SizeFamily> = {
  'poster-main': 'portrait',
  'boss-cloud-popup': 'portrait',
  'home-banner': 'portrait',
  'popup-image': 'portrait',
  'phone-1125x2436': 'portrait',
  'phone-1080x2160': 'portrait',
  'popup-620x775': 'portrait',
  'landscape-cover': 'landscape',
  'share-poster-1': 'landscape',
  'share-poster-2': 'landscape',
  'ultra-wide-banner': 'landscape',
  'banner-670x136': 'landscape',
  'banner-1005x360': 'landscape',
  'banner-1005x204': 'landscape',
  'mini-share-1-1': 'square',
  'mini-share-5-4': 'square',
};

export function inferSizeFamily(width: number, height: number): SizeFamily {
  if (height / width >= 1.05) return 'portrait';
  if (width / height >= 1.5) return 'landscape';
  return 'square';
}

export function inferLayoutMode(width: number, height: number, family?: SizeFamily): LayoutMode {
  const resolvedFamily = family ?? inferSizeFamily(width, height);
  const ratio = width / height;

  if (width === 1080 && height === 1920) return 'poster';
  if (resolvedFamily === 'landscape' && ratio >= 2.5) return 'banner';
  if (resolvedFamily === 'landscape') return 'landscape';
  if (resolvedFamily === 'portrait') return 'portrait';
  return 'square';
}

export function getSizeFamily(size: Pick<SizeTemplate, 'id' | 'width' | 'height' | 'family'>): SizeFamily {
  if (size.family) return size.family;
  return SIZE_FAMILY_BY_ID[size.id] ?? inferSizeFamily(size.width, size.height);
}

export function attachSizeFamily(size: SizeTemplate): SizeTemplate {
  const family = getSizeFamily(size);
  return {
    ...size,
    family,
    mode: size.mode ?? inferLayoutMode(size.width, size.height, family),
  };
}

export function groupSizesByFamily(sizes: SizeTemplate[]): Record<SizeFamily, SizeTemplate[]> {
  const groups: Record<SizeFamily, SizeTemplate[]> = {
    portrait: [],
    landscape: [],
    square: [],
  };

  for (const size of sizes) {
    groups[getSizeFamily(size)].push(size);
  }

  return groups;
}

export function sortSizesForGeneration(sizes: SizeTemplate[]): SizeTemplate[] {
  return [...sizes].sort((a, b) => {
    const familyDelta =
      SIZE_FAMILY_GENERATION_ORDER.indexOf(getSizeFamily(a)) -
      SIZE_FAMILY_GENERATION_ORDER.indexOf(getSizeFamily(b));
    if (familyDelta !== 0) return familyDelta;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

export function getFamilyPreset(family: SizeFamily): SizeFamilyPreset {
  return SIZE_FAMILY_PRESETS[family];
}

/** 主海报与目标尺寸跨类时，强制走目标类策略（横版/方版去掉主视觉） */
export function applyFamilyStrategy(
  size: SizeTemplate,
  masterWidth: number,
  masterHeight: number,
): SizeTemplate {
  const targetFamily = getSizeFamily(size);
  const preset = getFamilyPreset(targetFamily);
  const masterFamily = inferSizeFamily(masterWidth, masterHeight);

  if (masterFamily === targetFamily) {
    return { ...size, family: targetFamily };
  }

  const crossClassNote =
    masterFamily === 'portrait' && targetFamily !== 'portrait'
      ? '，跨类适配不含主视觉避免裁切人物'
      : '';

  return {
    ...size,
    family: targetFamily,
    contentDescription:
      size.elementSpec?.cropRect || size.contentDescription?.trim()
        ? size.contentDescription
        : `${preset.contentDescription}${crossClassNote}`,
  };
}
