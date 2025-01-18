//shared folder page
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { githubStorage } from '../utils/githubStorage';
import { EmailList } from './EmailList';
import { Alert, AlertDescription } from './ui/alert';
import { Loader, Home } from 'lucide-react';

export const ShareFolderPage = () => {
  const { token } = useParams();
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadFolder = async () => {
      try {
        const folderData = await githubStorage.loadFolderByShareToken(token);
        setFolder(folderData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadFolder();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {folder ? folder.name : 'Shared Folder'}
            </h1>
            {folder && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Created {new Date(folder.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>
          <Link 
            to="/"
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            <Home size={18} />
            <span>Home</span>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !folder ? (
          <Alert>
            <AlertDescription>Folder not found</AlertDescription>
          </Alert>
        ) : (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
            <EmailList folder={folder} isSharedView={true} />
          </div>
        )}
      </main>
    </div>
  );
};