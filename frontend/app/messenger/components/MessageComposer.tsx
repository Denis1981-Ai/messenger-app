import { useLayoutEffect } from "react";

import { Attachment, Message, UploadingAttachment } from "../types";
import { EmojiPicker } from "./EmojiPicker";
import { FilePreview } from "./FilePreview";
import { ReplyPreview } from "./ReplyPreview";

const COMMANDS = [
  {
    command: "/ответ" as const,
    label: "Сформулировать ответ",
    description: "Собрать короткий деловой ответ по контексту",
  },
  {
    command: "/перевод" as const,
    label: "Перевести",
    description: "Быстро перевести текущий текст в рабочий вариант",
  },
  {
    command: "/сократить" as const,
    label: "Сократить текст",
    description: "Убрать лишнее и сделать сообщение короче",
  },
] as const;

const COMPOSER_MIN_HEIGHT_PX = 44;
const COMPOSER_MAX_HEIGHT_PX = 176;

type SmartAction = {
  command: (typeof COMMANDS)[number]["command"];
  label: string;
  description: string;
};

type Props = {
  storageWarning: string;
  replyingToMessage: Message | null;
  editingMessageId: string | null;
  pendingAttachments: Attachment[];
  uploadingAttachments: UploadingAttachment[];
  showEmojiPicker: boolean;
  currentUserName: string;
  input: string;
  smartActions: SmartAction[];
  textInputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  emojiPickerRef: React.RefObject<HTMLDivElement | null>;
  onCancelReply: () => void;
  getQuotePreview: (message: Message | null) => { authorName: string; text: string };
  onRemovePendingAttachment: (attachmentId: string) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleEmojiPicker: () => void;
  onInsertEmoji: (emoji: string) => void;
  onInputChange: (value: string) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onRunCommand: (command: (typeof COMMANDS)[number]["command"]) => void;
  onCancelEditing: () => void;
  onSend: () => void;
};

