import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CONFIG_DIR = path.join(os.homedir(), '.octo-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_BASE_URL = 'https://octopus-app.zhenguanyu.com';

interface Config {
  token?: string;
  base_url?: string;
  env?: string;
}

function readConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`);
}

export function getBaseUrl(): string {
  return (
    process.env.OCTOPUS_BASE_URL ?? readConfig().base_url ?? DEFAULT_BASE_URL
  );
}

export function getToken(): string | undefined {
  return process.env.OCTOPUS_TOKEN ?? readConfig().token;
}

export function getDefaultEnv(): string {
  return process.env.OCTOPUS_ENV ?? readConfig().env ?? 'online';
}

export function getExtraHeaders(): Record<string, string> {
  const raw = process.env.OCTOPUS_EXTRA_HEADERS;
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('OCTOPUS_EXTRA_HEADERS must be a valid JSON object');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OCTOPUS_EXTRA_HEADERS must be a JSON object');
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)])
  );
}

export function saveToken(token: string, baseUrl?: string, env?: string): void {
  const previous = readConfig();
  writeConfig({
    token,
    base_url: baseUrl || previous.base_url,
    env: env || previous.env,
  });
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getCredentials(): { token: string } {
  const token = getToken();
  if (token) {
    return { token };
  }
  console.error(
    'Error: Not configured. Run `octo login --token <TOKEN>` or set OCTOPUS_TOKEN.'
  );
  process.exit(1);
}
