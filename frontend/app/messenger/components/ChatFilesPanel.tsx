import { Attachment, Message, User } from "../types";
import { openAttachment, triggerAttachmentDownload } from "../utils/attachmentDownload";
import { formatFileSize, formatMessageDate, formatMessageTime } from "../utils/format";

type ChatFileItem = {
  attachment: Attachment;
  message: Message;
  authorName: string;
};

type Props = {
  isOpen: boolean;
  messages: Message[];
  users: User[];
  onClose: () => void;
  onJumpToMessage: (messageId: string) => void;
};

const getFileKind = (attachment: Attachment) => {
  if (attachment.fileType.startsWith("image/")) return "Изображение";
  if (attachment.fileType.includes("pdf")) return "PDF";
  if (attachment.fileType.includes("spreadsheet") || /\.(xlsx?|csv)$/i.test(attachment.fileName)) return "Таблица";
  if (attachment.fileType.includes("word") || /\.(docx?|rtf)$/i.test(attachment.fileName)) return "Документ";
  return "Файл";
};

const getExtension = (fileName: string) => fileName.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE";

export function ChatFilesPanel({ isOpen, messages, users, onClose, onJumpToMessage }: Props) {
  if (!isOpen) {
    return null;
  }

  const userNamesById = new Map(users.map((user) => [user.id, user.name]));
  const files: ChatFileItem[] = messages
    .flatMap((message) =>
      (message.attachments || []).map((attachment) => ({
        attachment,
        message,
        authorName: userNamesById.get(message.authorId) || message.authorId,
      }))
    )
    .reverse();

  const imageCount = files.filter(({ attachment }) => attachment.fileType.startsWith("image/")).length;
  const documentCount = files.length - imageCount;

  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[420px] flex-col border-l border-[var(--border-soft)] bg-[var(--shell-bg)] shadow-[-24px_0_50px_rgba(2,6,23,0.32)] backdrop-blur-xl md:w-[390px]">
      <div className="border-b border-[var(--border-soft)] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[18px] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">
              Файлы и документы
            </div>
            <div className="mt-1 text-[12px] text-[var(--text-secondary)]">
              {files.length > 0
                ? `${files.length} вложений · ${documentCount} документов · ${imageCount} изображений`
                : "В этом чате пока нет вложений"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]"
            aria-label="Закрыть файлы чата"
            title="Закрыть"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center">
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--accent-soft)]">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
                <path
                  d="M5.5 17H14.5C15.3284 17 16 16.3284 16 15.5V7.75L11.25 3H5.5C4.67157 3 4 3.67157 4 4.5V15.5C4 16.3284 4.67157 17 5.5 17Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path d="M11 3.25V7.5H15.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="mt-4 text-sm font-semibold text-[var(--text-primary)]">Файлов пока нет</div>
            <div className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
              Все документы, счета и изображения из переписки будут собраны здесь.
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-2">
            {files.map(({ attachment, message, authorName }) => {
              const sizeLabel = formatFileSize(attachment.fileSize);
              const meta = `${authorName} · ${formatMessageDate(message)} ${formatMessageTime(message)}`;

              return (
                <div
                  key={`${message.id}:${attachment.id}`}
                  className="group rounded-[18px] border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3 transition-all duration-150 hover:border-[rgba(59,130,246,0.32)] hover:bg-[var(--surface-soft)]"
                >
                  <button
                    type="button"
                    onClick={() => onJumpToMessage(message.id)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-[rgba(59,130,246,0.2)] bg-[rgba(59,130,246,0.12)] text-[10px] font-bold text-[var(--accent-soft)]">
                      {getExtension(attachment.fileName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold leading-5 text-[var(--text-primary)]">
                        {attachment.fileName}
                      </span>
                      <span className="mt-1 block text-[12px] leading-5 text-[var(--text-secondary)]">
                        {getFileKind(attachment)}
                        {sizeLabel ? ` · ${sizeLabel}` : ""}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-[var(--text-muted)]">{meta}</span>
                    </span>
                  </button>

                  <div className="mt-3 flex flex-wrap gap-2 pl-14">
                    <button
                      type="button"
                      onClick={() => void openAttachment(attachment.fileData, attachment.fileName)}
                      className="rounded-full border border-[var(--border-soft)] bg-[rgba(255,255,255,0.045)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors duration-150 hover:border-[rgba(59,130,246,0.32)] hover:text-[var(--text-primary)]"
                    >
                      Открыть
                    </button>
                    <button
                      type="button"
                      onClick={() => void triggerAttachmentDownload(attachment.fileData, attachment.fileName)}
                      className="rounded-full border border-[var(--border-soft)] bg-[rgba(255,255,255,0.045)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors duration-150 hover:border-[rgba(59,130,246,0.32)] hover:text-[var(--text-primary)]"
                    >
                      Скачать
                    </button>
                    <button
                      type="button"
                      onClick={() => onJumpToMessage(message.id)}
                      className="rounded-full border border-[rgba(59,130,246,0.24)] bg-[rgba(59,130,246,0.1)] px-3 py-1.5 text-[11px] font-semibold text-[var(--accent-soft)] transition-colors duration-150 hover:bg-[rgba(59,130,246,0.16)]"
                    >
                      К сообщению
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
