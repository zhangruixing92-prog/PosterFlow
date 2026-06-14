import { useState } from 'react';
import { extractMasterContent } from '../services/qwenVision';

interface MasterContentPanelProps {
  masterImageDataUrl: string;
  texts: string;
  elements: string;
  onChange: (next: { texts?: string; elements?: string }) => void;
}

export function MasterContentPanel({
  masterImageDataUrl,
  texts,
  elements,
  onChange,
}: MasterContentPanelProps) {
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = async () => {
    setExtracting(true);
    setError(null);
    try {
      const content = await extractMasterContent(masterImageDataUrl);
      onChange({ texts: content.texts.join('\n'), elements: content.elements.join('\n') });
    } catch (err) {
      setError(err instanceof Error ? err.message : '提取失败');
    } finally {
      setExtracting(false);
    }
  };

  return (
    <section className="panel instruction-panel">
      <div className="panel-header">
        <div>
          <h2>主视觉文案与元素（AI 提取）</h2>
          <p>提取主图的原文案与核心元素，作为图生图的硬约束：严格按原文案生成、不截断、不臆造</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={handleExtract}
          disabled={extracting}
        >
          {extracting ? 'AI 提取中…' : texts || elements ? '重新提取' : 'AI 提取'}
        </button>
      </div>
      <div className="master-content-grid">
        <div>
          <label className="finetune-label">主视觉文案（每行一条，可修正 OCR 误差）</label>
          <textarea
            className="instruction-textarea"
            rows={5}
            placeholder="点击「AI 提取」自动识别，或手动逐行填写画面文字"
            value={texts}
            onChange={(event) => onChange({ texts: event.target.value })}
          />
        </div>
        <div>
          <label className="finetune-label">核心视觉元素（每行一条）</label>
          <textarea
            className="instruction-textarea"
            rows={5}
            placeholder="如：银色SUV轿车 / 充电桩 / 水墨山水背景"
            value={elements}
            onChange={(event) => onChange({ elements: event.target.value })}
          />
        </div>
      </div>
      {error && <p className="finetune-error">{error}</p>}
    </section>
  );
}
