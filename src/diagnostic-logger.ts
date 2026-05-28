import { DIAGNOSTIC_LOG_DIR } from "./pluginPaths";

export type DiagnosticLogMode = "off" | "next" | "always";
export type DiagnosticLogLevel = "safe" | "full";

export interface DiagnosticLogEvent {
    ts: string;
    elapsedMs: number;
    runId: string;
    sessionId?: string;
    event: string;
    data?: unknown;
}

export interface DiagnosticLogger {
    runId: string;
    filePath: string;
    level: DiagnosticLogLevel;
    log: (event: string, data?: unknown) => Promise<void>;
    flush: () => Promise<void>;
    close: (event?: string, data?: unknown) => Promise<void>;
}

export interface DiagnosticLoggerOptions {
    level?: DiagnosticLogLevel;
    sessionId?: string;
    putFile: (path: string, isDir: boolean, file: Blob) => Promise<unknown>;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
    [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/g, "Bearer [REDACTED]"],
    [/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-[REDACTED]"],
    [/\b(SIYUAN_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY)\s*=\s*([^\s"'`]+)/gi, "$1=[REDACTED]"],
    [/("(?:token|apiKey|api_key|authorization)"\s*:\s*")([^"]+)(")/gi, "$1[REDACTED]$3"],
    [/((?:token|apiKey|api_key|authorization)\s*[:=]\s*)([^\s"',}]+)/gi, "$1[REDACTED]"],
    [/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "[REDACTED_DATA_URL]"],
    [/\b[A-Za-z0-9+/]{320,}={0,2}\b/g, "[REDACTED_BASE64]"],
];

const SAFE_TEXT_LIMIT = 1200;
const FULL_TEXT_LIMIT = 20000;

export function createDiagnosticRunId(date = new Date()): string {
    const stamp = date.toISOString().replace(/[:.]/g, "-");
    const random = Math.random().toString(36).slice(2, 8);
    return `${stamp}-${random}`;
}

export function createDiagnosticLogPath(runId: string): string {
    return `${DIAGNOSTIC_LOG_DIR}/${runId}.jsonl`;
}

export function shouldStartDiagnosticLog(mode?: DiagnosticLogMode): boolean {
    return mode === "next" || mode === "always";
}

export function redactString(value: string, level: DiagnosticLogLevel = "safe"): string {
    let redacted = value;
    for (const [pattern, replacement] of SECRET_PATTERNS) {
        redacted = redacted.replace(pattern, replacement);
    }

    const limit = level === "full" ? FULL_TEXT_LIMIT : SAFE_TEXT_LIMIT;
    if (redacted.length > limit) {
        return `${redacted.slice(0, limit)}...[TRUNCATED ${redacted.length - limit} chars]`;
    }
    return redacted;
}

export function redactValue(value: unknown, level: DiagnosticLogLevel = "safe", depth = 0): unknown {
    if (value == null) return value;
    if (typeof value === "string") return redactString(value, level);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "function") return "[Function]";
    if (depth > 8) return "[MaxDepth]";

    if (Array.isArray(value)) {
        return value.map(item => redactValue(item, level, depth + 1));
    }

    if (value instanceof Error) {
        return {
            name: value.name,
            message: redactString(value.message, level),
            stack: value.stack ? redactString(value.stack, level) : undefined,
        };
    }

    if (typeof value === "object") {
        const output: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
            if (/^(token|apiKey|api_key|authorization|password|secret)$/i.test(key)) {
                output[key] = "[REDACTED]";
                continue;
            }
            output[key] = redactValue(nested, level, depth + 1);
        }
        return output;
    }

    return String(value);
}

export function createDiagnosticLogger(options: DiagnosticLoggerOptions): DiagnosticLogger {
    const level = options.level || "safe";
    const runId = createDiagnosticRunId();
    const filePath = createDiagnosticLogPath(runId);
    const startedAt = Date.now();
    const lines: string[] = [];
    let writeQueue = Promise.resolve();
    let closed = false;

    async function flush(): Promise<void> {
        const blob = new Blob([`${lines.join("\n")}${lines.length ? "\n" : ""}`], {
            type: "application/jsonl;charset=utf-8",
        });
        await options.putFile(filePath, false, blob);
    }

    async function log(event: string, data?: unknown): Promise<void> {
        if (closed) return;
        const entry: DiagnosticLogEvent = {
            ts: new Date().toISOString(),
            elapsedMs: Date.now() - startedAt,
            runId,
            sessionId: options.sessionId,
            event,
            data: redactValue(data, level),
        };
        lines.push(JSON.stringify(entry));
        writeQueue = writeQueue.then(flush, flush);
        await writeQueue;
    }

    async function close(event = "run.closed", data?: unknown): Promise<void> {
        if (!closed) {
            await log(event, data);
            closed = true;
        }
        await writeQueue;
    }

    return {
        runId,
        filePath,
        level,
        log,
        flush: async () => {
            writeQueue = writeQueue.then(flush, flush);
            await writeQueue;
        },
        close,
    };
}
