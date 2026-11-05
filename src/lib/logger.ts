import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pino, { type DestinationStream } from 'pino';
import { LOG_REDACT_PATHS } from '@/lib/redact';

const logDir = join(process.cwd(), 'data', 'logs');
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const KEPT_FILES = 5;

/** Size-based rotation: `<name>.ndjson` plus at most four rotated files `<name>.ndjson.1..4`. */
function rotatingFile(name: string) {
  const path = join(logDir, name);
  let size = -1;
  return {
    write(line: string) {
      if (size < 0) {
        mkdirSync(logDir, { recursive: true });
        size = existsSync(path) ? statSync(path).size : 0;
      }
      const bytes = Buffer.byteLength(line);
      if (size > 0 && size + bytes > MAX_FILE_BYTES) {
        for (let index = KEPT_FILES - 1; index >= 1; index -= 1) {
          const from = index === 1 ? path : `${path}.${index - 1}`;
          if (existsSync(from)) renameSync(from, `${path}.${index}`);
        }
        size = 0;
      }
      appendFileSync(path, line);
      size += bytes;
    },
  };
}

const options = { base: undefined, level: process.env.LOG_LEVEL ?? 'info', redact: { paths: LOG_REDACT_PATHS, censor: '[redacted]' } };

/** Same options (level, PII redaction) as the app loggers; tests pass an in-memory stream to inspect what would be written. */
export const createLogger = (destination: DestinationStream, level = options.level) => pino({ ...options, level }, destination);

// The MCP service shares this codebase but writes its own file (SERVICE_NAME=mcp).
export const logger = createLogger(rotatingFile(`${process.env.SERVICE_NAME ?? 'web'}.ndjson`));

export const workerLogger = createLogger(rotatingFile('worker.ndjson'));
