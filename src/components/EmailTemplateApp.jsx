import React, { useState, useEffect, useCallback } from 'react';
import { Moon, Sun, Loader, Search, Globe, ThumbsUp, ThumbsDown, Mail } from 'lucide-react';
import { FolderList } from './FolderList';
import { EmailList } from './EmailList';
import { useFolders, FolderProvider } from '../context/FolderContext';
import { Alert, AlertDescription } from './ui/alert';
import { githubStorage } from '../utils/githubStorage';

// Custom debounce hook
const useDebounce = (callback, delay) => {
  const [timeoutId, setTimeoutId] = useState(null);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [timeoutId]);

  return useCallback((...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    
    setTimeoutId(
      setTimeout(() => {
        callback(...args);
      }, delay)
    );
  }, [callback, delay, timeoutId]);
};

// UI Components
const Input = ({ className, ...props }) => (
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
    ghost: 'hover:bg-gray-100 dark:hover:bg-gray-800'
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

const VersionList = ({ versions, onUseVersion, onLikeVersion }) => {
  const sortedVersions = [...versions].sort((a, b) => {
    if (a.usageCount !== b.usageCount) {
      return b.usageCount - a.usageCount;
    }
    return b.likes - a.likes;
  });

  return (
    <div className="space-y-4">
      {sortedVersions.map((version) => (
        <div key={version.id} className="border rounded-lg p-4 bg-white dark:bg-gray-800">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium">Version {version.version}</h4>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost"
                onClick={() => onLikeVersion(version.id, 'like')}
                className="p-1"
              >
                <ThumbsUp className="h-4 w-4" />
                <span className="ml-1">{version.likes}</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => onLikeVersion(version.id, 'dislike')}
                className="p-1"
              >
                <ThumbsDown className="h-4 w-4" />
                <span className="ml-1">{version.dislikes}</span>
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            {version.emails.map((email, idx) => (
              <div key={idx} className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {email}
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between items-center">
            <span className="text-sm text-gray-500">
              Used {version.usageCount} times
            </span>
            <Button onClick={() => onUseVersion(version)}>
              Use List
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

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

const CountryFolder = ({ country, folder }) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadVersions = async () => {
      try {
        const data = await githubStorage.loadCountryFolderVersions(
          country.code,
          folder.id
        );
        setVersions(data);
      } catch (error) {
        console.error('Error loading versions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadVersions();
  }, [country.code, folder.id]);

  const handleUseVersion = async (version) => {
    try {
      // Implementation for using a version
      console.log('Using version:', version);
    } catch (error) {
      console.error('Error using version:', error);
    }
  };

  const handleLikeVersion = async (versionId, action) => {
    try {
      // Implementation for liking/disliking a version
      console.log('Version action:', { versionId, action });
    } catch (error) {
      console.error('Error updating version:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">
          {folder.name} - {country.name}
        </h3>
        <Button variant="outline" onClick={() => {}}>
          Add New Version
        </Button>
      </div>
      <VersionList
        versions={versions}
        onUseVersion={handleUseVersion}
        onLikeVersion={handleLikeVersion}
      />
    </div>
  );
};

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

        <div className="flex-1">
          {view === 'folders' && selectedFolder ? (
            <EmailList folder={selectedFolder} />
          ) : view === 'countries' && selectedCountry ? (
            <CountryFolder country={selectedCountry} folder={selectedFolder} />
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