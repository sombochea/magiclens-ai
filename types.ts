export enum AppMode {
  GENERATE = 'GENERATE',
  EDIT = 'EDIT',
  GALLERY = 'GALLERY'
}

export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT_3_4 = '3:4',
  LANDSCAPE_4_3 = '4:3',
  PORTRAIT_9_16 = '9:16',
  LANDSCAPE_16_9 = '16:9'
}

export enum ImageResolution {
  RES_1K = '1K',
  RES_2K = '2K',
  RES_4K = '4K'
}

export interface GeneratedImage {
  url: string;
  prompt: string;
}

export interface HistoryItem {
  id: string;
  type: 'generated' | 'edited';
  src: string;
  prompt: string;
  timestamp: number;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  // We use HTMLCanvasElement as the source for the layer data.
  // This allows us to draw it efficiently to the composition canvas.
  canvas: HTMLCanvasElement;
}

export interface LayerSnapshot {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  imageData: ImageData;
}
