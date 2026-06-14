import { DEFAULT_SIZES } from '../config/sizes';
import type { LayerRect, PosterProject, SizeElementSpec, SizeTemplate } from '../types/poster';

const STORAGE_KEY = 'posterflow_project';

const emptyProject = (): PosterProject => ({
  imageDataUrl: null,
  imageWidth: 0,
  imageHeight: 0,
  layers: [],
  selectedSizeIds: DEFAULT_SIZES.map((size) => size.id),
  customSizes: [],
});

export function loadProject(): PosterProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProject();
    const parsed = JSON.parse(raw) as Partial<PosterProject>;
    return {
      ...emptyProject(),
      ...parsed,
      layers: parsed.layers ?? [],
      selectedSizeIds: parsed.selectedSizeIds ?? DEFAULT_SIZES.map((size) => size.id),
      customSizes: parsed.customSizes ?? [],
    };
  } catch {
    return emptyProject();
  }
}

export function saveProject(project: PosterProject): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

/** 清空已保存的工作区，让刷新后从头开始 */
export function clearProject(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function saveLayers(layers: LayerRect[]): void {
  const project = loadProject();
  project.layers = layers;
  saveProject(project);
}

export function saveImage(
  imageDataUrl: string,
  imageWidth: number,
  imageHeight: number,
): void {
  const project = loadProject();
  project.imageDataUrl = imageDataUrl;
  project.imageWidth = imageWidth;
  project.imageHeight = imageHeight;
  saveProject(project);
}

export function saveSelectedSizeIds(selectedSizeIds: string[]): void {
  const project = loadProject();
  project.selectedSizeIds = selectedSizeIds;
  saveProject(project);
}

export function saveCustomSizes(customSizes: SizeTemplate[]): void {
  const project = loadProject();
  project.customSizes = customSizes;
  saveProject(project);
}

export function saveSizeContentDescriptions(descriptions: Record<string, string>): void {
  const project = loadProject();
  project.sizeContentDescriptions = descriptions;
  saveProject(project);
}

export function saveSizeElementSpecs(specs: Record<string, SizeElementSpec>): void {
  const project = loadProject();
  project.sizeElementSpecs = specs;
  saveProject(project);
}
