import minimist from "minimist";

const argv = minimist(process.argv.slice(2));

export const startupOptions = {
  bind_ip: argv['bind_ip'] ?? '127.0.0.1',
  bind_ip_all: argv['bind_ip_all'] ?? false,
  port: argv['port'] ?? 27017,
  dbpath: argv['dbpath'] ?? 'data/db',
  tls: !!argv['tls'],
  tlsCert: argv['tlsCert'] as string | undefined,
  tlsKey: argv['tlsKey'] as string | undefined,
  authUser: (argv['authUser'] as string | undefined) ?? null,
  authPass: (argv['authPass'] as string | undefined) ?? null,
}

