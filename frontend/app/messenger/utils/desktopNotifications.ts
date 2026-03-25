"use client";

export type DesktopNotificationPayload = {
  title: string;
  body?: string;
  chatId?: string;
};

export type DesktopNotificationAction = {
  chatId?: string;
};

type DesktopNotificationsBridge = {
  send: (payload: DesktopNotificationPayload) => Promise<void>;
  clearAll: () => Promise<void>;
  focusApp: () => Promise<void>;
  setUnreadOverlay: (count: number) => Promise<void>;
  getWindowState: () => Promise<{ focused: boolean; minimized: boolean }>;
  onAction: (handler: (payload: DesktopNotificationAction) => void | Promise<void>) => Promise<() => Promise<void>>;
};

type DesktopNotificationsDebugEntry = {
  at: string;
  event: string;
  details?: Record<string, string | number | boolean | null>;
};

type DesktopNotificationsDebugApi = {
  entries: DesktopNotificationsDebugEntry[];
  test: () => Promise<void>;
  testOverlay: (count?: number) => Promise<void>;
  clearOverlay: () => Promise<void>;
};

let desktopNotificationsBridgePromise: Promise<DesktopNotificationsBridge | null> | null = null;
const DESKTOP_NOTIFICATIONS_DEBUG_KEY = "messenger:debug-desktop-notifications";
const OVERLAY_ICON_SIZE = 64;

function getOverlayLabel(count: number) {
  if (!Number.isFinite(count) || count <= 0) {
    return "";
  }

  if (count <= 9) {
    return String(count);
  }

  return "9+";
}

function recordDesktopNotificationEvent(
  event: string,
  details?: Record<string, string | number | boolean | null>
) {
  if (typeof window === "undefined") {
    return;
  }

  const target = window as typeof window & {
    __messengerDesktopNotificationsDebug?: DesktopNotificationsDebugApi;
  };

  const entry: DesktopNotificationsDebugEntry = {
    at: new Date().toISOString(),
    event,
    details,
  };

  const currentEntries = target.__messengerDesktopNotificationsDebug?.entries || [];
  const nextEntries = [...currentEntries, entry].slice(-100);

  target.__messengerDesktopNotificationsDebug = {
    entries: nextEntries,
    test: async () => {
      const bridge = await getDesktopNotificationsBridge();
      if (!bridge) {
        recordDesktopNotificationEvent("test-notification-skip", {
          reason: "bridge-unavailable",
        });
        return;
      }

      await bridge.send({
        title: "Svarka Weld Messenger",
        body: "Тестовое desktop уведомление",
      });
    },
    testOverlay: async (count = 3) => {
      const bridge = await getDesktopNotificationsBridge();
      if (!bridge) {
        recordDesktopNotificationEvent("test-overlay-skip", {
          reason: "bridge-unavailable",
        });
        return;
      }

      await bridge.setUnreadOverlay(count);
    },
    clearOverlay: async () => {
      const bridge = await getDesktopNotificationsBridge();
      if (!bridge) {
        recordDesktopNotificationEvent("test-overlay-clear-skip", {
          reason: "bridge-unavailable",
        });
        return;
      }

      await bridge.setUnreadOverlay(0);
    },
  };

  try {
    if (window.localStorage.getItem(DESKTOP_NOTIFICATIONS_DEBUG_KEY) === "1") {
      console.info("[desktop-notifications]", entry);
    }
  } catch {
    // Keep debug logging best-effort only.
  }
}

async function createUnreadOverlayIcon(count: number) {
  if (typeof window === "undefined") {
    return null;
  }

  const label = getOverlayLabel(count);
  if (!label) {
    return null;
  }

  const canvas = window.document.createElement("canvas");
  canvas.width = OVERLAY_ICON_SIZE;
  canvas.height = OVERLAY_ICON_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    recordDesktopNotificationEvent("overlay-skip", {
      reason: "context-unavailable",
      count,
    });
    return null;
  }

  context.clearRect(0, 0, OVERLAY_ICON_SIZE, OVERLAY_ICON_SIZE);
  context.beginPath();
  context.arc(OVERLAY_ICON_SIZE / 2, OVERLAY_ICON_SIZE / 2, 28, 0, Math.PI * 2);
  context.fillStyle = "#d92d20";
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = "#ffffff";
  context.stroke();

  context.fillStyle = "#ffffff";
  context.font = label.length > 1 ? "bold 26px Segoe UI, Arial, sans-serif" : "bold 34px Segoe UI, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, OVERLAY_ICON_SIZE / 2, OVERLAY_ICON_SIZE / 2 + 1);

  const imageData = context.getImageData(0, 0, OVERLAY_ICON_SIZE, OVERLAY_ICON_SIZE);
  const imageModule = await import("@tauri-apps/api/image");
  return imageModule.Image.new(Uint8Array.from(imageData.data), OVERLAY_ICON_SIZE, OVERLAY_ICON_SIZE);
}

