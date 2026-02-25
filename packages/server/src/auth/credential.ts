import { pbkdf2Sync, createHmac, createHash, randomBytes } from 'crypto';

export type Credential = {
  username: string;
  salt: Buffer;
  iterations: number;
  storedKey: Buffer;
  serverKey: Buffer;
};

export function prepareCredential(username: string, password: string): Credential {
  const salt = randomBytes(28);
  const iterations = 4096;

  const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', saltedPassword).update('Server Key').digest();

  return { username, salt, iterations, storedKey, serverKey };
}
