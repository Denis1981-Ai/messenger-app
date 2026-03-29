/* eslint-disable @next/next/no-img-element */

import { ClipboardEvent, useEffect, useRef, useState } from "react";

import { isExecutableAttachment, isPreviewableImageAttachment } from "@/lib/attachment-mime";
import { Message } from "../types";
import { openAttachment, triggerAttachmentDownload } from "../utils/attachmentDownload";
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

type AttachmentActionStatus = "idle" | "pending" | "success" | "error";

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const getAttachmentActionLabel = (action: "open" | "download" | "copy", status: AttachmentActionStatus) => {
  if (action === "open") {
    if (status === "pending") {
      return "Открытие...";
    }
    if (status === "success") {
      return "Открыто";
    }
    if (status === "error") {
      return "Ошибка";
    }
    return "Открыть";
  }

  if (action === "download") {
    if (status === "pending") {
      return "Скачивание...";
    }
    if (status === "success") {
      return "Готово";
    }
    if (status === "error") {
      return "Ошибка";
    }
    return "Скачать";
  }

  if (status === "success") {
    return "Скопировано";
  }

  if (status === "error") {
    return "Ошибка";
  }

  return "Копировать";
};

const hasTextSelectionInsideContainer = (container: Node | null) => {
  if (!container || typeof window === "undefined" || typeof window.getSelection !== "function") {
    return false;
  }

  const selection = window.getSelection();
  const selectedText = selection?.toString() ?? "";
  const anchorNode = selection?.anchorNode ?? null;
  const focusNode = selection?.focusNode ?? null;

  return (
    Boolean(selectedText) &&
    Boolean(anchorNode) &&
    Boolean(focusNode) &&
    container.contains(anchorNode) &&
    container.contains(focusNode)
  );
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
  const [attachmentActionState, setAttachmentActionState] = useState<
    Record<string, AttachmentActionStatus>
  >({});
  const [pressedActionKey, setPressedActionKey] = useState<string | null>(null);
  const actionResetTimersRef = useRef<Record<string, number>>({});
  const [hasTextSelectionInsideMessage, setHasTextSelectionInsideMessage] = useState(false);
  const messageBubbleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const resetTimers = actionResetTimersRef.current;

    return () => {
      Object.values(resetTimers).forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, []);

  useEffect(() => {
    const syncSelectionState = () => {
      setHasTextSelectionInsideMessage(hasTextSelectionInsideContainer(messageBubbleRef.current));
    };

    document.addEventListener("selectionchange", syncSelectionState);

    return () => {
      document.removeEventListener("selectionchange", syncSelectionState);
    };
  }, []);

  const setAttachmentActionStatus = (
    key: string,
    status: AttachmentActionStatus,
    resetDelayMs = status === "pending" ? 0 : 1400
  ) => {
    const existingTimeout = actionResetTimersRef.current[key];
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
      delete actionResetTimersRef.current[key];
    }

    setAttachmentActionState((prev) => ({
      ...prev,
      [key]: status,
    }));

    if (resetDelayMs > 0) {
      actionResetTimersRef.current[key] = window.setTimeout(() => {
        setAttachmentActionState((prev) => {
          const nextState = { ...prev };
          delete nextState[key];
          return nextState;
        });
        delete actionResetTimersRef.current[key];
      }, resetDelayMs);
    }
  };

  const runAttachmentAction = async (
    key: string,
    action: () => Promise<void>,
    successMode: "idle" | "success" = "idle"
  ) => {
    if (attachmentActionState[key] === "pending") {
      return;
    }

    setAttachmentActionStatus(key, "pending");

    try {
      await action();
      if (successMode === "success") {
        setAttachmentActionStatus(key, "success");
      } else {
        setAttachmentActionStatus(key, "idle", 1);
      }
    } catch {
      setAttachmentActionStatus(key, "error");
    }
  };

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

  const handleMessageTextCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    const selection =
      typeof window !== "undefined" && typeof window.getSelection === "function"
        ? window.getSelection()
        : null;
    const selectedText = selection?.toString() ?? "";
    const currentTarget = event.currentTarget;
    const textToCopy = hasTextSelectionInsideContainer(currentTarget) ? selectedText : currentTarget.textContent || "";

    if (!textToCopy) {
      return;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", textToCopy);
  };

  const allowNativeSelectionContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (hasTextSelectionInsideContainer(event.currentTarget)) {
      event.stopPropagation();
    }
  };

  const renderAttachmentActionButton = (
    attachmentId: string,
    action: "open" | "download" | "copy",
    handler: (event: React.MouseEvent<HTMLButtonElement>) => void
  ) => {
    const stateKey = `${attachmentId}:${action}`;
    const actionState = attachmentActionState[stateKey] || "idle";
    const isPending = actionState === "pending";
    const isPressed = pressedActionKey === stateKey && !isPending;

    return (
      <button
        type="button"
        onClick={handler}
        onPointerDown={() => setPressedActionKey(stateKey)}
        onPointerUp={() => setPressedActionKey((current) => (current === stateKey ? null : current))}
        onPointerLeave={() => setPressedActionKey((current) => (current === stateKey ? null : current))}
        onPointerCancel={() => setPressedActionKey((current) => (current === stateKey ? null : current))}
        disabled={isPending}
        aria-busy={isPending}
        className={`inline-flex items-center rounded-full border px-3 py-2 text-[12px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_2px_6px_rgba(8,14,28,0.12)] transition-all duration-100 md:py-1.5 md:text-[11px] ${
          isMine
            ? "border-white/10 bg-white/12 text-white hover:border-white/18 hover:bg-white/24 hover:text-white disabled:border-white/12 disabled:bg-white/16 disabled:text-white/70"
            : "border-white/[0.06] bg-[rgba(20,28,43,0.56)] text-[var(--accent-soft)] hover:border-white/[0.12] hover:bg-[rgba(20,28,43,0.88)] hover:text-white disabled:border-white/[0.08] disabled:bg-[rgba(20,28,43,0.72)] disabled:text-[var(--text-secondary)]"
        } ${
          actionState === "success"
            ? "ring-1 ring-emerald-400/45"
            : actionState === "error"
              ? "ring-1 ring-rose-400/45"
              : isPending
                ? "translate-y-[1px] scale-[0.985] border-white/15 opacity-95 shadow-[inset_0_3px_10px_rgba(8,14,28,0.34)] saturate-75"
                : isPressed
                  ? "translate-y-[1px] scale-[0.96] border-white/18 shadow-[inset_0_3px_10px_rgba(8,14,28,0.42)] brightness-[0.88]"
                  : "hover:-translate-y-[1px] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_6px_14px_rgba(8,14,28,0.18)]"
        } disabled:cursor-wait`}
      >
        {getAttachmentActionLabel(action, actionState)}
      </button>
    );
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
          if (hasTextSelectionInsideContainer(messageBubbleRef.current)) {
            return;
          }
          onOpenContextMenu(event);
        }
      }}
      className={`flex ${isMine ? "justify-end" : "justify-start"} ${selectedMode ? "cursor-pointer" : ""}`}
    >
      <div className={`group flex w-full max-w-[94%] flex-col ${isMine ? "items-end" : "items-start"} md:max-w-[65%]`}>
        <div
          ref={messageBubbleRef}
          className={[
            "w-full rounded-[15px] border px-3.5 py-2 shadow-[0_8px_16px_rgba(9,14,28,0.07)] transition-colors duration-150 md:px-3.5 md:py-2",
            isMine
              ? "border-[rgba(113,132,215,0.36)] bg-[linear-gradient(180deg,#7184d7_0%,#6478ce_100%)] text-white"
              : "border-[rgba(255,255,255,0.06)] bg-[rgba(49,59,76,0.92)] text-[var(--text-primary)]",
            isHighlighted ? "ring-2 ring-[rgba(93,121,238,0.55)] ring-offset-2 ring-offset-[var(--content-bg)]" : "",
            isSelected ? "ring-2 ring-[var(--accent)]" : "",
          ].join(" ")}
        >
          {!selectedMode && !hasTextSelectionInsideMessage && (
            <div className="pointer-events-none mb-1.5 flex flex-wrap gap-1.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
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
              onCopy={handleMessageTextCopy}
              onContextMenu={allowNativeSelectionContextMenu}
              className={`whitespace-pre-wrap break-words text-[13px] leading-[1.55] ${
                message.attachments?.length ? "mb-2" : ""
              } message-text relative z-[1] select-text ${isMine ? "message-text--mine" : "message-text--incoming"}`}
            >
              {message.text}
            </div>
          )}

          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-col gap-2">
              {message.attachments.map((attachment) => {
                const isImage = isPreviewableImageAttachment(attachment.fileType, attachment.fileName);
                const isExecutable = isExecutableAttachment(attachment.fileType, attachment.fileName);
                const sizeLabel = formatFileSize(attachment.fileSize);
                const openUrl = attachment.fileData;

                return isImage ? (
                  <div key={attachment.id}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void runAttachmentAction(`${attachment.id}:open`, async () => {
                          await openAttachment(openUrl, attachment.fileName);
                        });
                      }}
                      className="group/image block overflow-hidden rounded-[12px]"
                    >
                      <img
                        src={openUrl}
                        alt={attachment.fileName}
                        className="block max-w-full rounded-[12px] border border-white/8 shadow-[0_10px_18px_rgba(8,14,28,0.12)] transition-transform duration-150 group-hover/image:scale-[1.01] md:max-w-[288px]"
                      />
                    </button>
                    <div className={`mt-1.5 text-[12px] ${isMine ? "text-white/76" : "text-[var(--text-secondary)]"}`}>
                      {attachment.fileName}
                      {sizeLabel ? ` • ${sizeLabel}` : ""}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {renderAttachmentActionButton(attachment.id, "open", (event) => {
                        event.stopPropagation();
                        void runAttachmentAction(`${attachment.id}:open`, async () => {
                          await openAttachment(openUrl, attachment.fileName);
                        });
                      })}
                      {renderAttachmentActionButton(attachment.id, "download", (event) => {
                        event.stopPropagation();
                        void runAttachmentAction(`${attachment.id}:download`, async () => {
                          await triggerAttachmentDownload(attachment.fileData, attachment.fileName);
                        });
                      })}
                      {renderAttachmentActionButton(attachment.id, "copy", (event) => {
                        event.stopPropagation();
                        void runAttachmentAction(`${attachment.id}:copy`, async () => {
                          await copyAttachment(attachment.fileName, attachment.fileData, attachment.fileType);
                        }, "success");
                      })}
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
                    <div className="text-sm font-semibold">Документ • {attachment.fileName}</div>
                    <div className={`mt-1 text-[12px] ${isMine ? "text-white/72" : "text-[var(--text-secondary)]"}`}>
                      {attachment.fileType}
                      {sizeLabel ? ` • ${sizeLabel}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {renderAttachmentActionButton(attachment.id, "download", (event) => {
                        event.stopPropagation();
                        void runAttachmentAction(`${attachment.id}:download`, async () => {
                          await triggerAttachmentDownload(attachment.fileData, attachment.fileName);
                        });
                      })}
                      {!isExecutable &&
                        renderAttachmentActionButton(attachment.id, "open", (event) => {
                          event.stopPropagation();
                          void runAttachmentAction(`${attachment.id}:open`, async () => {
                            await openAttachment(openUrl, attachment.fileName);
                          });
                        })}
                      {renderAttachmentActionButton(attachment.id, "copy", (event) => {
                        event.stopPropagation();
                        void runAttachmentAction(`${attachment.id}:copy`, async () => {
                          await copyAttachment(attachment.fileName, attachment.fileData, attachment.fileType);
                        }, "success");
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className={`mt-2 flex items-center justify-end gap-2 text-[10px] ${isMine ? "text-white/70" : "text-[var(--text-secondary)]"}`}>
            <span>
              {formatMessageTime(message)}
              {message.isEdited || message.edited ? " • изменено" : ""}
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
