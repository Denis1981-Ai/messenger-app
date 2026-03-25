import { useMemo } from "react";

import { DEFAULT_USERS } from "../constants";
import { Chats, Message, MessageContextMenuState, User } from "../types";
import { getSafeMessageDate } from "../utils/format";

type Params = {
  users: User[];
  chats: Chats;
  currentChat: string;
  currentUserId: string;
  search: string;
  selectedMessageIds: string[];
  contextMenu: MessageContextMenuState | null;
  replyingToMessageId: string | null;
};

export const useMessageCollections = ({
  users,
  chats,
  currentChat,
  currentUserId,
  search,
  selectedMessageIds,
  contextMenu,
  replyingToMessageId,
}: Params) => {
  const safeUsers = Array.isArray(users) && users.length > 0 ? users : DEFAULT_USERS;
  const safeSearch = typeof search === "string" ? search : "";
  const currentUser = safeUsers.find((user) => user.id === currentUserId) || DEFAULT_USERS[0];

  const filteredChats = useMemo(
    () =>
      Object.keys(chats && typeof chats === "object" && !Array.isArray(chats) ? chats : {})
        .filter((chatName) => chatName.toLowerCase().includes(safeSearch.toLowerCase()))
        .sort((chatA, chatB) => {
          const safeChats = chats && typeof chats === "object" && !Array.isArray(chats) ? chats : {};
          const messagesA = Array.isArray(safeChats[chatA]) ? safeChats[chatA] : [];
          const messagesB = Array.isArray(safeChats[chatB]) ? safeChats[chatB] : [];
          const lastMessageA = messagesA[messagesA.length - 1] || null;
          const lastMessageB = messagesB[messagesB.length - 1] || null;

          const timeA = lastMessageA ? getSafeMessageDate(lastMessageA).getTime() : 0;
          const timeB = lastMessageB ? getSafeMessageDate(lastMessageB).getTime() : 0;

          return timeB - timeA;
        }),
    [chats, safeSearch]
  );

  const currentChatMessages = useMemo(() => {
    const safeChats = chats && typeof chats === "object" && !Array.isArray(chats) ? chats : {};
    const messages = safeChats[currentChat];
    return Array.isArray(messages) ? messages : [];
  }, [chats, currentChat]);

  const selectedMessages = useMemo(
    () => {
      const safeSelectedMessageIds = Array.isArray(selectedMessageIds) ? selectedMessageIds : [];
      return currentChatMessages.filter((message) => safeSelectedMessageIds.includes(message.id));
    },
    [currentChatMessages, selectedMessageIds]
  );

  const contextMenuMessage = useMemo(
    () =>
      contextMenu && typeof contextMenu.messageId === "string"
        ? currentChatMessages.find((message) => message.id === contextMenu.messageId) || null
        : null,
    [contextMenu, currentChatMessages]
  );

  const messagesById = useMemo(() => {
    const map: Record<string, Message> = {};

    currentChatMessages.forEach((message) => {
      map[message.id] = message;
    });

    return map;
  }, [currentChatMessages]);

  const replyingToMessage = replyingToMessageId ? messagesById[replyingToMessageId] || null : null;

  return {
    currentUser,
    filteredChats,
    currentChatMessages,
    selectedMessages,
    contextMenuMessage,
    messagesById,
    replyingToMessage,
  };
};
