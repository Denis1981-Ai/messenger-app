/* eslint-disable @next/next/no-img-element */

import { isPreviewableImageAttachment } from "@/lib/attachment-mime";
import { Message } from "../types";
import { formatFileSize, formatMessageTime, getStatusDisplay } from "../utils/format";

type Props = {
  message: Message;
  isMine: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  authorName: string;
  quotePreview: { authorName: string; text: string };
  currentUserId: string;
  selectedMode: boolean;
  setMessageRef: (node: HTMLDivElement | null) => void;
  onToggleSelect: () => void;
  onOpenContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  onScrollToReply: (messageId: string) => void;
  onQuickReply: () => void;
  onQuickCopy: () => void;
  onQuickShorten: () => void;
  onQuickTranslate: () => void;
};

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const toDownloadUrl = (value: string) => {
  if (!value || value.startsWith("data:")) {
    return value;
  }

  return `${value}${value.includes("?") ? "&" : "?"}download=1`;
};

export function MessageItem({
  message,
  isMine,
  isSelected,
  isHighlighted,
  authorName,
  quotePreview,
  selectedMode,
  setMessageRef,
  onToggleSelect,
  onOpenContextMenu,
  onScrollToReply,
  onQuickReply,
  onQuickCopy,
  onQuickShorten,
  onQuickTranslate,
}: Props) {
  const statusDisplay = getStatusDisplay(message.status);
  const quickActions: Array<{ label: string; handler: () => void }> = [
    { label: "Ответить", handler: onQuickReply },
    { label: "Сократить", handler: onQuickShorten },
    { label: "Перевести", handler: onQuickTranslate },
    { label: "Копировать", handler: onQuickCopy },
  ];

  const copyAttachment = async (fileName: string, fileData: string, fileType: string) => {
    try {
      if (fileData.startsWith("data:") && "ClipboardItem" in window) {
        const blob = await dataUrlToBlob(fileData);
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type || fileType || "application/octet-stream"]: blob,
          }),
        ]);
        return;
      }

      await navigator.clipboard.writeText(fileName);
    } catch {
      await navigator.clipboard.writeText(fileName);
    }
  };

  return (
    <div
      ref={setMessageRef}
      onClick={() => {
        if (selectedMode) {
          onToggleSelect();
        }
      }}
      onContextMenu={(event) => {
        if (!selectedMode) {
          onOpenContextMenu(event);
        }
      }}
      className={`flex ${isMine ? "justify-end" : "justify-start"} ${selectedMode ? "cursor-pointer" : ""}`}
    >
      <div className={`group flex w-full max-w-[65%] flex-col ${isMine ? "items-end" : "items-start"}`}>
        <div
          className={[
            "w-full rounded-[15px] border px-3.5 py-2 shadow-[0_8px_16px_rgba(9,14,28,0.07)] transition-colors duration-150",
            isMine
              ? "border-[rgba(113,132,215,0.36)] bg-[linear-gradient(180deg,#7184d7_0%,#6478ce_100%)] text-white"
              : "border-[rgba(255,255,255,0.06)] bg-[rgba(49,59,76,0.92)] text-[var(--text-primary)]",
            isHighlighted ? "ring-2 ring-[rgba(93,121,238,0.55)] ring-offset-2 ring-offset-[var(--content-bg)]" : "",
            isSelected ? "ring-2 ring-[var(--accent)]" : "",
          ].join(" ")}
        >
          {!selectedMode && (
            <div className="mb-1.5 flex flex-wrap gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {quickActions.map(({ label, handler }) => (
                <button
                  key={label}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handler();
                  }}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors duration-150 ${
                    isMine
                      ? "bg-white/12 text-white/84 hover:bg-white/18"
                      : "bg-white/[0.05] text-[var(--text-secondary)] hover:bg-white/[0.08] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {message.replyToMessageId && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (message.replyToMessageId) {
                  onScrollToReply(message.replyToMessageId);
                }
              }}
              className={`mb-2 w-full rounded-[12px] border px-3 py-1 text-left transition-colors duration-150 ${
                isMine
                  ? "border-white/16 bg-white/10 hover:bg-white/14"
                  : "border-white/[0.06] bg-[rgba(20,28,43,0.56)] hover:bg-[rgba(20,28,43,0.7)]"
              }`}
            >
              <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isMine ? "text-white/78" : "text-[var(--text-secondary)]"}`}>
                {quotePreview.authorName}
              </div>
              <div className={`mt-0.5 truncate text-[12px] leading-[1.45] ${isMine ? "text-white/70" : "text-[var(--text-secondary)]"}`}>
                {quotePreview.text}
              </div>
            </button>
          )}

          <div className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${isMine ? "text-white/72" : "text-[var(--text-muted)]"}`}>
            {authorName}
          </div>

          {message.text && (
            <div
              className={`whitespace-pre-wrap break-words text-[13px] leading-[1.55] ${
                message.attachments?.length ? "mb-2" : ""
              }`}
            >
              {message.text}
            </div>
          )}

          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-col gap-2">
              {message.attachments.map((attachment) => {
                const isImage = isPreviewableImageAttachment(attachment.fileType, attachment.fileName);
                const sizeLabel = formatFileSize(attachment.fileSize);
                const openUrl = attachment.fileData;
                const downloadUrl = toDownloadUrl(attachment.fileData);

                return isImage ? (
                  <div key={attachment.id}>
                    <a href={openUrl} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={openUrl}
                        alt={attachment.fileName}
                        className="block max-w-[288px] rounded-[12px] border border-white/8 shadow-[0_10px_18px_rgba(8,14,28,0.12)]"
                      />
                    </a>
                    <div className={`mt-1.5 text-[12px] ${isMine ? "text-white/76" : "text-[var(--text-secondary)]"}`}>
                      {attachment.fileName}
                      {sizeLabel ? ` · ${sizeLabel}` : ""}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <a
                        href={openUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ${
                          isMine
                            ? "bg-white/12 text-white hover:bg-white/18"
                            : "bg-[rgba(20,28,43,0.56)] text-[var(--accent-soft)] hover:bg-[rgba(20,28,43,0.76)]"
                        }`}
                      >
                        Открыть
                      </a>
                      <a
                        href={downloadUrl}
                        download={attachment.fileName}
                        className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ${
                          isMine
                            ? "bg-white/12 text-white hover:bg-white/18"
                            : "bg-[rgba(20,28,43,0.56)] text-[var(--accent-soft)] hover:bg-[rgba(20,28,43,0.76)]"
                        }`}
                      >
                        Скачать
                      </a>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void copyAttachment(attachment.fileName, attachment.fileData, attachment.fileType);
                        }}
                        className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ${
                          isMine
                            ? "bg-white/12 text-white hover:bg-white/18"
                            : "bg-[rgba(20,28,43,0.56)] text-[var(--accent-soft)] hover:bg-[rgba(20,28,43,0.76)]"
                        }`}
                      >
                        Копировать
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={attachment.id}
                    className={`rounded-[12px] border px-3.5 py-2 ${
                      isMine
                        ? "border-white/16 bg-white/10"
                        : "border-white/[0.06] bg-[rgba(20,28,43,0.56)]"
                    }`}
                  >
                    <div className="text-sm font-semibold">Документ · {attachment.fileName}</div>
                    <div className={`mt-1 text-[12px] ${isMine ? "text-white/72" : "text-[var(--text-secondary)]"}`}>
                      {attachment.fileType}
                      {sizeLabel ? ` · ${sizeLabel}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a
                        href={openUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ${
                          isMine
                            ? "bg-white/12 text-white hover:bg-white/18"
                            : "bg-[rgba(20,28,43,0.56)] text-[var(--accent-soft)] hover:bg-[rgba(20,28,43,0.76)]"
                        }`}
                      >
                        Открыть
                      </a>
                      <a
                        href={downloadUrl}
                        download={attachment.fileName}
                        className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ${
                          isMine
                            ? "bg-white/12 text-white hover:bg-white/18"
                            : "bg-[rgba(20,28,43,0.56)] text-[var(--accent-soft)] hover:bg-[rgba(20,28,43,0.76)]"
                        }`}
                      >
                        Скачать
                      </a>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void copyAttachment(attachment.fileName, attachment.fileData, attachment.fileType);
                        }}
                        className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ${
                          isMine
                            ? "bg-white/12 text-white hover:bg-white/18"
                            : "bg-[rgba(20,28,43,0.56)] text-[var(--accent-soft)] hover:bg-[rgba(20,28,43,0.76)]"
                        }`}
                      >
                        Копировать
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className={`mt-2 flex items-center justify-end gap-2 text-[10px] ${isMine ? "text-white/70" : "text-[var(--text-secondary)]"}`}>
            <span>
              {formatMessageTime(message)}
              {message.isEdited || message.edited ? " · изменено" : ""}
            </span>
            {isMine && (
              <span className="font-medium" style={{ color: statusDisplay.color }}>
                {statusDisplay.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
