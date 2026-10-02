"use client";

import { KeyboardEvent, useMemo, useState } from "react";

import { ChatHeader } from "./messenger/components/ChatHeader";
import { ChatFilesPanel } from "./messenger/components/ChatFilesPanel";
import { ContextMenu } from "./messenger/components/ContextMenu";
import { DesktopRuntimeGuard } from "./messenger/components/DesktopRuntimeGuard";
import { DesktopUpdaterPrompt } from "./messenger/components/DesktopUpdaterPrompt";
import { MessageComposer } from "./messenger/components/MessageComposer";
import { MessageList } from "./messenger/components/MessageList";
import { SelectionToolbar } from "./messenger/components/SelectionToolbar";
import { Sidebar } from "./messenger/components/Sidebar";
import { useMessengerController } from "./messenger/hooks/useMessengerController";
import { useTheme } from "./messenger/hooks/useTheme";
import { Message } from "./messenger/types";
import { formatMessageDate, formatMessageTime } from "./messenger/utils/format";

const composerCommands = ["/ответ", "/перевод", "/сократить"] as const;

const countMatches = (value: string, pattern: RegExp) => (value.match(pattern) || []).length;

const looksForeign = (value: string) => {
  const latin = countMatches(value, /[a-z]/gi);
  const cyrillic = countMatches(value, /[а-яё]/gi);

  if (!value.trim()) {
    return false;
  }

  if (latin >= 6 && cyrillic <= 2) {
    return true;
  }

  if (cyrillic >= 6 && latin <= 2) {
    return false;
  }

  return latin >= 4 && cyrillic >= 4;
};

