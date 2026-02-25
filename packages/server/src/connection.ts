import type { ScramConv } from "./auth/scram.js";

export type ConnState = {
  buf: Buffer;
  authenticated: boolean;
  scramConv: ScramConv | null;
};
