/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
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

const commandExists = (command) => {
  const probe = spawnSync(command, ['--version'], { stdio: 'ignore', shell: false });
  return !probe.error;
};

const resolveDockerContainer = () => {
  const candidates = [
    process.env.POSTGRES_CONTAINER_NAME,
    'messenger-pilot-postgres',
    'messenger-stage1-postgres',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const inspect = spawnSync('docker', ['inspect', candidate], { stdio: 'ignore', shell: false });
    if (!inspect.error && inspect.status === 0) {
      return candidate;
    }
  }

  return process.env.POSTGRES_CONTAINER_NAME || 'messenger-pilot-postgres';
};

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const inputPath = args.input ? path.resolve(args.input) : '';
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Restore input file not found. Use --input <path-to-backup>.');
  process.exit(1);
}

const parsedUrl = new URL(databaseUrl);
const databaseName = parsedUrl.pathname.replace(/^\//, '');
const databaseUser = decodeURIComponent(parsedUrl.username || 'postgres');
const databasePassword = decodeURIComponent(parsedUrl.password || '');
const dockerContainer = resolveDockerContainer();

let result;
if (commandExists('pg_restore')) {
  result = spawnSync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', databaseUrl, inputPath], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
} else {
  const inputBuffer = fs.readFileSync(inputPath);
  result = spawnSync('docker', ['exec', '-i', '-e', `PGPASSWORD=${databasePassword}`, dockerContainer, 'pg_restore', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--username', databaseUser, '--dbname', databaseName], {
    input: inputBuffer,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: process.env,
    shell: false,
  });
}

if (result.error) {
  console.error('Restore command failed to start. Ensure pg_restore is in PATH or Docker container access is available.');
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log(`Restore completed from: ${inputPath}`);