export default function Home() {
  const messenger = useMessengerController();
  const { theme, toggleTheme } = useTheme();
  const [messageSearch, setMessageSearch] = useState("");
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [isFilesPanelOpen, setIsFilesPanelOpen] = useState(false);

  const getCommandSource = (sourceOverride?: string) => {
    const safeOverride = sourceOverride?.trim();

    if (safeOverride) {
      return safeOverride;
    }

    const safeInput = messenger.input.trim();

    if (safeInput && !safeInput.startsWith("/")) {
      return safeInput;
    }

    if (messenger.replyingToMessage?.text?.trim()) {
      return messenger.replyingToMessage.text.trim();
    }

    const lastIncoming = [...messenger.currentChatMessages]
      .reverse()
      .find(
        (message) =>
          message.authorId !== messenger.currentUserId &&
          typeof message.text === "string" &&
          message.text.trim().length > 0
      );

    return lastIncoming?.text?.trim() || "";
  };

  const runComposerCommand = (
    command: (typeof composerCommands)[number],
    sourceOverride?: string
  ) => {
    const source = getCommandSource(sourceOverride);
    const currentDraft = messenger.input.trim();
    let nextValue = currentDraft;

    if (command === "/ответ") {
      const lowerSource = source.toLowerCase();

      if (lowerSource.includes("когда") || lowerSource.includes("срок")) {
        nextValue = "Принял. Уточню сроки и вернусь с ответом сегодня.";
      } else if (
        lowerSource.includes("можешь") ||
        lowerSource.includes("сможешь") ||
        lowerSource.includes("нужно") ||
        lowerSource.includes("надо") ||
        lowerSource.includes("please")
      ) {
        nextValue = "Да, беру в работу. Как только будет обновление, сразу напишу.";
      } else if (lowerSource.includes("?")) {
        nextValue = "Принял вопрос. Сверю детали и вернусь с коротким ответом.";
      } else {
        nextValue = "Принял. Посмотрю и вернусь с ответом.";
      }
    }

    if (command === "/сократить") {
      const cleaned = (source || currentDraft)
        .replace(/\s+/g, " ")
        .replace(/\b(пожалуйста|как бы|в принципе|на самом деле)\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      if (cleaned.length <= 140) {
        nextValue = cleaned;
      } else {
        const sentences = cleaned
          .split(/(?<=[.!?])\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join(" ");

        nextValue =
          sentences && sentences.length <= 140
            ? sentences
            : `${cleaned.slice(0, 137).trim()}...`;
      }
    }

    if (command === "/перевод") {
      const base = (source || currentDraft).trim();
      const dictionary: Array<[RegExp, string]> = [
        [/\bпривет\b/gi, "hello"],
        [/\bспасибо\b/gi, "thanks"],
        [/\bпринял\b/gi, "got it"],
        [/\bдавайте обсудим\b/gi, "let's discuss"],
        [/\bсегодня\b/gi, "today"],
        [/\bзавтра\b/gi, "tomorrow"],
        [/\bсрок\b/gi, "deadline"],
        [/\bпозже\b/gi, "later"],
        [/\bготово\b/gi, "done"],
        [/\bответ\b/gi, "reply"],
        [/\bhello\b/gi, "привет"],
        [/\bthanks\b/gi, "спасибо"],
        [/\bgot it\b/gi, "принял"],
        [/\blet's discuss\b/gi, "давайте обсудим"],
        [/\btoday\b/gi, "сегодня"],
        [/\btomorrow\b/gi, "завтра"],
        [/\bdeadline\b/gi, "срок"],
        [/\blater\b/gi, "позже"],
        [/\bdone\b/gi, "готово"],
        [/\breply\b/gi, "ответ"],
      ];

      let translated = base;
      dictionary.forEach(([pattern, replacement]) => {
        translated = translated.replace(pattern, replacement);
      });

      nextValue =
        translated === base ? (/[а-яё]/i.test(base) ? `EN: ${base}` : `RU: ${base}`) : translated;
    }

    if (!nextValue.trim()) {
      return;
    }

    messenger.setInput(nextValue);
    messenger.setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      messenger.textInputRef.current?.focus();
      const length = nextValue.length;
      messenger.textInputRef.current?.setSelectionRange(length, length);
    });
  };

  const getMessageById = (messageId: string) =>
    messenger.currentChatMessages.find((message) => message.id === messageId) || null;

  const getMessageSource = (message: Message | null) => {
    if (!message) {
      return "";
    }

    const text = message.text?.trim();
    if (text) {
      return text;
    }

    const attachmentNames = (message.attachments || [])
      .map((attachment) => attachment.fileName)
      .filter(Boolean)
      .join(", ");

    return attachmentNames;
  };

  const applyMessageCommand = (
    messageId: string,
    command: (typeof composerCommands)[number]
  ) => {
    const source = getMessageSource(getMessageById(messageId));
    runComposerCommand(command, source);
  };

  const smartActions = useMemo(() => {
    const actions: Array<{
      command: (typeof composerCommands)[number];
      label: string;
      description: string;
    }> = [];
    const currentDraft = messenger.input.trim();
    const lastIncoming = [...messenger.currentChatMessages]
      .reverse()
      .find((message) => message.authorId !== messenger.currentUserId);

    if (messenger.replyingToMessage || (!currentDraft && lastIncoming?.text?.includes("?"))) {
      actions.push({
        command: "/ответ",
        label: "Сформулировать ответ",
        description: "Подготовить короткий рабочий ответ по контексту",
      });
    }

    if (currentDraft.length >= 80) {
      actions.push({
        command: "/сократить",
        label: "Сократить текст",
        description: "Убрать лишнее и оставить суть в одном клике",
      });
    }

    if (looksForeign(currentDraft)) {
      actions.push({
        command: "/перевод",
        label: "Перевести",
        description: "Привести текст к нужному языку без ручной команды",
      });
    }

    return actions.filter(
      (action, index, array) =>
        array.findIndex((candidate) => candidate.command === action.command) === index
    );
  }, [
    messenger.currentChatMessages,
    messenger.currentUserId,
    messenger.input,
    messenger.replyingToMessage,
  ]);

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const normalized = messenger.input.trim();

    if (event.key === "Tab" && normalized.startsWith("/")) {
      const matchedCommand = composerCommands.find((command) => command.startsWith(normalized));

      if (matchedCommand) {
        event.preventDefault();
        runComposerCommand(matchedCommand);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      const matchedCommand = composerCommands.find((command) => command === normalized);

      if (matchedCommand) {
        event.preventDefault();
        runComposerCommand(matchedCommand);
        return;
      }

      event.preventDefault();
      messenger.sendMessage();
    }
  };

  const currentChatSummary = useMemo(
    () => messenger.filteredChatSummaries.find((c) => c.id === messenger.currentChat) || null,
    [messenger.filteredChatSummaries, messenger.currentChat]
  );

  const currentChatMentionUsers = useMemo(
    () => (currentChatSummary?.members || []).filter((member) => member.id !== messenger.currentUserId),
    [currentChatSummary?.members, messenger.currentUserId]
  );

  const peerUser = useMemo(() => {
    const summary = currentChatSummary;
    if (!summary || summary.isGroup) return null;
    return summary.members.find((m) => m.id !== messenger.currentUserId) ?? null;
  }, [currentChatSummary, messenger.currentUserId]);

  const peerLastSeenAt = peerUser?.lastSeenAt ?? null;

  const messageSearchResults = useMemo(() => {
    const query = messageSearch.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return messenger.currentChatMessages
      .filter((message) => {
        const inText = message.text.toLowerCase().includes(query);
        const inFiles = (message.attachments || []).some(
          (attachment) =>
            attachment.fileName.toLowerCase().includes(query) ||
            attachment.fileType.toLowerCase().includes(query)
        );

        return inText || inFiles;
      })
      .slice(-12)
      .reverse()
      .map((message) => {
        const normalizedText = message.text.replace(/\s+/g, " ").trim();
        const previewText = normalizedText
          ? normalizedText
          : (message.attachments || [])
              .map((attachment) =>
                attachment.fileType.startsWith("image/")
                  ? `Изображение: ${attachment.fileName}`
                  : `Файл: ${attachment.fileName}`
              )
              .join(", ");

        return {
          id: message.id,
          title: previewText.length > 120 ? `${previewText.slice(0, 120)}...` : previewText,
          meta: `${formatMessageDate(message)} ${formatMessageTime(message)}`,
        };
      });
  }, [messageSearch, messenger.currentChatMessages]);

  if (!messenger.isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] text-sm text-[var(--text-primary)] [font-family:Inter,system-ui,sans-serif]">
        Загрузка...
      </div>
    );
  }

  if (!messenger.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 [font-family:Inter,system-ui,sans-serif]">
        <div className="w-full max-w-[420px] rounded-[24px] border border-[var(--border-soft)] bg-[var(--shell-bg)] p-7 shadow-[0_22px_48px_rgba(8,14,28,0.22)]">
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">Вход</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Войдите под своим аккаунтом для text pilot.</p>
          <div className="mt-6 space-y-4">
            <input
              value={messenger.loginName}
              onChange={(event) => messenger.setLoginName(event.target.value)}
              placeholder="Логин"
              className="h-12 w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[rgba(75,107,251,0.45)]"
            />
            <input
              type="password"
              value={messenger.loginPassword}
              onChange={(event) => messenger.setLoginPassword(event.target.value)}
              placeholder="Пароль"
              className="h-12 w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[rgba(75,107,251,0.45)]"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void messenger.login();
                }
              }}
            />
          </div>
          {messenger.authError && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {messenger.authError}
            </div>
          )}
          <button
            type="button"
            onClick={() => void messenger.login()}
            disabled={messenger.loginPending}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-semibold text-white transition-all duration-200 ease-out hover:bg-[var(--accent-strong)] disabled:cursor-default disabled:opacity-60"
          >
            {messenger.loginPending ? "Входим..." : "Войти"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <DesktopRuntimeGuard />
      <DesktopUpdaterPrompt />
      <div className="h-[100dvh] overflow-hidden bg-[var(--app-bg)] [font-family:Inter,system-ui,sans-serif] md:h-screen">
        <div className="flex h-full w-full min-w-0 items-stretch justify-center overflow-hidden p-0 md:p-3">
          <div className="messenger-shell flex h-full w-full max-w-[1480px] overflow-hidden rounded-none border border-[var(--border-soft)] bg-[var(--shell-bg)] md:rounded-[24px]">
            <Sidebar
              className={isMobileChatOpen ? "hidden md:block" : "block"}
              filteredChats={messenger.filteredChatSummaries}
              currentChat={messenger.currentChat}
              currentUserId={messenger.currentUserId}
              unreadByChat={messenger.unreadByChat}
              search={messenger.search}
              onSearchChange={messenger.setSearch}
              globalSearchResults={messenger.globalSearchResults}
              globalSearchPending={messenger.globalSearchPending}
              onOpenGlobalSearchResult={(result) => {
                messenger.openGlobalSearchResult(result);
                setIsMobileChatOpen(true);
              }}
              chatListFilter={messenger.chatListFilter}
              chatFilterCounts={messenger.chatFilterCounts}
              pinnedChatIds={messenger.pinnedChatIds}
              archivedChatIds={messenger.archivedChatIds}
              mutedChatIds={messenger.mutedChatIds}
              onChatListFilterChange={messenger.setChatListFilter}
              onOpenCreateConversation={messenger.openCreateConversation}
              theme={theme}
              onToggleTheme={toggleTheme}
              onSelectChat={(chatId) => {
                messenger.setCurrentChat(chatId);
                setIsMobileChatOpen(true);
                setIsFilesPanelOpen(false);
              }}
              onDeleteChat={messenger.deleteChat}
              onTogglePinnedChat={messenger.togglePinnedChat}
              onToggleArchivedChat={messenger.toggleArchivedChat}
              onToggleMutedChat={messenger.toggleMutedChat}
              onResetComposer={messenger.cancelEditing}
            />

            <div
              className={`chat-pattern-bg min-h-0 min-w-0 flex-1 flex-col ${
                isMobileChatOpen ? "flex" : "hidden md:flex"
              }`}
            >
              <ChatHeader
                currentChat={messenger.currentChatTitle || messenger.currentChat}
                currentUserId={messenger.currentUserId}
                peerUser={peerUser}
                users={messenger.users}
                copySuccess={messenger.copySuccess}
                isSelectionMode={messenger.isSelectionMode}
                messageSearch={messageSearch}
                messageSearchResults={messageSearchResults}
                onMessageSearchChange={setMessageSearch}
                onJumpToMessage={(messageId) => {
                  messenger.scrollToMessage(messageId);
                  setMessageSearch("");
                }}
                onBackToList={() => setIsMobileChatOpen(false)}
                onLogout={messenger.logout}
                onCopyChat={messenger.copyCurrentChat}
                onToggleSelectionMode={messenger.toggleSelectionMode}
                onRenameChat={messenger.renameCurrentChat}
                onDeleteChat={() => messenger.deleteChat(messenger.currentChat)}
                onToggleMutedChat={() => messenger.toggleMutedChat(messenger.currentChat)}
                onToggleFilesPanel={() => setIsFilesPanelOpen((value) => !value)}
                onOpenSettings={messenger.openDisplayNameSettings}
                isMuted={messenger.mutedChatIds.includes(messenger.currentChat)}
                pinnedMessage={messenger.pinnedMessage}
                onScrollToPinned={() => {
                  if (messenger.pinnedMessage) {
                    messenger.scrollToMessage(messenger.pinnedMessage.id);
                  }
                }}
              />

              {messenger.isSelectionMode && (
                <SelectionToolbar
                  selectedCount={messenger.selectedMessageIds.length}
                  onCopy={messenger.copySelectedMessages}
                  onForward={messenger.forwardSelectedMessages}
                  onDelete={messenger.deleteSelectedMessages}
                />
              )}

              <div
                onDragOver={messenger.handleChatDragOver}
                onDragLeave={messenger.handleChatDragLeave}
                onDrop={messenger.handleChatDrop}
                className="relative flex min-h-0 flex-1 flex-col"
              >
                {messenger.isChatDragOver && (
                  <div className="pointer-events-none absolute inset-6 z-[3] flex items-center justify-center rounded-[24px] border border-dashed border-[rgba(110,130,223,0.38)] bg-[rgba(30,38,53,0.74)] backdrop-blur-sm">
                    <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-5 py-3.5 text-sm font-medium text-[var(--text-primary)] shadow-[0_12px_24px_rgba(8,14,28,0.18)]">
                      Отпустите файл, чтобы добавить его в отправку
                    </div>
                  </div>
                )}

                <MessageList
                  key={`${messenger.currentUserId}:${messenger.currentChat}`}
                  currentChat={messenger.currentChatTitle || messenger.currentChat}
                  currentChatMessages={messenger.currentChatMessages}
                  currentUserId={messenger.currentUserId}
                  users={messenger.users}
                  selectedMessageIds={messenger.selectedMessageIds}
                  isSelectionMode={messenger.isSelectionMode}
                  highlightedMessageId={messenger.highlightedMessageId}
                  messageRefs={messenger.messageRefs}
                  getQuotePreview={messenger.getQuotePreview}
                  messagesById={messenger.messagesById}
                  onToggleMessageSelection={messenger.toggleMessageSelection}
                  onOpenContextMenu={messenger.openContextMenu}
                  onScrollToMessage={messenger.scrollToMessage}
                  onQuickReply={messenger.startReplyToMessage}
                  onQuickCopy={messenger.copySingleMessage}
                  onQuickShorten={(messageId) => applyMessageCommand(messageId, "/сократить")}
                  onQuickTranslate={(messageId) => applyMessageCommand(messageId, "/перевод")}
                  onOpenImage={(url, name) => setLightbox({ url, name })}
                  onToggleReaction={messenger.toggleReaction}
                  messagesEndRef={messenger.messagesEndRef}
                  hasMore={messenger.hasMoreByChat[messenger.currentChat] ?? false}
                  isLoadingMore={messenger.isLoadingMore}
                  onLoadMore={messenger.loadMoreMessages}
                  peerLastSeenAt={peerLastSeenAt}
                />

                <ChatFilesPanel
                  isOpen={isFilesPanelOpen}
                  messages={messenger.currentChatMessages}
                  users={messenger.users}
                  onClose={() => setIsFilesPanelOpen(false)}
                  onJumpToMessage={(messageId) => {
                    setIsFilesPanelOpen(false);
                    messenger.scrollToMessage(messageId);
                  }}
                />
              </div>

              {messenger.typingUsers.length > 0 && (
                <div className="shrink-0 px-4 pb-1 text-[12px] text-[var(--text-secondary)] md:px-6">
                  {messenger.typingUsers.join(", ")} {messenger.typingUsers.length === 1 ? "печатает" : "печатают"}...
                </div>
              )}

              <MessageComposer
                storageWarning={messenger.storageWarning}
                failedSendDrafts={messenger.currentFailedSendDrafts}
                replyingToMessage={messenger.replyingToMessage}
                editingMessageId={messenger.editingMessageId}
                pendingAttachments={messenger.pendingAttachments}
                uploadingAttachments={messenger.uploadingAttachments}
                showEmojiPicker={messenger.showEmojiPicker}
                currentUserName={messenger.currentUser?.name || "Я"}
                currentChatTitle={messenger.currentChatTitle || "текущий чат"}
                mentionUsers={currentChatMentionUsers}
                input={messenger.input}
                smartActions={smartActions}
                textInputRef={messenger.textInputRef}
                fileInputRef={messenger.fileInputRef}
                emojiPickerRef={messenger.emojiPickerRef}
                onCancelReply={messenger.cancelEditing}
                getQuotePreview={messenger.getQuotePreview}
                onRemovePendingAttachment={messenger.removePendingAttachment}
                onFileChange={messenger.handleFileChange}
                onChooseFiles={messenger.chooseFiles}
                onToggleEmojiPicker={() => messenger.setShowEmojiPicker(!messenger.showEmojiPicker)}
                onInsertEmoji={messenger.insertEmoji}
                onInputChange={messenger.handleInputChange}
                onPaste={messenger.handlePaste}
                onKeyDown={handleComposerKeyDown}
                onRunCommand={runComposerCommand}
                onCancelEditing={messenger.cancelEditing}
                onRetryFailedSend={messenger.retryFailedSend}
                onDiscardFailedSend={messenger.discardFailedSend}
                onSend={messenger.sendMessage}
                isFileDragOver={messenger.isChatDragOver}
                onFileDragOver={messenger.handleChatDragOver}
                onFileDragLeave={messenger.handleChatDragLeave}
                onFileDrop={messenger.handleChatDrop}
              />
            </div>
          </div>
        </div>
      </div>

      <ContextMenu
        contextMenu={messenger.contextMenu}
        contextMenuMessage={messenger.contextMenuMessage}
        currentUserId={messenger.currentUserId}
        canDeleteAnyMessages={messenger.canDeleteAnyMessages}
        contextMenuRef={messenger.contextMenuRef}
        onAction={messenger.handleContextMenuAction}
        onReaction={messenger.toggleContextMenuReaction}
      />

      {messenger.isCreateConversationOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#020617]/68 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[520px] rounded-[24px] border border-[var(--border-soft)] bg-[var(--shell-bg)] p-6 shadow-[0_24px_48px_rgba(4,10,24,0.34)]">
            <div className="text-[24px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{"\u041d\u043e\u0432\u0430\u044f \u0431\u0435\u0441\u0435\u0434\u0430"}</div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{"\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432. \u0415\u0441\u043b\u0438 \u0443\u043a\u0430\u0437\u0430\u043d\u043e \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043e \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u043b\u044e\u0434\u0435\u0439, \u0441\u043e\u0437\u0434\u0430\u0441\u0442\u0441\u044f \u043f\u0440\u0438\u0432\u0430\u0442\u043d\u0430\u044f \u0433\u0440\u0443\u043f\u043f\u043e\u0432\u0430\u044f \u0431\u0435\u0441\u0435\u0434\u0430."}</p>

            <div className="mt-5">
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">{"\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0431\u0435\u0441\u0435\u0434\u044b"}</label>
              <input
                value={messenger.createConversationTitle}
                onChange={(event) => messenger.setCreateConversationTitle(event.target.value)}
                maxLength={120}
                placeholder={"\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: \u041f\u043b\u0430\u043d\u0435\u0440\u043a\u0430 \u043e\u0442\u0434\u0435\u043b\u0430"}
                className="h-12 w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[rgba(75,107,251,0.45)]"
              />
            </div>

            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">{"\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0438"}</div>
              <div className="max-h-[240px] space-y-2 overflow-y-auto rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3">
                {messenger.createConversationCandidates.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-[var(--text-secondary)]">{"\u041d\u0435\u0442 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0445 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432."}</div>
                ) : (
                  messenger.createConversationCandidates.map((user) => {
                    const checked = messenger.createConversationMemberIds.includes(user.id);
                    const subtitle = user.displayName?.trim()
                      ? `${user.name} · ${user.login}`
                      : user.login || user.name;

                    return (
                      <label
                        key={user.id}
                        className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[rgba(148,163,184,0.08)] bg-[rgba(20,28,43,0.72)] px-3 py-3 text-left transition-all duration-200 hover:bg-[var(--content-bg)]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => messenger.toggleCreateConversationMember(user.id)}
                          className="h-4 w-4 rounded border-white/[0.2] bg-transparent text-[var(--accent)] focus:ring-[rgba(75,107,251,0.24)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{user.name}</span>
                          <span className="mt-1 block truncate text-xs text-[var(--text-secondary)]">{subtitle}</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {messenger.createConversationError && (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {messenger.createConversationError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={messenger.closeCreateConversation}
                className="h-11 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 text-sm font-medium text-[var(--text-primary)]"
              >
                {"\u041e\u0442\u043c\u0435\u043d\u0430"}
              </button>
              <button
                type="button"
                onClick={() => void messenger.createConversation()}
                disabled={messenger.createConversationPending}
                className="h-11 rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-60"
              >
                {messenger.createConversationPending ? "\u0421\u043e\u0437\u0434\u0430\u0451\u043c..." : "\u0421\u043e\u0437\u0434\u0430\u0442\u044c"}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Закрыть"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
          <a
            href={lightbox.url}
            download={lightbox.name}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-16 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label="Скачать"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
              <path d="M10 3v10M6 9l4 4 4-4M4 17h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[92vw] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.7)] md:max-w-[85vw]"
          />
        </div>
      )}

      {messenger.forwardingMessage && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#020617]/68 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[480px] rounded-[24px] border border-[var(--border-soft)] bg-[var(--shell-bg)] p-6 shadow-[0_24px_48px_rgba(4,10,24,0.34)]">
            <div className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">Переслать сообщение</div>
            <p className="mt-1.5 max-h-10 overflow-hidden text-sm leading-5 text-[var(--text-secondary)]">
              {messenger.forwardingMessageCount > 1
                ? `${messenger.forwardingMessageCount} сообщений`
                : messenger.forwardingPreviewText || "Сообщение"}
            </p>
            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Выберите чат</div>
              <div className="max-h-[280px] space-y-1.5 overflow-y-auto rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3">
                {messenger.chatSummaries.filter((c) => !c.isVirtual).length === 0 ? (
                  <div className="px-2 py-3 text-sm text-[var(--text-secondary)]">Нет доступных чатов.</div>
                ) : (
                  messenger.chatSummaries
                    .filter((c) => !c.isVirtual)
                    .map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => void messenger.executeForward(chat.id)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-[rgba(148,163,184,0.08)] bg-[rgba(20,28,43,0.72)] px-3 py-3 text-left transition-all duration-150 hover:bg-[var(--content-bg)]"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(93,121,238,0.15)] text-sm font-semibold text-[var(--accent-soft)]">
                          {chat.title.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{chat.title}</span>
                          {chat.lastMessage && (
                            <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">{chat.lastMessage.text || "Файл"}</span>
                          )}
                        </span>
                      </button>
                    ))
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={messenger.closeForwardMessage}
                className="h-11 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-5 text-sm font-medium text-[var(--text-primary)]"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {messenger.isDisplayNameSettingsOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#020617]/68 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[420px] rounded-[24px] border border-[var(--border-soft)] bg-[var(--shell-bg)] p-6 shadow-[0_24px_48px_rgba(4,10,24,0.34)]">
            <div className="text-[24px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">{"\u041e\u0442\u043e\u0431\u0440\u0430\u0436\u0430\u0435\u043c\u043e\u0435 \u0438\u043c\u044f"}</div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{"\u042d\u0442\u043e \u0438\u043c\u044f \u0431\u0443\u0434\u0435\u0442 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0442\u044c\u0441\u044f \u0432 \u0447\u0430\u0442\u0435. \u0415\u0441\u043b\u0438 \u043f\u043e\u043b\u0435 \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u043f\u0443\u0441\u0442\u044b\u043c, \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441 \u0432\u0435\u0440\u043d\u0451\u0442\u0441\u044f \u043a login."}</p>
            <div className="mt-5">
              <input
                value={messenger.displayNameDraft}
                onChange={(event) => messenger.setDisplayNameDraft(event.target.value)}
                maxLength={80}
                placeholder={"\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043c\u044f"}
                className="h-12 w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[rgba(75,107,251,0.45)]"
              />
              <div className="mt-2 text-xs text-[var(--text-muted)]">{"\u041e\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u043f\u0443\u0441\u0442\u044b\u043c, \u0447\u0442\u043e\u0431\u044b \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043b\u0441\u044f login."}</div>
            </div>
            {messenger.displayNameError && (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {messenger.displayNameError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={messenger.closeDisplayNameSettings}
                className="h-11 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 text-sm font-medium text-[var(--text-primary)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void messenger.saveDisplayName()}
                disabled={messenger.displayNameSavePending}
                className="h-11 rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-60"
              >
                {messenger.displayNameSavePending ? "\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c..." : "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
