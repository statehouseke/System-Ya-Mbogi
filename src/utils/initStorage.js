// initStorage.js
import { githubStorage } from './githubStorage.js';

// Cache for directory existence checks
const directoryCache = new Map();
const FILE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Optimized base64 encoding with caching
const base64Cache = new Map();
function toBase64(str) {
  if (base64Cache.has(str)) {
    return base64Cache.get(str);
  }
  const encoded = btoa(unescape(encodeURIComponent(str)));
  base64Cache.set(str, encoded);
  return encoded;
}

// Concurrent request limiter
class RequestLimiter {
  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async runTask(task) {
    if (this.running >= this.maxConcurrent) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.running++;
    
    try {
      return await task();
    } finally {
      this.running--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }
}

const requestLimiter = new RequestLimiter(3);

// Optimized file info retrieval with caching
async function getFileInfo(path, maxRetries = 2) {
  const cacheKey = `fileInfo:${path}`;
  const cached = directoryCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < FILE_CACHE_DURATION) {
    return cached.data;
  }

  const backoff = (attempt) => Math.min(1000 * Math.pow(2, attempt), 5000);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await requestLimiter.runTask(() =>
        githubStorage.makeRequest(`${githubStorage.baseUrl}/contents/${path}`)
      );
      
      const result = !response ? { exists: false } :
                    Array.isArray(response) ? { exists: true, isDirectory: true } :
                    { exists: true, sha: response.sha, content: response.content };

      directoryCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      return result;
    } catch (error) {
      if (error.message?.includes('404')) {
        const result = { exists: false };
        directoryCache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
        return result;
      }
      
      if (attempt === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, backoff(attempt)));
    }
  }
}

// Optimized file writing with retries
async function writeFile(path, content, maxRetries = 2) {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const encodedContent = toBase64(contentStr);
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const info = await getFileInfo(path);
      
      const requestBody = {
        message: `${info.exists ? 'Update' : 'Create'} ${path}`,
        content: encodedContent,
        ...(info.sha && { sha: info.sha })
      };

      await requestLimiter.runTask(() =>
        githubStorage.makeRequest(
          `${githubStorage.baseUrl}/contents/${path}`,
          {
            method: 'PUT',
            body: JSON.stringify(requestBody)
          }
        )
      );

      // Invalidate cache after successful write
      directoryCache.delete(`fileInfo:${path}`);
      return true;
    } catch (error) {
      if (error.message?.includes('409') && attempt < maxRetries - 1) {
        await new Promise(resolve => 
          setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 5000))
        );
        continue;
      }
      throw error;
    }
  }
}

// Optimized directory manager with parallel processing
class DirectoryManager {
  constructor() {
    this.inProgress = new Map();
    this.completed = new Set();
  }

  async createDirectory(path, readmeContent) {
    if (this.completed.has(path)) return true;
    
    const existing = this.inProgress.get(path);
    if (existing) return existing;

    const creation = (async () => {
      try {
        const info = await getFileInfo(path);
        if (info.exists) {
          this.completed.add(path);
          return true;
        }

        const parentPath = path.split('/').slice(0, -1).join('/');
        if (parentPath && parentPath !== 'data') {
          await this.createDirectory(parentPath);
        }

        const tasks = [writeFile(`${path}/.gitkeep`, '')];
        if (readmeContent) {
          tasks.push(writeFile(`${path}/README.md`, readmeContent));
        }

        await Promise.all(tasks);
        this.completed.add(path);
        return true;
      } finally {
        this.inProgress.delete(path);
      }
    })();

    this.inProgress.set(path, creation);
    return creation;
  }
}

// Fast initialization with parallel processing
export async function initializeStorage() {
  const dirManager = new DirectoryManager();
  
  try {
    const baseStructure = {
      'data': ['folders', 'emails', 'attachments', 'silent', 'blacklist', 'maliciousips', 'metadata', 'countries'],
      'data/folders': ['versions'],
      'data/emails': ['attachments'],
      'data/metadata': ['links'],
      'data/silent': ['folders'],
      'data/countries': ['ke']
    };

    // Create directories in parallel with dependencies handled
    const createDirs = async ([parentPath, subdirs]) => {
      await dirManager.createDirectory(
        parentPath,
        `# ${parentPath.split('/').pop()}\n\nRoot directory for ${parentPath} storage.`
      );

      await Promise.all(
        subdirs.map(subdir => {
          const fullPath = `${parentPath}/${subdir}`;
          return dirManager.createDirectory(
            fullPath,
            `# ${subdir}\n\nStorage directory for ${subdir} data.`
          );
        })
      );
    };

    // Process each level sequentially but subdirs in parallel
    for (const level of Object.entries(baseStructure)) {
      await createDirs(level);
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

    return { 
      success: true,
      directoriesCreated: dirManager.completed.size 
    };
    
  } catch (error) {
    console.error('Storage initialization failed:', error);
    return {
      success: false,
      error: error.message,
      directoriesCreated: dirManager.completed.size
    };
  }
}

// Add monitoring
export function getInitializationStats() {
  return {
    cacheSizes: {
      directoryCache: directoryCache.size,
      base64Cache: base64Cache.size
    },
    cacheEntries: Array.from(directoryCache.keys())
  };
}

// Clear caches if needed
export function clearCaches() {
  directoryCache.clear();
  base64Cache.clear();
}