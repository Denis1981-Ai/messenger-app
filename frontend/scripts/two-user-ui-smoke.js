/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");

const parseArgs = (argv) => {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith("--")) {
      continue;
    }

    const key = value.slice(2);
    const nextValue = argv[index + 1];

    if (!nextValue || nextValue.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = nextValue;
    index += 1;
  }

  return args;
};

const requireArg = (args, key) => {
  const value = args[key]?.trim();

  if (!value) {
    throw new Error(`Missing required --${key}.`);
  }

  return value;
};

const waitForVisible = async (locator, timeout = 15000) => {
  await locator.waitFor({ state: "visible", timeout });
};

const isMessengerReady = async (page) =>
  page.evaluate(() => document.body?.innerText.includes("Рабочие диалоги") || false);

const login = async (page, baseUrl, loginName, password) => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  if (await isMessengerReady(page)) {
    return;
  }

  const loginInput = page.getByPlaceholder("Логин");
  await waitForVisible(loginInput, 15000);
  await loginInput.fill(loginName);
  await page.getByPlaceholder("Пароль").fill(password);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/login"), { timeout: 15000 }),
    page.getByRole("button", { name: "Войти" }).click(),
  ]);

  if (loginResponse.status() !== 200) {
    throw new Error(`Login failed for "${loginName}" with status ${loginResponse.status()}.`);
  }

  await page.waitForFunction(
    () => document.body?.innerText.includes("Рабочие диалоги"),
    undefined,
    { timeout: 20000 }
  );
};

const fetchFromPage = async (page, input, init) =>
  page.evaluate(
    async ({ input, init }) => {
      const response = await fetch(input, init);
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          body && typeof body === "object" && typeof body.error === "string"
            ? body.error
            : `Request failed with status ${response.status}`
        );
      }

      return body;
    },
    { input, init }
  );

const createDirectChat = async (page, peerLogin) => {
  const usersPayload = await fetchFromPage(page, "/api/users", { method: "GET" });
  const peer = usersPayload.users.find((user) => user.login === peerLogin);

  if (!peer) {
    throw new Error(`Peer user "${peerLogin}" was not returned by /api/users.`);
  }

  const chatPayload = await fetchFromPage(page, "/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberIds: [peer.id] }),
  });

  return { chat: chatPayload.chat, peer };
};

const selectChatByTitle = async (page, title) => {
  await page.getByPlaceholder("Поиск по чатам").fill(title);
  await page.getByText(title, { exact: true }).first().click();
  await waitForVisible(page.getByText(title, { exact: true }).first());
};

const getScrollSnapshot = async (page, text) =>
  page.evaluate((text) => {
    const container = document.querySelector(".chat-appear");
    const matchingText = Array.from(document.querySelectorAll(".message-text")).find((node) =>
      node.textContent?.includes(text)
    );

    if (!(container instanceof HTMLElement)) {
      return { ok: false, reason: "message container not found" };
    }

    const containerRect = container.getBoundingClientRect();
    const messageRect = matchingText instanceof HTMLElement ? matchingText.getBoundingClientRect() : null;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

    return {
      ok: true,
      distanceFromBottom,
      messageVisible:
        Boolean(messageRect) &&
        messageRect.top >= containerRect.top &&
        messageRect.bottom <= containerRect.bottom,
      hasNewMessagesButton: document.body.textContent?.includes("Новые сообщения:") || false,
    };
  }, text);

const scrollToBottom = async (page) => {
  await page.evaluate(() => {
    const container = document.querySelector(".chat-appear");

    if (container instanceof HTMLElement) {
      container.scrollTop = container.scrollHeight;
    }
  });
};

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = (args.url || "http://127.0.0.1:3000").replace(/\/$/, "");
  const loginA = requireArg(args, "login-a");
  const passwordA = requireArg(args, "password-a");
  const loginB = requireArg(args, "login-b");
  const passwordB = requireArg(args, "password-b");
  const headless = args.headed !== "true";
  const messageText = `two-user smoke ${new Date().toISOString()}`;

  const browser = await chromium.launch({ channel: "chrome", headless });
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await login(pageA, baseUrl, loginA, passwordA);
    await login(pageB, baseUrl, loginB, passwordB);

    const { chat } = await createDirectChat(pageA, loginB);

    await pageA.reload({ waitUntil: "domcontentloaded" });
    await pageB.reload({ waitUntil: "domcontentloaded" });
    await waitForVisible(pageA.getByPlaceholder("Поиск по чатам"));
    await waitForVisible(pageB.getByPlaceholder("Поиск по чатам"));

    await selectChatByTitle(pageA, chat.title);

    const chatsB = await fetchFromPage(pageB, "/api/chats", { method: "GET" });
    const chatForB = chatsB.chats.find((candidate) => candidate.id === chat.id);
    if (!chatForB) {
      throw new Error("Created direct chat was not returned for the second user.");
    }

    await selectChatByTitle(pageB, chatForB.title);

    await pageA.bringToFront();
    await scrollToBottom(pageA);

    await fetchFromPage(pageB, `/api/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: messageText }),
    });

    await pageA.getByText(messageText, { exact: true }).waitFor({ state: "visible", timeout: 20000 });
    await pageA.waitForTimeout(700);

    const snapshot = await getScrollSnapshot(pageA, messageText);
    if (!snapshot.ok) {
      throw new Error(snapshot.reason || "Could not inspect message list scroll state.");
    }

    if (!snapshot.messageVisible) {
      throw new Error("Incoming message arrived but is not visible in the active chat viewport.");
    }

    if (snapshot.distanceFromBottom > 96) {
      throw new Error(`Active chat did not stay near the bottom (${snapshot.distanceFromBottom}px).`);
    }

    if (snapshot.hasNewMessagesButton) {
      throw new Error("Unexpected new-message jump button appeared while user was already at the bottom.");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          chatId: chat.id,
          message: messageText,
          distanceFromBottom: snapshot.distanceFromBottom,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
