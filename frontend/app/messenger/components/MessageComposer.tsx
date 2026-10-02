import { useLayoutEffect, useMemo, useState } from "react";

import { Attachment, Message, UploadingAttachment, User } from "../types";
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
  failedSendDrafts: Array<{
    id: string;
    text: string;
    error: string;
  }>;
  replyingToMessage: Message | null;
  editingMessageId: string | null;
  pendingAttachments: Attachment[];
  uploadingAttachments: UploadingAttachment[];
  showEmojiPicker: boolean;
  currentUserName: string;
  currentChatTitle: string;
  mentionUsers: User[];
  input: string;
  smartActions: SmartAction[];
  textInputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  emojiPickerRef: React.RefObject<HTMLDivElement | null>;
  onCancelReply: () => void;
  getQuotePreview: (message: Message | null) => { authorName: string; text: string };
  onRemovePendingAttachment: (attachmentId: string) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onChooseFiles: () => void;
  onToggleEmojiPicker: () => void;
  onInsertEmoji: (emoji: string) => void;
  onInputChange: (value: string) => void;
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onRunCommand: (command: (typeof COMMANDS)[number]["command"]) => void;
  onCancelEditing: () => void;
  onRetryFailedSend: (draftId: string) => void;
  onDiscardFailedSend: (draftId: string) => void;
  onSend: () => void;
  isFileDragOver: boolean;
  onFileDragOver: React.DragEventHandler<HTMLDivElement>;
  onFileDragLeave: React.DragEventHandler<HTMLDivElement>;
  onFileDrop: React.DragEventHandler<HTMLDivElement>;
};

const getUserMentionLabel = (user: User) => user.displayName?.trim() || user.name || user.login || "Пользователь";

const getMentionToken = (user: User) => `@${getUserMentionLabel(user).trim().replace(/\s+/g, "_")}`;

const getMentionState = (value: string, cursor: number) => {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/u);

  if (!match) {
    return null;
  }

  const prefix = match[1] || "";
  const query = match[2] || "";
  const start = beforeCursor.length - query.length - 1;

  return {
    query,
    start,
    end: cursor,
    needsLeadingSpace: prefix === "",
  };
};

