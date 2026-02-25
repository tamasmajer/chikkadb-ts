import type { OpMsgPayload } from "@chikkadb/interfaces/wire/types";
import type { ConnState } from "../connection.js";
import type { Credential } from "./credential.js";
import { clientFirst, clientFinal } from "./scram.js";

/** Extract UTF-8 string from BSON payload (may be Buffer, BSON Binary, or string) */
function extractPayload(payloadBuf: any): string {
  if (Buffer.isBuffer(payloadBuf)) {
    return payloadBuf.toString('utf8');
  }
  // BSON Binary object has a .buffer property (Uint8Array)
  if (payloadBuf && payloadBuf.buffer instanceof Uint8Array) {
    return Buffer.from(payloadBuf.buffer).toString('utf8');
  }
  if (typeof payloadBuf === 'string') {
    return payloadBuf;
  }
  return String(payloadBuf ?? '');
}

export function handleSaslStart(
  document: Record<string, any>,
  connState: ConnState,
  credential: Credential,
): OpMsgPayload {
  try {
    const mechanism = document.mechanism;
    if (mechanism !== 'SCRAM-SHA-256') {
      return errorResponse(`Unsupported mechanism: ${mechanism}`, 334);
    }

    const payload = extractPayload(document.payload);

    const [conv, serverFirstMsg] = clientFirst(payload, credential);
    connState.scramConv = conv;

    return {
      _type: 'OP_MSG',
      flagBits: 0,
      sections: [{
        sectionKind: 0 as const,
        document: {
          conversationId: 1,
          done: false,
          payload: Buffer.from(serverFirstMsg, 'utf8'),
          ok: 1,
        },
      }],
    };
  } catch (error: any) {
    return errorResponse(error.message, 18);
  }
}

export function handleSaslContinue(
  document: Record<string, any>,
  connState: ConnState,
  credential: Credential,
): OpMsgPayload {
  try {
    if (!connState.scramConv) {
      return errorResponse('No SCRAM conversation in progress', 18);
    }

    const payload = extractPayload(document.payload);

    const serverFinalMsg = clientFinal(payload, connState.scramConv, credential);
    connState.authenticated = true;
    connState.scramConv = null;

    return {
      _type: 'OP_MSG',
      flagBits: 0,
      sections: [{
        sectionKind: 0 as const,
        document: {
          conversationId: 1,
          done: true,
          payload: Buffer.from(serverFinalMsg, 'utf8'),
          ok: 1,
        },
      }],
    };
  } catch (error: any) {
    connState.scramConv = null;
    return errorResponse(`Authentication failed: ${error.message}`, 18);
  }
}

function errorResponse(msg: string, code: number): OpMsgPayload {
  return {
    _type: 'OP_MSG',
    flagBits: 0,
    sections: [{
      sectionKind: 0 as const,
      document: { ok: 0, errmsg: msg, code, codeName: 'AuthenticationFailed' },
    }],
  };
}
