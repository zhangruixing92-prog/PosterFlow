import { attachSizeFamily, inferLayoutMode } from './sizeFamilies';
import { getDefaultContentForSize } from './sizeContentSpecs';
import type { SizeFamily, SizeTemplate, LayoutMode } from '../types/poster';

function withDefaults(
  size: Omit<SizeTemplate, 'contentDescription' | 'family' | 'mode'> & {
    family: SizeFamily;
    mode?: LayoutMode;
  },
): SizeTemplate {
  const preset = getDefaultContentForSize(size.id);
  return attachSizeFamily({
    ...size,
    mode: size.mode ?? inferLayoutMode(size.width, size.height, size.family),
    contentDescription: preset.description,
  });
}

export const DEFAULT_SIZES: SizeTemplate[] = [
  // 竖版
  withDefaults({ id: 'poster-main', name: '主海报', width: 1080, height: 1920, mode: 'poster', family: 'portrait' }),
  withDefaults({ id: 'boss-cloud-popup', name: '老板云弹窗', width: 900, height: 1080, family: 'portrait' }),
  withDefaults({ id: 'home-banner', name: '首页 Banner', width: 525, height: 705, family: 'portrait' }),
  withDefaults({ id: 'popup-image', name: '弹窗图', width: 620, height: 727, family: 'portrait' }),
  withDefaults({ id: 'phone-1125x2436', name: '全面屏 1125×2436', width: 1125, height: 2436, family: 'portrait' }),
  withDefaults({ id: 'phone-1080x2160', name: '全面屏 1080×2160', width: 1080, height: 2160, family: 'portrait' }),
  withDefaults({ id: 'popup-620x775', name: '弹窗 620×775', width: 620, height: 775, family: 'portrait' }),

  // 横版 / Banner
  withDefaults({ id: 'landscape-cover', name: '横版封面', width: 1920, height: 1080, family: 'landscape' }),
  withDefaults({ id: 'share-poster-1', name: '转发海报1', width: 1300, height: 750, family: 'landscape' }),
  withDefaults({ id: 'share-poster-2', name: '转发海报2', width: 1500, height: 750, family: 'landscape' }),
  withDefaults({ id: 'ultra-wide-banner', name: '超宽 Banner 1053×186', width: 1053, height: 186, mode: 'banner', family: 'landscape' }),
  withDefaults({ id: 'banner-670x136', name: 'Banner 670×136', width: 670, height: 136, mode: 'banner', family: 'landscape' }),
  withDefaults({ id: 'banner-1005x360', name: 'Banner 1005×360', width: 1005, height: 360, mode: 'banner', family: 'landscape' }),
  withDefaults({ id: 'banner-1005x204', name: 'Banner 1005×204', width: 1005, height: 204, mode: 'banner', family: 'landscape' }),

  // 方版
  withDefaults({ id: 'mini-share-1-1', name: '小程序分享 1:1', width: 500, height: 500, family: 'square' }),
  withDefaults({ id: 'mini-share-5-4', name: '小程序分享 5:4', width: 500, height: 400, family: 'square' }),
];

export const RECOMMENDED_WIDTH = 1080;
export const RECOMMENDED_HEIGHT = 1920;