export function MessageComposer({
  storageWarning,
  failedSendDrafts,
  replyingToMessage,
  editingMessageId,
  pendingAttachments,
  uploadingAttachments,
  showEmojiPicker,
  currentUserName,
  currentChatTitle,
  mentionUsers,
  input,
  smartActions,
  textInputRef,
  fileInputRef,
  emojiPickerRef,
  onCancelReply,
  getQuotePreview,
  onRemovePendingAttachment,
  onFileChange,
  onChooseFiles,
  onToggleEmojiPicker,
  onInsertEmoji,
  onInputChange,
  onPaste,
  onKeyDown,
  onRunCommand,
  onCancelEditing,
  onRetryFailedSend,
  onDiscardFailedSend,
  onSend,
  isFileDragOver,
  onFileDragOver,
  onFileDragLeave,
  onFileDrop,
}: Props) {
  const safeAttachments = Array.isArray(pendingAttachments) ? pendingAttachments : [];
  const safeUploading = Array.isArray(uploadingAttachments) ? uploadingAttachments : [];
  const safeSmartActions = Array.isArray(smartActions) ? smartActions : [];
  const safeFailedDrafts = Array.isArray(failedSendDrafts) ? failedSendDrafts : [];
  const [mentionCursor, setMentionCursor] = useState(input.length);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const quotePreview = replyingToMessage ? getQuotePreview(replyingToMessage) : { authorName: "", text: "" };
  const trimmedInput = input.trim();
  const suggestions = ["Ок", "Уточню", "Переслал на почту", "Запросил", "Спасибо", "Жду"];
  const visibleCommands = trimmedInput.startsWith("/")
    ? COMMANDS.filter(({ command, label }) => {
        const normalized = trimmedInput.toLowerCase();
        return command.startsWith(normalized) || label.toLowerCase().includes(normalized.replace("/", ""));
      })
    : [];

  const mentionState = getMentionState(input, mentionCursor);
  const mentionOptions = useMemo(() => {
    if (!mentionState) {
      return [];
    }

    const normalizedQuery = mentionState.query.toLowerCase().replace(/_/g, " ");

    const safeUsers = Array.isArray(mentionUsers) ? mentionUsers : [];

    return safeUsers
      .filter((user) => {
        const haystack = [
          user.name,
          user.displayName || "",
          user.login || "",
          getMentionToken(user),
        ]
          .join(" ")
          .toLowerCase()
          .replace(/_/g, " ");

        return !normalizedQuery || haystack.includes(normalizedQuery);
      })
      .slice(0, 6);
  }, [mentionState, mentionUsers]);
  const effectiveActiveMentionIndex =
    mentionOptions.length > 0 ? Math.min(activeMentionIndex, mentionOptions.length - 1) : 0;

  const insertMention = (user: User) => {
    if (!mentionState) {
      return;
    }

    const token = getMentionToken(user);
    const inserted = `${mentionState.needsLeadingSpace ? "" : ""}${token} `;
    const nextValue = `${input.slice(0, mentionState.start)}${inserted}${input.slice(mentionState.end)}`;
    const nextCursor = mentionState.start + inserted.length;

    onInputChange(nextValue);
    setActiveMentionIndex(0);
    setMentionCursor(nextCursor);

    requestAnimationFrame(() => {
      textInputRef.current?.focus();
      textInputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

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
    <div
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={onFileDrop}
      className="composer-surface relative shrink-0 border-t border-[var(--border-soft)] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5 [font-family:Inter,system-ui,sans-serif] backdrop-blur-xl md:px-5 md:pb-[max(16px,env(safe-area-inset-bottom))] md:pt-3"
    >
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileChange} />

      {isFileDragOver && (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-[22px] border border-dashed border-[rgba(59,130,246,0.46)] bg-[rgba(8,15,27,0.78)] text-sm font-semibold text-[var(--accent-soft)] shadow-[0_18px_36px_rgba(2,6,23,0.28)] backdrop-blur-sm">
          Отпустите файл здесь
        </div>
      )}

      {storageWarning && (
        <div className="mb-3 rounded-2xl border border-[#F59E0B]/18 bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-primary)]">
          {storageWarning}
        </div>
      )}

      {safeFailedDrafts.length > 0 && (
        <div className="mb-3 grid gap-2">
          {safeFailedDrafts.map((draft) => (
            <div
              key={draft.id}
              className="rounded-[16px] border border-[#F59E0B]/18 bg-[rgba(245,158,11,0.08)] px-3.5 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-[#ffd39a]">Не отправлено</div>
                  <div className="mt-1 line-clamp-2 text-[13px] leading-5 text-[var(--text-primary)]">
                    {draft.text}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--text-secondary)]">{draft.error}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onRetryFailedSend(draft.id)}
                    className="rounded-xl bg-[rgba(93,121,238,0.18)] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-soft)] transition-colors duration-150 hover:bg-[rgba(93,121,238,0.26)]"
                  >
                    Повторить
                  </button>
                  <button
                    type="button"
                    onClick={() => onDiscardFailedSend(draft.id)}
                    aria-label="Убрать неотправленное сообщение"
                    title="Убрать"
                    className="rounded-xl px-2.5 py-1.5 text-[12px] text-[var(--text-muted)] transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}
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
              className="rounded-full border border-[rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.1)] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-soft)] transition-all duration-150 hover:border-[rgba(59,130,246,0.34)] hover:bg-[rgba(59,130,246,0.16)] hover:text-white"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {!replyingToMessage && !editingMessageId && safeAttachments.length === 0 && (
        <div className="mb-2.5 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              className="rounded-full border border-[var(--border-soft)] bg-[rgba(255,255,255,0.045)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-all duration-150 hover:border-[rgba(59,130,246,0.32)] hover:bg-[rgba(59,130,246,0.11)] hover:text-[var(--accent-soft)] active:scale-95"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="premium-panel rounded-[24px] border px-3 py-2 shadow-[0_16px_34px_rgba(2,6,23,0.28),inset_0_1px_0_rgba(255,255,255,0.055)] transition-all duration-200 focus-within:border-[rgba(59,130,246,0.55)] focus-within:shadow-[0_16px_34px_rgba(2,6,23,0.28),0_0_0_3px_rgba(59,130,246,0.16),inset_0_1px_0_rgba(255,255,255,0.055)] md:px-4">
        <div className="relative min-w-0">
          {mentionOptions.length > 0 && mentionState && (
            <div className="absolute bottom-[calc(100%+10px)] left-0 z-30 min-w-[260px] max-w-[360px] rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-2 shadow-[0_20px_44px_rgba(2,6,23,0.34)]">
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Упомянуть
              </div>
              {mentionOptions.map((user, index) => {
                const label = getUserMentionLabel(user);
                const subtitle = user.login && user.login !== label ? user.login : getMentionToken(user);

                return (
                  <button
                    key={user.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertMention(user);
                    }}
                    className={`flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-left transition-colors duration-150 ${
                      index === effectiveActiveMentionIndex
                        ? "bg-[rgba(59,130,246,0.14)] text-[var(--text-primary)]"
                        : "text-[var(--text-primary)] hover:bg-white/[0.055]"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(59,130,246,0.16)] text-xs font-bold text-[var(--accent-soft)]">
                      {label.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{label}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-[var(--text-secondary)]">{subtitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <textarea
            ref={textInputRef}
            value={input}
            onChange={(event) => {
              setMentionCursor(event.target.selectionStart ?? event.target.value.length);
              onInputChange(event.target.value);
            }}
            onClick={(event) => setMentionCursor(event.currentTarget.selectionStart ?? input.length)}
            onKeyUp={(event) => setMentionCursor(event.currentTarget.selectionStart ?? input.length)}
            onSelect={(event) => setMentionCursor(event.currentTarget.selectionStart ?? input.length)}
            onPaste={onPaste}
            onKeyDown={(event) => {
              if (mentionOptions.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveMentionIndex((index) => (index + 1) % mentionOptions.length);
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveMentionIndex((index) => (index - 1 + mentionOptions.length) % mentionOptions.length);
                  return;
                }

                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  insertMention(mentionOptions[effectiveActiveMentionIndex] || mentionOptions[0]);
                  return;
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  setMentionCursor(0);
                  return;
                }
              }

              onKeyDown(event);
            }}
            rows={1}
            placeholder={
              editingMessageId
                ? "Редактирование сообщения..."
                : `Сообщение в чат: ${currentChatTitle || currentUserName || "текущий чат"}`
            }
            className="min-h-[44px] w-full min-w-0 resize-none overflow-y-hidden bg-transparent px-1 py-2.5 text-[15px] leading-[1.55] text-[var(--text-primary)] outline-none transition-[height] duration-100 ease-out placeholder:text-[var(--text-muted)] md:text-[13px]"
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onChooseFiles}
              title="Файл"
              className="composer-icon-button flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-all duration-150 hover:bg-[rgba(59,130,246,0.12)] hover:text-white active:scale-95 md:h-9 md:w-9"
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
                className="composer-icon-button flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-all duration-150 hover:bg-[rgba(59,130,246,0.12)] hover:text-white active:scale-95 md:h-9 md:w-9"
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
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2">
            {(editingMessageId || replyingToMessage) && (
              <button
                type="button"
                onClick={onCancelEditing}
                className="h-9 shrink-0 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)] px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[rgba(255,255,255,0.07)] hover:text-white md:px-4"
              >
                Отмена
              </button>
            )}

            <button
              type="button"
              onClick={onSend}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[14px] bg-[linear-gradient(135deg,#3b82f6_0%,#1d4ed8_100%)] px-3.5 text-[12px] font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.36),inset_0_1px_0_rgba(255,255,255,0.18)] transition-all duration-150 hover:shadow-[0_10px_26px_rgba(37,99,235,0.48),inset_0_1px_0_rgba(255,255,255,0.18)] hover:brightness-110 active:scale-[0.96] active:shadow-[0_2px_8px_rgba(37,99,235,0.28)] md:px-4"
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
        </div>
      </div>

      <div className="mt-2 hidden items-center justify-between gap-3 px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)] md:flex">
        <span>{trimmedInput.startsWith("/") ? "Enter — выполнить команду" : "Enter — отправить"}</span>
        <span>Shift+Enter — новая строка</span>
      </div>
    </div>
  );
}
