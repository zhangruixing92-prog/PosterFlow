import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SIZE_FAMILY_GENERATION_ORDER,
  SIZE_FAMILY_PRESETS,
  attachSizeFamily,
  groupSizesByFamily,
  inferLayoutMode,
  getSizeFamily,
} from '../config/sizeFamilies';
import { getDefaultContentForSize } from '../config/sizeContentSpecs';
import { summarizeElementSpec } from '../utils/elementPicker';
import type { LayerRect, LayoutMode, SizeElementSpec, SizeFamily, SizeTemplate } from '../types/poster';

interface SizeSelectorProps {
  sizes: SizeTemplate[];
  selectedSizeIds: string[];
  layers: LayerRect[];
  pickingSizeId: string | null;
  pastingSizeId: string | null;
  onSelectionChange: (selectedIds: string[]) => void;
  onAddCustomSize: (size: SizeTemplate) => void;
  onContentDescriptionChange: (sizeId: string, description: string) => void;
  onStartSizePick: (sizeId: string) => void;
  onStartPaste: (sizeId: string) => void;
  onPasteScreenshot: (sizeId: string, dataUrl: string) => void;
  onClearElementSpec: (sizeId: string) => void;
}

const MODE_LABELS: Record<LayoutMode, string> = {
  poster: 'Poster',
  square: 'Square',
  landscape: 'Landscape',
  portrait: 'Portrait',
  banner: 'Banner',
};

