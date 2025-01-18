//folderlist component
import React, { useState, useEffect } from 'react';
import { Folder, Plus, X, AlertTriangle, Lock, Share2 } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { useFolders, FolderProvider } from '../context/FolderContext';
import { ShareUrl } from './ShareUrl';
import { githubStorage } from '../utils/githubStorage';
import CryptoJS from 'crypto-js';

export const FolderList = ({ selectedFolder, onSelectFolder }) => {
  const { folders, addFolder, deleteFolder } = useFolders();
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderData, setNewFolderData] = useState({ name: '', targetEmail: '' });
  const [error, setError] = useState(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [selectedFolderForShare, setSelectedFolderForShare] = useState(null);
  const [savedPasswords, setSavedPasswords] = useState({});

  // Load saved passwords from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('folderPasswords');
      if (stored) {
        const decrypted = CryptoJS.AES.decrypt(
          stored, 
          'folderPasswords', 
          { 
            mode: CryptoJS.mode.CBC, 
            padding: CryptoJS.pad.Pkcs7 
          }
        ).toString(CryptoJS.enc.Utf8);
  
        const parsedPasswords = JSON.parse(decrypted);
        console.log('Retrieved Passwords:', {
          passwords: Object.keys(parsedPasswords).map(key => ({
            id: key,
            passwordLength: parsedPasswords[key].length,
            charCodes: Array.from(parsedPasswords[key]).map(char => char.charCodeAt(0))
          }))
        });
  
        setSavedPasswords(parsedPasswords);
      }
    } catch (error) {
      console.error('Error loading saved passwords:', error);
    }
  }, []);

  // Save passwords to localStorage
  const savePasswordToStorage = (folderId, password) => {
    try {
      console.log('Saving Password with Extra Checks:', {
        folderId,
        password,
        type: typeof password,
        charCodes: Array.from(password).map(char => char.charCodeAt(0))
      });
  
      const updated = { ...savedPasswords, [folderId]: password };
      setSavedPasswords(updated);
      
      // Use a more robust encryption method
      const encryptedPasswords = CryptoJS.AES.encrypt(
        JSON.stringify(updated), 
        'folderPasswords', 
        { 
          mode: CryptoJS.mode.CBC, 
          padding: CryptoJS.pad.Pkcs7 
        }
      ).toString();
  
      localStorage.setItem('folderPasswords', encryptedPasswords);
    } catch (error) {
      console.error('Error saving password:', error);
    }
  };

  // Remove password from localStorage
  const removePasswordFromStorage = (folderId) => {
    try {
      const updated = { ...savedPasswords };
      delete updated[folderId];
      setSavedPasswords(updated);
      const encrypted = CryptoJS.AES.encrypt(
        JSON.stringify(updated),
        'folderPasswords'
      ).toString();
      localStorage.setItem('folderPasswords', encrypted);
    } catch (error) {
      console.error('Error removing password:', error);
    }
  };

  const handleCreateFolder = async (e) => {
      e.preventDefault();
      setError(null);

      if (!newFolderData.name || !newFolderData.targetEmail) {
        setError('Both folder name and target email are required');
        return;
      }

      try {
        const ip = await fetch('https://api.ipify.org?format=json')
          .then(res => res.json())
          .then(data => data.ip);

        const result = await addFolder(newFolderData, ip);
        
        // Save the unhashed admin password
        savePasswordToStorage(result.id, result.adminPassword);
        
        // Show the admin password to the user
        setAdminPassword(result.adminPassword);
        setShowAdminPassword(true);
        
        // Reset form
        setNewFolderData({ name: '', targetEmail: '' });
        setIsCreating(false);

        // Show share URL after folder creation
        setSelectedFolderForShare(result);
        setShowShare(true);
      } catch (error) {
        setError(error.message);
      }
  };

  const handleDeleteFolder = async (folder) => {
    try {
      const savedPassword = savedPasswords[folder.id];
      
      console.log('Saved Password:', savedPassword);
      console.log('Folder ID:', folder.id);
      console.log('Saved Passwords Object:', savedPasswords);
  
      if (savedPassword) {
        try {
          await deleteFolder(folder.id, savedPassword);
          removePasswordFromStorage(folder.id);
          return;
        } catch (error) {
          console.error('Delete failed with saved password:', error);
          console.error('Full error details:', error.stack);
        }
      }
  
      const password = prompt('Enter folder admin password to delete:');
      if (!password) return;
  
      await deleteFolder(folder.id, password);
    } catch (error) {
      console.error('Full delete error:', error);
      setError(error.message);
    }
  };

  const handlePasswordClose = () => {
    setShowAdminPassword(false);
    setAdminPassword('');
  };

  const handleShare = (e, folder) => {
    e.stopPropagation();
    setSelectedFolderForShare(folder);
    setShowShare(true);
  };

  return (
    <div className="w-64 bg-gray-50 dark:bg-gray-800 p-4 border-r dark:border-gray-700 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Folders</h2>
        <button
          onClick={() => setIsCreating(true)}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
          title="Create new folder"
        >
          <Plus size={20} />
        </button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showAdminPassword && (
        <Alert className="mb-4 bg-yellow-50 border-yellow-200">
          <Lock className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <div className="font-bold mb-1">IMPORTANT: Save this password!</div>
            <div className="text-sm break-all">{adminPassword}</div>
            <div className="text-xs mt-1 text-yellow-600">
              This password is required for folder management and cannot be recovered.
            </div>
            <button
              onClick={handlePasswordClose}
              className="mt-2 w-full text-center bg-yellow-100 hover:bg-yellow-200 p-1 rounded text-sm"
            >
              I have saved the password
            </button>
          </AlertDescription>
        </Alert>
      )}

      {showShare && selectedFolderForShare && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-2">Share this folder</h3>
          <ShareUrl folder={selectedFolderForShare} />
        </div>
      )}

      {isCreating && (
        <form onSubmit={handleCreateFolder} className="mb-4">
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderData.name}
              onChange={(e) => {
                setError(null);
                setNewFolderData(prev => ({ ...prev, name: e.target.value }));
              }}
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            />
            <input
              type="email"
              placeholder="Target email"
              value={newFolderData.targetEmail}
              onChange={(e) => {
                setError(null);
                setNewFolderData(prev => ({ ...prev, targetEmail: e.target.value }));
              }}
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setError(null);
                }}
                className="flex-1 bg-gray-200 dark:bg-gray-700 p-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {folders.map(folder => (
          <div
            key={folder.id}
            className={`flex items-center justify-between p-2 rounded cursor-pointer ${
              selectedFolder?.id === folder.id
                ? 'bg-blue-100 dark:bg-blue-900'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center gap-2" onClick={() => onSelectFolder(folder)}>
              <Folder size={20} />
              <span>{folder.name}</span>
              {folder.status === 'silent' && (
                <span className="text-xs bg-yellow-200 text-yellow-800 px-1 rounded">
                  Pending
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => handleShare(e, folder)}
                className="p-1 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-full"
                title="Share folder"
              >
                <Share2 size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteFolder(folder);
                }}
                className="p-1 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-full"
                title="Delete folder"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};