export async function getDesktopNotificationsBridge(): Promise<DesktopNotificationsBridge | null> {
  if (desktopNotificationsBridgePromise) {
    return desktopNotificationsBridgePromise;
  }

  desktopNotificationsBridgePromise = (async () => {
    const coreModule = await import("@tauri-apps/api/core");

    if (!coreModule.isTauri()) {
      recordDesktopNotificationEvent("bridge-unavailable", {
        reason: "not-tauri",
      });
      return null;
    }

    const [notificationModule, windowModule] = await Promise.all([
      import("@tauri-apps/plugin-notification"),
      import("@tauri-apps/api/window"),
    ]);
    const appWindow = windowModule.getCurrentWindow();

    let permissionGranted = await notificationModule.isPermissionGranted().catch(() => false);
    recordDesktopNotificationEvent("permission-check", {
      granted: permissionGranted,
    });

    if (!permissionGranted) {
      const permissionState = await notificationModule.requestPermission().catch(() => "denied");
      permissionGranted = permissionState === "granted";
      recordDesktopNotificationEvent("permission-request", {
        result: permissionState,
      });
    }

    const focusApp = async () => {
      const isMinimized = await appWindow.isMinimized().catch(() => false);
      recordDesktopNotificationEvent("focus-app", {
        minimized: isMinimized,
      });

      if (isMinimized) {
        await appWindow.unminimize().catch(() => {});
      }

      await appWindow.show().catch(() => {});
      await appWindow.setFocus().catch(() => {});
      await appWindow.requestUserAttention(windowModule.UserAttentionType.Informational).catch(() => {});
    };

    const setUnreadOverlay = async (count: number) => {
      const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

      if (normalizedCount <= 0) {
        await appWindow.setOverlayIcon(undefined).catch(() => {});
        recordDesktopNotificationEvent("overlay-cleared");
        return;
      }

      const overlayIcon = await createUnreadOverlayIcon(normalizedCount);
      if (!overlayIcon) {
        recordDesktopNotificationEvent("overlay-skip", {
          reason: "icon-unavailable",
          count: normalizedCount,
        });
        return;
      }

      await appWindow.setOverlayIcon(overlayIcon).catch(() => {});
      recordDesktopNotificationEvent("overlay-set", {
        count: normalizedCount,
        label: getOverlayLabel(normalizedCount),
      });
    };

    const getWindowState = async () => {
      const [focused, minimized] = await Promise.all([
        appWindow.isFocused().catch(() => false),
        appWindow.isMinimized().catch(() => false),
      ]);

      recordDesktopNotificationEvent("window-state", {
        focused,
        minimized,
      });

      return {
        focused,
        minimized,
      };
    };

    return {
      send: async (payload) => {
        if (!permissionGranted) {
          recordDesktopNotificationEvent("notification-skip", {
            reason: "permission-denied",
          });
          return;
        }

        recordDesktopNotificationEvent("notification-send-attempt", {
          hasBody: Boolean(payload.body),
          hasChatId: Boolean(payload.chatId),
        });
        notificationModule.sendNotification({
          title: payload.title,
          body: payload.body,
          autoCancel: true,
          extra: payload.chatId ? { chatId: payload.chatId } : {},
        });
        recordDesktopNotificationEvent("notification-send-dispatched", {
          hasBody: Boolean(payload.body),
          hasChatId: Boolean(payload.chatId),
        });
      },
      clearAll: async () => {
        await notificationModule.removeAllActive().catch(() => {});
        recordDesktopNotificationEvent("notification-clear-all");
      },
      focusApp,
      setUnreadOverlay,
      getWindowState,
      onAction: async (handler) => {
        recordDesktopNotificationEvent("notification-action-listener-register");
        const listener = await notificationModule.onAction((notification) => {
          const extra =
            notification.extra && typeof notification.extra === "object"
              ? (notification.extra as Record<string, unknown>)
              : {};
          const chatId = typeof extra.chatId === "string" ? extra.chatId : undefined;
          recordDesktopNotificationEvent("notification-action", {
            hasChatId: Boolean(chatId),
          });
          void handler({ chatId });
        });

        return async () => {
          await listener.unregister().catch(() => {});
          recordDesktopNotificationEvent("notification-action-listener-unregister");
        };
      },
    };
  })();

  return desktopNotificationsBridgePromise;
}
