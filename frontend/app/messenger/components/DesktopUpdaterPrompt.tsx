"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type UpdateInfo = {
  version: string;
  notes?: string | null;
};

type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

type UpdateHandle = {
  downloadAndInstall: (onEvent?: (event: DownloadEvent) => void) => Promise<void>;
};

type UpdateDialogState =
  | { kind: "hidden" }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "downloading"; info: UpdateInfo; downloadedBytes: number; totalBytes?: number }
  | { kind: "installing"; info: UpdateInfo }
  | { kind: "restart-required"; info: UpdateInfo }
  | { kind: "error"; info?: UpdateInfo; message: string };

const hasTauriRuntime = () =>
  typeof window !== "undefined" &&
  typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
  }

  if (value >= 1024) {
    return `${Math.round(value / 1024)} КБ`;
  }

  return `${value} Б`;
};

export function DesktopUpdaterPrompt() {
  const [state, setState] = useState<UpdateDialogState>({ kind: "hidden" });
  const updateRef = useRef<UpdateHandle | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current || !hasTauriRuntime()) {
      return;
    }

    checkedRef.current = true;

    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();

        if (!update) {
          return;
        }

        updateRef.current = update as UpdateHandle;
        setState({
          kind: "available",
          info: {
            version: update.version,
            notes: update.body,
          },
        });
      } catch {
        updateRef.current = null;
      }
    })();
  }, []);

  const startUpdate = async () => {
    if (!updateRef.current || state.kind !== "available") {
      return;
    }

    const info = state.info;
    let downloadedBytes = 0;

    setState({
      kind: "downloading",
      info,
      downloadedBytes: 0,
    });

    try {
      await updateRef.current.downloadAndInstall((event) => {
        if (event.event === "Started") {
          downloadedBytes = 0;
          setState({
            kind: "downloading",
            info,
            downloadedBytes: 0,
            totalBytes: event.data.contentLength,
          });
          return;
        }

        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          setState((current) =>
            current.kind === "downloading"
              ? {
                  kind: "downloading",
                  info,
                  downloadedBytes,
                  totalBytes: current.totalBytes,
                }
              : current
          );
          return;
        }

        setState({
          kind: "installing",
          info,
        });
      });

      setState({
        kind: "restart-required",
        info,
      });
    } catch {
      setState({
        kind: "error",
        info,
        message: "Не удалось загрузить или установить обновление.",
      });
    }
  };

  const dismiss = () => {
    setState({ kind: "hidden" });
  };

  const progressText = useMemo(() => {
    if (state.kind !== "downloading") {
      return "";
    }

    const downloaded = formatBytes(state.downloadedBytes);
    const total = state.totalBytes ? formatBytes(state.totalBytes) : "";

    if (downloaded && total) {
      return `${downloaded} из ${total}`;
    }

    return downloaded;
  }, [state]);

  if (state.kind === "hidden") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/72 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-[24px] border border-[var(--border-soft)] bg-[var(--shell-bg)] p-6 shadow-[0_24px_48px_rgba(4,10,24,0.34)]">
        <div className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
          {state.kind === "available" && "Доступно обновление"}
          {state.kind === "downloading" && "Загрузка обновления"}
          {state.kind === "installing" && "Установка обновления"}
          {state.kind === "restart-required" && "Обновление установлено"}
          {state.kind === "error" && "Ошибка обновления"}
        </div>

        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          {(state.kind === "available" ||
            state.kind === "downloading" ||
            state.kind === "installing" ||
            state.kind === "restart-required") &&
            `Новая версия ${state.info.version} доступна для Windows desktop app.`}
          {state.kind === "downloading" && progressText ? ` ${progressText}.` : ""}
          {state.kind === "installing" && " Приложение может закрыться для завершения установки."}
          {state.kind === "restart-required" &&
            " Если приложение не перезапустилось автоматически, закройте его и откройте снова."}
          {state.kind === "error" && ` ${state.message}`}
        </p>

        {(state.kind === "available" || state.kind === "error") && state.info?.notes && (
          <div className="mt-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
            {state.info.notes}
          </div>
        )}

        {state.kind === "available" && (
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={dismiss}
              className="h-11 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 text-sm font-medium text-[var(--text-primary)]"
            >
              Позже
            </button>
            <button
              type="button"
              onClick={() => void startUpdate()}
              className="h-11 rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-white"
            >
              Обновить сейчас
            </button>
          </div>
        )}

        {(state.kind === "restart-required" || state.kind === "error") && (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={dismiss}
              className="h-11 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-muted)] px-4 text-sm font-medium text-[var(--text-primary)]"
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
