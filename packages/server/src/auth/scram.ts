import { createHmac, createHash, randomBytes } from 'crypto';
import type { Credential } from './credential.js';

export type ScramConv = {
  clientFirstBare: string;
  serverFirstMsg: string;
  clientNonce: string;
  fullNonce: string;
};

/** Parse SCRAM attribute string "n=val,r=val,..." into a map */
function parseAttributes(msg: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const part of msg.split(',')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      attrs.set(part.slice(0, eq), part.slice(eq + 1));
    }
  }
  return attrs;
}

/**
 * Process client-first message from saslStart.
 * Returns [scramConv, serverFirstMessage] or throws on error.
 */
export function clientFirst(
  payload: string,
  credential: Credential,
): [ScramConv, string] {
  // payload: "n,,n=username,r=clientNonce"
  // Strip GS2 header "n,,"
  const gs2End = payload.indexOf(',,');
  if (gs2End < 0) throw new Error('Invalid client-first: missing GS2 header');

  const clientFirstBare = payload.slice(gs2End + 2);
  const attrs = parseAttributes(clientFirstBare);

  const username = attrs.get('n');
  const clientNonce = attrs.get('r');

  if (!username || !clientNonce) {
    throw new Error('Invalid client-first: missing username or nonce');
  }

  if (username !== credential.username) {
    throw new Error(`Unknown user: ${username}`);
  }

  const serverNonce = randomBytes(24).toString('base64');
  const fullNonce = clientNonce + serverNonce;

  const serverFirstMsg =
    `r=${fullNonce},s=${credential.salt.toString('base64')},i=${credential.iterations}`;

  const conv: ScramConv = {
    clientFirstBare,
    serverFirstMsg,
    clientNonce,
    fullNonce,
  };

  return [conv, serverFirstMsg];
}

/**
 * Process client-final message from saslContinue.
 * Returns serverFinalMessage or throws on auth failure.
 */
export function clientFinal(
  payload: string,
  conv: ScramConv,
  credential: Credential,
): string {
  // payload: "c=biws,r=fullNonce,p=base64proof"
  const attrs = parseAttributes(payload);

  const channelBinding = attrs.get('c');
  const nonce = attrs.get('r');
  const proofB64 = attrs.get('p');

  if (!channelBinding || !nonce || !proofB64) {
    throw new Error('Invalid client-final: missing required attributes');
  }

  if (channelBinding !== 'biws') {
    throw new Error('Unsupported channel binding');
  }

  if (nonce !== conv.fullNonce) {
    throw new Error('Nonce mismatch');
  }

  // clientFinalWithoutProof = everything before ",p="
  const pIdx = payload.lastIndexOf(',p=');
  const clientFinalWithoutProof = payload.slice(0, pIdx);

  const authMessage =
    conv.clientFirstBare + ',' + conv.serverFirstMsg + ',' + clientFinalWithoutProof;

  // Verify client proof
  const clientSignature = createHmac('sha256', credential.storedKey)
    .update(authMessage).digest();
  const clientProof = Buffer.from(proofB64, 'base64');
  const recoveredClientKey = xorBuffers(clientProof, clientSignature);
  const recoveredStoredKey = createHash('sha256').update(recoveredClientKey).digest();

  if (!recoveredStoredKey.equals(credential.storedKey)) {
    throw new Error('Authentication failed');
  }

  // Compute server signature
  const serverSignature = createHmac('sha256', credential.serverKey)
    .update(authMessage).digest();

  return `v=${serverSignature.toString('base64')}`;
}

function xorBuffers(a: Buffer, b: Buffer): Buffer {
  const result = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i]! ^ b[i]!;
  }
  return result;
}
