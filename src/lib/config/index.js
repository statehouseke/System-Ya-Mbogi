// src/lib/config/index.js

const requiredEnvVars = [
    'VITE_GITHUB_TOKEN',
    'VITE_GITHUB_USERNAME',
    'VITE_REPO_NAME',
    'VITE_ADMIN_PASSWORD_HASH',
    'VITE_ADMIN_PASSWORD_SALT'
  ];
  
  class Config {
    constructor() {
      this.config = {
        github: {
          token: import.meta.env.VITE_GITHUB_TOKEN,
          username: import.meta.env.VITE_GITHUB_USERNAME,
          repoName: import.meta.env.VITE_REPO_NAME,
          baseUrl: `https://api.github.com/repos/${import.meta.env.VITE_GITHUB_USERNAME}/${import.meta.env.VITE_REPO_NAME}`
        },
        security: {
          adminPasswordHash: import.meta.env.VITE_ADMIN_PASSWORD_HASH,
          adminPasswordSalt: import.meta.env.VITE_ADMIN_PASSWORD_SALT,
          defaultTimeout: 10000,
          maxRetries: 3
        },
        rateLimits: {
          CREATE_FOLDER: { max: 5, window: 3600000 },
          CREATE_EMAIL: { max: 20, window: 3600000 },
          CREATE_VERSION: { max: 10, window: 3600000 },
          LIKE_ACTION: { max: 50, window: 3600000 },
          DOWNLOAD_ATTACHMENT: { max: 100, window: 3600000 }
        }
      };
  
      this.validateConfig();
    }
  
    validateConfig() {
      const missingVars = requiredEnvVars.filter(
        varName => !import.meta.env[varName]
      );
  
      if (missingVars.length > 0) {
        throw new Error(
          `Missing required environment variables: ${missingVars.join(', ')}`
        );
      }
    }
  
    get(path) {
      return path.split('.').reduce((obj, key) => obj?.[key], this.config);
    }
  }
  
  export default new Config();