"use client";

import { useEffect, useState } from "react";

const WINDOWS_INSTALLER_URL =
  "/desktop-updates/windows-x86_64/Svarka%20Weld%20Messenger_0.1.3_x64-setup.exe";

const hasTauriRuntime = () =>
  typeof window !== "undefined" &&
  typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";

const isStandaloneWebApp = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: window-controls-overlay)").matches
  );
};

export function DesktopRuntimeGuard() {
  const [shouldBlock, setShouldBlock] = useState(false);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setShouldBlock(!hasTauriRuntime() && isStandaloneWebApp());
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  if (!shouldBlock) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#020617]/82 px-4 backdrop-blur-md">
      <div className="w-full max-w-[460px] rounded-[24px] border border-[rgba(148,163,184,0.2)] bg-[var(--shell-bg)] p-6 shadow-[0_28px_60px_rgba(2,6,23,0.45)]">
        <div className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
          Открыт старый ярлык
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          Это Chrome-версия мессенджера. Для работы с файлами, уведомлениями и обновлениями откройте Windows-приложение
          Svarka Weld Messenger.
        </p>
        <div className="mt-5 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
          Если мессенджер открыли со старого ярлыка, удалите этот ярлык и установите приложение заново.
        </div>
        <div className="mt-6 flex justify-end">
          <a
            href={WINDOWS_INSTALLER_URL}
            className="flex h-11 items-center justify-center rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
          >
            Скачать Windows-приложение
          </a>
        </div>
      </div>
    </div>
  );
}
