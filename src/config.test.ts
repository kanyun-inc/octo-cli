import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configFile = vi.hoisted(() => ({
  contents: undefined as string | undefined,
}));

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: () => undefined,
    readFileSync: () => {
      if (configFile.contents === undefined) {
        throw new Error('ENOENT');
      }
      return configFile.contents;
    },
    writeFileSync: (_path: string, contents: string) => {
      configFile.contents = contents;
    },
  },
}));

import { getCredentials, saveToken } from './config.js';

const originalToken = process.env.OCTOPUS_TOKEN;

describe('PAT credentials', () => {
  beforeEach(() => {
    configFile.contents = undefined;
    delete process.env.OCTOPUS_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (originalToken === undefined) {
      delete process.env.OCTOPUS_TOKEN;
    } else {
      process.env.OCTOPUS_TOKEN = originalToken;
    }
  });

  it('prefers the environment PAT over the configured PAT', () => {
    configFile.contents = JSON.stringify({ token: 'config-token' });
    vi.stubEnv('OCTOPUS_TOKEN', 'env-token');

    expect(getCredentials()).toEqual({ token: 'env-token' });
  });

  it('uses the configured PAT when the environment PAT is absent', () => {
    configFile.contents = JSON.stringify({ token: 'config-token' });

    expect(getCredentials()).toEqual({ token: 'config-token' });
  });

  it('does not authenticate with legacy AppKey credentials only', () => {
    configFile.contents = JSON.stringify({
      app_id: 'legacy-app-id',
      app_secret: 'legacy-app-secret',
    });
    vi.stubEnv('OCTOPUS_APP_ID', 'legacy-env-app-id');
    vi.stubEnv('OCTOPUS_APP_SECRET', 'legacy-env-app-secret');
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(() => getCredentials()).toThrow('process.exit(1)');
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      'Error: Not configured. Run `octo login --token <TOKEN>` or set OCTOPUS_TOKEN.'
    );
  });

  it('saveToken removes legacy AppKey fields and preserves other settings', () => {
    configFile.contents = JSON.stringify({
      app_id: 'legacy-app-id',
      app_secret: 'legacy-app-secret',
      base_url: 'https://octopus.example.com',
      env: 'test',
    });

    saveToken('new-token');

    expect(JSON.parse(configFile.contents ?? '{}')).toEqual({
      token: 'new-token',
      base_url: 'https://octopus.example.com',
      env: 'test',
    });
  });
});
