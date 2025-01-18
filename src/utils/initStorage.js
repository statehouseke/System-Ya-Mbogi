// initStorage.js
import { githubStorage } from './githubStorage.js';

// Utility to add exponential backoff delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const exponentialBackoff = (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000);

/**
 * Convert string to base64 encoding
 */
function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Get file info with retries
 */
async function getFileInfo(path, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await githubStorage.makeRequest(
        `${githubStorage.baseUrl}/contents/${path}`
      );
      
      if (!response) return { exists: false };
      if (Array.isArray(response)) return { exists: true, isDirectory: true };
      return { exists: true, sha: response.sha, content: response.content };
      
    } catch (error) {
      if (error.message?.includes('404')) return { exists: false };
      if (attempt === maxRetries - 1) throw error;
      await delay(exponentialBackoff(attempt));
    }
  }
}

/**
 * Write file with conflict resolution and retries
 */
async function writeFile(path, content, maxRetries = 3) {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const info = await getFileInfo(path);
      
      const requestBody = {
        message: `${info.exists ? 'Update' : 'Create'} ${path}`,
        content: toBase64(contentStr)
      };

      if (info.sha) requestBody.sha = info.sha;

      await githubStorage.makeRequest(
        `${githubStorage.baseUrl}/contents/${path}`,
        {
          method: 'PUT',
          body: JSON.stringify(requestBody)
        }
      );

      return true;
    } catch (error) {
      // If conflict and not last retry, continue
      if (error.message?.includes('409') && attempt < maxRetries - 1) {
        await delay(exponentialBackoff(attempt));
        continue;
      }
      
      // If last attempt or different error, throw
      throw error;
    }
  }
}

/**
 * Create directory with proper locking and deduplication
 */
class DirectoryManager {
  constructor() {
    this.inProgress = new Set();
    this.completed = new Set();
  }

  async createDirectory(path, readmeContent) {
    // Skip if already completed
    if (this.completed.has(path)) return true;
    
    // Wait if creation in progress
    while (this.inProgress.has(path)) {
      await delay(100);
    }

    try {
      this.inProgress.add(path);

      // Check if directory exists
      const info = await getFileInfo(path);
      if (info.exists) {
        this.completed.add(path);
        return true;
      }

      // Create parent directory if needed
      const parentPath = path.split('/').slice(0, -1).join('/');
      if (parentPath && parentPath !== 'data') {
        await this.createDirectory(parentPath);
      }

      // Create README.md if provided
      if (readmeContent) {
        await writeFile(`${path}/README.md`, readmeContent);
      }

      // Create .gitkeep
      await writeFile(`${path}/.gitkeep`, '');

      this.completed.add(path);
      return true;

    } finally {
      this.inProgress.delete(path);
    }
  }
}

/**
 * Initialize the complete storage structure
 */
export async function initializeStorage() {
  const dirManager = new DirectoryManager();
  
  try {
    // Define base structure
    const baseStructure = {
      'data': ['folders', 'emails', 'attachments', 'silent', 'blacklist', 'maliciousips', 'metadata'],
      'data/folders': ['versions'],
      'data/emails': ['attachments'],
      'data/metadata': ['links'],
      'data/silent': ['folders']
    };

    // Create all directories with proper README files
    for (const [parentPath, subdirs] of Object.entries(baseStructure)) {
      // Create parent directory
      await dirManager.createDirectory(parentPath, `# ${parentPath.split('/').pop()}\n\nRoot directory for ${parentPath} storage.`);

      // Create subdirectories
      for (const subdir of subdirs) {
        const fullPath = `${parentPath}/${subdir}`;
        await dirManager.createDirectory(
          fullPath,
          `# ${subdir}\n\nStorage directory for ${subdir} data.`
        );
      }
    }

    // Initialize blacklist if needed
    const blacklistPath = 'data/blacklist/ips.json';
    const blacklistInfo = await getFileInfo(blacklistPath);
    
    if (!blacklistInfo.exists) {
      const emptyBlacklist = {
        ips: [],
        entries: {},
        pendingReports: {},
        updatedAt: new Date().toISOString()
      };
      await writeFile(blacklistPath, emptyBlacklist);
    }

    return { success: true };
    
  } catch (error) {
    console.error('Storage initialization failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}