import { getAiModelSettings, getDashScopeRoot } from '../config/aiModel';
import { downloadAndResize } from '../utils/canvas';
import { describeError, logger } from '../utils/logger';

const GENERATION_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

// wan2.7-image 图生图(i2i)像素范围限制：总像素 589824 ~ 4194304(2K)，单边 ≤ 4096
const MIN_PIXELS = 589_824;
const MAX_PIXELS = 4_194_304;
// 超采样默认目标像素（清晰度），可被 UI 参数覆盖
export const DEFAULT_TARGET_PIXELS = 2_800_000;
const MAX_SIDE = 4096;

const QUALITY_SUFFIX =
  ' 画面高清、清晰锐利、细节丰富、文字边缘清晰可读，无模糊、无噪点、无压缩失真。';
const NEGATIVE_PROMPT =
  '模糊, 失焦, 低清, 低分辨率, 噪点, 颗粒, 压缩失真, 马赛克, 重影, 伪影, 水印, 文字错乱, 错字, 乱码, ' +
  '人物变形, 面部扭曲, 五官错乱, 肢体畸形, 多手多指, 缺指, 多肢, 比例失调, 姿态怪异, ' +
  'deformed, distorted, bad anatomy, extra fingers, fused fingers, mutated hands, malformed limbs, disfigured';

export interface GeneratePosterOptions {
  /** 覆盖生图模型，默认取配置（wan2.7-image） */
  model?: string;
  /** 超采样目标像素（清晰度），越大越清晰但越慢 */
  targetPixels?: number;
}

/**
 * 计算送给模型的出图尺寸：在目标比例下放大到约 targetPixels（超采样），
 * 夹在模型像素范围与最长边限制内；最终再缩放回精确目标尺寸。
 */
function clampRequestSize(
  width: number,
  height: number,
  targetPixels: number,
): { w: number; h: number } {
  const pixels = width * height;
  const desired = Math.min(MAX_PIXELS * 0.98, Math.max(MIN_PIXELS * 1.02, targetPixels));
  let scale = Math.sqrt(Math.max(pixels, desired) / pixels);
  if (pixels * scale * scale > MAX_PIXELS * 0.98) {
    scale = Math.sqrt((MAX_PIXELS * 0.98) / pixels);
  }
  let w = Math.round(width * scale);
  let h = Math.round(height * scale);
  const longest = Math.max(w, h);
  if (longest > MAX_SIDE) {
    const k = MAX_SIDE / longest;
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  return { w, h };
}

interface GenerationResponse {
  output?: {
    choices?: Array<{ message?: { content?: Array<{ image?: string; text?: string }> } }>;
  };
  code?: string;
  message?: string;
}

function extractImageUrl(data: GenerationResponse): string {
  const content = data.output?.choices?.[0]?.message?.content ?? [];
  for (const item of content) {
    if (item.image) return item.image;
  }
  throw new Error('模型未返回图片');
}

/**
 * 用 wan2.7-image「图生图」直接生成目标尺寸整图。
 * 输入主海报 + 提示词，模型按可用像素范围出图，再缩放到精确目标尺寸。
 * 不做任何本地兜底：失败直接抛错。
 */
export async function generatePosterImage(
  masterDataUrl: string,
  prompt: string,
  targetWidth: number,
  targetHeight: number,
  options: GeneratePosterOptions = {},
): Promise<string> {
  const { image, apiKey } = getAiModelSettings();
  if (!apiKey) throw new Error('未配置图像模型 API Key，无法生成');

  const targetPixels =
    options.targetPixels && options.targetPixels > 0 ? options.targetPixels : DEFAULT_TARGET_PIXELS;
  const req = clampRequestSize(targetWidth, targetHeight, targetPixels);
  const model = options.model?.trim() || image.expandModel;

  logger.info('image.generate.request', {
    model,
    target: `${targetWidth}x${targetHeight}`,
    requested: `${req.w}x${req.h}`,
    requestedPixels: req.w * req.h,
    targetPixels,
    promptLength: prompt.length,
    promptPreview: prompt.slice(0, 200),
    masterBytes: masterDataUrl.length,
  });

  let response: Response;
  try {
    response = await fetch(`${getDashScopeRoot()}${GENERATION_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            {
              role: 'user',
              content: [{ image: masterDataUrl }, { text: prompt + QUALITY_SUFFIX }],
            },
          ],
        },
        parameters: {
          size: `${req.w}*${req.h}`,
          n: 1,
          negative_prompt: NEGATIVE_PROMPT,
          // 关闭提示词扩写，避免模型自行添加无关文案
          prompt_extend: false,
        },
      }),
    });
  } catch (networkError) {
    logger.error('image.generate.network', {
      model,
      requested: `${req.w}x${req.h}`,
      error: describeError(networkError),
    });
    throw networkError;
  }

  const data = (await response.json()) as GenerationResponse;
  if (!response.ok) {
    logger.error('image.generate.apiError', {
      model,
      status: response.status,
      code: data.code,
      message: data.message,
      requested: `${req.w}x${req.h}`,
      requestedPixels: req.w * req.h,
      target: `${targetWidth}x${targetHeight}`,
      targetPixels,
    });
    throw new Error(data.message || `生成失败 HTTP ${response.status}`);
  }

  const resultUrl = extractImageUrl(data);
  const finalDataUrl = await downloadAndResize(resultUrl, targetWidth, targetHeight);
  logger.info('image.generate.ok', {
    model,
    target: `${targetWidth}x${targetHeight}`,
    requested: `${req.w}x${req.h}`,
  });
  return finalDataUrl;
}
