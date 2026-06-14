import { useState } from 'react';
import { refineImageInstruction } from '../services/qwenVision';

interface ImageInstructionPanelProps {
  masterImageDataUrl: string;
  value: string;
  onChange: (value: string) => void;
}

export function ImageInstructionPanel({
  masterImageDataUrl,
  value,
  onChange,
}: ImageInstructionPanelProps) {
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefine = async () => {
    if (!value.trim()) return;
    setRefining(true);
    setError(null);
    try {
      const polished = await refineImageInstruction(masterImageDataUrl, value);
      if (polished) onChange(polished);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 润色失败');
    } finally {
      setRefining(false);
    }
  };

  return (
    <section className="panel instruction-panel">
      <div className="panel-header">
        <div>
          <h2>本图特殊要求（可选）</h2>
          <p>针对这张主海报的额外要求，AI 润色后会补充到提示词，作用于全部尺寸</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={handleRefine}
          disabled={refining || !value.trim()}
        >
          {refining ? 'AI 润色中…' : 'AI 润色'}
        </button>
      </div>
      <textarea
        className="instruction-textarea"
        rows={3}
        placeholder="例如：整体更冷色调、主视觉再大一些、底部留出更多空白放活动信息…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <p className="finetune-error">{error}</p>}
    </section>
  );
}
