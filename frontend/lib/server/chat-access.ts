import { prisma } from "@/lib/prisma";
import { resolveUserDisplayName, toClientUser } from "@/lib/server/user-display";

export type ChatWithMembers = {
  id: string;
  title: string | null;
  chatType: "DIRECT" | "GROUP";
  members: Array<{
    userId: string;
    user: {
      id: string;
      name: string;
      login: string;
      displayName?: string | null;
      lastSeenAt?: Date | null;
    };
  }>;
};

export const getChatForMember = async (chatId: string, userId: string) => {
  const chat = await prisma.chat.findUnique({
    where: {
      id: chatId,
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              login: true,
              displayName: true,
              lastSeenAt: true,
            },
          },
        },
      },
    },
  });

  if (!chat) {
    return {
      chat: null,
      isMember: false,
    };
  }

  return {
    chat,
    isMember: chat.members.some((member: ChatWithMembers["members"][number]) => member.userId === userId),
  };
};

export const resolveChatTitle = (
  chat: Pick<ChatWithMembers, "title" | "chatType" | "members">,
  currentUserId: string
) => {
  if (chat.title?.trim()) {
    return chat.title.trim();
  }

  if (chat.chatType === "DIRECT") {
    const otherUser = chat.members.find(
      (member: ChatWithMembers["members"][number]) => member.user.id !== currentUserId
    )?.user;

    return otherUser ? resolveUserDisplayName(otherUser) : "Direct chat";
  }

  return "????? ???";
};

export const toClientChatMember = (member: ChatWithMembers["members"][number]) => toClientUser(member.user);
