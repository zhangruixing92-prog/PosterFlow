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

/**
 * 从主海报切出的元素贴片（固定资产）。
 * 永不进入图像模型、永不被非等比拉伸；合成时按 srcRect 的宽高比等比落位。
 */
export interface ElementSprite {
  id: string;
  type: LayerType;
  /** 切出的 PNG（Phase1 矩形裁切，Phase2 透明抠图） */
  dataUrl: string;
  /** 在主图上的原始位置（主图像素坐标），用于推断相对布局与宽高比 */
  srcRect: CropRect;
  /** 贴片宽高比 = srcRect.width / srcRect.height */
  aspectRatio: number;
  /** 是否含透明通道（Phase2 抠图后为 true） */
  hasAlpha: boolean;
}

/** 资产切片结果：元素贴片集合 + 抹除元素后的背景底板 */
export interface AssetBundle {
  sprites: ElementSprite[];
  /** 主海报抹除/填充元素区后的纯背景底板 dataUrl，供背景扩展使用 */
  backgroundPlate: string;
}

/** 背景生成结果：扩展到目标比例的纯背景 dataUrl */
export interface BackgroundResult {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * 归一化布局框（0~1，相对目标画布）。
 * 由 Qwen-VL 规划或规则兜底产出；compositor 据此把对应元素贴片等比摆放。
 */
export interface PlannedBox {
  type: LayerType;
  /** 关联的元素贴片 id（可选，缺省时按 type 匹配） */
  spriteId?: string;
  /** 归一化左上角与尺寸，取值 0~1 */
  x: number;
  y: number;
  w: number;
  h: number;
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
