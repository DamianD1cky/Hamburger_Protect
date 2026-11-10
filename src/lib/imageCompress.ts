/**
 * 上传前把照片压一道。
 *
 * 手机直出的照片动辄 4000×3000、5 MB 以上，原样塞进 Storage 很快就爆配额。
 * 统一缩到长边 1600px、JPEG 0.85，一张通常落到 300～500 KB，看着几乎没差别。
 */
const MAX_EDGE = 1600;
const QUALITY = 0.85;

export async function compressImage(
  file: File,
  maxEdge = MAX_EDGE,
  quality = QUALITY,
): Promise<Blob> {
  // 不是图片或浏览器不支持解码时，原样返回，让上层按体积规则去拒。
  if (!file.type.startsWith("image/")) return file;
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    return file;
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) return file;

  // 压完反而更大（小图重编码）就用原图。
  return blob.size < file.size ? blob : file;
}

export function blobToFile(blob: Blob, name: string) {
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
