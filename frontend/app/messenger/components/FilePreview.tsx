/* eslint-disable @next/next/no-img-element */

import { isPreviewableImageAttachment, resolveAttachmentMimeType } from "@/lib/attachment-mime";

import { Attachment } from "../types";
import { formatFileSize } from "../utils/format";

type Props = {
  attachment: Attachment;
  onRemove: (attachmentId: string) => void;
};

export function FilePreview({ attachment, onRemove }: Props) {
  const safeAttachment = attachment ?? {
    id: "",
    fileName: "Файл",
    fileType: "application/octet-stream",
    fileData: "",
    fileSize: 0,
  };

  const resolvedMimeType = resolveAttachmentMimeType(safeAttachment.fileType, safeAttachment.fileName);
  const isImage = isPreviewableImageAttachment(safeAttachment.fileType, safeAttachment.fileName);
  const attachmentMeta = isImage
    ? `Изображение${safeAttachment.fileSize ? ` • ${formatFileSize(safeAttachment.fileSize)}` : ""}`
    : `${resolvedMimeType}${safeAttachment.fileSize ? ` • ${formatFileSize(safeAttachment.fileSize)}` : ""}`;

  return (
    <div className="relative min-w-[160px] max-w-[200px] rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-2 shadow-[0_12px_22px_rgba(8,14,28,0.14)]">
      <button
        type="button"
        onClick={() => onRemove(safeAttachment.id)}
        title="Убрать"
        className="absolute right-3 top-3 z-10 rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-sm leading-none text-[var(--text-secondary)] transition-colors duration-200 hover:text-[var(--text-primary)]"
      >
        ×
      </button>

      {isImage ? (
        <img
          src={safeAttachment.fileData}
          alt={safeAttachment.fileName}
          className="mb-3 h-[104px] w-full rounded-[14px] object-cover"
        />
      ) : (
        <div className="mb-3 flex h-[104px] items-center justify-center rounded-[14px] bg-[var(--surface-muted)] text-[26px] text-[var(--text-primary)]">
          {"\uD83D\uDCCE"}
        </div>
      )}

      <div className="break-words pr-6 text-sm font-medium leading-5 text-[var(--text-primary)]">
        {safeAttachment.fileName || "Файл"}
      </div>
      <div className="mt-1 break-words text-xs leading-5 text-[var(--text-secondary)]">{attachmentMeta}</div>
    </div>
  );
}
