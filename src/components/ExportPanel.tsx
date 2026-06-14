import { useState } from 'react';
import type { GeneratedImage, LayerRect } from '../types/poster';
import { buildExportFileName } from '../engines/exportEngine';
import {
  describeGenerationStage,
  type GenerationProgress,
  type PromptContext,
} from '../services/generationPipeline';
import { isAiEnabled } from '../config/aiModel';
import { FineTunePanel } from './FineTunePanel';

interface ExportPanelProps {
  selectedCount: number;
  generatedImages: GeneratedImage[];
  isGenerating: boolean;
  generationProgress: GenerationProgress | null;
  masterImageDataUrl: string | null;
  masterWidth: number;
  masterHeight: number;
  layers: LayerRect[];
  promptContext: PromptContext;
  clarity: number;
  onClarityChange: (value: number) => void;
  onGenerateAll: () => void;
  onDownloadZip: () => void;
  onSizeRegenerated: (image: GeneratedImage) => void;
}

// 受 i2i 总像素上限(4194304)约束，最高档位留出余量
const CLARITY_OPTIONS: Array<{ label: string; value: number; hint: string }> = [
  { label: '标准', value: 1_600_000, hint: '更快' },
  { label: '高清', value: 2_800_000, hint: '推荐' },
  { label: '超清', value: 4_000_000, hint: '最清晰' },
];

export function ExportPanel({
  selectedCount,
  generatedImages,
  isGenerating,
  generationProgress,
  masterImageDataUrl,
  masterWidth,
  masterHeight,
  layers,
  promptContext,
  clarity,
  onClarityChange,
  onGenerateAll,
  onDownloadZip,
  onSizeRegenerated,
}: ExportPanelProps) {
  const [fineTuneSizeId, setFineTuneSizeId] = useState<string | null>(null);
  const fineTuneImage = generatedImages.find((image) => image.size.id === fineTuneSizeId) ?? null;

  const progressText =
    isGenerating && generationProgress
      ? `${describeGenerationStage(generationProgress.stage)}：${generationProgress.sizeName}（${generationProgress.current}/${generationProgress.total}）`
      : null;

  return (
    <section className="panel export-panel">
      <div className="panel-header export-panel-header">
        <div>
          <h2>批量生成与导出</h2>
          <p>
            已选择 {selectedCount} 个尺寸，生成后可打包下载 ZIP
            {isAiEnabled() && (
              <span className="vision-badge">AI 生成已启用（视觉 + 扩图）</span>
            )}
          </p>
          {progressText && <p className="generation-progress">{progressText}</p>}
          {!isGenerating && (
            <p className="generation-hint">每个尺寸由图像模型（wan2.7-image）直接图生图出整图</p>
          )}
        </div>
        <div className="export-actions">
          <label className="clarity-control">
            <span>清晰度</span>
            <select
              value={clarity}
              disabled={isGenerating}
              onChange={(event) => onClarityChange(Number(event.target.value))}
            >
              {CLARITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}（{option.hint}）
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={selectedCount === 0 || isGenerating}
            onClick={onGenerateAll}
          >
            {isGenerating ? 'AI 生成中...' : 'Generate All'}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={generatedImages.length === 0 || isGenerating}
            onClick={onDownloadZip}
          >
            Download ZIP
          </button>
        </div>
      </div>

      {generatedImages.length > 0 && (
        <div className="preview-grid">
          {generatedImages.map((image) => (
            <figure key={image.size.id} className="preview-card">
              <div
                className="preview-image-wrap"
                style={{ aspectRatio: `${image.size.width} / ${image.size.height}` }}
              >
                <img src={image.dataUrl} alt={image.size.name} />
              </div>
              <figcaption>
                <strong>{image.size.name}</strong>
                <span>{buildExportFileName(image)}</span>
              </figcaption>
              <button
                type="button"
                className="finetune-trigger"
                disabled={isGenerating || !masterImageDataUrl}
                onClick={() => setFineTuneSizeId(image.size.id)}
              >
                精调
              </button>
            </figure>
          ))}
        </div>
      )}

      {fineTuneImage && masterImageDataUrl && (
        <FineTunePanel
          size={fineTuneImage.size}
          masterImageDataUrl={masterImageDataUrl}
          masterWidth={masterWidth}
          masterHeight={masterHeight}
          layers={layers}
          promptContext={promptContext}
          currentImage={fineTuneImage}
          onClose={() => setFineTuneSizeId(null)}
          onRegenerated={onSizeRegenerated}
        />
      )}
    </section>
  );
}
