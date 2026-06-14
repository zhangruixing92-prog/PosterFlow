import JSZip from 'jszip';
import type { GeneratedImage } from '../types/poster';

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

export function buildExportFileName(image: GeneratedImage): string {
  const safeName = sanitizeFileName(image.size.name);
  return `${safeName}_${image.size.width}x${image.size.height}.png`;
}

export async function createZipFromImages(images: GeneratedImage[]): Promise<Blob> {
  const zip = new JSZip();

  for (const image of images) {
    zip.file(buildExportFileName(image), image.blob);
  }

  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadZip(images: GeneratedImage[], zipName = 'PosterFlow导出.zip'): Promise<void> {
  const zipBlob = await createZipFromImages(images);
  downloadBlob(zipBlob, zipName);
}
