"use client";

import { isExecutableAttachment } from "@/lib/attachment-mime";

const hasTauriRuntime = () =>
  typeof window !== "undefined" &&
  typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";

const toDownloadUrl = (value: string) => {
  if (!value || value.startsWith("data:")) {
    return value;
  }

  return `${value}${value.includes("?") ? "&" : "?"}download=1`;
};

const clickTemporaryLink = (href: string, fileName?: string) => {
  const link = document.createElement("a");
  link.href = href;

  if (fileName) {
    link.download = fileName;
  }

  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const triggerDirectAttachmentDownload = (downloadUrl: string) => {
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

async function fetchAttachmentBytes(url: string) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Не удалось получить файл.");
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function openAttachment(fileUrl: string, fileName = "attachment.bin") {
  if (!fileUrl) {
    throw new Error("Файл недоступен для открытия.");
  }

  if (isExecutableAttachment(undefined, fileName)) {
    await triggerAttachmentDownload(fileUrl, fileName);
    return;
  }

  if (fileUrl.startsWith("data:")) {
    window.open(fileUrl, "_blank", "noopener,noreferrer");
    return;
  }

  if (!hasTauriRuntime()) {
    window.open(fileUrl, "_blank", "noopener,noreferrer");
    return;
  }

  if (hasTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const bytes = await fetchAttachmentBytes(fileUrl);

    await invoke("open_downloaded_attachment", {
      fileName,
      bytes: Array.from(bytes),
    });
    return;
  }

}

export async function triggerAttachmentDownload(fileUrl: string, fileName: string) {
  if (!fileUrl) {
    throw new Error("Файл недоступен для скачивания.");
  }

  if (fileUrl.startsWith("data:")) {
    clickTemporaryLink(fileUrl, fileName);
    return;
  }

  const downloadUrl = toDownloadUrl(fileUrl);

  if (isExecutableAttachment(undefined, fileName)) {
    triggerDirectAttachmentDownload(downloadUrl);
    return;
  }

  if (!hasTauriRuntime()) {
    clickTemporaryLink(downloadUrl, fileName);
    return;
  }

  if (hasTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const bytes = await fetchAttachmentBytes(downloadUrl);

    await invoke("save_downloaded_attachment", {
      fileName,
      bytes: Array.from(bytes),
    });
    return;
  }

}
