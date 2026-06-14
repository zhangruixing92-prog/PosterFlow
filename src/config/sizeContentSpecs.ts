import { getFamilyPreset, getSizeFamily } from './sizeFamilies';
import type { LayerType } from '../types/poster';

export interface SizeContentPreset {
  description: string;
  layers: LayerType[];
}

/** 对标 lovart 定稿：粘贴截图 + 布局指令 */
export const DEFAULT_SIZE_CONTENT: Record<string, SizeContentPreset> = {
  'poster-main': {
    description: '完整主海报：Logo、副标题、主标题、主视觉、CTA/底栏全部保留',
    layers: ['logo', 'title', 'subtitle', 'subject', 'cta'],
  },
  'boss-cloud-popup': {
    description: '弹窗竖版：Logo + 副标题 + 主标题 + 主视觉 + 底栏，上文案下背景',
    layers: ['logo', 'title', 'subtitle', 'subject', 'cta'],
  },
  'home-banner': {
    description: '首页 Banner：Logo + 主标题 + 主视觉，上文案下山水',
    layers: ['logo', 'title', 'subject'],
  },
  'popup-image': {
    description: '弹窗图：Logo + 主标题 + 主视觉 + 底栏，上文案下背景',
    layers: ['logo', 'title', 'subject', 'subtitle', 'cta'],
  },
  'phone-1125x2436': {
    description: '全面屏竖版：Logo + 副标题 + 主标题 + 主视觉 + 底栏，上文案下山水',
    layers: ['logo', 'title', 'subtitle', 'subject', 'cta'],
  },
  'phone-1080x2160': {
    description: '全面屏竖版：Logo + 副标题 + 主标题 + 主视觉 + 底栏，上文案下山水',
    layers: ['logo', 'title', 'subtitle', 'subject', 'cta'],
  },
  'popup-620x775': {
    description: '弹窗竖版：Logo + 主标题 + 主视觉 + 底栏，上文案下背景',
    layers: ['logo', 'title', 'subject', 'subtitle', 'cta'],
  },
  'landscape-cover': {
    description: '横版：Logo + 副标题 + 主标题 + CTA右区，左山水背景右文案，不要主视觉产品',
    layers: ['logo', 'title', 'subtitle', 'cta'],
  },
  'share-poster-1': {
    description: '转发横版1：Logo + 副标题 + 主标题 + CTA右区，左山水背景右文案，不要主视觉产品',
    layers: ['logo', 'title', 'subtitle', 'cta'],
  },
  'share-poster-2': {
    description: '转发横版2：Logo + 副标题 + 主标题 + CTA右区，左山水背景右文案，不要主视觉产品',
    layers: ['logo', 'title', 'subtitle', 'cta'],
  },
  'ultra-wide-banner': {
    description: '超宽 Banner：Logo + 主标题 + CTA，左山水背景右文案，不要主视觉',
    layers: ['logo', 'title', 'subtitle', 'cta'],
  },
  'banner-670x136': {
    description: '超宽 Banner：Logo + 主标题 + CTA，左山水背景右文案，不要主视觉',
    layers: ['logo', 'title', 'subtitle', 'cta'],
  },
  'banner-1005x360': {
    description: 'Banner：Logo + 主标题 + CTA，左山水背景右文案，不要主视觉',
    layers: ['logo', 'title', 'subtitle', 'cta'],
  },
  'banner-1005x204': {
    description: '超宽 Banner：Logo + 主标题 + CTA，左山水背景右文案，不要主视觉',
    layers: ['logo', 'title', 'subtitle', 'cta'],
  },
  'mini-share-1-1': {
    description: '方版 1:1：Logo + 副标题 + 主标题 + CTA，上文案下山水背景，不要主视觉产品',
    layers: ['logo', 'title', 'subtitle', 'cta'],
  },
  'mini-share-5-4': {
    description: '方版 5:4：Logo + 副标题 + 主标题 + CTA，上文案下山水背景，不要主视觉',
    layers: ['logo', 'title', 'subtitle', 'cta'],
  },
};

export function getDefaultContentForSize(
  sizeId: string,
  size?: { width: number; height: number; family?: import('../types/poster').SizeFamily },
): SizeContentPreset {
  if (DEFAULT_SIZE_CONTENT[sizeId]) {
    return DEFAULT_SIZE_CONTENT[sizeId];
  }

  if (size) {
    const preset = getFamilyPreset(getSizeFamily({ id: sizeId, ...size }));
    return { description: preset.contentDescription, layers: preset.layers };
  }

  return {
    description: 'Logo + 主标题 + 主视觉，上文案下山水背景',
    layers: ['logo', 'title', 'subject'],
  };
}
