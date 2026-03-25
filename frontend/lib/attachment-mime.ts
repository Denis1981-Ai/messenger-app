const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
};

const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream"]);
const PREVIEWABLE_IMAGE_MIME_TYPES = new Set(Object.values(IMAGE_MIME_BY_EXTENSION));

const getFileExtension = (fileName?: string | null) => {
  if (!fileName) {
    return "";
  }

  const normalized = fileName.trim().toLowerCase();
  const lastDotIndex = normalized.lastIndexOf(".");

  if (lastDotIndex < 0) {
    return "";
  }

  return normalized.slice(lastDotIndex);
};

export const inferMimeTypeFromFileName = (fileName?: string | null) => {
  const extension = getFileExtension(fileName);
  return IMAGE_MIME_BY_EXTENSION[extension] || "";
};

export const resolveAttachmentMimeType = (mimeType?: string | null, fileName?: string | null) => {
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();

  if (normalizedMimeType && !GENERIC_MIME_TYPES.has(normalizedMimeType)) {
    return normalizedMimeType;
  }

  return inferMimeTypeFromFileName(fileName) || "application/octet-stream";
};

export const isPreviewableImageAttachment = (mimeType?: string | null, fileName?: string | null) =>
  PREVIEWABLE_IMAGE_MIME_TYPES.has(resolveAttachmentMimeType(mimeType, fileName));
