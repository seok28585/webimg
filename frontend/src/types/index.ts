export interface UploadedImage {
  id: string;
  name: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

export type MergeDirection = 'vertical' | 'horizontal';

export interface StitchSettings {
  direction: MergeDirection;
  presetWidth: number; // 0 for original
  customWidth: number;
  gap: number;
  backgroundColor: string;
  sliceHeight: number; // 0 for no slice, or e.g. 10000
  quality: number; // 0.1 ~ 1.0
  format: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface ExtractedImageItem {
  id: number;
  url: string;
  alt: string;
  selected: boolean;
  previewLoaded?: boolean;
}

export interface ThumbnailSettings {
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor: string;
  fitMode: 'fit' | 'fill' | 'original';
  paddingPercent: number;
  badgeText: string;
  badgeStyle: 'red' | 'blue' | 'black' | 'yellow' | 'green' | 'none';
  badgePosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  watermarkText: string;
  watermarkOpacity: number;
  quality: number;
  format: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface OptimizerItem {
  id: string;
  file: File;
  name: string;
  originalSize: number;
  originalWidth: number;
  originalHeight: number;
  previewUrl: string;
  optimizedBlob?: Blob;
  optimizedSize?: number;
  optimizedUrl?: string;
  status: 'pending' | 'processing' | 'done' | 'error';
}
