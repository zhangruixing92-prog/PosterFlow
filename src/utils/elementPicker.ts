import type { LayerRect } from '../types/poster';
import { LAYER_TYPE_LABELS } from '../types/poster';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SizeElementSpec {
  /** 在主图上的匹配区域（主图坐标） */
  cropRect?: CropRect;
  /** 框选/粘贴命中的图层 ID */
  layerIds: string[];
  /** 参考缩略图（粘贴或框选的截图） */
  referenceCrop: string;
}

function intersectionArea(a: CropRect, b: CropRect): number {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return 0;
  return (right - x) * (bottom - y);
}

function centerInside(crop: CropRect, layer: LayerRect): boolean {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  return cx >= crop.x && cx <= crop.x + crop.width && cy >= crop.y && cy <= crop.y + crop.height;
}

export function findLayersInCrop(layers: LayerRect[], crop: CropRect): LayerRect[] {
  return layers.filter((layer) => {
    const layerArea = layer.width * layer.height;
    if (layerArea <= 0) return false;
    const overlap = intersectionArea(crop, layer);
    const overlapRatio = overlap / layerArea;
    return overlapRatio >= 0.2 || centerInside(crop, layer);
  });
}

export function layersToDescription(layers: LayerRect[]): string {
  const types = [...new Set(layers.map((layer) => layer.type))];
  const order: import('../types/poster').LayerType[] = [
    'logo',
    'subtitle',
    'title',
    'subject',
    'element',
    'cta',
  ];
  return order
    .filter((type) => types.includes(type))
    .map((type) => LAYER_TYPE_LABELS[type])
    .join(' + ');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = src;
  });
}

function toGrayscale(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    gray[i] = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
  }
  return gray;
}

/** 在主海报上定位粘贴截图的位置（模板匹配） */
export async function findPasteRegionOnMaster(
  masterSrc: string,
  pasteDataUrl: string,
  masterWidth: number,
  masterHeight: number,
): Promise<CropRect | null> {
  const [masterImage, pasteImage] = await Promise.all([
    loadImage(masterSrc),
    loadImage(pasteDataUrl),
  ]);

  const searchMax = 480;
  const masterScale = Math.min(1, searchMax / Math.max(masterWidth, masterHeight));
  const sw = Math.max(1, Math.round(masterWidth * masterScale));
  const sh = Math.max(1, Math.round(masterHeight * masterScale));

  const masterCanvas = document.createElement('canvas');
  masterCanvas.width = sw;
  masterCanvas.height = sh;
  const masterCtx = masterCanvas.getContext('2d');
  if (!masterCtx) return null;
  masterCtx.drawImage(masterImage, 0, 0, sw, sh);
  const masterGray = toGrayscale(masterCtx.getImageData(0, 0, sw, sh).data, sw, sh);

  const pasteScale = Math.min(1, (sw * 0.85) / pasteImage.width, (sh * 0.85) / pasteImage.height);
  const pw = Math.max(8, Math.round(pasteImage.width * pasteScale));
  const ph = Math.max(8, Math.round(pasteImage.height * pasteScale));

  const pasteCanvas = document.createElement('canvas');
  pasteCanvas.width = pw;
  pasteCanvas.height = ph;
  const pasteCtx = pasteCanvas.getContext('2d');
  if (!pasteCtx) return null;
  pasteCtx.drawImage(pasteImage, 0, 0, pw, ph);
  const pasteGray = toGrayscale(pasteCtx.getImageData(0, 0, pw, ph).data, pw, ph);

  if (pw > sw || ph > sh) return null;

  let bestScore = Number.POSITIVE_INFINITY;
  let bestX = 0;
  let bestY = 0;
  const step = Math.max(2, Math.round(Math.min(sw, sh) / 120));

  for (let y = 0; y <= sh - ph; y += step) {
    for (let x = 0; x <= sw - pw; x += step) {
      let diff = 0;
      for (let py = 0; py < ph; py += 2) {
        for (let px = 0; px < pw; px += 2) {
          const masterVal = masterGray[(y + py) * sw + (x + px)];
          const pasteVal = pasteGray[py * pw + px];
          const delta = masterVal - pasteVal;
          diff += delta * delta;
        }
      }
      if (diff < bestScore) {
        bestScore = diff;
        bestX = x;
        bestY = y;
      }
    }
  }

  const samples = (pw / 2) * (ph / 2);
  const normalized = bestScore / Math.max(1, samples);
  if (normalized > 3500) return null;

  const inv = 1 / masterScale;
  return {
    x: Math.round(bestX * inv),
    y: Math.round(bestY * inv),
    width: Math.round(pw * inv),
    height: Math.round(ph * inv),
  };
}

export async function cropMasterThumbnail(
  imageSrc: string,
  crop: CropRect,
  maxEdge = 240,
): Promise<string> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxEdge / Math.max(crop.width, crop.height));
  canvas.width = Math.max(1, Math.round(crop.width * scale));
  canvas.height = Math.max(1, Math.round(crop.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL('image/png');
}

export async function buildSizeElementSpec(
  imageSrc: string,
  layers: LayerRect[],
  crop: CropRect,
): Promise<SizeElementSpec | null> {
  const matched = findLayersInCrop(layers, crop);
  if (matched.length === 0) return null;

  const referenceCrop = await cropMasterThumbnail(imageSrc, crop);
  return {
    cropRect: crop,
    layerIds: matched.map((layer) => layer.id),
    referenceCrop,
  };
}

export interface PasteSpecResult {
  spec: SizeElementSpec;
  matchedLayers: LayerRect[];
  matchedOnMaster: boolean;
}

/** 将剪贴板截图粘贴到尺寸规格：保存参考图 + 在主图上定位 + 匹配图层 */
export async function buildSizeElementSpecFromPaste(
  masterSrc: string,
  masterWidth: number,
  masterHeight: number,
  pasteDataUrl: string,
  layers: LayerRect[],
): Promise<PasteSpecResult> {
  const cropRect = await findPasteRegionOnMaster(
    masterSrc,
    pasteDataUrl,
    masterWidth,
    masterHeight,
  );

  const matchedLayers = cropRect && layers.length > 0
    ? findLayersInCrop(layers, cropRect)
    : [];

  const spec: SizeElementSpec = {
    cropRect: cropRect ?? undefined,
    layerIds: matchedLayers.map((layer) => layer.id),
    referenceCrop: pasteDataUrl,
  };

  return {
    spec,
    matchedLayers,
    matchedOnMaster: Boolean(cropRect),
  };
}

export function readClipboardImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read image'));
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

export function summarizeElementSpec(layers: LayerRect[], spec?: SizeElementSpec): string {
  if (!spec) return '';
  if (spec.layerIds.length > 0) {
    const picked = layers.filter((layer) => spec.layerIds.includes(layer.id));
    return layersToDescription(picked);
  }
  if (spec.referenceCrop) return '已粘贴参考截图';
  return '';
}
