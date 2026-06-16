import { getAiModelSettings, getImageApiRoot } from '../config/aiModel';
import { downloadAndResize } from '../utils/canvas';
import { describeError, logger } from '../utils/logger';

// 超采样默认目标像素（清晰度），可被 UI 参数覆盖；映射到 gpt-image-2-all 的 1k/2k
export const DEFAULT_TARGET_PIXELS = 2_800_000;

const QUALITY_SUFFIX =
  ' 画面高清、清晰锐利、细节丰富、文字边缘清晰可读，无模糊、无噪点、无压缩失真。';

const ASPECT_RATIO_CANDIDATES: Array<[string, number]> = [
  ['1:1', 1],
  ['16:9', 16 / 9],
  ['9:16', 9 / 16],
  ['4:3', 4 / 3],
  ['3:4', 3 / 4],
  ['3:2', 3 / 2],
  ['2:3', 2 / 3],
  ['21:9', 21 / 9],
];

export interface GeneratePosterOptions {
  /** 覆盖生图模型，默认取配置（gpt-image-2-all） */
  model?: string;
  /** 超采样目标像素（清晰度），越大越清晰但越慢 */
  targetPixels?: number;
}

function toAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  let best = '1:1';
  let bestDiff = Infinity;
  for (const [label, candidate] of ASPECT_RATIO_CANDIDATES) {
    const diff = Math.abs(Math.log(ratio / candidate));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  return best;
}

function toResolution(targetPixels: number | undefined, defaultResolution: string): string {
  if (!targetPixels || targetPixels <= 0) return defaultResolution;
  return targetPixels < 2_000_000 ? '1k' : '2k';
}

interface GptImageResponse {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
  message?: string;
}

function extractImageUrl(data: GptImageResponse): string {
  const item = data.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) {
    const raw = item.b64_json;
    return raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
  }
  throw new Error('模型未返回图片');
}

/**
 * 用 gpt-image-2-all「图生图」直接生成目标尺寸整图。
 * 输入主海报 + 提示词，经 yhmx 网关调用 OpenAI Images API，再缩放到精确目标尺寸。
 * 不做任何本地兜底：失败直接抛错。
 */
export async function generatePosterImage(
  masterDataUrl: string,
  prompt: string,
  targetWidth: number,
  targetHeight: number,
  options: GeneratePosterOptions = {},
): Promise<string> {
  const { image } = getAiModelSettings();
  if (!image.apiKey) throw new Error('未配置图生图 API Key（yhmx），无法生成');

  const targetPixels =
    options.targetPixels && options.targetPixels > 0 ? options.targetPixels : DEFAULT_TARGET_PIXELS;
  const model = options.model?.trim() || image.expandModel;
  const aspectRatio = toAspectRatio(targetWidth, targetHeight);
  const resolution = toResolution(targetPixels, image.resolution);
  const endpoint = image.generationEndpoint || '/v1/images/generations';

  logger.info('image.generate.request', {
    model,
    provider: image.provider,
    target: `${targetWidth}x${targetHeight}`,
    aspectRatio,
    resolution,
    targetPixels,
    promptLength: prompt.length,
    promptPreview: prompt.slice(0, 200),
    masterBytes: masterDataUrl.length,
  });

  let response: Response;
  try {
    response = await fetch(`${getImageApiRoot()}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${image.apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: `${prompt}${QUALITY_SUFFIX}`,
        n: 1,
        resolution,
        size: aspectRatio,
        response_format: 'url',
        image: [masterDataUrl],
      }),
    });
  } catch (networkError) {
    logger.error('image.generate.network', {
      model,
      aspectRatio,
      resolution,
      error: describeError(networkError),
    });
    throw networkError;
  }

  const data = (await response.json()) as GptImageResponse;
  if (!response.ok) {
    logger.error('image.generate.apiError', {
      model,
      status: response.status,
      message: data.error?.message || data.message,
      aspectRatio,
      resolution,
      target: `${targetWidth}x${targetHeight}`,
      targetPixels,
    });
    throw new Error(data.error?.message || data.message || `生成失败 HTTP ${response.status}`);
  }

  const resultUrl = extractImageUrl(data);
  let finalDataUrl: string;
  try {
    finalDataUrl = await downloadAndResize(resultUrl, targetWidth, targetHeight);
  } catch (resizeError) {
    logger.error('image.generate.resizeError', {
      model,
      resultUrl: resultUrl.slice(0, 120),
      target: `${targetWidth}x${targetHeight}`,
      error: describeError(resizeError),
    });
    throw resizeError;
  }
  logger.info('image.generate.ok', {
    model,
    target: `${targetWidth}x${targetHeight}`,
    aspectRatio,
    resolution,
  });
  return finalDataUrl;
}
