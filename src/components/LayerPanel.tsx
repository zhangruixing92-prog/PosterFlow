import { LAYER_TYPE_COLORS, type LayerRect } from '../types/poster';

interface LayerPanelProps {
  layers: LayerRect[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onDeleteLayer: (layerId: string) => void;
}

export function LayerPanel({
  layers,
  selectedLayerId,
  onSelectLayer,
  onDeleteLayer,
}: LayerPanelProps) {
  return (
    <section className="panel layer-panel">
      <div className="panel-header">
        <h2>保留元素</h2>
        <p>在左侧主图上框选的区域即为扩展图要保留的元素；Generate All 时由 AI 按尺寸自动排版。</p>
      </div>

      <p className="archetype-tip">
        已标记 {layers.length} 个元素
        {layers.length > 0 ? '，全部会参与各尺寸生成' : '，请先框选至少一个区域'}
      </p>

      <div className="layer-list">
        {layers.length === 0 && (
          <p className="empty-tip">在画布空白处拖拽即可框选要保留的元素（Logo、标题、产品等均可）</p>
        )}
        {layers.map((layer, index) => (
          <article
            key={layer.id}
            className={`layer-item ${selectedLayerId === layer.id ? 'selected' : ''}`}
            onClick={() => onSelectLayer(layer.id)}
          >
            <div className="layer-item-head">
              <span className="dot" style={{ backgroundColor: LAYER_TYPE_COLORS.element }} />
              <strong>元素 {index + 1}</strong>
            </div>
            <p className="layer-meta">
              x:{Math.round(layer.x)} y:{Math.round(layer.y)} · {Math.round(layer.width)}×
              {Math.round(layer.height)}
            </p>
            <div className="layer-actions">
              <button
                type="button"
                className="danger-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteLayer(layer.id);
                }}
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
