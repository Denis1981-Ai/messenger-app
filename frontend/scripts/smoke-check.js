/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

const parseArgs = (argv) => {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      args._.push(value);
      continue;
    }
    const key = value.slice(2);
    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = nextValue;
    index += 1;
  }
  return args;
};

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args.url || 'http://127.0.0.1:3000';
  const loginName = args.login || 'denis';
  const password = args.password || 'password123';

  const health = await fetch(`${baseUrl}/api/health`);
  if (health.status !== 200) {
    throw new Error(`Health check failed with status ${health.status}.`);
  }

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: loginName, password }),
  });
  if (login.status !== 200) {
    throw new Error(`Login failed with status ${login.status}.`);
  }

  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const authHeaders = cookie ? { cookie } : {};

  const chatsResponse = await fetch(`${baseUrl}/api/chats`, { headers: authHeaders });
  if (chatsResponse.status !== 200) {
    throw new Error(`Chats request failed with status ${chatsResponse.status}.`);
  }

  const chatsPayload = await chatsResponse.json();
  const chatId = chatsPayload?.chats?.[0]?.id;
  if (!chatId) {
    throw new Error('Smoke check requires at least one chat.');
  }

  const textResponse = await fetch(`${baseUrl}/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'smoke check message' }),
  });
  if (textResponse.status !== 201) {
    throw new Error(`Text message failed with status ${textResponse.status}.`);
  }

  const tempDir = path.join(process.cwd(), '.codex-artifacts', 'qa', 'stage5-smoke');
  fs.mkdirSync(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, 'smoke-file.txt');
  fs.writeFileSync(tempFile, 'stage5 smoke file');

  const form = new FormData();
  form.append('files', new Blob([fs.readFileSync(tempFile)], { type: 'text/plain' }), 'smoke-file.txt');
  const uploadResponse = await fetch(`${baseUrl}/api/chats/${chatId}/attachments`, {
    method: 'POST',
    headers: authHeaders,
    body: form,
  });
  if (uploadResponse.status !== 201) {
    throw new Error(`File upload failed with status ${uploadResponse.status}.`);
  }

  const uploadPayload = await uploadResponse.json();
  const attachmentId = uploadPayload?.message?.attachments?.[0]?.id;
  if (!attachmentId) {
    throw new Error('Upload response did not include an attachment id.');
  }

  const downloadResponse = await fetch(`${baseUrl}/api/attachments/${attachmentId}/download`, {
    headers: authHeaders,
  });
  if (downloadResponse.status !== 200) {
    throw new Error(`File download failed with status ${downloadResponse.status}.`);
  }

  console.log(`Smoke check passed for ${baseUrl}.`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