export function SizeSelector({
  sizes,
  selectedSizeIds,
  layers,
  pickingSizeId,
  pastingSizeId,
  onSelectionChange,
  onAddCustomSize,
  onContentDescriptionChange,
  onStartSizePick,
  onStartPaste,
  onPasteScreenshot,
  onClearElementSpec,
}: SizeSelectorProps) {
  const [showForm, setShowForm] = useState(false);
  const [expandedSizeId, setExpandedSizeId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [width, setWidth] = useState('1080');
  const [height, setHeight] = useState('1920');
  const [mode, setMode] = useState<LayoutMode>('portrait');
  const [customDescription, setCustomDescription] = useState('');
  const [activeFamily, setActiveFamily] = useState<SizeFamily>('portrait');
  const pasteInputRef = useRef<HTMLInputElement>(null);

  const groupedSizes = useMemo(() => groupSizesByFamily(sizes), [sizes]);

  const activeFamilySizes = groupedSizes[activeFamily];
  const activePreset = SIZE_FAMILY_PRESETS[activeFamily];
  const activeFamilyIds = activeFamilySizes.map((size) => size.id);
  const allActiveFamilySelected =
    activeFamilyIds.length > 0 &&
    activeFamilyIds.every((id) => selectedSizeIds.includes(id));

  useEffect(() => {
    if (!pastingSizeId) return;

    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (!file) continue;
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            onPasteScreenshot(pastingSizeId, reader.result);
          }
        };
        reader.readAsDataURL(file);
        break;
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pastingSizeId, onPasteScreenshot]);

  const toggleSize = (sizeId: string) => {
    if (selectedSizeIds.includes(sizeId)) {
      onSelectionChange(selectedSizeIds.filter((id) => id !== sizeId));
    } else {
      onSelectionChange([...selectedSizeIds, sizeId]);
    }
  };

  const toggleAll = () => {
    if (allActiveFamilySelected) {
      onSelectionChange(selectedSizeIds.filter((id) => !activeFamilyIds.includes(id)));
    } else {
      onSelectionChange([...new Set([...selectedSizeIds, ...activeFamilyIds])]);
    }
  };

  const handleAddCustomSize = () => {
    const parsedWidth = Number(width);
    const parsedHeight = Number(height);
    if (!name.trim() || !parsedWidth || !parsedHeight) {
      alert('请填写完整的尺寸名称和宽高');
      return;
    }

    const draft = attachSizeFamily({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      width: parsedWidth,
      height: parsedHeight,
      mode: mode === 'poster' ? inferLayoutMode(parsedWidth, parsedHeight) : mode,
      contentDescription:
        customDescription.trim() ||
        getDefaultContentForSize('', { width: parsedWidth, height: parsedHeight }).description,
    });

    onAddCustomSize(draft);
    setActiveFamily(getSizeFamily(draft));

    setName('');
    setWidth('1080');
    setHeight('1920');
    setMode('portrait');
    setCustomDescription('');
    setShowForm(false);
  };

  const handleFilePick = async (sizeId: string, file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onPasteScreenshot(sizeId, reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const renderSpecSummary = (size: SizeTemplate, spec?: SizeElementSpec) => {
    if (spec?.layerIds.length) {
      return `截图指定：${summarizeElementSpec(layers, spec)}`;
    }
    if (spec?.referenceCrop) {
      return '已粘贴参考截图（生成时将结合文字描述）';
    }
    return size.contentDescription ?? getDefaultContentForSize(size.id, size).description;
  };

  const renderSizeCard = (size: SizeTemplate) => {
    const description =
      size.contentDescription ?? getDefaultContentForSize(size.id, size).description;
    const spec = size.elementSpec;
    const isExpanded = expandedSizeId === size.id;
    const isPicking = pickingSizeId === size.id;
    const isPasting = pastingSizeId === size.id;

    return (
      <div
        key={size.id}
        className={`size-item-card${isPicking ? ' size-item-picking' : ''}${isPasting ? ' size-item-pasting' : ''}`}
      >
        <label className="size-item">
          <input
            type="checkbox"
            checked={selectedSizeIds.includes(size.id)}
            onChange={() => toggleSize(size.id)}
          />
          <div className="size-item-main">
            <strong>{size.name}</strong>
            <span>
              {size.width} × {size.height} · {MODE_LABELS[size.mode]}
            </span>
            <span className="size-content-summary">{renderSpecSummary(size, spec)}</span>
          </div>
        </label>

        <div
          className={`size-paste-zone${spec?.referenceCrop ? ' has-image' : ''}${isPasting ? ' active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onStartPaste(size.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onStartPaste(size.id);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            onStartPaste(size.id);
          }}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) handleFilePick(size.id, file);
          }}
        >
          {spec?.referenceCrop ? (
            <img src={spec.referenceCrop} alt={`${size.name} 元素参考`} />
          ) : (
            <span>
              {isPasting
                ? '已选中，请 Cmd+V 粘贴截图'
                : '点击此处后粘贴截图（或拖入图片）'}
            </span>
          )}
        </div>

        {spec?.referenceCrop && (
          <p className="size-paste-caption">此尺寸需要的元素参考</p>
        )}

        <div className="size-item-actions">
          <button
            type="button"
            className={`primary-button${isPasting ? ' active' : ''}`}
            onClick={() => onStartPaste(size.id)}
          >
            {isPasting ? '等待粘贴…' : '粘贴截图到此尺寸'}
          </button>
          <button
            type="button"
            className={`secondary-button${isPicking ? ' active' : ''}`}
            onClick={() => onStartSizePick(size.id)}
          >
            {isPicking ? '正在主图框选…' : '主图框选'}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              pasteInputRef.current!.dataset.sizeId = size.id;
              pasteInputRef.current?.click();
            }}
          >
            选择图片
          </button>
          {spec && (
            <button type="button" className="ghost-button" onClick={() => onClearElementSpec(size.id)}>
              清除
            </button>
          )}
          <button
            type="button"
            className="size-expand-button"
            onClick={() => setExpandedSizeId(isExpanded ? null : size.id)}
          >
            {isExpanded ? '收起文字描述' : '文字描述'}
          </button>
        </div>

        {isExpanded && (
          <div className="size-content-editor">
            <textarea
              rows={2}
              value={description}
              placeholder="例如：Logo + 主标题 + 主视觉，不要底栏"
              onChange={(event) => onContentDescriptionChange(size.id, event.target.value)}
              disabled={Boolean(spec?.layerIds.length)}
            />
            {spec?.layerIds.length ? (
              <p className="size-content-hint">截图已匹配图层，清除后可改文字描述</p>
            ) : (
              <p className="size-content-hint">
                粘贴截图后会自动在主图上定位；若已标记图层则自动识别包含哪些元素
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="panel size-panel">
      <div className="panel-header size-panel-header">
        <div>
          <h2>尺寸模板</h2>
          <p>
            切换 Tab 选择不同类别尺寸；Generate All 按 竖版 → 方版 → 横版 依次生成，跨类不含主视觉避免裁切人物。
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={toggleAll}>
          {allActiveFamilySelected ? `取消${activePreset.label}` : `全选${activePreset.label}`}
        </button>
      </div>

      <div className="size-family-tabs" role="tablist" aria-label="尺寸类别">
        {SIZE_FAMILY_GENERATION_ORDER.map((family) => {
          const preset = SIZE_FAMILY_PRESETS[family];
          const familySizes = groupedSizes[family];
          const selectedInFamily = familySizes.filter((size) =>
            selectedSizeIds.includes(size.id),
          ).length;
          const isActive = activeFamily === family;

          return (
            <button
              key={family}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`size-family-tab${isActive ? ' active' : ''}`}
              onClick={() => setActiveFamily(family)}
            >
              <span>{preset.label}</span>
              <span className="size-family-tab-count">
                {selectedInFamily}/{familySizes.length}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="size-family-panel"
        role="tabpanel"
        aria-label={activePreset.label}
      >
        <p className="size-family-panel-desc">{activePreset.description}</p>
        {activeFamilySizes.length > 0 ? (
          <div className="size-grid">{activeFamilySizes.map(renderSizeCard)}</div>
        ) : (
          <p className="size-family-empty">当前类别暂无尺寸</p>
        )}
      </div>

      <input
        ref={pasteInputRef}
        type="file"
        accept="image/*"
        className="visually-hidden"
        onChange={(event) => {
          const sizeId = event.target.dataset.sizeId;
          if (sizeId) handleFilePick(sizeId, event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />

      <div className="custom-size-block">
        <button type="button" className="ghost-button" onClick={() => setShowForm((value) => !value)}>
          {showForm ? '收起新增表单' : '新增自定义尺寸'}
        </button>

        {showForm && (
          <div className="custom-size-form">
            <input
              type="text"
              placeholder="尺寸名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="custom-size-row">
              <input
                type="number"
                min={1}
                placeholder="宽度"
                value={width}
                onChange={(event) => setWidth(event.target.value)}
              />
              <input
                type="number"
                min={1}
                placeholder="高度"
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
              <select value={mode} onChange={(event) => setMode(event.target.value as LayoutMode)}>
                {Object.entries(MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={2}
              placeholder="留空则按宽高自动归入三类并套用默认策略"
              value={customDescription}
              onChange={(event) => setCustomDescription(event.target.value)}
            />
            <button type="button" className="primary-button" onClick={handleAddCustomSize}>
              添加尺寸
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
