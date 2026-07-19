import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

type ImageFormat = 'webp' | 'avif' | 'png' | 'jpg' | 'jpeg';

interface OptimizeOptions {
  width?: number;
  height?: number;
  format?: ImageFormat;
}

/** 將 content collection 的 image() 欄位轉為 Astro Image 最佳化輸出 */
export async function optimizeContentImage(
  image: ImageMetadata,
  options: OptimizeOptions = {},
) {
  return getImage({
    src: image,
    width: options.width ?? 1600,
    height: options.height,
    format: options.format ?? 'webp',
  });
}

/** 批次最佳化 detailImages */
export async function optimizeDetailImages(
  images: ImageMetadata[],
  options: OptimizeOptions = {},
) {
  return Promise.all(images.map((image) => optimizeContentImage(image, options)));
}

/** 判斷是否應顯示 detail grid（空陣列時隱藏並最大化 hero） */
export function hasDetailImages(images: ImageMetadata[] | undefined): boolean {
  return Array.isArray(images) && images.length > 0;
}
