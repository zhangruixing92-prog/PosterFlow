import type { LayerType, SizeFamily, SizeTemplate } from '../types/poster';
import { LAYER_TYPE_LABELS } from '../types/poster';
import { getSizeFamily } from '../config/sizeFamilies';

const FAMILY_LAYOUT_GUIDE: Record<SizeFamily, string> = {
  portrait: '竖版构图：上方放 Logo 与文案（标题/副标题/CTA），下方安排主视觉与背景延展',
  landscape: '横版/Banner 构图：左侧背景延展，右侧排文案，主视觉完整不被裁切',
  square: '方版构图：上方文案区、下方背景延展，整体均衡',
};

const FAMILY_BG_GUIDE: Record<SizeFamily, string> = {
  portrait: '竖版：背景上松下实，预留上方文案区与下方主视觉区，过渡自然',
  landscape: '横版/Banner：背景向左右两侧自然延展铺满，右侧预留文案区',
  square: '方版：背景均衡延展铺满画布，预留上方文案区',
};

/**
 * 背景扩展提示词：只把「已抹除元素的纯背景底板」延展到目标比例，
 * 绝不生成文字/人物/Logo/产品/按钮——这些由本地合成阶段贴回。
 */
export function buildBackgroundPrompt(size: SizeTemplate): string {
  const family = getSizeFamily(size);
  return [
    `把这张纯背景图延展铺满 ${size.width}×${size.height} 的画布。`,
    `${FAMILY_BG_GUIDE[family]}。`,
    '严格保持原有品牌调性、色彩、光影、材质与装饰风格一致；只自然补全边缘背景与留白，不留黑边白边。',
    '输入是不含文字、Logo、产品、人物的纯背景；',
    '严禁生成或臆造任何文字、Logo、产品、人物、按钮、图形元素、水印、边框、伪影；画面只能是背景与装饰。',
  ].join('');
}

export function describeKeptElements(types: LayerType[]): string {
  const order: LayerType[] = ['logo', 'title', 'subtitle', 'subject', 'cta', 'element'];
  const labels = order.filter((t) => types.includes(t)).map((t) => LAYER_TYPE_LABELS[t]);
  return labels.length > 0 ? labels.join('、') : '主海报主要元素';
}

export interface BuildPromptInput {
  size: SizeTemplate;
  keptTypes: LayerType[];
  contentDescription?: string;
  /** 用户对本图的特殊要求（已由 qwen-vl 润色），补充进提示词 */
  imageInstruction?: string;
  /** qwen-vl 提取的主视觉原文案，强约束模型严格使用 */
  masterTexts?: string[];
  /** qwen-vl 提取的核心视觉元素 */
  masterElements?: string[];
}

/**
 * 本地拼装「图生图」提示词（不调用任何模型）。
 * 描述如何把主海报适配为目标尺寸整图，由 wan2.7-image 直接出图。
 */
export function buildAdaptationPrompt(input: BuildPromptInput): string {
  const { size } = input;
  const family = getSizeFamily(size);
  const kept = describeKeptElements(input.keptTypes);
  const contentHint = input.contentDescription?.trim()
    ? `内容要求：${input.contentDescription.trim()}。`
    : '';
  const instructionHint = input.imageInstruction?.trim()
    ? `本图特殊要求：${input.imageInstruction.trim()}。`
    : '';

  const texts = (input.masterTexts ?? []).map((t) => t.trim()).filter(Boolean);
  const elements = (input.masterElements ?? []).map((e) => e.trim()).filter(Boolean);

  const elementHint = elements.length
    ? `需完整保留并清晰呈现的核心视觉元素：${elements.join('、')}。`
    : '';
  const hasSubject = input.keptTypes.includes('subject') || input.keptTypes.includes('element');
  const subjectGuard = hasSubject
    ? '人物与主体保持原有外观、结构和比例，五官、四肢、姿态自然准确，与主视觉一致；不得变形、扭曲、错位、改变长相或增减肢体手指。'
    : '';
  const textHint = texts.length
    ? `画面文字必须且只能使用主视觉的原文案，逐字一致、完整呈现、不得截断：${texts
        .map((t) => `「${t}」`)
        .join('、')}。`
    : '';
  // 文字强约束放在末尾，作为最高优先级
  const textGuard = texts.length
    ? '严禁新增、改写、翻译、臆造、复制或重复任何文字；除上述原文案外，画面不得出现其它任何文字；确保每条文案完整、清晰、不被裁切。'
    : '不要改写或新增任何文字、Logo、产品、人物或图形，不要水印、边框、伪影。';

  return [
    `把这张主视觉海报适配为 ${size.width}×${size.height} 的运营海报整图。`,
    `${FAMILY_LAYOUT_GUIDE[family]}。`,
    `保留并清晰呈现：${kept}。`,
    elementHint,
    subjectGuard,
    contentHint,
    instructionHint,
    '严格保持主海报的品牌调性、色彩、光影、材质、装饰风格和信息层级一致；',
    '把内容自然铺满整张画布，补全留白与背景，不留黑边白边；',
    textHint,
    textGuard,
  ]
    .filter(Boolean)
    .join('');
}
