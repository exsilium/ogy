export class Logger {
  static debugMode = false;

  static log(...args: any[]) {
    if (Logger.debugMode) {
      console.log(...args);
    }
  }

  static enableDebug() {
    Logger.debugMode = true;
  }

  static disableDebug() {
    Logger.debugMode = false;
  }
}