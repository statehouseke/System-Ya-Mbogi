import React, { useState, useEffect, useCallback } from 'react';
import { Heart, Send, Trash2, Paperclip, AlertTriangle, Lock } from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';
import { useFolders } from '../context/FolderContext';
import { EmailForm } from './EmailForm';
import { PasswordManager } from '../utils/githubStorage';

export const EmailList = ({ folder }) => {
  const { addEmail, likeEmail, deleteEmail, loadFolderEmails } = useFolders();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [emailPassword, setEmailPassword] = useState('');
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load emails only once when folder changes
  useEffect(() => {
    let mounted = true;

    const loadEmails = async () => {
      if (!folder || folder.emailsLoaded) return;
      
      try {
        setLoading(true);
        setError(null);
        await loadFolderEmails(folder.id);
      } catch (err) {
        if (mounted) {
          setError('Failed to load emails: ' + err.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadEmails();
    return () => { mounted = false; };
  }, [folder?.id, loadFolderEmails]);

  const handleCreateEmail = useCallback(async (emailData) => {
    try {
      setError(null);
      setLoading(true);

      // Get IP address
      const ip = await fetch('https://api.ipify.org?format=json')
        .then(res => res.json())
        .then(data => data.ip)
        .catch(() => {
          throw new Error('Failed to get IP address. Please try again.');
        });

      const result = await addEmail(folder.id, emailData, ip);
      
      // Save password if user wants to
      try {
        await PasswordManager.savePassword('email', result.id, result.password);
      } catch (err) {
        console.warn('Failed to save password:', err);
      }
      
      // Show the email password to the user
      setEmailPassword(result.password);
      setShowEmailPassword(true);
      setIsCreating(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [folder?.id, addEmail]);

  const handleDeleteEmail = useCallback(async (emailId) => {
    // First try saved password
    const savedPassword = PasswordManager.getPassword('email', emailId);
    
    if (savedPassword) {
      try {
        await deleteEmail(folder.id, emailId, savedPassword);
        return;
      } catch (err) {
        console.warn('Failed to delete with saved password:', err);
      }
    }

    // If no saved password or it failed, prompt user
    const password = prompt('Enter email password to delete:');
    if (!password) return;

    try {
      setError(null);
      await deleteEmail(folder.id, emailId, password);
    } catch (err) {
      setError(err.message);
    }
  }, [folder?.id, deleteEmail]);

  const handleLikeEmail = useCallback(async (emailId) => {
    try {
      setError(null);
      await likeEmail(folder.id, emailId);
    } catch (err) {
      setError(err.message);
    }
  }, [folder?.id, likeEmail]);

  const handleSendEmail = useCallback((email) => {
    const mailtoLink = `mailto:${folder.targetEmail}?subject=${encodeURIComponent(
      email.subject
    )}&body=${encodeURIComponent(email.body)}`;
    window.location.href = mailtoLink;
  }, [folder?.targetEmail]);

  const handlePasswordClose = useCallback(() => {
    setShowEmailPassword(false);
    setEmailPassword('');
  }, []);

  const renderAttachments = useCallback((attachments) => {
    if (!attachments?.length) return null;

    return (
      <div className="mt-2 space-y-1">
        <div className="text-sm text-gray-500">Attachments:</div>
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <a
              key={index}
              href={`data:${attachment.type};base64,${attachment.content}`}
              download={attachment.name}
              className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600"
            >
              <Paperclip size={16} />
              <span>{attachment.name}</span>
            </a>
          ))}
        </div>
      </div>
    );
  }, []);

  if (!folder) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center text-gray-500">
        Select a folder to view emails
      </div>
    );
  }

  return (
    <div className="flex-1 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">{folder.name}</h2>
          {folder.status === 'silent' && (
            <div className="text-sm text-yellow-600">
              This folder is pending approval. Content will be visible after approval.
            </div>
          )}
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          disabled={loading}
        >
          New Email
        </button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showEmailPassword && (
        <Alert className="mb-4 bg-yellow-50 border-yellow-200">
          <Lock className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <div className="font-bold mb-1">IMPORTANT: Save this email password!</div>
            <div className="text-sm break-all">{emailPassword}</div>
            <div className="text-xs mt-1 text-yellow-600">
              This password is required to modify or delete this email.
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

      {isCreating && (
        <div className="mb-6">
          <EmailForm
            onSubmit={handleCreateEmail}
            onCancel={() => {
              setIsCreating(false);
              setError(null);
            }}
            disabled={loading}
          />
        </div>
      )}

      {loading && !folder.emails && (
        <div className="text-center py-8 text-gray-500">
          Loading emails...
        </div>
      )}

      <div className="space-y-4">
        {folder.emails?.sort((a, b) => {
          // Sort by likes first, then by date
          if (b.likes !== a.likes) return b.likes - a.likes;
          return new Date(b.createdAt) - new Date(a.createdAt);
        }).map(email => (
          <div
            key={email.id}
            className="border dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-lg font-semibold">{email.subject}</h3>
                <div className="text-sm text-gray-500">
                  {new Date(email.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleLikeEmail(email.id)}
                  className="flex items-center gap-1 text-pink-500 hover:text-pink-600"
                  disabled={loading}
                >
                  <Heart size={20} className={email.userHasLiked ? "fill-current" : ""} />
                  <span>{email.likes}</span>
                </button>
                <button
                  onClick={() => handleSendEmail(email)}
                  className="text-blue-500 hover:text-blue-600"
                  disabled={loading}
                >
                  <Send size={20} />
                </button>
                <button
                  onClick={() => handleDeleteEmail(email.id)}
                  className="text-red-500 hover:text-red-600"
                  disabled={loading}
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
            <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
              {email.body}
            </p>
            {renderAttachments(email.attachments)}
          </div>
        ))}
      </div>
    </div>
  );
};