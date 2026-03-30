import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CONFIG_DIR = path.join(os.homedir(), '.octo-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_BASE_URL = 'https://octopus-app.zhenguanyu.com';

interface Config {
  app_id?: string;
  app_secret?: string;
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

export function getAppId(): string | undefined {
  return process.env.OCTOPUS_APP_ID ?? readConfig().app_id;
}

export function getAppSecret(): string | undefined {
  return process.env.OCTOPUS_APP_SECRET ?? readConfig().app_secret;
}

export function getDefaultEnv(): string {
  return process.env.OCTOPUS_ENV ?? readConfig().env ?? 'online';
}

export function saveConfig(
  appId: string,
  appSecret: string,
  baseUrl?: string,
  env?: string
): void {
  const config = readConfig();
  config.app_id = appId;
  config.app_secret = appSecret;
  if (baseUrl) config.base_url = baseUrl;
  if (env) config.env = env;
  writeConfig(config);
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getCredentials(): { appId: string; appSecret: string } {
  const appId = getAppId();
  const appSecret = getAppSecret();
  if (!appId || !appSecret) {
    console.error(
      'Error: Not configured. Run `octo login` or set OCTOPUS_APP_ID and OCTOPUS_APP_SECRET.'
    );
    process.exit(1);
  }
  return { appId, appSecret };
}
