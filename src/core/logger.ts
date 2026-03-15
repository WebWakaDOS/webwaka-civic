/**
 * WebWaka Civic — Platform Logger
 * Blueprint Reference: Part 9.3 (Zero Console Logs — must use platform logger)
 *
 * Structured JSON logging for Cloudflare Workers.
 * Zero console.log usage anywhere in the codebase.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  module: string;
  tenantId?: string | undefined;
  timestamp: string;
  data?: Record<string, unknown> | undefined;
}

export class Logger {
  private readonly module: string;
  private readonly tenantId: string | undefined;

  constructor(module: string, tenantId?: string) {
    this.module = module;
    this.tenantId = tenantId;
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      module: this.module,
      timestamp: new Date().toISOString(),
      ...(this.tenantId !== undefined ? { tenantId: this.tenantId } : {}),
      ...(data !== undefined ? { data } : {}),
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case "debug":
        console.debug(output);
        break;
      case "info":
        console.info(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        break;
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log("error", message, data);
  }

  withTenant(tenantId: string): Logger {
    return new Logger(this.module, tenantId);
  }
}

export function createLogger(module: string, tenantId?: string): Logger {
  return new Logger(module, tenantId);
}
