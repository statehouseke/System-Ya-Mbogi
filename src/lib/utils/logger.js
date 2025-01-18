// src/lib/utils/logger.js

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
  };
  
  class Logger {
    constructor(serviceName) {
      this.serviceName = serviceName;
      this.logLevel = import.meta.env.VITE_LOG_LEVEL || LOG_LEVELS.INFO;
    }
  
    formatMessage(level, message, data) {
      const timestamp = new Date().toISOString();
      return {
        timestamp,
        level,
        service: this.serviceName,
        message,
        ...(data && { data })
      };
    }
  
    error(message, error) {
      if (this.logLevel >= LOG_LEVELS.ERROR) {
        const formattedMessage = this.formatMessage('ERROR', message, {
          errorMessage: error?.message,
          stack: error?.stack
        });
        console.error(JSON.stringify(formattedMessage));
      }
    }
  
    warn(message, data) {
      if (this.logLevel >= LOG_LEVELS.WARN) {
        const formattedMessage = this.formatMessage('WARN', message, data);
        console.warn(JSON.stringify(formattedMessage));
      }
    }
  
    info(message, data) {
      if (this.logLevel >= LOG_LEVELS.INFO) {
        const formattedMessage = this.formatMessage('INFO', message, data);
        console.info(JSON.stringify(formattedMessage));
      }
    }
  
    debug(message, data) {
      if (this.logLevel >= LOG_LEVELS.DEBUG) {
        const formattedMessage = this.formatMessage('DEBUG', message, data);
        console.debug(JSON.stringify(formattedMessage));
      }
    }
  }
  
  export default Logger;