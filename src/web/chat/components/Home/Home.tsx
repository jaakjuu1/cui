import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConversations } from '../../contexts/ConversationsContext';
import { api } from '../../services/api';
import { Header } from './Header';
import { Composer, ComposerRef } from '@/web/chat/components/Composer';
import { TaskTabs } from './TaskTabs';
import { TaskList } from './TaskList';

export function Home() {
  const navigate = useNavigate();
  const { 
    conversations, 
    loading, 
    loadingMore, 
    hasMore, 
    error, 
    loadConversations, 
    loadMoreConversations,
    recentDirectories,
    getMostRecentWorkingDirectory 
  } = useConversations();
  const [activeTab, setActiveTab] = useState<'tasks' | 'history' | 'archive'>('tasks');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const conversationCountRef = useRef(conversations.length);
  const composerRef = useRef<ComposerRef>(null);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  // Update the ref whenever conversations change
  useEffect(() => {
    conversationCountRef.current = conversations.length;
  }, [conversations.length]);

  // Get filter parameters based on active tab
  const getFiltersForTab = (tab: 'tasks' | 'history' | 'archive') => {
    switch (tab) {
      case 'tasks':
        return { archived: false, hasContinuation: false };
      case 'history':
        return { hasContinuation: true };
      case 'archive':
        return { archived: true, hasContinuation: false };
      default:
        return {};
    }
  };

  // Auto-refresh on navigation back to Home
  useEffect(() => {
    // Refresh on component mount if we have conversations
    if (conversationCountRef.current > 0) {
      loadConversations(conversationCountRef.current, getFiltersForTab(activeTab));
    }
    
    // Focus the input after a brief delay to ensure DOM is ready
    const timer = setTimeout(() => {
      composerRef.current?.focusInput();
    }, 100);
    
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array means this runs only on mount

  // Reload conversations when tab changes
  useEffect(() => {
    loadConversations(undefined, getFiltersForTab(activeTab));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Auto-refresh on focus
  useEffect(() => {
    const handleFocus = () => {
      // Only refresh if we have loaded conversations before
      if (conversationCountRef.current > 0) {
        loadConversations(conversationCountRef.current, getFiltersForTab(activeTab));
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && conversationCountRef.current > 0) {
        loadConversations(conversationCountRef.current, getFiltersForTab(activeTab));
      }
    };

    // Listen for window focus
    window.addEventListener('focus', handleFocus);
    // Listen for tab visibility change
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadConversations, activeTab]);

  // Get the most recent working directory from conversations
  const recentWorkingDirectory = conversations.length > 0 
    ? conversations[0].projectPath 
    : undefined;

  const handleComposerSubmit = async (text: string, workingDirectory: string, model: string, permissionMode: string) => {
    setIsSubmitting(true);

    try {
      let sessionIdToNavigate: string;

      // If we have staged files, we need to upload them and include file references
      if (stagedFiles.length > 0) {
        // Create file references based on predictable upload paths
        const fileReferences = stagedFiles.map(f => `@uploads/${f.name}`).join(' ');
        const messageWithFiles = `${fileReferences}\n\n${text}`;

        // Start conversation with the user's message + file references
        // The files will be uploaded immediately after, so the references will be valid
        const response = await api.startConversation({
          workingDirectory,
          initialPrompt: messageWithFiles,
          model: model === 'default' ? undefined : model,
          permissionMode: permissionMode === 'default' ? undefined : permissionMode,
        });

        sessionIdToNavigate = response.sessionId;

        try {
          // Wait a bit for the conversation to be initialized and persisted
          // The conversation needs to exist in ~/.claude/ before we can upload files
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Retry upload up to 3 times with exponential backoff
          let uploadSuccess = false;
          let lastError: Error | null = null;

          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const uploadResponse = await api.uploadFiles(stagedFiles, response.sessionId, 'uploads');
              console.log(`Uploaded ${stagedFiles.length} staged files to conversation ${response.sessionId}`);

              // Get uploaded file paths for logging
              const uploadedFilePaths = uploadResponse.files.map((f: { uploadedPath: string }) => f.uploadedPath);
              console.log(`Files uploaded to: ${uploadedFilePaths.join(', ')}`);

              // Clear staged files after successful upload
              setStagedFiles([]);

              uploadSuccess = true;
              break; // Success, exit retry loop
            } catch (err) {
              lastError = err instanceof Error ? err : new Error(String(err));
              console.log(`Upload attempt ${attempt} failed, retrying...`, err);

              if (attempt < 3) {
                // Wait before retrying (exponential backoff: 500ms, 1000ms)
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
              }
            }
          }

          if (!uploadSuccess) {
            throw lastError || new Error('Upload failed after 3 attempts');
          }
        } catch (uploadError) {
          console.error('Failed to upload staged files:', uploadError);
          alert(`Warning: Failed to upload files: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}\n\nYou can upload files manually from the conversation view.`);
          // Continue to navigate even if upload failed - user can upload manually
        }
      } else {
        // No staged files, just start conversation normally
        const response = await api.startConversation({
          workingDirectory,
          initialPrompt: text,
          model: model === 'default' ? undefined : model,
          permissionMode: permissionMode === 'default' ? undefined : permissionMode,
        });
        sessionIdToNavigate = response.sessionId;
      }

      // Navigate to the conversation page
      navigate(`/c/${sessionIdToNavigate}`);
    } catch (error) {
      console.error('Failed to start conversation:', error);
      // You might want to show an error message to the user here
      alert(`Failed to start conversation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsSubmitting(false);
    }
  };

  const handleFilesStaged = (files: File[]) => {
    setStagedFiles(prev => [...prev, ...files]);
  };

  const handleRemoveStagedFile = (index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background">
      <Header />

      <main className="relative flex flex-1 w-full h-full overflow-hidden transition-all duration-[250ms] z-[1]">
        <div className="flex flex-col h-full w-full">
          <div className="z-0 mx-auto flex flex-col w-full max-w-3xl h-full">
            <div className="sticky top-0 z-50 flex flex-col items-center bg-background">
              <div className="flex items-center gap-3 mb-4 pt-4">
                <div className="flex items-center">
                  <div className="w-[27px] h-[27px] flex items-center justify-center">
                    <svg width="24" height="24" viewBox="4.5 5.2 11.7 13.3" fill="currentColor">
                      <circle cx="10.3613" cy="6.44531" r="1.03516" />
                      <circle cx="5.69336" cy="9.15039" r="1.03516" />
                      <circle cx="15.0195" cy="9.15039" r="1.03516" />
                      <circle cx="5.69336" cy="14.5801" r="1.03516" />
                      <circle cx="15.0195" cy="14.5801" r="1.03516" />
                      <circle cx="10.3613" cy="17.2754" r="1.03516" />
                      <path d="M10.3613 13.4961C11.2695 13.4961 11.9922 12.7734 11.9922 11.8652C11.9922 10.9668 11.25 10.2344 10.3613 10.2344C9.47266 10.2344 8.73047 10.9766 8.73047 11.8652C8.73047 12.7539 9.46289 13.4961 10.3613 13.4961Z" />
                    </svg>
                  </div>
                </div>
                <h1 className="text-2xl font-semibold font-sans text-foreground">What is the next task?</h1>
              </div>
              
              <div className="w-full">
                <Composer
                  ref={composerRef}
                  workingDirectory={recentWorkingDirectory}
                  onSubmit={handleComposerSubmit}
                  isLoading={isSubmitting}
                  placeholder="Describe your task"
                  showDirectorySelector={true}
                  showModelSelector={true}
                  showFileUpload={true}
                  enableFileAutocomplete={true}
                  recentDirectories={recentDirectories}
                  getMostRecentWorkingDirectory={getMostRecentWorkingDirectory}
                  stagedFiles={stagedFiles}
                  onFilesStaged={handleFilesStaged}
                  onRemoveStagedFile={handleRemoveStagedFile}
                  onDirectoryChange={(directory) => {
                    // Focus input after directory change
                    setTimeout(() => {
                      composerRef.current?.focusInput();
                    }, 50);
                  }}
                  onModelChange={(model) => {
                    // Focus input after model change
                    setTimeout(() => {
                      composerRef.current?.focusInput();
                    }, 50);
                  }}
                  onFetchFileSystem={async (directory) => {
                    const response = await api.listDirectory({
                      path: directory,
                      recursive: true,
                      respectGitignore: true,
                    });
                    return response.entries;
                  }}
                  onFetchCommands={async (workingDirectory) => {
                    const response = await api.getCommands(workingDirectory);
                    return response.commands;
                  }}
                />
              </div>

              <TaskTabs 
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>

            <TaskList 
              conversations={conversations}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              error={error}
              activeTab={activeTab}
              onLoadMore={(filters) => loadMoreConversations(filters)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
