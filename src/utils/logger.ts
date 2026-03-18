export class Logger {
  private prefix: string;

  constructor(prefix: string = "[TRIEOH SDK]") {
    this.prefix = prefix;
  }

  /**
   * Sets the prefix for all logs from this instance.
   */
  setPrefix(prefix: string) {
    this.prefix = prefix;
  }

  /**
   * Logs a message with the current prefix.
   */
  log(...args: unknown[]) {
    console.log(this.prefix, ...args);
  }

  /**
   * Logs a warning with the current prefix.
   */
  warn(...args: unknown[]) {
    console.warn(this.prefix, ...args);
  }

  /**
   * Logs an error with the current prefix.
   */
  error(...args: unknown[]) {
    console.error(this.prefix, ...args);
  }

  /**
   * Creates a new Logger instance with an extended prefix.
   * Useful for scoping logs to specific modules.
   */
  scope(module: string): Logger {
    return new Logger(`${this.prefix} [${module}]`);
  }

  /**
   * Returns a function that logs with a specific custom prefix or message override.
   */
  with(customPrefix?: string, ...initialArgs: unknown[]) {
    const p = customPrefix || this.prefix;
    return {
      log: (...args: unknown[]) => console.log(p, ...initialArgs, ...args),
      warn: (...args: unknown[]) => console.warn(p, ...initialArgs, ...args),
      error: (...args: unknown[]) => console.error(p, ...initialArgs, ...args),
    };
  }
}

export const logger = new Logger();