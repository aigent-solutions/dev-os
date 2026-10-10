// Structured JSON logger (00-foundation.md §6.7).
// Allowed fields: request_id, user_id, contract_id, status, latency_ms, code, counts, mode.
// Forbidden: contract text, term values, chat content, emails, file names, tokens, secrets.
type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

export type Logger = {
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
};

function write(level: Level, msg: string, base: Fields, fields?: Fields): void {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...base, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createLogger(base: Fields = {}): Logger {
  return {
    info: (m, f) => write('info', m, base, f),
    warn: (m, f) => write('warn', m, base, f),
    error: (m, f) => write('error', m, base, f),
    child: (f) => createLogger({ ...base, ...f }),
  };
}

export const logger = createLogger({ service: 'contractiq', version: process.env.COMMIT_REF ?? 'dev' });

/** Safe error shape for logs: never request bodies; stack only outside production. */
export function serializeError(err: unknown): Fields {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
      ...('code' in err && typeof err.code === 'string' ? { code: err.code } : {}),
    };
  }
  return { message: String(err) };
}
