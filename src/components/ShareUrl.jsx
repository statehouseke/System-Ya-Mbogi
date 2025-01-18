//shareUrl.jsx
import React, { useState } from 'react';
import { Share2, Copy, Check } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';

export const ShareUrl = ({ folder }) => {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Make sure we have a valid share token
  const shareUrl = folder.shareToken 
    ? `${window.location.origin}/share/${folder.shareToken}`
    : null;

  const copyToClipboard = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 2000);
    }
  };

  if (!shareUrl) {
    return (
      <Alert>
        <AlertDescription>
          Share URL not available. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
        <input
          type="text"
          value={shareUrl}
          readOnly
          className="flex-1 bg-transparent border-none focus:outline-none text-sm"
        />
        <button
          onClick={copyToClipboard}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          title="Copy to clipboard"
        >
          {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
        </button>
      </div>

      {showTooltip && (
        <Alert className="mt-2">
          <AlertDescription>
            Select and copy the URL manually - clipboard access denied
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};