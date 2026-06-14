import { useEffect, useRef, useState } from 'react';
import { Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  LAYER_TYPE_COLORS,
  type LayerRect,
} from '../types/poster';

interface CanvasEditorProps {
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  layers: LayerRect[];
  selectedLayerId: string | null;
  onLayersChange: (layers: LayerRect[]) => void;
  onSelectLayer: (layerId: string | null) => void;
  editorMode?: 'mark' | 'sizePick';
  sizePickLabel?: string;
  highlightLayerIds?: string[];
  onSizePickComplete?: (crop: { x: number; y: number; width: number; height: number }) => void;
  onCancelSizePick?: () => void;
}

const MIN_RECT_SIZE = 20;

export function CanvasEditor({
  imageSrc,
  imageWidth,
  imageHeight,
  layers,
  selectedLayerId,
  onLayersChange,
  onSelectLayer,
  editorMode = 'mark',
  sizePickLabel,
  highlightLayerIds = [],
  onSizePickComplete,
  onCancelSizePick,
}: CanvasEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [stageSize, setStageSize] = useState({ width: 360, height: 640 });
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftRect, setDraftRect] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const isSizePick = editorMode === 'sizePick';
  const highlightSet = new Set(highlightLayerIds);

  const scale = Math.min(stageSize.width / imageWidth, stageSize.height / imageHeight);
  const displayWidth = imageWidth * scale;
  const displayHeight = imageHeight * scale;
  const offsetX = (stageSize.width - displayWidth) / 2;
  const offsetY = (stageSize.height - displayHeight) / 2;

  useEffect(() => {
    const image = new window.Image();
    image.onload = () => setImageElement(image);
    image.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      setStageSize({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage || isSizePick) {
      transformer?.nodes([]);
      transformer?.getLayer()?.batchDraw();
      return;
    }

    const selectedNode = selectedLayerId
      ? stage.findOne(`#layer-${selectedLayerId}`)
      : null;

    if (selectedNode) {
      transformer.nodes([selectedNode]);
    } else {
      transformer.nodes([]);
    }
    transformer.getLayer()?.batchDraw();
  }, [selectedLayerId, layers, stageSize, isSizePick]);

  const toImageCoords = (stageX: number, stageY: number) => ({
    x: (stageX - offsetX) / scale,
    y: (stageY - offsetY) / scale,
  });

  const toStageCoords = (layer: LayerRect) => ({
    x: offsetX + layer.x * scale,
    y: offsetY + layer.y * scale,
    width: layer.width * scale,
    height: layer.height * scale,
  });

  const clampToImage = (rect: { x: number; y: number; width: number; height: number }) => {
    const x = Math.max(0, Math.min(rect.x, imageWidth));
    const y = Math.max(0, Math.min(rect.y, imageHeight));
    const width = Math.max(0, Math.min(rect.width, imageWidth - x));
    const height = Math.max(0, Math.min(rect.height, imageHeight - y));
    return { x, y, width, height };
  };

  const updateLayer = (layerId: string, patch: Partial<LayerRect>) => {
    onLayersChange(layers.map((layer) => (layer.id === layerId ? { ...layer, ...patch } : layer)));
  };

  const handleStageMouseDown = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (event.target !== event.target.getStage()) return;

    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;

    if (!isSizePick) onSelectLayer(null);
    drawStartRef.current = pointer;
    setIsDrawing(true);
    setDraftRect({ x: pointer.x, y: pointer.y, width: 0, height: 0 });
  };

  const handleStageMouseMove = () => {
    if (!isDrawing || !drawStartRef.current) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;

    const start = drawStartRef.current;
    setDraftRect({
      x: Math.min(start.x, pointer.x),
      y: Math.min(start.y, pointer.y),
      width: Math.abs(pointer.x - start.x),
      height: Math.abs(pointer.y - start.y),
    });
  };

  const finalizeDrawing = () => {
    if (!draftRect) return;

    const topLeft = toImageCoords(draftRect.x, draftRect.y);
    const bottomRight = toImageCoords(draftRect.x + draftRect.width, draftRect.y + draftRect.height);
    const raw = {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
    const crop = clampToImage(raw);

    if (isSizePick) {
      if (crop.width >= MIN_RECT_SIZE && crop.height >= MIN_RECT_SIZE) {
        onSizePickComplete?.(crop);
      }
      setIsDrawing(false);
      setDraftRect(null);
      drawStartRef.current = null;
      return;
    }

    if (crop.width >= MIN_RECT_SIZE && crop.height >= MIN_RECT_SIZE) {
      const newLayer: LayerRect = {
        id: `element-${Date.now()}`,
        type: 'element',
        x: Math.max(0, Math.min(crop.x, imageWidth - MIN_RECT_SIZE)),
        y: Math.max(0, Math.min(crop.y, imageHeight - MIN_RECT_SIZE)),
        width: Math.min(crop.width, imageWidth),
        height: Math.min(crop.height, imageHeight),
      };
      onLayersChange([...layers, newLayer]);
      onSelectLayer(newLayer.id);
    }

    setIsDrawing(false);
    setDraftRect(null);
    drawStartRef.current = null;
  };

  const handleStageMouseUp = () => {
    if (isDrawing) finalizeDrawing();
  };

  return (
    <section className={`panel canvas-panel${isSizePick ? ' canvas-panel-picking' : ''}`}>
      <div className="panel-header">
        <h2>{isSizePick ? '截图框选元素' : '原图预览 / 标记模式'}</h2>
        <p>
          {isSizePick ? (
            <>
              正在为 <strong>{sizePickLabel}</strong> 框选需要的元素区域，松开鼠标完成截图识别
            </>
          ) : (
            <>在画布上拖拽框选要保留的元素，AI 将自动适配各尺寸排版</>
          )}
        </p>
        {isSizePick && (
          <button type="button" className="ghost-button canvas-cancel-pick" onClick={onCancelSizePick}>
            取消截图选元素
          </button>
        )}
      </div>
      <div className="canvas-shell" ref={containerRef}>
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
        >
          <Layer>
            {imageElement && (
              <KonvaImage
                image={imageElement}
                x={offsetX}
                y={offsetY}
                width={displayWidth}
                height={displayHeight}
                listening={false}
              />
            )}

            {layers.map((layer) => {
              const coords = toStageCoords(layer);
              const highlighted = highlightSet.has(layer.id);
              const stroke = highlighted ? '#fbbf24' : LAYER_TYPE_COLORS.element;
              const fill = highlighted ? 'rgba(251, 191, 36, 0.28)' : `${LAYER_TYPE_COLORS.element}33`;

              return (
                <Rect
                  key={layer.id}
                  id={`layer-${layer.id}`}
                  x={coords.x}
                  y={coords.y}
                  width={coords.width}
                  height={coords.height}
                  stroke={stroke}
                  strokeWidth={highlighted ? 3 : 2}
                  dash={highlighted ? [] : [8, 4]}
                  fill={fill}
                  draggable={!isSizePick}
                  listening={!isSizePick}
                  onClick={() => !isSizePick && onSelectLayer(layer.id)}
                  onTap={() => !isSizePick && onSelectLayer(layer.id)}
                  onDragEnd={(event) => {
                    const node = event.target;
                    const imageCoords = toImageCoords(node.x(), node.y());
                    updateLayer(layer.id, {
                      x: Math.max(0, Math.min(imageCoords.x, imageWidth - layer.width)),
                      y: Math.max(0, Math.min(imageCoords.y, imageHeight - layer.height)),
                    });
                  }}
                  onTransformEnd={(event) => {
                    const node = event.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);

                    const imageCoords = toImageCoords(node.x(), node.y());
                    updateLayer(layer.id, {
                      x: Math.max(0, imageCoords.x),
                      y: Math.max(0, imageCoords.y),
                      width: Math.max(MIN_RECT_SIZE, node.width() * scaleX / scale),
                      height: Math.max(MIN_RECT_SIZE, node.height() * scaleY / scale),
                    });
                  }}
                />
              );
            })}

            {draftRect && (
              <Rect
                x={draftRect.x}
                y={draftRect.y}
                width={draftRect.width}
                height={draftRect.height}
                stroke={isSizePick ? '#fbbf24' : LAYER_TYPE_COLORS.element}
                strokeWidth={isSizePick ? 3 : 2}
                dash={isSizePick ? [6, 3] : [4, 4]}
                fill={isSizePick ? 'rgba(251, 191, 36, 0.18)' : `${LAYER_TYPE_COLORS.element}22`}
                listening={false}
              />
            )}

            {isSizePick && sizePickLabel && (
              <Text
                x={offsetX + 12}
                y={offsetY + 12}
                text="拖拽框选此尺寸需要的元素"
                fontSize={14}
                fill="#fbbf24"
                listening={false}
              />
            )}

            {!isSizePick && (
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                boundBoxFunc={(oldBox, newBox) => {
                  if (newBox.width < MIN_RECT_SIZE * scale || newBox.height < MIN_RECT_SIZE * scale) {
                    return oldBox;
                  }
                  return newBox;
                }}
              />
            )}
          </Layer>
        </Stage>
      </div>
    </section>
  );
}
