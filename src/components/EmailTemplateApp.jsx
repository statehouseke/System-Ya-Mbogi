import React, { useState, useEffect, useCallback } from 'react';
import { Moon, Sun, Loader, Search, Globe, ThumbsUp, ThumbsDown, Mail, Plus, X } from 'lucide-react';
import { FolderList } from './FolderList';
import { EmailList } from './EmailList';
import { useFolders, FolderProvider } from '../context/FolderContext';
import { Alert, AlertDescription } from './ui/alert';
import { githubStorage } from '../utils/githubStorage';

// Custom debounce hook
const useDebounce = (callback, delay) => {
  const [timeoutId, setTimeoutId] = useState(null);

  useEffect(() => {
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [timeoutId]);

  return useCallback((...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    setTimeoutId(setTimeout(() => callback(...args), delay));
  }, [callback, delay, timeoutId]);
};

// Reusable UI Components
const Input = ({ className = '', ...props }) => (
  <input
    className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium 
                placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 
                focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed 
                disabled:opacity-50 ${className}`}
    {...props}
  />
);

const Button = ({ children, variant = 'default', className = '', ...props }) => {
  const baseClasses = 'px-4 py-2 rounded-lg transition-colors';
  const variants = {
    default: 'bg-blue-500 text-white hover:bg-blue-600',
    outline: 'border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
    ghost: 'hover:bg-gray-100 dark:hover:bg-gray-800',
    danger: 'bg-red-500 text-white hover:bg-red-600'
  };

  return (
    <button 
      className={`${baseClasses} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

// Email Input Component
const EmailInput = ({ emails, setEmails }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.toLowerCase());
  };

  const handleAddEmail = () => {
    if (!email) {
      setError('Email is required');
      return;
    }
    if (!validateEmail(email)) {
      setError('Invalid email format');
      return;
    }
    if (emails.includes(email)) {
      setError('Email already exists in the list');
      return;
    }

    setEmails([...emails, email]);
    setEmail('');
    setError('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEmail();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            onKeyPress={handleKeyPress}
            placeholder="Add email address"
            className={error ? 'border-red-500' : ''}
          />
          {error && (
            <p className="text-sm text-red-500 mt-1">{error}</p>
          )}
        </div>
        <Button onClick={handleAddEmail} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      <div className="space-y-2">
        {emails.map((email, index) => (
          <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <Mail className="h-4 w-4 text-gray-500" />
            <span className="flex-1">{email}</span>
            <button
              onClick={() => setEmails(emails.filter((_, i) => i !== index))}
              className="text-red-500 hover:text-red-600"
              aria-label="Remove email"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// Country Search Component
const CountrySearch = ({ onSelectCountry }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchCountries = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await githubStorage.searchCountries(query);
      setSearchResults(response);
    } catch (error) {
      console.error('Error searching countries:', error);
    } finally {
      setLoading(false);
    }
  };

  const debouncedSearch = useDebounce(searchCountries, 300);

  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    debouncedSearch(query);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
        <Input
          placeholder="Search countries..."
          value={searchQuery}
          onChange={handleSearch}
          className="pl-8"
        />
      </div>
      
      {loading ? (
        <div className="flex justify-center">
          <Loader className="animate-spin h-6 w-6" />
        </div>
      ) : (
        <div className="space-y-2">
          {searchResults.map((country) => (
            <button
              key={country.code}
              onClick={() => onSelectCountry(country)}
              className="w-full p-3 text-left border rounded-lg hover:bg-gray-50 
                       dark:hover:bg-gray-800 flex items-center gap-2"
            >
              <Globe className="h-4 w-4" />
              <span>{country.name}</span>
              <span className="text-sm text-gray-500">({country.code})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Country Folder Component
const CountryFolder = ({ country }) => {
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [emails, setEmails] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadFolders = async () => {
      if (!country?.code) return;
      
      try {
        setLoading(true);
        const data = await githubStorage.loadCountryFolders(country.code);
        setFolders(data || []);
      } catch (error) {
        console.error('Error loading folders:', error);
        setError('Failed to load folders');
      } finally {
        setLoading(false);
      }
    };

    loadFolders();
  }, [country?.code]);

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      if (!newFolderName.trim()) {
        setError('Folder name is required');
        return;
      }
      if (emails.length === 0) {
        setError('At least one email address is required');
        return;
      }

      const newFolder = await githubStorage.createCountryFolder(
        country.code,
        newFolderName.trim(),
        emails
      );

      setFolders(prev => [...prev, newFolder]);
      setNewFolderName('');
      setEmails([]);
      setIsCreating(false);
      setSelectedFolderId(newFolder.id);
    } catch (error) {
      console.error('Error creating folder:', error);
      setError('Failed to create folder');
    }
  };

  if (!country) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Select a country to view folders
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{country.name} Email Lists</h2>
        <Button onClick={() => setIsCreating(true)}>
          Create New List
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="my-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isCreating && (
        <form onSubmit={handleCreateFolder} className="space-y-4 p-4 border rounded-lg">
          <div>
            <label className="block text-sm font-medium mb-1">List Name</label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Enter list name (e.g., Parliament Members)"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Email Addresses</label>
            <EmailInput emails={emails} setEmails={setEmails} />
          </div>

          <div className="flex gap-2">
            <Button type="submit">Create</Button>
            <Button 
              type="button" 
              variant="outline"
              onClick={() => {
                setIsCreating(false);
                setNewFolderName('');
                setEmails([]);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="grid gap-4">
        {folders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No email lists found. Create one to get started.
          </div>
        ) : (
          folders.map(folder => (
            <div 
              key={folder.id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors
                ${selectedFolderId === folder.id 
                  ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              onClick={() => setSelectedFolderId(folder.id)}
            >
              <div className="flex justify-between items-center">
                <h3 className="font-medium">{folder.name}</h3>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">
                    {folder.emails?.length || 0} emails
                  </span>
                  <span className="text-sm text-gray-500">
                    Created {new Date(folder.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              
              {selectedFolderId === folder.id && folder.emails?.length > 0 && (
                <div className="mt-4 space-y-2">
                  {folder.emails.map((email, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <Mail className="h-4 w-4 text-gray-500" />
                      <span>{email}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Main App Component
const AppContent = () => {
  const { loading, error } = useFolders();
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [view, setView] = useState('folders');

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-2">
          <Loader className="animate-spin h-8 w-8 text-blue-500" />
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark:bg-gray-900 dark:text-white' : 'bg-gray-50'}`}>
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Email Template System</h1>
            <div className="flex gap-2">
              <Button
                variant={view === 'folders' ? 'default' : 'outline'}
                onClick={() => setView('folders')}
              >
                Folders
              </Button>
              <Button
                variant={view === 'countries' ? 'default' : 'outline'}
                onClick={() => setView('countries')}
              >
                Countries
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full"
          >
            {darkMode ? <Sun size={24} /> : <Moon size={24} />}
          </Button>
        </div>
      </header>

      {error && (
        <Alert variant="destructive" className="m-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <main className="flex h-[calc(100vh-4rem)]">
        <div className="w-80 border-r dark:border-gray-700">
          {view === 'folders' ? (
            <FolderList
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
            />
          ) : (
            <CountrySearch onSelectCountry={setSelectedCountry} />
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {view === 'folders' && selectedFolder ? (
            <EmailList folder={selectedFolder} />
          ) : view === 'countries' ? (
            <CountryFolder country={selectedCountry} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              {view === 'folders' 
                ? 'Select a folder to get started'
                : 'Search and select a country to view email lists'}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export const EmailTemplateApp = () => {
  return (
    <FolderProvider>
      <AppContent />
    </FolderProvider>
  );
};

export default EmailTemplateApp;