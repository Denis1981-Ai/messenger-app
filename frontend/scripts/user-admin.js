/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, scryptSync } = require('node:crypto');

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

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

const printUsage = () => {
  console.log('Usage:');
  console.log('  node scripts/user-admin.js list');
  console.log('  node scripts/user-admin.js create --login <login> --name <name> --password <password>');
  console.log('  node scripts/user-admin.js reset-password --login <login> --password <new-password>');
  console.log('  node scripts/user-admin.js disable --login <login>');
};

const requireValue = (value, message) => {
  if (!value || !String(value).trim()) {
    throw new Error(message);
  }

  return String(value).trim();
};

const normalizeLogin = (value) => requireValue(value, 'Login is required.').toLowerCase();

const listUsers = async () => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      login: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          sessions: true,
        },
      },
    },
  });

  console.table(
    users.map((user) => ({
      id: user.id,
      login: user.login,
      name: user.name,
      status: user.isActive ? 'active' : 'disabled',
      sessions: user._count.sessions,
      createdAt: user.createdAt.toISOString(),
    })),
  );
};

const createUser = async (args) => {
  const login = normalizeLogin(args.login);
  const name = requireValue(args.name, 'Name is required.');
  const password = requireValue(args.password, 'Password is required.');

  const existingUser = await prisma.user.findUnique({ where: { login } });

  if (existingUser) {
    throw new Error(`User with login "${login}" already exists.`);
  }

  const user = await prisma.user.create({
    data: {
      login,
      name,
      passwordHash: hashPassword(password),
      isActive: true,
    },
    select: {
      id: true,
      login: true,
      name: true,
      isActive: true,
    },
  });

  console.log(`Created user ${user.login} (${user.name}).`);
};

const resetPassword = async (args) => {
  const login = normalizeLogin(args.login);
  const password = requireValue(args.password, 'New password is required.');

  const user = await prisma.user.findUnique({ where: { login }, select: { id: true, login: true } });

  if (!user) {
    throw new Error(`User with login "${login}" not found.`);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(password) },
    }),
    prisma.session.deleteMany({
      where: { userId: user.id },
    }),
  ]);

  console.log(`Password reset for ${user.login}. Existing sessions revoked.`);
};

const disableUser = async (args) => {
  const login = normalizeLogin(args.login);

  const user = await prisma.user.findUnique({ where: { login }, select: { id: true, login: true, isActive: true } });

  if (!user) {
    throw new Error(`User with login "${login}" not found.`);
  }

  if (!user.isActive) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    console.log(`User ${user.login} is already disabled. Sessions revoked.`);
    return;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    }),
    prisma.session.deleteMany({
      where: { userId: user.id },
    }),
  ]);

  console.log(`Disabled user ${user.login}. Existing sessions revoked.`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  switch (command) {
    case 'list':
      await listUsers();
      break;
    case 'create':
      await createUser(args);
      break;
    case 'reset-password':
      await resetPassword(args);
      break;
    case 'disable':
      await disableUser(args);
      break;
    default:
      printUsage();
      process.exitCode = 1;
  }
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
