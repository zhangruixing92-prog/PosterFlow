export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  time: number;
  level: LogLevel;
  event: string;
  context?: unknown;
}

const STORAGE_KEY = 'posterflow_logs';
const MAX_ENTRIES = 300;

let buffer: LogEntry[] = loadLogs();

function loadLogs(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    // 存储满或不可用时忽略，至少保留内存日志
  }
}

/** 截断超长字段（如 dataURL/base64），避免日志膨胀，同时保留输入规模信息 */
function sanitize(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > 300 ? `${value.slice(0, 120)}…(共${value.length}字符)` : value;
  }
  if (Array.isArray(value)) {
    if (depth > 4) return `[数组 长度${value.length}]`;
    return value.map((item) => sanitize(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    if (depth > 5) return '[对象]';
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitize(val, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level: LogLevel, event: string, context?: unknown): void {
  const entry: LogEntry = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    time: Date.now(),
    level,
    event,
    context: context === undefined ? undefined : sanitize(context),
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(-MAX_ENTRIES);
  persist();

  const iso = new Date(entry.time).toISOString();
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  fn(`[PosterFlow ${iso}] ${event}`, entry.context ?? '');
}

/** 把任意异常归一化成可记录的结构 */
export function describeError(error: unknown): { message: string; name?: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 6).join('\n'),
    };
  }
  return { message: String(error) };
}

export const logger = {
  info: (event: string, context?: unknown) => write('info', event, context),
  warn: (event: string, context?: unknown) => write('warn', event, context),
  error: (event: string, context?: unknown) => write('error', event, context),
  getEntries: (): LogEntry[] => [...buffer],
  clear: (): void => {
    buffer = [];
    persist();
  },
};

export function downloadLogs(): void {
  const blob = new Blob([JSON.stringify(buffer, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `posterflow-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
