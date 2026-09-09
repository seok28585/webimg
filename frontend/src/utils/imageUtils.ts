import JSZip from 'jszip';
import type { UploadedImage, StitchSettings, ThumbnailSettings } from '../types';

export const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`이미지 로드 실패: ${src} (${e})`));
    img.src = src;
  });
};

export const getImageDimensions = (file: File): Promise<{ width: number; height: number; previewUrl: string }> => {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight, previewUrl });
    };
    img.onerror = () => {
      reject(new Error('이미지 규격 확인 실패'));
    };
    img.src = previewUrl;
  });
};

export const stitchImages = async (
  images: UploadedImage[],
  settings: StitchSettings
): Promise<{ canvas: HTMLCanvasElement; blob: Blob; totalWidth: number; totalHeight: number }> => {
  if (images.length === 0) {
    throw new Error('병합할 이미지가 없습니다.');
  }

  // 1. 모든 이미지 로드
  const loadedImgs = await Promise.all(images.map((img) => loadImage(img.previewUrl)));

  // 2. 리사이즈 및 캔버스 크기 계산
  const targetWidth = settings.presetWidth > 0 ? settings.presetWidth : settings.customWidth;
  const isVertical = settings.direction === 'vertical';

  interface SizedImg {
    img: HTMLImageElement;
    w: number;
    h: number;
  }

  const sizedList: SizedImg[] = loadedImgs.map((img) => {
    let w = img.naturalWidth;
    let h = img.naturalHeight;

    if (targetWidth > 0) {
      const ratio = targetWidth / w;
      w = targetWidth;
      h = Math.round(h * ratio);
    }
    return { img, w, h };
  });

  let totalWidth = 0;
  let totalHeight = 0;
  const gap = Math.max(0, settings.gap);

  if (isVertical) {
    totalWidth = Math.max(...sizedList.map((s) => s.w));
    totalHeight = sizedList.reduce((acc, s) => acc + s.h, 0) + gap * (sizedList.length - 1);
  } else {
    totalWidth = sizedList.reduce((acc, s) => acc + s.w, 0) + gap * (sizedList.length - 1);
    totalHeight = Math.max(...sizedList.map((s) => s.h));
  }

  // 3. 캔버스에 그리기
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D Context를 생성할 수 없습니다.');

  // 배경색 채우기
  ctx.fillStyle = settings.backgroundColor || '#ffffff';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // 이미지 드로잉
  let curX = 0;
  let curY = 0;

  for (const s of sizedList) {
    if (isVertical) {
      const posX = Math.round((totalWidth - s.w) / 2);
      ctx.drawImage(s.img, posX, curY, s.w, s.h);
      curY += s.h + gap;
    } else {
      const posY = Math.round((totalHeight - s.h) / 2);
      ctx.drawImage(s.img, curX, posY, s.w, s.h);
      curX += s.w + gap;
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas Blob 생성 실패'));
      },
      settings.format,
      settings.quality
    );
  });

  return { canvas, blob, totalWidth, totalHeight };
};

export const sliceAndZipImages = async (
  sourceCanvas: HTMLCanvasElement,
  sliceHeight: number,
  format: string = 'image/jpeg',
  quality: number = 0.92,
  filenamePrefix: string = 'detail_slice'
): Promise<Blob> => {
  const zip = new JSZip();
  const totalH = sourceCanvas.height;
  const totalW = sourceCanvas.width;
  const numSlices = Math.ceil(totalH / sliceHeight);

  const ext = format === 'image/webp' ? 'webp' : format === 'image/png' ? 'png' : 'jpg';

  for (let i = 0; i < numSlices; i++) {
    const currentSliceHeight = Math.min(sliceHeight, totalH - i * sliceHeight);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = totalW;
    sliceCanvas.height = currentSliceHeight;
    const sliceCtx = sliceCanvas.getContext('2d');

    if (!sliceCtx) continue;

    // 배경색 채우기
    sliceCtx.fillStyle = '#ffffff';
    sliceCtx.fillRect(0, 0, totalW, currentSliceHeight);

    // 원본에서 슬라이스 부분 복사
    sliceCtx.drawImage(
      sourceCanvas,
      0,
      i * sliceHeight,
      totalW,
      currentSliceHeight,
      0,
      0,
      totalW,
      currentSliceHeight
    );

    const sliceBlob = await new Promise<Blob>((resolve) => {
      sliceCanvas.toBlob((b) => resolve(b || new Blob()), format, quality);
    });

    const indexStr = String(i + 1).padStart(2, '0');
    zip.file(`${filenamePrefix}_${indexStr}.${ext}`, sliceBlob);
  }

  return await zip.generateAsync({ type: 'blob' });
};

