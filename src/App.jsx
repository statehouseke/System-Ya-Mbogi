import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { EmailTemplateApp } from './components/EmailTemplateApp';
import { ShareFolderPage } from './components/ShareFolderPage';
import { useFolders, FolderProvider } from './context/FolderContext';
import { Alert, AlertDescription } from './components/ui/alert';

function App() {
  return (
    <Router>
      <FolderProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <Alert className="mb-4">
            <AlertDescription>
              A kenyan State of art tool for my fellow age mates.
            </AlertDescription>
          </Alert>
          <Routes>
            <Route path="/" element={<EmailTemplateApp />} />
            <Route path="/share/:token" element={<ShareFolderPage />} />
          </Routes>
        </div>
      </FolderProvider>
    </Router>
  );
}

export default App;