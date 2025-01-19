//githubStorage.js
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';

// Constants for security and rate limiting
const RATE_LIMITS = {
  CREATE_FOLDER: { max: 5, window: 3600000 },
  CREATE_EMAIL: { max: 20, window: 3600000 },
  CREATE_VERSION: { max: 10, window: 3600000 },
  LIKE_ACTION: { max: 50, window: 3600000 },
  DOWNLOAD_ATTACHMENT: { max: 100, window: 3600000 }
};

const FOLDER_STATUS = {
  SILENT: 'silent',
  ACTIVE: 'active',
  FLAGGED: 'flagged'
};

// SecurityManager class changes
class SecurityManager {
  encryptContent(content, password) {
    return CryptoJS.AES.encrypt(JSON.stringify(content), password).toString();
  }

  decryptContent(encryptedContent, password) {
    const bytes = CryptoJS.AES.decrypt(encryptedContent, password);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  }

  constructor() {
    this.rateLimitCache = new Map();
    this.blacklistedIPs = new Set();
  }

  // Generate a secure folder password
  generateSecurePassword() {
    const length = 20;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    // Use crypto.getRandomValues for more secure randomness
    const randomBytes = crypto.getRandomValues(new Uint8Array(length));
    
    const password = Array.from(randomBytes)
      .map(byte => charset[byte % charset.length])
      .join('');
    
    return password;
  }

  // Generate a regular content password
  generateContentPassword() {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
      .map(byte => charset[byte % charset.length])
      .join('');
  }

  // In SecurityManager class
  hashPassword(password) {
    try {
      // Generate a cryptographically secure salt
      const salt = CryptoJS.lib.WordArray.random(128/8);

      // Explicit, consistent hashing parameters
      const hash = CryptoJS.PBKDF2(password, salt, {
        keySize: 512/32,     // 512-bit key
        iterations: 10000,   // High iteration count for security
        hasher: CryptoJS.algo.SHA512  // Use SHA-512 explicitly
      });

      // Convert salt to hex string for consistent storage
      const saltHex = salt.toString(CryptoJS.enc.Hex);
      const hashStr = hash.toString();

      console.log('Password Hashing Details:', {
        saltLength: saltHex.length,
        hashLength: hashStr.length,
        iterations: 10000,
        hasher: 'SHA-512'
      });

      return {
        hash: hashStr,
        salt: saltHex
      };
    } catch (error) {
      console.error('Password Hashing Error:', error);
      throw error;
    }
  }

  verifyPassword(password, storedHash, storedSalt) {
    try {
      console.log('Verification Process Details:');
      console.log('Input Password:', password);
      console.log('Input Password Length:', password.length);
      console.log('Input Password Char Codes:', 
        Array.from(password).map(char => char.charCodeAt(0))
      );

      // Parse salt from hex string
      const salt = CryptoJS.enc.Hex.parse(storedSalt);

      // Recompute hash with IDENTICAL parameters
      const hash = CryptoJS.PBKDF2(password, salt, {
        keySize: 512/32,     // Exact key size
        iterations: 10000,   // Exact iteration count
        hasher: CryptoJS.algo.SHA512  // Exact hashing algorithm
      });

      const computedHashStr = hash.toString();

      console.log('Stored Hash:', storedHash);
      console.log('Computed Hash:', computedHashStr);
      console.log('Hash Lengths:', {
        stored: storedHash.length,
        computed: computedHashStr.length
      });

      const isValid = computedHashStr === storedHash;
      console.log('Password Verification Result:', isValid);

      // Detailed logging for failed verifications
      if (!isValid) {
        console.error('Verification Failed Details:', {
          inputPassword: password,
          storedHash,
          computedHash: computedHashStr,
          salt: storedSalt
        });
      }

      return isValid;
    } catch (error) {
      console.error('Password Verification Error:', error);
      return false;
    }
  }

  // Generate data integrity checksum
  generateChecksum(data) {
    return CryptoJS.SHA256(JSON.stringify(data)).toString();
  }

  // Check rate limits
  async checkRateLimit(ip, action) {
    if (this.blacklistedIPs.has(ip)) {
      return false;
    }

    const key = `${ip}:${action}`;
    const now = Date.now();
    const limit = RATE_LIMITS[action];

    if (!this.rateLimitCache.has(key)) {
      this.rateLimitCache.set(key, []);
    }

    const requests = this.rateLimitCache.get(key);
    const recentRequests = requests.filter(time => now - time < limit.window);

    if (recentRequests.length >= limit.max) {
      await this.flagSuspiciousIP(ip, action);
      return false;
    }

    recentRequests.push(now);
    this.rateLimitCache.set(key, recentRequests);
    return true;
  }

  // Generate shareable link with encryption
  generateShareableLink(folderId, metadata) {
    const token = CryptoJS.SHA256(folderId + Date.now() + Math.random()).toString(CryptoJS.enc.Hex).slice(0, 32);
    const encryptedData = CryptoJS.AES.encrypt(JSON.stringify(metadata), token).toString();
    return { token, encryptedData };
  }
}

class PasswordManager {
  static STORAGE_KEY = 'securePasswords';
  static ENCRYPTION_KEY = CryptoJS.SHA256(window.location.host + navigator.userAgent).toString();
  static PREFERENCE_KEY = 'passwordSavePreference';

  static async savePassword(type, id, password) {
    if (!window.localStorage || !password) {
      return false;
    }

    try {
      // Check save preference
      const savedPreference = localStorage.getItem(this.PREFERENCE_KEY);
      let shouldSave = savedPreference === 'true';
      
      // If no preference saved, ask user
      if (savedPreference === null) {
        shouldSave = await this.askToSavePassword();
        localStorage.setItem(this.PREFERENCE_KEY, shouldSave.toString());
      }

      if (!shouldSave) return false;

      const stored = this.getStoredPasswords();
      
      // Hash the password for storage verification
      const hashedPassword = CryptoJS.SHA256(password).toString();
      
      // Store with additional security metadata
      stored[`${type}_${id}`] = {
        hash: hashedPassword,
        password: this.encryptData(password), // Encrypt original password
        timestamp: Date.now(),
        type,
        id,
        deviceId: this.getDeviceId(),
        lastUsed: Date.now()
      };

      await this.saveToStorage(stored);
      return true;
    } catch (error) {
      console.error('Error saving password:', error);
      return false;
    }
  }

