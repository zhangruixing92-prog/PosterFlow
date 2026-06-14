import { useEffect, useMemo } from 'react';
import type { GeneratedImage } from '../types/poster';
import type { HistoryRecord } from '../utils/history';
import { buildExportFileName, downloadBlob, downloadZip } from '../engines/exportEngine';

interface HistoryPanelProps {
  records: HistoryRecord[];
  onDelete: (id: string) => void;
  onClear: () => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

/** 把历史图片还原成 GeneratedImage 形态，复用导出逻辑 */
function toGeneratedImages(record: HistoryRecord): GeneratedImage[] {
  return record.images.map((img) => ({
    size: {
      id: img.sizeId,
      name: img.sizeName,
      width: img.width,
      height: img.height,
      mode: 'portrait',
    },
    blob: img.blob,
    dataUrl: '',
  }));
}

function HistoryCard({
  record,
  onDelete,
}: {
  record: HistoryRecord;
  onDelete: (id: string) => void;
}) {
  const urls = useMemo(() => record.images.map((img) => URL.createObjectURL(img.blob)), [record]);

  useEffect(() => {
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [urls]);

  return (
    <div className="history-card">
      <div className="history-card-head">
        <img className="history-thumb" src={record.masterThumb} alt="主海报" />
        <div className="history-meta">
          <strong>{formatTime(record.createdAt)}</strong>
          <span>{record.count} 个尺寸</span>
        </div>
        <div className="history-card-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              downloadZip(toGeneratedImages(record), `PosterFlow_${record.id.slice(0, 8)}.zip`)
            }
          >
            下载 ZIP
          </button>
          <button type="button" className="link-button" onClick={() => onDelete(record.id)}>
            删除
          </button>
        </div>
      </div>
      <div className="history-grid">
        {record.images.map((img, index) => (
          <figure key={img.sizeId} className="history-item">
            <div
              className="history-item-image"
              style={{ aspectRatio: `${img.width} / ${img.height}` }}
            >
              <img src={urls[index]} alt={img.sizeName} />
            </div>
            <figcaption>
              <span>{img.sizeName}</span>
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  downloadBlob(
                    img.blob,
                    buildExportFileName({
                      size: { id: img.sizeId, name: img.sizeName, width: img.width, height: img.height, mode: 'portrait' },
                      blob: img.blob,
                      dataUrl: '',
                    }),
                  )
                }
              >
                下载
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function HistoryPanel({ records, onDelete, onClear }: HistoryPanelProps) {
  if (records.length === 0) return null;

  return (
    <section className="panel history-panel">
      <div className="panel-header">
        <div>
          <h2>历史记录</h2>
          <p>每次批量生成的成图都会留存在本机，刷新不丢失</p>
        </div>
        <button type="button" className="secondary-button" onClick={onClear}>
          清空历史
        </button>
      </div>
      <div className="history-list">
        {records.map((record) => (
          <HistoryCard key={record.id} record={record} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}
