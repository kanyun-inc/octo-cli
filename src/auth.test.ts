import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateAuthorizationHeader } from './auth.js';

describe('generateAuthorizationHeader', () => {
  const appId = 'testAppId123';
  const appSecret = 'testSecret456';

  it('returns a valid V2 authorization header', () => {
    const header = generateAuthorizationHeader(
      appId,
      appSecret,
      'POST',
      '/infra-octopus-openapi/v1/logs/search',
      '',
      '{"env":"online"}'
    );

    expect(header).toMatch(/^OC-HMAC-SHA256-2 /);
    expect(header).toContain(`Credential=${appId}/`);
    expect(header).toContain('Timestamp=');
    expect(header).toContain('SignedHeaders=content-type');
    expect(header).toContain('Signature=');
  });

  it('produces different signatures for different payloads', () => {
    const h1 = generateAuthorizationHeader(
      appId,
      appSecret,
      'POST',
      '/api/test',
      '',
      '{"a":1}'
    );
    const h2 = generateAuthorizationHeader(
      appId,
      appSecret,
      'POST',
      '/api/test',
      '',
      '{"a":2}'
    );

    const sig1 = h1.match(/Signature=(.+)$/)?.[1];
    const sig2 = h2.match(/Signature=(.+)$/)?.[1];
    expect(sig1).not.toEqual(sig2);
  });

  it('produces different signatures for different methods', () => {
    const h1 = generateAuthorizationHeader(
      appId,
      appSecret,
      'GET',
      '/api/test'
    );
    const h2 = generateAuthorizationHeader(
      appId,
      appSecret,
      'POST',
      '/api/test'
    );

    const sig1 = h1.match(/Signature=(.+)$/)?.[1];
    const sig2 = h2.match(/Signature=(.+)$/)?.[1];
    expect(sig1).not.toEqual(sig2);
  });

  it('signature is valid base64', () => {
    const header = generateAuthorizationHeader(
      appId,
      appSecret,
      'GET',
      '/api/test'
    );
    const sig = header.match(/Signature=(.+)$/)?.[1];
    expect(sig).toBeDefined();
    const decoded = Buffer.from(sig!, 'base64');
    // HMAC-SHA256 produces 32 bytes
    expect(decoded.length).toBe(32);
  });

  it('handles empty query string and payload for GET', () => {
    const header = generateAuthorizationHeader(
      appId,
      appSecret,
      'GET',
      '/api/resource'
    );
    expect(header).toMatch(/^OC-HMAC-SHA256-2 /);
  });
});