  static getDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = CryptoJS.SHA256(
        navigator.userAgent + 
        window.screen.width + 
        window.screen.height +
        new Date().getTime()
      ).toString();
      localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  }

  static async saveToStorage(data) {
    const encryptedData = this.encryptData(JSON.stringify(data));
    localStorage.setItem(this.STORAGE_KEY, encryptedData);
    
    // Add checksum for data integrity
    const checksum = CryptoJS.SHA256(encryptedData).toString();
    localStorage.setItem(`${this.STORAGE_KEY}_checksum`, checksum);
  }

  static askToSavePassword() {
    return new Promise((resolve) => {
      const shouldSave = window.confirm(
        'Would you like to save this password securely in browser memory? (You can manage saved passwords later)'
      );
      resolve(shouldSave);
    });
  }

  static getStoredPasswords() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return {};

      // Verify data integrity
      const storedChecksum = localStorage.getItem(`${this.STORAGE_KEY}_checksum`);
      const calculatedChecksum = CryptoJS.SHA256(stored).toString();

      if (storedChecksum !== calculatedChecksum) {
        console.error('Password storage integrity check failed');
        return {};
      }

      const data = JSON.parse(this.decryptData(stored));

      // Verify device
      const currentDeviceId = this.getDeviceId();
      Object.keys(data).forEach(key => {
        if (data[key].deviceId && data[key].deviceId !== currentDeviceId) {
          delete data[key]; // Remove passwords from other devices
        }
      });

      return data;
    } catch (error) {
      console.error('Error getting stored passwords:', error);
      return {};
    }
  }

  static getPassword(type, id) {
    try {
      const stored = this.getStoredPasswords();
      const entry = stored[`${type}_${id}`];
      
      if (!entry) return null;

      // Update last used timestamp
      entry.lastUsed = Date.now();
      this.saveToStorage(stored).catch(console.error);

      // Decrypt and return original password
      return this.decryptData(entry.password);
    } catch (error) {
      console.error('Error getting password:', error);
      return null;
    }
  }

  static verifyPassword(type, id, password) {
    try {
      const stored = this.getStoredPasswords();
      const entry = stored[`${type}_${id}`];
      
      if (!entry) return false;

      // Compare hashed passwords
      const hashedPassword = CryptoJS.SHA256(password).toString();
      return hashedPassword === entry.hash;
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  }

  static async removePassword(type, id) {
    try {
      const stored = this.getStoredPasswords();
      delete stored[`${type}_${id}`];
      await this.saveToStorage(stored);
      return true;
    } catch (error) {
      console.error('Error removing password:', error);
      return false;
    }
  }

  static async killSwitch(type = 'all') {
    const stored = this.getStoredPasswords();
    const githubStorage = window.githubStorage;

    for (const [key, entry] of Object.entries(stored)) {
      if (type === 'all' || entry.type === type) {
        try {
          const password = this.decryptData(entry.password);
          if (entry.type === 'folder') {
            await githubStorage.deleteFolder(entry.id, password);
          } else if (entry.type === 'email') {
            await githubStorage.deleteEmail(entry.id, password);
          }
          delete stored[key];
        } catch (error) {
          console.error(`Error deleting ${entry.type} ${entry.id}:`, error);
        }
      }
    }

    if (type === 'all') {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(`${this.STORAGE_KEY}_checksum`);
      localStorage.removeItem(this.PREFERENCE_KEY);
    } else {
      await this.saveToStorage(stored);
    }
  }

  static encryptData(data) {
    try {
      // Add salt to encryption
      const salt = CryptoJS.lib.WordArray.random(128/8);
      const key = CryptoJS.PBKDF2(this.ENCRYPTION_KEY, salt, {
        keySize: 256/32,
        iterations: 1000
      });

      const encrypted = CryptoJS.AES.encrypt(data, key.toString());
      return salt.toString() + ':' + encrypted.toString();
    } catch (error) {
      console.error('Error encrypting data:', error);
      throw error;
    }
  }

  static decryptData(data) {
    try {
      const [salt, encrypted] = data.split(':');
      const key = CryptoJS.PBKDF2(this.ENCRYPTION_KEY, salt, {
        keySize: 256/32,
        iterations: 1000
      });

      const bytes = CryptoJS.AES.decrypt(encrypted, key.toString());
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Error decrypting data:', error);
      throw error;
    }
  }

  static async clearAll() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(`${this.STORAGE_KEY}_checksum`);
      localStorage.removeItem(this.PREFERENCE_KEY);
      return true;
    } catch (error) {
      console.error('Error clearing passwords:', error);
      return false;
    }
  }

  static hasPassword(type, id) {
    const stored = this.getStoredPasswords();
    return !!stored[`${type}_${id}`];
  }

  static getStorageStats() {
    const stored = this.getStoredPasswords();
    return {
      totalPasswords: Object.keys(stored).length,
      lastAccess: Math.max(...Object.values(stored).map(entry => entry.lastUsed || 0)),
      byType: Object.values(stored).reduce((acc, entry) => {
        acc[entry.type] = (acc[entry.type] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

export { PasswordManager };

class ContentValidator {
  static validateEmail(email) {
    const required = ['subject', 'body'];
    const maxSize = {
      subject: 200,
      body: 50000
    };

    for (const field of required) {
      if (!email[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
      if (email[field].length > maxSize[field]) {
        throw new Error(`${field} exceeds maximum size of ${maxSize[field]} characters`);
      }
    }
  }

  static validateAttachment(attachment) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'];

    if (attachment.size > maxSize) {
      throw new Error('Attachment exceeds maximum size of 10MB');
    }
    if (!allowedTypes.includes(attachment.type)) {
      throw new Error('Invalid attachment type');
    }
  }
}

class GitHubStorage {
  constructor() {
    const requiredEnvVars = {
      'VITE_GITHUB_TOKEN': import.meta.env.VITE_GITHUB_TOKEN,
      'VITE_GITHUB_USERNAME': import.meta.env.VITE_GITHUB_USERNAME,
      'VITE_REPO_NAME': import.meta.env.VITE_REPO_NAME
    };
    
    const missingVars = Object.entries(requiredEnvVars)
      .filter(([_, value]) => !value)
      .map(([key]) => key);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    this.headers = {
      'Authorization': `token ${import.meta.env.VITE_GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
    
    this.baseUrl = `https://api.github.com/repos/${
      import.meta.env.VITE_GITHUB_USERNAME
    }/${import.meta.env.VITE_REPO_NAME}`;
    
    this.security = new SecurityManager();
    this.timeout = 10000;
    this.initialized = false;
  }

  // Helper function to encode content for GitHub
  encodeContent(data) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  }

  // Helper function to decode content from GitHub
  decodeContent(content) {
    return JSON.parse(decodeURIComponent(escape(atob(content))));
  }

  // Helper method to wait for file creation
  async waitForFile(path, maxAttempts = 5) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await this.makeRequest(`${this.baseUrl}/contents/${path}`);
        if (response) {
          return response;
        }
      } catch (error) {
        if (!error.message.includes('404')) {
          throw error;
        }
      }
      // Wait before next attempt (increasing delay)
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
    throw new Error(`Timeout waiting for file: ${path}`);
  }

  // Make authenticated request to GitHub API
  async makeRequest(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.headers,
          'If-None-Match': '', // Bypass GitHub's caching
        }
      });

      const text = await response.text();
      
      if (!response.ok) {
        let errorMessage;
        try {
          const errorJson = JSON.parse(text);
          errorMessage = errorJson.message || errorJson.error || response.statusText;
        } catch (e) {
          errorMessage = text || response.statusText;
        }

        // Handle specific error cases
        if (response.status === 403) {
          if (errorMessage.includes('API rate limit exceeded')) {
            throw new Error('Rate limit exceeded. Please try again later.');
          }
          throw new Error('Permission denied. Please check your GitHub token permissions.');
        }

        throw new Error(`GitHub API error (${response.status}): ${errorMessage}`);
      }

      // Parse JSON response if possible
      try {
        return text ? JSON.parse(text) : null;
      } catch (e) {
        return text;
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async initializeRepository() {
    if (this.initialized) {
      return;
    }
  
    const directories = [
      'data',
      'data/folders',
      'data/emails',
      'data/attachments',
      'data/silent',
      'data/silent/folders',
      'data/blacklist',
      'data/maliciousips',
      'data/metadata',
      'data/metadata/links'
    ];
  
    try {
      for (const dir of directories) {
        await this.ensureDirectoryExists(dir);
        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing repository:', error);
      throw error;
    }
  }
 
  async ensureDirectoryExists(path) {
    try {
      const response = await this.makeRequest(`${this.baseUrl}/contents/${path}`);
      
      if (response && Array.isArray(response)) {
        return true;
      }

      // Create directory with .gitkeep
      await this.makeRequest(`${this.baseUrl}/contents/${path}/.gitkeep`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Initialize ${path} directory`,
          content: btoa(''),
          branch: 'main' // Explicitly specify branch
        })
      });

      return true;
    } catch (error) {
      if (error.message.includes('404')) {
        // Create parent directory first if needed
        const parent = path.split('/').slice(0, -1).join('/');
        if (parent && parent !== 'data') {
          await this.ensureDirectoryExists(parent);
        }
        
        // Retry creating this directory
        return this.ensureDirectoryExists(path);
      }
      throw error;
    }
  }


  async loadCountryEmails(countryCode) {
    try {
      // First check if country data exists
      const countryPath = `data/countries/${countryCode.toLowerCase()}`;
      await this.ensureDirectoryExists(countryPath);
      
      const files = await this.makeRequest(`${this.baseUrl}/contents/${countryPath}`);
      if (!Array.isArray(files)) return [];
      
      const emailFiles = files.filter(file => file.name.endsWith('.json'));
      
      const emails = await Promise.all(
        emailFiles.map(async file => {
          try {
            return await this.loadData(`${countryPath}/${file.name}`);
          } catch (error) {
            console.warn(`Failed to load email ${file.name}:`, error);
            return null;
          }
        })
      );
      
      return emails.filter(email => email !== null);
    } catch (error) {
      console.error(`Error loading emails for country ${countryCode}:`, error);
      return [];
    }
  }

  async saveEmailToCountry(countryCode, emailData, ip) {
    if (!await this.security.checkRateLimit(ip, 'CREATE_EMAIL')) {
      throw new Error('Rate limit exceeded for email creation');
    }

    const countryPath = `data/countries/${countryCode.toLowerCase()}`;
    await this.ensureDirectoryExists(countryPath);

    const emailId = uuidv4();
    const password = this.security.generateSecurePassword();
    const { hash, salt } = this.security.hashPassword(password);

    const emailMetadata = {
      id: emailId,
      countryCode,
      subject: emailData.subject,
      body: emailData.body,
      attachments: emailData.attachments || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creatorIP: CryptoJS.SHA256(ip).toString(),
      passwordHash: hash,
      passwordSalt: salt,
      likes: 0,
      checksum: ''
    };

    emailMetadata.checksum = this.security.generateChecksum(emailMetadata);

    await this.saveData(`${countryPath}/${emailId}.json`, emailMetadata);

    // Handle attachments if any
    if (emailData.attachments?.length > 0) {
      await Promise.all(emailData.attachments.map(async attachment => {
        const attachmentData = {
          ...attachment,
          checksum: this.security.generateChecksum(attachment)
        };
        await this.saveData(
          `data/attachments/countries/${countryCode}/${emailId}/${attachment.name}`,
          attachmentData
        );
      }));
    }

    return {
      ...emailMetadata,
      password // Return password only once
    };
  }


  async createFolder(folderData, ip) {
    try {
      console.group('Folder Creation Process');
      console.log('Input Data:', {
        folderName: folderData.name,
        targetEmail: folderData.targetEmail,
        creatorIP: ip
      });
  
      // Initialize repository if not already done
      if (!this.initialized) {
        console.log('Initializing repository...');
        await this.initializeRepository();
      }
  
      // Rate limit check
      if (!await this.security.checkRateLimit(ip, 'CREATE_FOLDER')) {
        console.error('Rate limit exceeded for folder creation');
        throw new Error('Rate limit exceeded for folder creation');
      }
  
      // Generate unique folder ID
      const folderId = uuidv4();
      console.log('Generated Folder ID:', folderId);
  
      // Ensure base directories exist
      const baseDirectories = [
        'data/silent/folders',
        'data/metadata/links'
      ];
  
      for (const dir of baseDirectories) {
        const exists = await this.checkPathExists(dir);
        if (!exists) {
          console.log(`Creating directory: ${dir}`);
          await this.ensureDirectoryExists(dir);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
  
      // Generate folder credentials with explicit logging
      const folderAdminPassword = this.security.generateSecurePassword();
      console.log('Folder Admin Password Generation:', {
        password: folderAdminPassword,
        length: folderAdminPassword.length,
        charCodes: Array.from(folderAdminPassword).map(char => char.charCodeAt(0))
      });
  
      // Hash the password
      const { hash: adminHash, salt: adminSalt } = this.security.hashPassword(folderAdminPassword);
      console.log('Password Hash Generation:', {
        adminHashLength: adminHash.length,
        adminSaltLength: adminSalt.length
      });
  
      // Validate input data
      if (!folderData.name || !folderData.targetEmail) {
        throw new Error('Folder name and target email are required');
      }
  
      // Create folder metadata
      const folderMetadata = {
        id: folderId,
        name: folderData.name,
        targetEmail: folderData.targetEmail,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: FOLDER_STATUS.SILENT,
        creatorIP: CryptoJS.SHA256(ip).toString(),
        adminHash,
        adminSalt,
        emails: [], // Initialize empty emails array
        emailsLoaded: true, // Mark as loaded since it's new
        checksum: ''
      };
  
      // Generate checksum for metadata integrity
      folderMetadata.checksum = this.security.generateChecksum(folderMetadata);
      console.log('Folder Metadata Checksum:', folderMetadata.checksum);
  
      // Save folder metadata
      try {
        await this.makeRequest(`${this.baseUrl}/contents/data/silent/folders/${folderId}.json`, {
          method: 'PUT',
          body: JSON.stringify({
            message: `Create folder ${folderId}`,
            content: btoa(JSON.stringify(folderMetadata, null, 2))
          })
        });
        console.log('Folder metadata saved successfully');
      } catch (saveError) {
        console.error('Error saving folder metadata:', saveError);
        throw saveError;
      }
  
      // Generate share token
      const { token, encryptedData } = this.security.generateShareableLink(folderId, {
        name: folderData.name,
        createdAt: folderMetadata.createdAt
      });
      console.log('Share Token Generated:', {
        token,
        tokenLength: token.length
      });
  
      // Create link metadata
      const linkMetadata = {
        folderId,
        encryptedData,
        createdAt: new Date().toISOString()
      };
  
      // Save share link
      try {
        await this.makeRequest(`${this.baseUrl}/contents/data/metadata/links/${token}.json`, {
          method: 'PUT',
          body: JSON.stringify({
            message: `Create share link for folder ${folderId}`,
            content: btoa(JSON.stringify(linkMetadata, null, 2))
          })
        });
        console.log('Share link saved successfully');
      } catch (linkSaveError) {
        console.error('Error saving share link:', linkSaveError);
        throw linkSaveError;
      }
  
      console.groupEnd();
  
      // Return folder details
      return {
        ...folderMetadata,
        adminPassword: folderAdminPassword,
        shareToken: token,
        shareableLink: `${window.location.origin}/share/${token}`
      };
    } catch (error) {
      console.error('Comprehensive Folder Creation Error:', {
        message: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to create folder: ${error.message}`);
    }
  }

  // Fixed version of the loadFolders method
  async loadFolders(includeAll = false) {
    const folders = [];
    
    try {
      // Load active folders
      const activeFiles = await this.makeRequest(`${this.baseUrl}/contents/data/folders`);
      if (Array.isArray(activeFiles)) {
        const activeFolders = await Promise.all(
          activeFiles
            .filter(file => file.name.endsWith('.json'))
            .map(file => this.loadData(`data/folders/${file.name}`))
        );
        folders.push(...activeFolders.filter(f => f !== null));
      }

      // Load silent folders if requested
      if (includeAll) {
        const silentFiles = await this.makeRequest(`${this.baseUrl}/contents/data/silent/folders`);
        if (Array.isArray(silentFiles)) {
          const silentFolders = await Promise.all(
            silentFiles
              .filter(file => file.name.endsWith('.json'))
              .map(file => this.loadData(`data/silent/folders/${file.name}`))
          );
          folders.push(...silentFolders.filter(f => f !== null));
        }
      }

      return folders.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
    } catch (error) {
      if (error.message.includes('404')) {
        return [];
      }
      throw error;
    }
  }

  // New method to save data with verification
  async saveDataWithVerification(path, data, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.saveData(path, data);
        
        // Verify the saved data
        const savedData = await this.loadData(path);
        if (JSON.stringify(savedData) !== JSON.stringify(data)) {
          throw new Error('Data verification failed');
        }
        
        return;
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // Modified createFile method with better error handling
  async createFile(path, content, message, ignoreErrors = false) {
    try {
      // Check if file exists first
      let existingFile;
      try {
        existingFile = await this.makeRequest(`${this.baseUrl}/contents/${path}`);
      } catch (error) {
        if (!error.message.includes('404')) {
          throw error;
        }
      }

      const base64Content = btoa(unescape(encodeURIComponent(content || '')));
      const requestBody = {
        message: message || `Create ${path}`,
        content: base64Content
      };

      // If file exists, include its SHA
      if (existingFile) {
        requestBody.sha = existingFile.sha;
      }

      await this.makeRequest(`${this.baseUrl}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify(requestBody)
      });
      
      return true;
    } catch (error) {
      if (ignoreErrors && (error.message.includes('404') || error.message.includes('409'))) {
        return false;
      }
      throw error;
    }
  }



  // Modified saveData method with better handling of new file creation
  async saveData(path, data) {
    try {
      let existingSha = null;

      try {
        // Try to get existing file
        const existing = await this.makeRequest(`${this.baseUrl}/contents/${path}`);
        if (existing && existing.sha) {
          existingSha = existing.sha;
          
          // Verify data integrity if updating existing file
          if (existing.content) {
            const existingData = this.decodeContent(existing.content);
            if (existingData.checksum && 
                existingData.checksum !== this.security.generateChecksum(existingData)) {
              throw new Error('Data integrity check failed');
            }
          }
        }
      } catch (error) {
        // 404 is expected for new files, but other errors should be thrown
        if (!error.message.includes('404')) {
          throw error;
        }
      }

      // Prepare the content
      let content = data;
      if (typeof data === 'object') {
        content = JSON.stringify(data, null, 2);
      }
      const base64Content = btoa(unescape(encodeURIComponent(content)));

      // Prepare request body
      const requestBody = {
        message: `Update ${path}`,
        content: base64Content
      };

      // Include SHA if updating existing file
      if (existingSha) {
        requestBody.sha = existingSha;
      }

      // Make the PUT request
      let retries = 3;
      let lastError = null;

      while (retries > 0) {
        try {
          const response = await this.makeRequest(`${this.baseUrl}/contents/${path}`, {
            method: 'PUT',
            body: JSON.stringify(requestBody)
          });
          return response;
        } catch (error) {
          lastError = error;
          // Don't retry on 409 (conflict) errors
          if (error.message.includes('409')) {
            break;
          }
          retries--;
          if (retries > 0) {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (lastError) {
        throw lastError;
      }

    } catch (error) {
      console.error('Error saving data:', error);
      throw error;
    }
  }

  // Load data with integrity check
  async loadData(path) {
    try {
      const response = await this.makeRequest(`${this.baseUrl}/contents/${path}`);
      const data = this.decodeContent(response.content);
      
      if (data.checksum && 
          data.checksum !== this.security.generateChecksum({...data, checksum: ''})) {
        throw new Error('Data integrity check failed');
      }
      
      return data;
    } catch (error) {
      if (error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  // Helper method to create directory structure
  async createDirectoryStructure(paths) {
    for (const path of paths) {
      try {
        await this.makeRequest(`${this.baseUrl}/contents/${path}`);
      } catch (error) {
        if (error.message.includes('404')) {
          await this.createFile(`${path}/.gitkeep`, '', `Initialize ${path}`);
        } else {
          throw error;
        }
      }
    }
  }

  // Save email with security measures
  async saveEmail(folderId, emailData, ip) {
    if (!await this.security.checkRateLimit(ip, 'CREATE_EMAIL')) {
      throw new Error('Rate limit exceeded for email creation');
    }

    const folder = await this.loadData(`data/folders/${folderId}.json`);
    if (!folder) {
      throw new Error('Folder not found');
    }

    const emailId = uuidv4();
    const password = this.security.generateSecurePassword();
    const { hash, salt } = this.security.hashPassword(password);

    const emailMetadata = {
      id: emailId,
      folderId,
      subject: emailData.subject,
      body: emailData.body,
      attachments: emailData.attachments || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creatorIP: CryptoJS.SHA256(ip).toString(),
      passwordHash: hash,
      passwordSalt: salt,
      likes: 0,
      checksum: ''
    };

    emailMetadata.checksum = this.security.generateChecksum(emailMetadata);

    await this.saveData(`data/emails/${folderId}/${emailId}.json`, emailMetadata);

    // Handle attachments
    if (emailData.attachments?.length > 0) {
      await Promise.all(emailData.attachments.map(async attachment => {
        const attachmentData = {
          ...attachment,
          checksum: this.security.generateChecksum(attachment)
        };
        await this.saveData(
          `data/attachments/${folderId}/${emailId}/${attachment.name}`,
          attachmentData
        );
      }));
    }

    return {
      ...emailMetadata,
      password // Return password only once
    };
  }

  async checkPathExists(path) {
    try {
      await this.makeRequest(`${this.baseUrl}/contents/${path}`);
      return true;
    } catch (error) {
      if (error.message.includes('404')) return false;
      throw error;
    }
  }

  // New method for saving data with retries
  async saveDataWithRetry(path, data, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.saveData(path, data);
        return;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
    throw lastError;
  }

  async deleteFolder(folderId, adminPassword) {
    // Input validation
    if (!folderId) {
      throw new Error('Folder ID is required');
    }
    if (!adminPassword) {
      throw new Error('Admin password is required');
    }
  
    // Extensive logging for debugging
    console.log(`Attempting to delete folder: ${folderId}`);
    console.log(`Admin Password Received: ${adminPassword}`);
  
    // First try silent folder, then active folder
    let folder = await this.loadData(`data/silent/folders/${folderId}.json`);
    let isSilent = true;
    let folderPath = `data/silent/folders/${folderId}.json`;
    
    if (!folder) {
      folder = await this.loadData(`data/folders/${folderId}.json`);
      if (!folder) {
        throw new Error('Folder not found');
      }
      isSilent = false;
      folderPath = `data/folders/${folderId}.json`;
    }
  
    // Detailed folder and password logging
    console.log('Folder Metadata:', JSON.stringify(folder, null, 2));
    console.log('Stored admin hash:', folder.adminHash);
    console.log('Stored admin salt:', folder.adminSalt);
  
    // Verify admin password using stored hash and salt
    const isValid = this.security.verifyPassword(
      adminPassword,
      folder.adminHash,
      folder.adminSalt
    );
    
    if (!isValid) {
      console.error('Password verification failed');
      console.error('Verification Details:', {
        providedPassword: adminPassword,
        storedHash: folder.adminHash,
        storedSalt: folder.adminSalt
      });
      throw new Error('Invalid folder admin password');
    }
  
    try {
      // Delete folder contents before deleting metadata
      await this.deleteFolderContentsWithRetry(folderId);
  
      // Delete folder metadata
      await this.deleteFile(folderPath);
  
      // Clean up share links with improved error handling
      try {
        const linkFiles = await this.makeRequest(`${this.baseUrl}/contents/data/metadata/links`);
        if (Array.isArray(linkFiles)) {
          const linkDeletionPromises = linkFiles
            .filter(file => file.name.endsWith('.json'))
            .map(async file => {
              try {
                const linkData = await this.loadData(`data/metadata/links/${file.name}`);
                if (linkData && linkData.folderId === folderId) {
                  await this.deleteFile(`data/metadata/links/${file.name}`);
                  console.log(`Deleted share link: ${file.name}`);
                }
              } catch (linkError) {
                console.error(`Error processing link file ${file.name}:`, linkError);
              }
            });
  
          const linkDeletionResults = await Promise.allSettled(linkDeletionPromises);
          
          // Log any failed link deletions
          const failedDeletions = linkDeletionResults.filter(
            result => result.status === 'rejected'
          );
          
          if (failedDeletions.length > 0) {
            console.warn('Some share links could not be deleted:', 
              failedDeletions.map(result => result.reason)
            );
          }
        }
      } catch (linkCleanupError) {
        if (!linkCleanupError.message.includes('404')) {
          console.error('Partial error cleaning up share links:', linkCleanupError);
        }
      }
  
      console.log(`Folder ${folderId} deleted successfully`);
      return true;
    } catch (error) {
      console.error('Comprehensive folder deletion error:', {
        message: error.message,
        stack: error.stack,
        folderId,
        isSilent,
        folderPath
      });
      throw error;
    }
  }
  
  // Enhanced method for deleting folder contents
  async deleteFolderContentsWithRetry(folderId, maxRetries = 3) {
    const paths = [
      `data/emails/${folderId}`,
      `data/attachments/${folderId}`,
      `data/emails/${folderId}/versions`
    ];
  
    for (const path of paths) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          await this.deletePath(path);
          break;
        } catch (error) {
          console.error(`Attempt ${attempt + 1} to delete ${path} failed:`, error);
          
          // If it's the last attempt and not a 404 error, throw
          if (attempt === maxRetries - 1 && !error.message.includes('404')) {
            throw error;
          }
  
          // Wait before retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
  }
  
  // Helper method for deleting a path with comprehensive checks
  async deletePath(path) {
    try {
      const response = await this.makeRequest(`${this.baseUrl}/contents/${path}`);
      
      if (Array.isArray(response)) {
        // It's a directory, delete all contents
        const deletionPromises = response.map(async item => {
          try {
            await this.deleteFile(`${path}/${item.name}`);
          } catch (itemError) {
            console.error(`Error deleting item ${item.name}:`, itemError);
          }
        });
  
        await Promise.allSettled(deletionPromises);
      } else {
        // It's a single file
        await this.deleteFile(path);
      }
    } catch (error) {
      // Only throw if it's not a 404 error (file/directory not found)
      if (!error.message.includes('404')) {
        throw error;
      }
    }
  }

  // Track likes on emails
  async updateEmailLikes(folderId, emailId, action = 'increment') {
    const emailPath = `data/emails/${folderId}/${emailId}.json`;
    const email = await this.loadData(emailPath);
    
    if (!email) {
      throw new Error('Email not found');
    }

    const updatedEmail = {
      ...email,
      likes: action === 'increment' ? email.likes + 1 : Math.max(0, email.likes - 1),
      updatedAt: new Date().toISOString()
    };

    // Update checksum
    updatedEmail.checksum = this.security.generateChecksum(updatedEmail);

    await this.saveData(emailPath, updatedEmail);
    return updatedEmail;
  }

  // Load email versions
  async loadEmailVersions(folderId, emailId) {
    try {
      const files = await this.makeRequest(
        `${this.baseUrl}/contents/data/emails/${folderId}/versions`
      );

      const versions = await Promise.all(
        files
          .filter(file => file.name.endsWith('.json'))
          .map(file => this.loadData(`data/emails/${folderId}/versions/${file.name}`))
      );

      return versions
        .filter(v => v && v.originalEmailId === emailId)
        .sort((a, b) => b.version - a.version);
    } catch (error) {
      if (error.message.includes('404')) {
        return [];
      }
      throw error;
    }
  }

  async searchCountries(query) {
    try {
      // Load all countries first
      const countriesResponse = await this.loadData('data/countries/inchi.json');
      
      if (!query.trim()) {
        return [];
      }

      // Filter countries based on query
      return countriesResponse.filter(country => 
        country.name.toLowerCase().includes(query.toLowerCase()) ||
        country.code.toLowerCase().includes(query.toLowerCase())
      );
    } catch (error) {
      console.error('Error searching countries:', error);
      return [];
    }
  }

  async loadCountryFolderVersions(countryCode, folderId) {
    try {
      const path = `data/countries/${countryCode.toLowerCase()}/${folderId}/versions`;
      const files = await this.makeRequest(`${this.baseUrl}/contents/${path}`);
      
      if (!Array.isArray(files)) {
        return [];
      }

      const versions = await Promise.all(
        files
          .filter(file => file.name.endsWith('.json'))
          .map(async file => {
            try {
              return await this.loadData(`${path}/${file.name}`);
            } catch (error) {
              console.warn(`Failed to load version ${file.name}:`, error);
              return null;
            }
          })
      );

      // Sort versions by usage count and likes
      return versions
        .filter(v => v !== null)
        .sort((a, b) => {
          if (a.usageCount !== b.usageCount) {
            return b.usageCount - a.usageCount;
          }
          return b.likes - a.likes;
        });
    } catch (error) {
      console.error('Error loading country folder versions:', error);
      return [];
    }
  }

  async createCountryFolderVersion(countryCode, folderId, emails) {
    try {
      const folderPath = `data/countries/${countryCode.toLowerCase()}/${folderId}`;
      await this.ensureDirectoryExists(`${folderPath}/versions`);

      // Load existing versions to determine next version number
      const existingVersions = await this.loadCountryFolderVersions(countryCode, folderId);
      const versionNumber = existingVersions.length + 1;

      const versionData = {
        id: uuidv4(),
        version: versionNumber,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        emails,
        likes: 0,
        dislikes: 0,
        usageCount: 0,
        checksum: ''
      };

      // Add checksum
      versionData.checksum = this.security.generateChecksum(versionData);

      // Save version
      await this.saveData(
        `${folderPath}/versions/${versionData.id}.json`,
        versionData
      );

      return versionData;
    } catch (error) {
      console.error('Error creating country folder version:', error);
      throw error;
    }
  }
  async updateVersionStats(countryCode, folderId, versionId, action) {
    try {
      const path = `data/countries/${countryCode.toLowerCase()}/${folderId}/versions/${versionId}.json`;
      const version = await this.loadData(path);

      if (!version) {
        throw new Error('Version not found');
      }

      // Update stats based on action
      switch (action) {
        case 'like':
          version.likes += 1;
          break;
        case 'dislike':
          version.dislikes += 1;
          break;
        case 'use':
          version.usageCount += 1;
          break;
        default:
          throw new Error('Invalid action');
      }

      version.updatedAt = new Date().toISOString();
      version.checksum = this.security.generateChecksum(version);

      await this.saveData(path, version);
      return version;
    } catch (error) {
      console.error('Error updating version stats:', error);
      throw error;
    }
  }

  async createCountryFolder(countryCode, folderName) {
    try {
      const folderId = uuidv4();
      const folderPath = `data/countries/${countryCode.toLowerCase()}/${folderId}`;
      
      await this.ensureDirectoryExists(folderPath);
      await this.ensureDirectoryExists(`${folderPath}/versions`);

      const folderData = {
        id: folderId,
        name: folderName,
        countryCode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        checksum: ''
      };

      folderData.checksum = this.security.generateChecksum(folderData);

      await this.saveData(
        `${folderPath}/folder.json`,
        folderData
      );

      return folderData;
    } catch (error) {
      console.error('Error creating country folder:', error);
      throw error;
    }
  }

  async loadCountryFolders(countryCode) {
    try {
      const path = `data/countries/${countryCode.toLowerCase()}`;
      const files = await this.makeRequest(`${this.baseUrl}/contents/${path}`);
      
      if (!Array.isArray(files)) {
        return [];
      }

      const folders = await Promise.all(
        files
          .filter(file => file.type === 'dir')
          .map(async folder => {
            try {
              return await this.loadData(`${path}/${folder.name}/folder.json`);
            } catch (error) {
              console.warn(`Failed to load folder ${folder.name}:`, error);
              return null;
            }
          })
      );

      return folders
        .filter(f => f !== null)
        .sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    } catch (error) {
      console.error('Error loading country folders:', error);
      return [];
    }
  }

  // Helper method to get total stats for a version
  async getVersionStats(countryCode, folderId, versionId) {
    try {
      const version = await this.loadData(
        `data/countries/${countryCode.toLowerCase()}/${folderId}/versions/${versionId}.json`
      );

      if (!version) {
        throw new Error('Version not found');
      }

      return {
        likes: version.likes,
        dislikes: version.dislikes,
        usageCount: version.usageCount,
        ratio: version.likes / (version.likes + version.dislikes) || 0
      };
    } catch (error) {
      console.error('Error getting version stats:', error);
      throw error;
    }
  }

  // Create email version (for modifications without password)
  async createEmailVersion(folderId, emailId, modifications) {
    const originalEmail = await this.loadData(`data/emails/${folderId}/${emailId}.json`);
    if (!originalEmail) {
      throw new Error('Original email not found');
    }

    const versionId = uuidv4();
    const emailVersion = {
      ...originalEmail,
      id: versionId,
      originalEmailId: emailId,
      ...modifications,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: (originalEmail.version || 1) + 1,
      likes: 0
    };

    // Update checksum
    emailVersion.checksum = this.security.generateChecksum(emailVersion);

    await this.saveData(
      `data/emails/${folderId}/versions/${versionId}.json`, 
      emailVersion
    );

    return emailVersion;
  }

  async loadEmails(folderId) {
    try {
      // First check if folder exists to avoid unnecessary calls
      const folderExists = await this.makeRequest(
        `${this.baseUrl}/contents/data/emails/${folderId}`
      ).catch(error => {
        if (error.message.includes('404')) {
          return false;
        }
        throw error;
      });
  
      // If folder doesn't exist yet, return empty array
      if (!folderExists) {
        return [];
      }
  
      // If folder exists and is not an array (not a directory), return empty
      if (!Array.isArray(folderExists)) {
        return [];
      }
  
      // Now safely get the email files
      const emailFiles = folderExists.filter(file => file.name.endsWith('.json'));
      
      if (emailFiles.length === 0) {
        return [];
      }
  
      // Load all emails in parallel
      const emails = await Promise.all(
        emailFiles.map(async file => {
          try {
            return await this.loadData(`data/emails/${folderId}/${file.name}`);
          } catch (error) {
            console.warn(`Failed to load email ${file.name}:`, error);
            return null;
          }
        })
      );
  
      return emails.filter(email => email !== null);
    } catch (error) {
      console.warn(`Error loading emails for folder ${folderId}:`, error);
      return [];
    }
  }

  // Load folder by share token
  async loadFolderByShareToken(token) {
    try {
      const linkData = await this.loadData(`data/metadata/links/${token}.json`);
      if (!linkData) {
        throw new Error('Invalid share token');
      }

      const folder = await this.loadData(`data/folders/${linkData.folderId}.json`) ||
                    await this.loadData(`data/silent/folders/${linkData.folderId}.json`);

      if (!folder) {
        throw new Error('Folder not found');
      }

      return {
        ...folder,
        shareMetadata: JSON.parse(
          CryptoJS.AES.decrypt(linkData.encryptedData, token).toString(CryptoJS.enc.Utf8)
        )
      };
    } catch (error) {
      console.error('Error loading shared folder:', error);
      throw new Error('Invalid share token');
    }
  }

  // Check folder approval
  async checkFolderApproval(folderId) {
    const silentFolder = await this.loadData(`data/silent/folders/${folderId}.json`);
    if (!silentFolder) {
      return null;
    }
  
    const TIME_TO_APPROVE = 24 * 60 * 60 * 1000; // 24 hours
    const MIN_INTERACTIONS = 5; // Minimum interactions required
  
    const now = new Date().getTime();
    const folderAge = now - new Date(silentFolder.createdAt).getTime();
    
    // Get folder interactions (likes, emails, etc.)
    const interactions = await this.getFolderInteractions(folderId);
  
    if (folderAge >= TIME_TO_APPROVE || interactions >= MIN_INTERACTIONS) {
      // Move to active folders
      await this.saveData(`data/folders/${folderId}.json`, {
        ...silentFolder,
        status: FOLDER_STATUS.ACTIVE,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
  
      // Delete from silent folders
      await this.deleteFile(`data/silent/folders/${folderId}.json`);
      return await this.loadData(`data/folders/${folderId}.json`);
    }
  
    return silentFolder;
  }

  // Get folder interactions count
  async getFolderInteractions(folderId) {
    let interactionCount = 0;
  
    try {
      // Count emails
      const emails = await this.loadEmails(folderId);
      interactionCount += emails.length;
  
      // Count likes on emails
      const emailLikes = emails.reduce((sum, email) => sum + (email.likes || 0), 0);
      interactionCount += emailLikes;
  
      // Count versions
      const versions = await Promise.all(
        emails.map(email => this.loadEmailVersions(folderId, email.id))
      );
      interactionCount += versions.flat().length;
  
    } catch (error) {
      console.error('Error counting interactions:', error);
    }
  
    return interactionCount;
  }

  // Fork a folder
  async forkFolder(folderId, newOwnerPassword) {
    const folder = await this.loadData(`data/folders/${folderId}.json`);
    const { hash: newAdminHash, salt: newAdminSalt } = this.security.hashPassword(newOwnerPassword);

    const forkedFolder = {
      ...folder,
      id: uuidv4(),
      forkedFrom: folderId,
      forkedAt: new Date().toISOString(),
      adminHash: newAdminHash,
      adminSalt: newAdminSalt,
      status: FOLDER_STATUS.SILENT
    };

    await this.saveData(
      `data/silent/folders/${forkedFolder.id}.json`,
      forkedFolder
    );

    return {
      ...forkedFolder,
      adminPassword: newOwnerPassword
    };
  }

  // Delete content with authentication
  async deleteContent(path, password, adminOverride = false) {
    const content = await this.loadData(path);
    if (!content) {
      throw new Error('Content not found');
    }

    // Allow admin override with admin password
    if (adminOverride) {
      const adminHash = import.meta.env.VITE_ADMIN_PASSWORD_HASH;
      const adminSalt = import.meta.env.VITE_ADMIN_PASSWORD_SALT;
      
      if (!this.security.verifyPassword(password, adminHash, adminSalt)) {
        throw new Error('Invalid admin password');
      }
    } else {
      // Verify content creator's password
      if (!this.security.verifyPassword(
        password,
        content.passwordHash,
        content.passwordSalt
      )) {
        throw new Error('Invalid password');
      }
    }

    try {
      const file = await this.makeRequest(`${this.baseUrl}/contents/${path}`);
      await this.makeRequest(`${this.baseUrl}/contents/${path}`, {
        method: 'DELETE',
        body: JSON.stringify({
          message: `Delete ${path}`,
          sha: file.sha
        })
      });
    } catch (error) {
      console.error('Error deleting content:', error);
      throw error;
    }
  }

  // Handle folder interaction
  async handleInteraction(folderId) {
    const folder = await this.loadData(`data/silent/folders/${folderId}.json`);
    if (folder && folder.status === FOLDER_STATUS.SILENT) {
      await this.checkFolderApproval(folderId);
    }
  }

  async deleteFile(path) {
    try {
      const file = await this.makeRequest(`${this.baseUrl}/contents/${path}`);
      await this.makeRequest(`${this.baseUrl}/contents/${path}`, {
        method: 'DELETE',
        body: JSON.stringify({
          message: `Delete ${path}`,
          sha: file.sha
        })
      });
    } catch (error) {
      if (!error.message.includes('404')) {
        console.error('Error deleting file:', error);
        throw error;
      }
    }
  }

  // Search emails across folders
  async searchEmails(query, includeVersions = false) {
    const folders = await this.loadFolders();
    const results = [];

    for (const folder of folders) {
      try {
        const emails = await this.loadEmails(folder.id);
        const matchingEmails = emails.filter(email =>
          email.subject.toLowerCase().includes(query.toLowerCase()) ||
          email.body.toLowerCase().includes(query.toLowerCase())
        );

        if (includeVersions) {
          for (const email of matchingEmails) {
            const versions = await this.loadEmailVersions(folder.id, email.id);
            const matchingVersions = versions.filter(version =>
              version.subject.toLowerCase().includes(query.toLowerCase()) ||
              version.body.toLowerCase().includes(query.toLowerCase())
            );
            results.push(
              ...matchingVersions.map(version => ({
                ...version,
                folderName: folder.name,
                isVersion: true
              }))
            );
          }
        }

        results.push(
          ...matchingEmails.map(email => ({
            ...email,
            folderName: folder.name
          }))
        );
      } catch (error) {
        console.error(`Error searching folder ${folder.id}:`, error);
      }
    }

    return results.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }
  
  // Blacklist management methods
  async isIPBlacklisted(ip) {
    const ipHash = CryptoJS.SHA256(ip).toString();
    try {
      const blacklist = await this.loadData('data/blacklist/ips.json');
      return blacklist && blacklist.ips.includes(ipHash);
    } catch (error) {
      if (error.message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  async addToBlacklist(ip, evidence) {
    const ipHash = CryptoJS.SHA256(ip).toString();
    let blacklist;

    try {
      blacklist = await this.loadData('data/blacklist/ips.json') || { 
        ips: [], 
        entries: {},
        pendingReports: {} 
      };

      if (!blacklist.pendingReports[ipHash]) {
        blacklist.pendingReports[ipHash] = {
          reports: [],
          firstReportedAt: new Date().toISOString()
        };
      }

      blacklist.pendingReports[ipHash].reports.push({
        timestamp: new Date().toISOString(),
        evidence
      });

      const REPORTS_THRESHOLD = 3;
      const TIME_WINDOW = 7 * 24 * 60 * 60 * 1000; // 7 days

      const recentReports = blacklist.pendingReports[ipHash].reports.filter(report => {
        const reportAge = Date.now() - new Date(report.timestamp).getTime();
        return reportAge <= TIME_WINDOW;
      });

      if (recentReports.length >= REPORTS_THRESHOLD && !blacklist.ips.includes(ipHash)) {
        blacklist.ips.push(ipHash);
        blacklist.entries[ipHash] = {
          timestamp: new Date().toISOString(),
          reports: recentReports
        };
        delete blacklist.pendingReports[ipHash];
        this.security.blacklistedIPs.add(ip);
      }

      await this.saveData('data/blacklist/ips.json', blacklist);
    } catch (error) {
      console.error('Error updating blacklist:', error);
      throw error;
    }
  }

  async getSuspiciousIPs() {
    try {
      const files = await this.makeRequest(
        `${this.baseUrl}/contents/data/maliciousips`
      );

      const suspiciousIPs = await Promise.all(
        files
          .filter(file => file.name.endsWith('.json'))
          .map(file => this.loadData(`data/maliciousips/${file.name}`))
      );

      return suspiciousIPs
        .filter(ip => ip !== null)
        .sort((a, b) => b.attempts - a.attempts);
    } catch (error) {
      if (error.message.includes('404')) {
        return [];
      }
      throw error;
    }
  }

  // Flag suspicious IP activity
  async flagSuspiciousIP(ip, action) {
    const ipHash = CryptoJS.SHA256(ip).toString();
    const suspiciousActivity = {
      ipHash,
      action,
      timestamp: new Date().toISOString(),
      attempts: this.security.rateLimitCache.get(`${ip}:${action}`).length
    };

    await this.saveData(
      `data/maliciousips/${ipHash}.json`,
      suspiciousActivity
    );
  }
}
// Create the singleton instance first
const githubStorageInstance = new GitHubStorage();

// Then export everything together
export { githubStorageInstance as githubStorage, GitHubStorage, FOLDER_STATUS };