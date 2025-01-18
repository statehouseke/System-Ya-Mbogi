//email form
import React, { useState, useCallback } from 'react';
import { X, Paperclip, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf', 'text/plain'];

export const EmailForm = ({ onSubmit, onCancel, initialData }) => {
  const [formData, setFormData] = useState(initialData || {
    subject: '',
    body: '',
    attachments: []
  });
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  const validateFile = useCallback((file) => {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File ${file.name} exceeds 5MB size limit`);
    }
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      throw new Error(`File type ${file.type} is not supported`);
    }
  }, []);

  const handleAttachment = async (e) => {
    const files = Array.from(e.target.files);
    setIsUploading(true);
    setError(null);

    try {
      for (const file of files) {
        validateFile(file);
      }

      const newAttachments = await Promise.all(
        files.map(async (file) => {
          const reader = new FileReader();
          const fileContent = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
            reader.readAsDataURL(file);
          });

          return {
            name: file.name,
            type: file.type,
            content: fileContent.split(',')[1],
            size: file.size
          };
        })
      );

      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...newAttachments]
      }));
    } catch (error) {
      setError(error.message);
      console.error('Error processing attachments:', error);
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Reset file input
    }
  };

  const removeAttachment = (index) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.subject.trim()) {
      setError('Subject is required');
      return;
    }
    if (!formData.body.trim()) {
      setError('Body is required');
      return;
    }
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <input
        type="text"
        placeholder="Subject"
        value={formData.subject}
        onChange={(e) => {
          setError(null);
          setFormData(prev => ({ ...prev, subject: e.target.value }));
        }}
        className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
      />
      
      <textarea
        placeholder="Body"
        value={formData.body}
        onChange={(e) => {
          setError(null);
          setFormData(prev => ({ ...prev, body: e.target.value }));
        }}
        className="w-full p-2 border rounded h-32 dark:bg-gray-700 dark:border-gray-600"
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
            <Paperclip size={20} />
            <span>Add Attachment</span>
            <input
              type="file"
              multiple
              onChange={handleAttachment}
              className="hidden"
              disabled={isUploading}
              accept={ALLOWED_FILE_TYPES.join(',')}
            />
          </label>
          {isUploading && (
            <span className="text-sm text-gray-500 animate-pulse">
              Uploading...
            </span>
          )}
        </div>

        {formData.attachments.length > 0 && (
          <div className="space-y-2">
            {formData.attachments.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded"
              >
                <div className="flex items-center gap-2">
                  {file.type.startsWith('image/') ? (
                    <ImageIcon size={20} />
                  ) : (
                    <Paperclip size={20} />
                  )}
                  <span className="text-sm">{file.name}</span>
                  <span className="text-xs text-gray-500">
                    ({Math.round(file.size / 1024)}KB)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          disabled={isUploading}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export default EmailForm;