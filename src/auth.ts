import crypto from 'node:crypto';

const ALGORITHM = 'OC-HMAC-SHA256-2';

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex').toLowerCase();
}

export function generateAuthorizationHeader(
  appId: string,
  appSecret: string,
  httpMethod: string,
  path: string,
  queryString = '',
  requestPayload = ''
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const scope = '';
  const signedHeaders = 'content-type';
  const canonicalHeaders = 'content-type:application/json\n';

  const hashedPayload = sha256Hex(requestPayload || '');

  const canonicalRequest = [
    httpMethod.toUpperCase(),
    path,
    queryString || '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n');

  const stringToSign = [
    ALGORITHM,
    timestamp.toString(),
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = crypto
    .createHmac('sha256', appSecret)
    .update(stringToSign)
    .digest('base64');

  return `${ALGORITHM} Credential=${appId}/${scope}, Timestamp=${timestamp}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}
