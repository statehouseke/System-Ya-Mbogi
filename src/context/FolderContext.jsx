import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { githubStorage } from '../utils/githubStorage';
import { initializeStorage } from '../utils/initStorage';

const FolderContext = createContext(undefined);

function useFolders() {
  const context = useContext(FolderContext);
  if (context === undefined) {
    throw new Error('useFolders must be used within a FolderProvider');
  }
  return context;
}

function FolderProvider({ children }) {
  const [state, setState] = useState({
    folders: [],
    loading: true,
    error: null,
    initialized: false
  });

  // Batch state updates for better performance
  const updateState = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Load folders without initializing storage
  const loadFoldersOnly = useCallback(async () => {
    try {
      const folders = await githubStorage.loadFolders(true);
      updateState({ folders: folders || [], loading: false });
    } catch (err) {
      console.error('Error loading folders:', err);
      updateState({ error: err.message, loading: false });
    }
  }, [updateState]);

  // Main initialization effect
  useEffect(() => {
    let mounted = true;

    const initializeApp = async () => {
      try {
        // Validate environment variables first
        if (!import.meta.env.VITE_GITHUB_TOKEN || 
            !import.meta.env.VITE_GITHUB_USERNAME || 
            !import.meta.env.VITE_REPO_NAME) {
          throw new Error('Missing required environment variables');
        }

        // Initialize storage in background
        initializeStorage().catch(console.error);
        
        // Load folders immediately
        if (mounted) await loadFoldersOnly();

        // Mark as initialized
        if (mounted) updateState({ initialized: true });
      } catch (err) {
        console.error('Error in initialization:', err);
        if (mounted) updateState({ error: err.message, loading: false });
      }
    };

    initializeApp();
    return () => { mounted = false; };
  }, [loadFoldersOnly, updateState]);

  // Add folder
  const addFolder = useCallback(async (folderData, ip) => {
    try {
      const newFolder = await githubStorage.createFolder(folderData, ip);
      updateState({
        folders: [...state.folders, { ...newFolder, emails: [], emailsLoaded: true }]
      });
      return newFolder;
    } catch (err) {
      console.error('Error creating folder:', err);
      throw err;
    }
  }, [state.folders, updateState]);

  // Load emails for a folder
  const loadFolderEmails = useCallback(async (folderId) => {
    // Skip if already loaded
    const folder = state.folders.find(f => f.id === folderId);
    if (folder?.emailsLoaded) return folder.emails;

    try {
      const emails = await githubStorage.loadEmails(folderId);
      updateState({
        folders: state.folders.map(folder => 
          folder.id === folderId 
            ? { ...folder, emails, emailsLoaded: true }
            : folder
        )
      });
      return emails;
    } catch (err) {
      console.error('Error loading emails:', err);
      throw err;
    }
  }, [state.folders, updateState]);

  // Add email
  const addEmail = useCallback(async (folderId, emailData, ip) => {
    try {
      const newEmail = await githubStorage.saveEmail(folderId, emailData, ip);
      updateState({
        folders: state.folders.map(folder => 
          folder.id === folderId 
            ? {
                ...folder,
                emails: [...(folder.emails || []), newEmail],
                emailsLoaded: true
              }
            : folder
        )
      });
      return newEmail;
    } catch (err) {
      console.error('Error adding email:', err);
      throw err;
    }
  }, [state.folders, updateState]);

  // Delete email
  const deleteEmail = useCallback(async (folderId, emailId, password) => {
    try {
      await githubStorage.deleteContent(`data/emails/${folderId}/${emailId}.json`, password);
      updateState({
        folders: state.folders.map(folder => 
          folder.id === folderId 
            ? {
                ...folder,
                emails: folder.emails?.filter(email => email.id !== emailId) || []
              }
            : folder
        )
      });
    } catch (err) {
      console.error('Error deleting email:', err);
      throw err;
    }
  }, [state.folders, updateState]);

  // Like email
  const likeEmail = useCallback(async (folderId, emailId) => {
    try {
      const updatedEmail = await githubStorage.updateEmailLikes(folderId, emailId);
      updateState({
        folders: state.folders.map(folder => 
          folder.id === folderId 
            ? {
                ...folder,
                emails: folder.emails?.map(email => 
                  email.id === emailId ? updatedEmail : email
                ) || []
              }
            : folder
        )
      });
    } catch (err) {
      console.error('Error liking email:', err);
      throw err;
    }
  }, [state.folders, updateState]);

  // Delete folder
  const deleteFolder = useCallback(async (folderId, password) => {
    try {
      await githubStorage.deleteFolder(folderId, password);
      updateState({
        folders: state.folders.filter(folder => folder.id !== folderId)
      });
    } catch (err) {
      console.error('Error deleting folder:', err);
      throw err;
    }
  }, [state.folders, updateState]);

  const value = {
    ...state,
    addFolder,
    deleteFolder,
    addEmail,
    deleteEmail,
    likeEmail,
    loadFolderEmails,
    refreshFolders: loadFoldersOnly
  };

  return (
    <FolderContext.Provider value={value}>
      {children}
    </FolderContext.Provider>
  );
}

export { FolderProvider, useFolders };