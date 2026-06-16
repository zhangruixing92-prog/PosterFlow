export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });
}

/** 生成小缩略图 dataURL（用于历史封面） */
export async function makeThumbnail(src: string, maxEdge = 200): Promise<string> {
  const img = await loadImage(src);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('导出画布失败'));
    }, 'image/png');
  });
}

function toImageLoadSrc(src: string): string {
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;
  return `/img-proxy?url=${encodeURIComponent(src)}`;
}

/**
 * 将图片（URL 或 dataURL）缩放到精确目标尺寸，返回 dataURL。
 */
export async function resizeToDataUrl(
  src: string,
  targetWidth: number,
  targetHeight: number,
): Promise<string> {
  const image = await loadImage(toImageLoadSrc(src));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布上下文');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/png');
}

/**
 * 下载模型返回的结果图（经本地 /img-proxy 绕过 CORS），缩放到精确目标尺寸，返回 dataURL。
 */
export async function downloadAndResize(
  resultUrl: string,
  targetWidth: number,
  targetHeight: number,
): Promise<string> {
  if (resultUrl.startsWith('data:')) {
    return resizeToDataUrl(resultUrl, targetWidth, targetHeight);
  }
  const proxied = `/img-proxy?url=${encodeURIComponent(resultUrl)}`;
  const response = await fetch(proxied);
  if (!response.ok) throw new Error(`下载结果图失败 HTTP ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await resizeToDataUrl(objectUrl, targetWidth, targetHeight);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