export const renderThumbnailCanvas = async (
  imgElement: HTMLImageElement,
  settings: ThumbnailSettings
): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> => {
  const canvas = document.createElement('canvas');
  canvas.width = settings.canvasWidth;
  canvas.height = settings.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas Context Error');

  // 1. 배경 채우기
  if (settings.backgroundColor === 'transparent') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = settings.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 2. 이미지 피팅 계산
  const cw = canvas.width;
  const ch = canvas.height;
  const iw = imgElement.naturalWidth;
  const ih = imgElement.naturalHeight;

  let dw = cw;
  let dh = ch;
  let dx = 0;
  let dy = 0;

  const pad = settings.paddingPercent / 100;
  const availW = cw * (1 - pad * 2);
  const availH = ch * (1 - pad * 2);

  if (settings.fitMode === 'fit') {
    // 여백 두고 비율 맞춤
    const scale = Math.min(availW / iw, availH / ih);
    dw = Math.round(iw * scale);
    dh = Math.round(ih * scale);
    dx = Math.round((cw - dw) / 2);
    dy = Math.round((ch - dh) / 2);
  } else if (settings.fitMode === 'fill') {
    // 캔버스 꽉 채우기
    const scale = Math.max(cw / iw, ch / ih);
    dw = Math.round(iw * scale);
    dh = Math.round(ih * scale);
    dx = Math.round((cw - dw) / 2);
    dy = Math.round((ch - dh) / 2);
  }

  ctx.drawImage(imgElement, dx, dy, dw, dh);

  // 3. 뱃지 오버레이 그리기
  if (settings.badgeStyle !== 'none' && settings.badgeText.trim()) {
    ctx.save();
    const text = settings.badgeText.trim();
    const fontSize = Math.round(cw * 0.045);
    ctx.font = `bold ${fontSize}px 'Pretendard', sans-serif`;

    const metrics = ctx.measureText(text);
    const badgeW = metrics.width + fontSize * 1.5;
    const badgeH = fontSize * 1.8;
    const badgeRadius = 6;

    let bx = 20;
    let by = 20;
    if (settings.badgePosition === 'top-right') {
      bx = cw - badgeW - 20;
    } else if (settings.badgePosition === 'bottom-left') {
      by = ch - badgeH - 20;
    } else if (settings.badgePosition === 'bottom-right') {
      bx = cw - badgeW - 20;
      by = ch - badgeH - 20;
    }

    // 뱃지 배경색 매핑
    const colors: Record<string, string> = {
      red: '#ef4444',
      blue: '#3b82f6',
      black: '#111827',
      yellow: '#f59e0b',
      green: '#10b981',
    };
    ctx.fillStyle = colors[settings.badgeStyle] || '#ef4444';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;

    // 라운드 박스 그리기
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, badgeH, badgeRadius);
    ctx.fill();

    // 뱃지 텍스트
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + badgeW / 2, by + badgeH / 2);
    ctx.restore();
  }

  // 4. 워터마크 그리기
  if (settings.watermarkText.trim()) {
    ctx.save();
    const wmText = settings.watermarkText.trim();
    const wmFontSize = Math.round(cw * 0.035);
    ctx.font = `600 ${wmFontSize}px 'Pretendard', sans-serif`;
    ctx.fillStyle = `rgba(255, 255, 255, ${settings.watermarkOpacity})`;
    ctx.shadowColor = `rgba(0, 0, 0, ${settings.watermarkOpacity * 0.6})`;
    ctx.shadowBlur = 4;
    ctx.textAlign = 'right';
    ctx.fillText(wmText, cw - 20, ch - 20);
    ctx.restore();
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Thumbnail Blob Failed'));
      },
      settings.format,
      settings.quality
    );
  });

  return { canvas, blob };
};

export const formatBytes = (bytes: number, decimals: number = 1): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};
