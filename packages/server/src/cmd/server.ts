#!/usr/bin/env node
import { Socket, createServer } from "net";
import { createServer as createTlsServer } from "tls";
import { encodeMessage, processBuffer } from "../lib/wire.js";
import { type WireMessage } from "@chikkadb/interfaces/wire/types";
import { getResponse } from "../command-handler.js";
import { logWireConn, logWireMsg } from "../lib/utils.js";
import { startupOptions } from "../config.js";
import { prepareCredential, type Credential } from "../auth/credential.js";
import { type ConnState } from "../connection.js";
import fs from 'fs';

const HOST = startupOptions.bind_ip_all
  ? '0.0.0.0'
  : startupOptions.bind_ip ?? '127.0.0.1';

const isHostFilePath = (HOST as string).startsWith('/');

const PORT = startupOptions.port;

const authEnabled = !!(startupOptions.authUser && startupOptions.authPass);
const credential: Credential | null = authEnabled
  ? prepareCredential(startupOptions.authUser!, startupOptions.authPass!)
  : null;

const server = startupOptions.tls
  ? createTlsServer({
      cert: fs.readFileSync(startupOptions.tlsCert!),
      key: fs.readFileSync(startupOptions.tlsKey!),
    }, handleNewConnection)
  : createServer(handleNewConnection);

async function handleNewConnection(sock: Socket) {
  logWireConn('client connected from port:', sock.remotePort);

  const connState: ConnState = {
    buf: Buffer.alloc(0),
    authenticated: !authEnabled,
    scramConv: null,
  };

  sock.on('data', async (data) => {
    try {
      connState.buf = Buffer.concat([connState.buf, data]);
      const messages = processBuffer(connState);
      for (const message of messages) {
        logWireMsg(`C -> S message`, message.header);
        logWireMsg('%O', message.payload);
        const responseBuf = await getEncodedResponse(message, connState);
        sock.write(responseBuf);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      sock.destroy();
    }
  });

  sock.on('error', (error) => {
    console.error(error);
    sock.destroy();
  });
}

if (isHostFilePath) {
  server.listen(HOST, () => {
    console.log(`ChikkaDB listening on`, HOST, authEnabled ? '(auth enabled)' : '', startupOptions.tls ? '(TLS)' : '');
  })
} else {
  server.listen(isHostFilePath ? HOST : PORT, () => {
    console.log(`ChikkaDB listening on`, `${HOST}:${PORT}`, authEnabled ? '(auth enabled)' : '', startupOptions.tls ? '(TLS)' : '');
  });
}

process.on('exit', () => {
  if (isHostFilePath && fs.existsSync(HOST)) fs.unlinkSync(HOST);
});
process.on('SIGINT', () => process.exit());

async function getEncodedResponse(message: WireMessage, connState: ConnState): Promise<Buffer> {
  const response = await getResponse(message, connState, credential);
  const responseBuf = encodeMessage(response);

  return responseBuf;
}