export function MessageComposer({
  storageWarning,
  replyingToMessage,
  editingMessageId,
  pendingAttachments,
  uploadingAttachments,
  showEmojiPicker,
  currentUserName,
  input,
  smartActions,
  textInputRef,
  fileInputRef,
  emojiPickerRef,
  onCancelReply,
  getQuotePreview,
  onRemovePendingAttachment,
  onFileChange,
  onToggleEmojiPicker,
  onInsertEmoji,
  onInputChange,
  onPaste,
  onKeyDown,
  onRunCommand,
  onCancelEditing,
  onSend,
}: Props) {
  const safeAttachments = Array.isArray(pendingAttachments) ? pendingAttachments : [];
  const safeUploading = Array.isArray(uploadingAttachments) ? uploadingAttachments : [];
  const safeSmartActions = Array.isArray(smartActions) ? smartActions : [];
  const quotePreview = replyingToMessage ? getQuotePreview(replyingToMessage) : { authorName: "", text: "" };
  const trimmedInput = input.trim();
  const suggestions = ["Файл получен", "Уточните детали", "Согласовано", "Жду правки"];
  const visibleCommands = trimmedInput.startsWith("/")
    ? COMMANDS.filter(({ command, label }) => {
        const normalized = trimmedInput.toLowerCase();
        return command.startsWith(normalized) || label.toLowerCase().includes(normalized.replace("/", ""));
      })
    : [];

  useLayoutEffect(() => {
    const textarea = textInputRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = `${COMPOSER_MIN_HEIGHT_PX}px`;
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, COMPOSER_MIN_HEIGHT_PX),
      COMPOSER_MAX_HEIGHT_PX
    );
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > COMPOSER_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [editingMessageId, input, textInputRef]);

  return (
    <div className="shrink-0 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(31,40,56,0.92)] px-3 pb-3 pt-2 [font-family:Inter,system-ui,sans-serif] md:px-5 md:pb-3.5 md:pt-2.5">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileChange} />

      {storageWarning && (
        <div className="mb-3 rounded-2xl border border-[#F59E0B]/18 bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-primary)]">
          {storageWarning}
        </div>
      )}

      {replyingToMessage && (
        <div className="mb-3">
          <ReplyPreview authorName={quotePreview.authorName} text={quotePreview.text} onClose={onCancelReply} />
        </div>
      )}

      {safeUploading.length > 0 && (
        <div className="mb-3 grid gap-2">
          {safeUploading.map((item) => (
            <div key={item.id} className="rounded-[16px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--text-primary)]">{item.fileName}</div>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    {item.fileType.startsWith("image/") ? "Изображение" : item.fileType}
                  </div>
                </div>
                <div className="text-xs font-medium text-[var(--accent-soft)]">{item.progress}%</div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all duration-200 ease-out"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {safeAttachments.length > 0 && (
        <div className="mb-3 flex gap-3 overflow-x-auto pb-1">
          {safeAttachments.map((attachment, index) => (
            <FilePreview
              key={attachment?.id || `${attachment?.fileName || "file"}-${index}`}
              attachment={attachment}
              onRemove={onRemovePendingAttachment}
            />
          ))}
        </div>
      )}

      {visibleCommands.length > 0 && (
        <div className="mb-3 grid gap-2">
          {visibleCommands.map((item) => (
            <button
              key={item.command}
              type="button"
              onClick={() => onRunCommand(item.command)}
              className="group flex items-start justify-between rounded-[15px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-left transition-colors duration-150 hover:border-[rgba(93,121,238,0.2)] hover:bg-[rgba(255,255,255,0.05)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</span>
                  <span className="rounded-full bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-soft)]">
                    {item.command}
                  </span>
                </div>
                <div className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{item.description}</div>
              </div>
              <span className="pl-3 pt-0.5 text-xs font-medium text-[var(--text-muted)] transition-colors duration-150 group-hover:text-[var(--accent-soft)]">
                Tab
              </span>
            </button>
          ))}
        </div>
      )}

      {visibleCommands.length === 0 && safeSmartActions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {safeSmartActions.map((action) => (
            <button
              key={`${action.command}-${action.label}`}
              type="button"
              onClick={() => onRunCommand(action.command)}
              className="rounded-full border border-[rgba(93,121,238,0.16)] bg-[rgba(93,121,238,0.09)] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-soft)] transition-colors duration-150 hover:bg-[rgba(93,121,238,0.14)] hover:text-white"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {!replyingToMessage && !editingMessageId && safeAttachments.length === 0 && (
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Подсказки:
          </span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                onInputChange(suggestion);
                requestAnimationFrame(() => {
                  textInputRef.current?.focus();
                  const length = suggestion.length;
                  textInputRef.current?.setSelectionRange(length, length);
                });
              }}
              className="rounded-full border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[rgba(255,255,255,0.05)] hover:text-white"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-[17px] border border-[rgba(255,255,255,0.07)] bg-[rgba(35,45,63,0.96)] px-2.5 py-1.5 shadow-[0_10px_18px_rgba(8,14,28,0.1)] md:px-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Файл"
          className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[rgba(255,255,255,0.07)] hover:text-white md:h-9 md:w-9"
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
            <path
              d="M11.6667 5.83333L7.21405 10.286C6.56572 10.9343 6.56572 11.9854 7.21405 12.6337C7.86237 13.282 8.91342 13.282 9.56174 12.6337L14.6034 7.59208C15.5757 6.61977 15.5757 5.04386 14.6034 4.07155C13.6311 3.09923 12.0552 3.09923 11.0829 4.07155L5.45262 9.70178C4.156 10.9984 4.156 13.1005 5.45262 14.3971C6.74924 15.6937 8.85134 15.6937 10.148 14.3971L15.25 9.29508"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div ref={emojiPickerRef} className="relative shrink-0">
          <button
            type="button"
            onClick={onToggleEmojiPicker}
            title="Эмодзи"
            className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[rgba(255,255,255,0.07)] hover:text-white md:h-9 md:w-9"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
              <path
                d="M13.9583 7.08333H13.9667M6.04167 7.08333H6.05M14.5833 10C14.5833 12.5313 12.5313 14.5833 10 14.5833C7.4687 14.5833 5.41667 12.5313 5.41667 10C5.41667 7.4687 7.4687 5.41667 10 5.41667C12.5313 5.41667 14.5833 7.4687 14.5833 10ZM1.66667 10C1.66667 14.6024 5.39763 18.3333 10 18.3333C14.6024 18.3333 18.3333 14.6024 18.3333 10C18.3333 5.39763 14.6024 1.66667 10 1.66667C5.39763 1.66667 1.66667 5.39763 1.66667 10ZM7.08333 11.6667C7.60406 12.534 8.64633 13.125 10 13.125C11.3537 13.125 12.3959 12.534 12.9167 11.6667"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {showEmojiPicker && <EmojiPicker onSelect={onInsertEmoji} />}
        </div>

        <div className="relative flex min-w-0 flex-1 items-stretch overflow-hidden rounded-[15px] bg-[rgba(21,29,42,0.84)] px-4">
          <textarea
            ref={textInputRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            rows={1}
            autoFocus
            placeholder={
              editingMessageId
                ? "Редактирование сообщения..."
                : `Напишите сообщение ${currentUserName || "в чат"}...`
            }
            className="min-h-[44px] w-full min-w-0 resize-none overflow-y-hidden bg-transparent py-2.5 text-[13px] leading-[1.55] text-[var(--text-primary)] outline-none transition-[height] duration-100 ease-out placeholder:text-[var(--text-muted)]"
          />
        </div>

        {(editingMessageId || replyingToMessage) && (
          <button
            type="button"
            onClick={onCancelEditing}
            className="mb-0.5 h-9 shrink-0 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)] px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[rgba(255,255,255,0.07)] hover:text-white md:px-4"
          >
            Отмена
          </button>
        )}

        <button
          type="button"
          onClick={onSend}
          className="mb-0.5 inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-[var(--accent)] px-3 text-[12px] font-semibold text-white shadow-[0_8px_16px_rgba(93,121,238,0.14)] transition-colors duration-150 hover:bg-[var(--accent-strong)] md:px-4"
        >
          {editingMessageId ? "Сохранить" : "Отправить"}
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
            <path
              d="M17.5 2.5L9.47947 10.5205M17.5 2.5L12.3954 17.1051L9.47947 10.5205M17.5 2.5L2.8949 7.60461L9.47947 10.5205"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)] md:text-[10px]">
        <span>{trimmedInput.startsWith("/") ? "Enter — выполнить команду" : "Enter — отправить"}</span>
        <span>Shift+Enter — новая строка</span>
      </div>
    </div>
  );
}
