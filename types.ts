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
