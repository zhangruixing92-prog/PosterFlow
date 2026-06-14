export type LayerType = 'logo' | 'title' | 'subtitle' | 'subject' | 'cta' | 'element';

export type LayoutMode = 'poster' | 'square' | 'landscape' | 'portrait' | 'banner';

/** 尺寸类别：竖版 / 横版·Banner / 方版 */
export type SizeFamily = 'portrait' | 'landscape' | 'square';

export interface LayerRect {
  id: string;
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SizeTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  mode: LayoutMode;
  /** 尺寸类别，决定布局策略与默认内容 */
  family?: SizeFamily;
  /** 该尺寸应包含的内容描述（自然语言，可编辑） */
  contentDescription?: string;
  /** 截图框选指定的元素（优先于文字描述） */
  elementSpec?: SizeElementSpec;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SizeElementSpec {
  cropRect?: CropRect;
  layerIds: string[];
  referenceCrop: string;
}

export interface GeneratedImage {
  size: SizeTemplate;
  blob: Blob;
  dataUrl: string;
}

export interface PosterProject {
  imageDataUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  layers: LayerRect[];
  selectedSizeIds: string[];
  customSizes: SizeTemplate[];
  /** 各尺寸内容描述覆盖（sizeId → description） */
  sizeContentDescriptions?: Record<string, string>;
  /** 各尺寸截图框选规格（sizeId → spec） */
  sizeElementSpecs?: Record<string, SizeElementSpec>;
}

export const LAYER_TYPE_LABELS: Record<LayerType, string> = {
  logo: 'Logo',
  title: '主标题',
  subtitle: '副标题',
  subject: '主视觉主体',
  cta: 'CTA按钮',
  element: '保留元素',
};

export const LAYER_TYPE_COLORS: Record<LayerType, string> = {
  logo: '#3b82f6',
  title: '#ef4444',
  subtitle: '#f97316',
  subject: '#22c55e',
  cta: '#a855f7',
  element: '#38bdf8',
};
