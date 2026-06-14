import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeneratedImage, LayerRect, SizeTemplate } from '../types/poster';
import {
  buildFineTuneContext,
  regenerateSize,
  type FineTuneContext,
  type PromptContext,
} from '../services/generationPipeline';

interface FineTunePanelProps {
  size: SizeTemplate;
  masterImageDataUrl: string;
  masterWidth: number;
  masterHeight: number;
  layers: LayerRect[];
  promptContext: PromptContext;
  currentImage?: GeneratedImage;
  onClose: () => void;
  onRegenerated: (image: GeneratedImage) => void;
}

interface FormState {
  model: string;
  prompt: string;
  baseImage: string;
}

export function FineTunePanel({
  size,
  masterImageDataUrl,
  masterWidth,
  masterHeight,
  layers,
  promptContext,
  currentImage,
  onClose,
  onRegenerated,
}: FineTunePanelProps) {
  const [context, setContext] = useState<FineTuneContext | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | undefined>(currentImage?.dataUrl);
  const baseFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    buildFineTuneContext(masterImageDataUrl, masterWidth, masterHeight, layers, size, promptContext)
      .then((ctx) => {
        if (cancelled) return;
        setContext(ctx);
        setForm({ model: ctx.model, prompt: ctx.prompt, baseImage: ctx.baseImage });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载精调参数失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [layers, masterHeight, masterImageDataUrl, masterWidth, size, promptContext]);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleBaseReplace = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => update('baseImage', reader.result as string);
      reader.readAsDataURL(file);
    },
    [update],
  );

  const handleRegenerate = useCallback(async () => {
    if (!form || !context) return;
    setRegenerating(true);
    setError(null);
    try {
      const image = await regenerateSize(masterImageDataUrl, masterWidth, masterHeight, layers, size, {
        model: form.model,
        prompt: form.prompt,
        baseImage: form.baseImage !== context.baseImage ? form.baseImage : undefined,
        targetPixels: promptContext.targetPixels,
      });
      setPreview(image.dataUrl);
      onRegenerated(image);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新生成失败');
    } finally {
      setRegenerating(false);
    }
  }, [context, form, layers, masterHeight, masterImageDataUrl, masterWidth, onRegenerated, promptContext, size]);

  return (
    <div className="finetune-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="finetune-modal" onClick={(event) => event.stopPropagation()}>
        <div className="finetune-header">
          <div>
            <h3>精调 · {size.name}</h3>
            <p>{size.width}×{size.height}</p>
          </div>
          <button type="button" className="finetune-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        {loading ? (
          <div className="finetune-body finetune-loading">正在加载该尺寸的模型参数…</div>
        ) : !form || !context ? (
          <div className="finetune-body finetune-loading">{error ?? '无法加载参数'}</div>
        ) : (
          <div className="finetune-body">
            <div className="finetune-grid">
              <div className="finetune-fields">
                <section className="finetune-section">
                  <header className="finetune-section-header">
                    <h4>图生图模型</h4>
                    <span className="ft-tag ft-tag-on">将调用</span>
                  </header>
                  <p className="finetune-note">保留元素：{context.keptElements}</p>
                  <label className="finetune-label">调用的模型</label>
                  <input
                    className="finetune-input"
                    value={form.model}
                    onChange={(event) => update('model', event.target.value)}
                  />
                  <label className="finetune-label">输入给模型的主海报（图生图底图）</label>
                  <div className="finetune-thumb">
                    <img src={form.baseImage} alt="图生图底图" />
                  </div>
                  <div className="finetune-image-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => baseFileInputRef.current?.click()}
                    >
                      替换底图
                    </button>
                    {form.baseImage !== context.baseImage && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => update('baseImage', context.baseImage)}
                      >
                        恢复默认
                      </button>
                    )}
                    <input
                      ref={baseFileInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={handleBaseReplace}
                    />
                  </div>
                  <label className="finetune-label">输入给模型的提示词</label>
                  <textarea
                    className="finetune-textarea"
                    rows={10}
                    value={form.prompt}
                    onChange={(event) => update('prompt', event.target.value)}
                  />
                </section>
              </div>

              <aside className="finetune-preview">
                <label className="finetune-label">生成预览</label>
                <div
                  className="finetune-preview-image"
                  style={{ aspectRatio: `${size.width} / ${size.height}` }}
                >
                  {preview ? <img src={preview} alt="生成预览" /> : <span>尚未生成</span>}
                </div>
              </aside>
            </div>

            {error && <p className="finetune-error">{error}</p>}

            <div className="finetune-footer">
              <button type="button" className="secondary-button" onClick={onClose} disabled={regenerating}>
                关闭
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                {regenerating ? '重新生成中…' : '重新生成此尺寸'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
