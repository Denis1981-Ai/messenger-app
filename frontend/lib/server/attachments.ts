import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { resolveAttachmentMimeType } from "@/lib/attachment-mime";

export const UPLOADS_ROOT = path.resolve(process.cwd(), "storage", "uploads");
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 5;

const sanitizeFilename = (value: string) => {
  const base = path.basename(value || "file");
  const cleaned = base
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const safe = cleaned || "file";
  return safe.length > 120 ? safe.slice(0, 120) : safe;
};

export const ensureUploadsStorageReady = async () => {
  await mkdir(UPLOADS_ROOT, { recursive: true });
  await access(UPLOADS_ROOT, fsConstants.R_OK | fsConstants.W_OK);
};

const resolveStoragePath = (storageKey: string) => {
  const normalizedKey = storageKey.replace(/\\/g, "/");
  const fullPath = path.resolve(UPLOADS_ROOT, normalizedKey);
  const rootPath = path.resolve(UPLOADS_ROOT);

  if (!fullPath.startsWith(rootPath)) {
    throw new Error("Invalid storage key.");
  }

  return fullPath;
};

export const getAttachmentDownloadUrl = (attachmentId: string) =>
  `/api/attachments/${attachmentId}/download`;

export const saveIncomingFile = async (file: File) => {
  if (!file || typeof file.name !== "string") {
    throw new Error("Файл не передан.");
  }

  if (file.size <= 0) {
    throw new Error(`Файл ${file.name} пустой.`);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`Файл ${file.name} превышает лимит 10 МБ.`);
  }

  await ensureUploadsStorageReady();

  const safeName = sanitizeFilename(file.name);
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const storageKey = `${year}/${month}/${randomUUID()}-${safeName}`;
  const targetPath = resolveStoragePath(storageKey);

  await mkdir(path.dirname(targetPath), { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(targetPath, buffer);

  return {
    originalName: safeName,
    mimeType: resolveAttachmentMimeType(file.type, safeName),
    sizeBytes: buffer.byteLength,
    storageKey,
  };
};

export const removeStoredFile = async (storageKey: string) => {
  if (!storageKey) {
    return;
  }

  try {
    await rm(resolveStoragePath(storageKey), { force: true });
  } catch {}
};

export const removeStoredFiles = async (storageKeys: string[]) => {
  await Promise.all(storageKeys.map((storageKey) => removeStoredFile(storageKey)));
};

export const readStoredFile = async (storageKey: string) => {
  await ensureUploadsStorageReady();
  const fullPath = resolveStoragePath(storageKey);
  return readFile(fullPath);
};
