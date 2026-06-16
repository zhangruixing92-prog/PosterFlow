import { useCallback, useEffect, useMemo, useState } from 'react';
import { CanvasEditor } from './components/CanvasEditor';
import { ExportPanel } from './components/ExportPanel';
import { LayerPanel } from './components/LayerPanel';
import { SizeSelector } from './components/SizeSelector';
import { UploadPanel } from './components/UploadPanel';
import { attachSizeFamily } from './config/sizeFamilies';
import { DEFAULT_SIZES } from './config/sizes';
import { getDefaultContentForSize } from './config/sizeContentSpecs';
import { isVisionModelConfigured, getVisionModelSettings } from './config/visionModel';
import { isAiEnabled, getAiModelSettings } from './config/aiModel';
import { downloadZip } from './engines/exportEngine';
import {
  generateAllSizes,
  type GenerationProgress,
  type PromptContext,
} from './services/generationPipeline';
import { extractMasterContent } from './services/qwenVision';
import { analyzeSizeReferenceWithVision } from './services/qwenVision';
import type { GeneratedImage, LayerRect, SizeElementSpec, SizeTemplate } from './types/poster';
import {
  buildSizeElementSpec,
  buildSizeElementSpecFromPaste,
  cropMasterThumbnail,
  layersToDescription,
} from './utils/elementPicker';
import {
  clearProject,
  saveCustomSizes,
  saveImage,
  saveLayers,
  saveSelectedSizeIds,
  saveSizeContentDescriptions,
  saveSizeElementSpecs,
} from './utils/storage';
import {
  addHistoryRecord,
  clearHistoryRecords,
  deleteHistoryRecord,
  listHistoryRecords,
  type HistoryRecord,
} from './utils/history';
import { makeThumbnail } from './utils/canvas';
import { describeError, downloadLogs, logger } from './utils/logger';
import { HistoryPanel } from './components/HistoryPanel';
import { ImageInstructionPanel } from './components/ImageInstructionPanel';
import { MasterContentPanel } from './components/MasterContentPanel';
import './App.css';

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function App() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);
  const [layers, setLayers] = useState<LayerRect[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [customSizes, setCustomSizes] = useState<SizeTemplate[]>([]);
  const [sizeContentDescriptions, setSizeContentDescriptions] = useState<Record<string, string>>({});
  const [sizeElementSpecs, setSizeElementSpecs] = useState<Record<string, SizeElementSpec>>({});
  const [pickingSizeId, setPickingSizeId] = useState<string | null>(null);
  const [pastingSizeId, setPastingSizeId] = useState<string | null>(null);
  // 默认不全选尺寸，由用户按需勾选
  const [selectedSizeIds, setSelectedSizeIds] = useState<string[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [imageInstruction, setImageInstruction] = useState('');
  const [masterTextsText, setMasterTextsText] = useState('');
  const [masterElementsText, setMasterElementsText] = useState('');
  const [clarity, setClarity] = useState(2_800_000);

  const promptContext = useMemo<PromptContext>(
    () => ({
      imageInstruction,
      masterTexts: splitLines(masterTextsText),
      masterElements: splitLines(masterElementsText),
      targetPixels: clarity,
    }),
    [imageInstruction, masterTextsText, masterElementsText, clarity],
  );

  const handleMasterContentChange = useCallback(
    (next: { texts?: string; elements?: string }) => {
      if (next.texts !== undefined) setMasterTextsText(next.texts);
      if (next.elements !== undefined) setMasterElementsText(next.elements);
    },
    [],
  );

  useEffect(() => {
    // 每次刷新从头开始：清掉上次工作区，只加载历史记录
    clearProject();
    listHistoryRecords().then(setHistory).catch(() => setHistory([]));
  }, []);

  const allSizes = useMemo(() => {
    const defaults = DEFAULT_SIZES.map((size) =>
      attachSizeFamily({
        ...size,
        contentDescription:
          sizeContentDescriptions[size.id] ??
          size.contentDescription ??
          getDefaultContentForSize(size.id, size).description,
        elementSpec: sizeElementSpecs[size.id],
      }),
    );
    const customs = customSizes.map((size) =>
      attachSizeFamily({
        ...size,
        contentDescription:
          sizeContentDescriptions[size.id] ??
          size.contentDescription ??
          getDefaultContentForSize(size.id, size).description,
        elementSpec: sizeElementSpecs[size.id],
      }),
    );
    return [...defaults, ...customs];
  }, [customSizes, sizeContentDescriptions, sizeElementSpecs]);

  const pickingSize = useMemo(
    () => allSizes.find((size) => size.id === pickingSizeId) ?? null,
    [allSizes, pickingSizeId],
  );

  const highlightLayerIds = useMemo(
    () => pickingSize?.elementSpec?.layerIds ?? [],
    [pickingSize],
  );

  const markedLayerTypes = useMemo(
    () => [...new Set(layers.map((layer) => layer.type))],
    [layers],
  );

  const selectedSizes = useMemo(
    () => allSizes.filter((size) => selectedSizeIds.includes(size.id)),
    [allSizes, selectedSizeIds],
  );

  const handleUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return;

      const image = new Image();
      image.onload = () => {
        setImageDataUrl(result);
        setImageName(file.name);
        setImageWidth(image.width);
        setImageHeight(image.height);
        setGeneratedImages([]);
        setImageInstruction('');
        setMasterTextsText('');
        setMasterElementsText('');
        saveImage(result, image.width, image.height);
      };
      image.src = result;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleLayersChange = useCallback((nextLayers: LayerRect[]) => {
    setLayers(nextLayers);
    saveLayers(nextLayers);
    setGeneratedImages([]);
  }, []);

  const handleSelectionChange = useCallback((nextSelectedIds: string[]) => {
    setSelectedSizeIds(nextSelectedIds);
    saveSelectedSizeIds(nextSelectedIds);
  }, []);

  const handleAddCustomSize = useCallback(
    (size: SizeTemplate) => {
      const nextCustomSizes = [...customSizes, size];
      const nextSelectedIds = [...selectedSizeIds, size.id];
      const nextDescriptions = size.contentDescription
        ? { ...sizeContentDescriptions, [size.id]: size.contentDescription }
        : sizeContentDescriptions;
      setCustomSizes(nextCustomSizes);
      setSelectedSizeIds(nextSelectedIds);
      setSizeContentDescriptions(nextDescriptions);
      saveCustomSizes(nextCustomSizes);
      saveSelectedSizeIds(nextSelectedIds);
      saveSizeContentDescriptions(nextDescriptions);
    },
    [customSizes, selectedSizeIds, sizeContentDescriptions],
  );

  const handleContentDescriptionChange = useCallback(
    (sizeId: string, description: string) => {
      const nextDescriptions = { ...sizeContentDescriptions, [sizeId]: description };
      setSizeContentDescriptions(nextDescriptions);
      saveSizeContentDescriptions(nextDescriptions);
      setGeneratedImages([]);
    },
    [sizeContentDescriptions],
  );

  const handleStartSizePick = useCallback((sizeId: string) => {
    setPastingSizeId(null);
    setPickingSizeId((current) => (current === sizeId ? null : sizeId));
  }, []);

  const handleStartPaste = useCallback((sizeId: string) => {
    setPickingSizeId(null);
    setPastingSizeId(sizeId);
  }, []);

  const handleCancelSizePick = useCallback(() => {
    setPickingSizeId(null);
  }, []);

  const applyElementSpec = useCallback(
    (
      sizeId: string,
      spec: SizeElementSpec,
      matchedLayers: LayerRect[],
      message?: string,
      descriptionOverride?: string,
    ) => {
      const nextSpecs = { ...sizeElementSpecs, [sizeId]: spec };
      const description =
        descriptionOverride ??
        (matchedLayers.length > 0 ? layersToDescription(matchedLayers) : undefined);
      const nextDescriptions =
        description !== undefined
          ? { ...sizeContentDescriptions, [sizeId]: description }
          : sizeContentDescriptions;

      setSizeElementSpecs(nextSpecs);
      if (description !== undefined) {
        setSizeContentDescriptions(nextDescriptions);
        saveSizeContentDescriptions(nextDescriptions);
      }
      saveSizeElementSpecs(nextSpecs);
      setGeneratedImages([]);
      setPickingSizeId(null);
      setPastingSizeId(null);

      if (message) alert(message);
    },
    [sizeContentDescriptions, sizeElementSpecs],
  );

  const handlePasteScreenshot = useCallback(
    async (sizeId: string, dataUrl: string) => {
      if (!imageDataUrl) {
        alert('请先上传主海报');
        return;
      }

      const targetSize = allSizes.find((size) => size.id === sizeId);
      const { spec, matchedLayers, matchedOnMaster } = await buildSizeElementSpecFromPaste(
        imageDataUrl,
        imageWidth,
        imageHeight,
        dataUrl,
        layers,
      );

      let finalSpec = spec;
      let finalLayers = matchedLayers;
      let descriptionOverride: string | undefined;
      let message: string | undefined;

      if (isVisionModelConfigured() && targetSize) {
        try {
          const vision = await analyzeSizeReferenceWithVision({
            masterImageDataUrl: imageDataUrl,
            referenceCropDataUrl: dataUrl,
            sizeName: targetSize.name,
            sizeWidth: targetSize.width,
            sizeHeight: targetSize.height,
            sizeMode: targetSize.mode,
            markedLayerTypes: markedLayerTypes,
          });

          if (vision.includedLayers.length > 0) {
            const visionMatched = layers.filter((layer) => vision.includedLayers.includes(layer.type));
            if (visionMatched.length > 0) {
              finalLayers = visionMatched;
              finalSpec = {
                ...spec,
                layerIds: visionMatched.map((layer) => layer.id),
              };
            }
          }

          if (vision.description) {
            descriptionOverride = vision.description;
          }

          message = `视觉模型（${getVisionModelSettings().model}）：${vision.description || layersToDescription(finalLayers)}`;
        } catch (error) {
          console.warn('[PosterFlow] 视觉模型分析失败，已回退本地识别', error);
        }
      }

      if (!message) {
        if (finalLayers.length > 0) {
          message = `已粘贴并识别：${layersToDescription(finalLayers)}`;
        } else if (matchedOnMaster && layers.length === 0) {
          message = '截图已粘贴。请标记图层后重新粘贴，或补充文字描述';
        } else if (!matchedOnMaster) {
          message = '截图已保存为参考。若来自主海报请截清晰区域；标记图层后可自动识别元素';
        }
      }

      applyElementSpec(sizeId, finalSpec, finalLayers, message, descriptionOverride);
    },
    [allSizes, applyElementSpec, imageDataUrl, imageHeight, imageWidth, layers, markedLayerTypes],
  );

  const handleSizePickComplete = useCallback(
    async (crop: { x: number; y: number; width: number; height: number }) => {
      if (!imageDataUrl || !pickingSizeId) return;

      const spec = await buildSizeElementSpec(imageDataUrl, layers, crop);
      if (!spec) {
        if (layers.length === 0) {
          applyElementSpec(
            pickingSizeId,
            { referenceCrop: await cropMasterThumbnail(imageDataUrl, crop), layerIds: [] },
            [],
            '框选区域已保存。请标记图层后重新框选，或补充文字描述',
          );
          return;
        }
        alert('框选区域内未识别到已标记图层，请框住 Logo/标题/主视觉等元素');
        return;
      }

      const matchedLayers = layers.filter((layer) => spec.layerIds.includes(layer.id));
      applyElementSpec(pickingSizeId, spec, matchedLayers);
    },
    [applyElementSpec, imageDataUrl, layers, pickingSizeId],
  );

  const handleClearElementSpec = useCallback(
    (sizeId: string) => {
      const nextSpecs = { ...sizeElementSpecs };
      delete nextSpecs[sizeId];
      setSizeElementSpecs(nextSpecs);
      saveSizeElementSpecs(nextSpecs);
      setGeneratedImages([]);
    },
    [sizeElementSpecs],
  );

  const handleDeleteLayer = useCallback(
    (layerId: string) => {
      const nextLayers = layers.filter((layer) => layer.id !== layerId);
      handleLayersChange(nextLayers);
      if (selectedLayerId === layerId) setSelectedLayerId(null);
    },
    [handleLayersChange, layers, selectedLayerId],
  );

  const handleGenerateAll = useCallback(async () => {
    logger.info('user.generate.request', {
      imageSize: imageDataUrl ? `${imageWidth}x${imageHeight}` : null,
      layerCount: layers.length,
      layerTypes: [...new Set(layers.map((l) => l.type))],
      selectedSizes: selectedSizes.map((s) => `${s.name} ${s.width}x${s.height}`),
      clarity,
      hasInstruction: Boolean(imageInstruction.trim()),
      masterTextsCount: splitLines(masterTextsText).length,
      masterElementsCount: splitLines(masterElementsText).length,
    });

    if (!imageDataUrl) {
      logger.warn('validate.fail', { rule: 'master-image', reason: '未上传主海报' });
      alert('请先上传主海报');
      return;
    }
    if (selectedSizes.length === 0) {
      logger.warn('validate.fail', { rule: 'sizes', reason: '未选择尺寸' });
      alert('请至少选择一个尺寸');
      return;
    }
    if (layers.length === 0) {
      logger.warn('validate.fail', { rule: 'layers', reason: '未框选保留元素' });
      alert('请先在主图上框选至少一个要保留的元素');
      return;
    }
    if (!isAiEnabled()) {
      logger.warn('validate.fail', {
        rule: 'ai-enabled',
        reason: '未配置 api_key',
        configPath: getAiModelSettings().configPath,
      });
      alert(`必须使用图像模型生成，请先在 ${getAiModelSettings().configPath} 配置 api_key`);
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(null);
    try {
      // 文字约束未就绪时，先用 qwen-vl 提取主视觉原文案与元素，避免文字被截断/臆造
      let texts = splitLines(masterTextsText);
      let elements = splitLines(masterElementsText);
      if (texts.length === 0) {
        try {
          const content = await extractMasterContent(imageDataUrl);
          texts = content.texts;
          elements = content.elements;
          setMasterTextsText(texts.join('\n'));
          setMasterElementsText(elements.join('\n'));
        } catch (extractError) {
          logger.warn('user.generate.extractFallback', {
            reason: '提取主视觉文案失败，按无约束生成',
            error: describeError(extractError),
          });
        }
      }

      const context: PromptContext = {
        imageInstruction,
        masterTexts: texts,
        masterElements: elements,
        targetPixels: clarity,
      };

      const images = await generateAllSizes(
        imageDataUrl,
        imageWidth,
        imageHeight,
        layers,
        selectedSizes,
        context,
        (progress) => setGenerationProgress(progress),
      );
      setGeneratedImages(images);

      if (images.length > 0) {
        const record: HistoryRecord = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          masterThumb: await makeThumbnail(imageDataUrl, 200),
          count: images.length,
          images: images.map((image) => ({
            sizeId: image.size.id,
            sizeName: image.size.name,
            width: image.size.width,
            height: image.size.height,
            blob: image.blob,
          })),
        };
        await addHistoryRecord(record);
        setHistory((prev) => [record, ...prev]);
      }
    } catch (error) {
      logger.error('user.generate.error', {
        error: describeError(error),
        imageSize: `${imageWidth}x${imageHeight}`,
        layerCount: layers.length,
        selectedSizes: selectedSizes.map((s) => `${s.name} ${s.width}x${s.height}`),
        clarity,
      });
      alert(`生成失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  }, [
    imageDataUrl,
    imageHeight,
    imageWidth,
    layers,
    selectedSizes,
    imageInstruction,
    masterTextsText,
    masterElementsText,
    clarity,
  ]);

  const handleDeleteHistory = useCallback(async (id: string) => {
    await deleteHistoryRecord(id);
    setHistory((prev) => prev.filter((record) => record.id !== id));
  }, []);

  const handleClearHistory = useCallback(async () => {
    if (!window.confirm('确定清空全部历史记录？')) return;
    await clearHistoryRecords();
    setHistory([]);
  }, []);

  const handleSizeRegenerated = useCallback((image: GeneratedImage) => {
    setGeneratedImages((prev) => {
      const index = prev.findIndex((item) => item.size.id === image.size.id);
      if (index === -1) return [...prev, image];
      const next = [...prev];
      next[index] = image;
      return next;
    });
  }, []);

  const handleDownloadZip = useCallback(async () => {
    if (generatedImages.length === 0) return;
    try {
      await downloadZip(generatedImages);
    } catch (error) {
      console.error(error);
      alert('ZIP 导出失败');
    }
  }, [generatedImages]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">PosterFlow</p>
          <h1>运营素材自动批量适配工具</h1>
          <p className="subtitle">
            上传主海报 → 框选保留元素 → AI 自动排版适配 → ZIP 导出
            {isAiEnabled() ? (
              <span className="vision-badge">
                AI：{getAiModelSettings().vision.model} + 万相扩图
              </span>
            ) : isVisionModelConfigured() ? (
              <span className="vision-badge">
                视觉模型：{getVisionModelSettings().model}
              </span>
            ) : null}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={downloadLogs}>
            下载日志
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              logger.clear();
              alert('日志已清空');
            }}
          >
            清空日志
          </button>
        </div>
      </header>

      <UploadPanel onUpload={handleUpload} hasImage={Boolean(imageDataUrl)} imageName={imageName} />

      {imageDataUrl ? (
        <div className="workspace">
          <CanvasEditor
            imageSrc={imageDataUrl}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            layers={layers}
            selectedLayerId={selectedLayerId}
            onLayersChange={handleLayersChange}
            onSelectLayer={setSelectedLayerId}
            editorMode={pickingSizeId ? 'sizePick' : 'mark'}
            sizePickLabel={pickingSize?.name}
            highlightLayerIds={highlightLayerIds}
            onSizePickComplete={handleSizePickComplete}
            onCancelSizePick={handleCancelSizePick}
          />
          <LayerPanel
            layers={layers}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onDeleteLayer={handleDeleteLayer}
          />
        </div>
      ) : (
        <section className="panel empty-workspace">
          <p>上传主海报后即可进入图层标记模式</p>
        </section>
      )}

      {imageDataUrl && (
        <MasterContentPanel
          masterImageDataUrl={imageDataUrl}
          texts={masterTextsText}
          elements={masterElementsText}
          onChange={handleMasterContentChange}
        />
      )}

      {imageDataUrl && (
        <ImageInstructionPanel
          masterImageDataUrl={imageDataUrl}
          value={imageInstruction}
          onChange={setImageInstruction}
        />
      )}

      <SizeSelector
        sizes={allSizes}
        selectedSizeIds={selectedSizeIds}
        layers={layers}
        pickingSizeId={pickingSizeId}
        pastingSizeId={pastingSizeId}
        onSelectionChange={handleSelectionChange}
        onAddCustomSize={handleAddCustomSize}
        onContentDescriptionChange={handleContentDescriptionChange}
        onStartSizePick={handleStartSizePick}
        onStartPaste={handleStartPaste}
        onPasteScreenshot={handlePasteScreenshot}
        onClearElementSpec={handleClearElementSpec}
      />

      <ExportPanel
        selectedCount={selectedSizes.length}
        generatedImages={generatedImages}
        isGenerating={isGenerating}
        generationProgress={generationProgress}
        masterImageDataUrl={imageDataUrl}
        masterWidth={imageWidth}
        masterHeight={imageHeight}
        layers={layers}
        promptContext={promptContext}
        clarity={clarity}
        onClarityChange={setClarity}
        onGenerateAll={handleGenerateAll}
        onDownloadZip={handleDownloadZip}
        onSizeRegenerated={handleSizeRegenerated}
      />

      <HistoryPanel
        records={history}
        onDelete={handleDeleteHistory}
        onClear={handleClearHistory}
      />
    </div>
  );
}

export default App;
