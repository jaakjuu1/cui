import React, { useState, useMemo } from 'react';
import { Download, FileText, FolderOpen, Package } from 'lucide-react';
import { api } from '../services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  extractFilePathsFromConversation,
  getUniqueFilePaths,
  type DetectedFile
} from '../../utils/filePathDetector';

interface ConversationFilesSidebarProps {
  messages: Array<{
    uuid: string;
    type: 'user' | 'assistant' | 'system';
    message: {
      content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    };
    cwd?: string;
  }>;
  sessionId: string;
}

export function ConversationFilesSidebar({ messages, sessionId }: ConversationFilesSidebarProps) {
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Extract files from conversation
  const detectedFiles = useMemo(() => {
    return extractFilePathsFromConversation(messages);
  }, [messages]);

  const handleDownloadAll = async () => {
    try {
      setIsDownloadingAll(true);
      setDownloadError(null);

      const filePaths = getUniqueFilePaths(detectedFiles);
      await api.downloadFilesAsZip(sessionId, filePaths);
    } catch (err) {
      console.error('Bulk download error:', err);
      setDownloadError(err instanceof Error ? err.message : 'Bulk download failed');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const handleDownloadSingle = async (filePath: string) => {
    try {
      await api.downloadFile(filePath, sessionId);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  if (detectedFiles.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Files
          </CardTitle>
          <CardDescription>
            No files detected in this conversation
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5" />
          Files
          <Badge variant="secondary">{detectedFiles.length}</Badge>
        </CardTitle>
        <CardDescription>
          Files referenced in this conversation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleDownloadAll}
          disabled={isDownloadingAll}
          className="w-full gap-2"
          variant="default"
        >
          <Package className="w-4 h-4" />
          {isDownloadingAll ? 'Downloading...' : `Download All as ZIP (${detectedFiles.length} files)`}
        </Button>

        {downloadError && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
            {downloadError}
          </div>
        )}

        <Separator />

        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {detectedFiles.map((file: DetectedFile) => (
              <FileItem
                key={file.path}
                file={file}
                onDownload={() => handleDownloadSingle(file.path)}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

interface FileItemProps {
  file: DetectedFile;
  onDownload: () => void;
}

function FileItem({ file, onDownload }: FileItemProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      await onDownload();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-accent group">
      <FileText className="w-4 h-4 mt-1 flex-shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{file.filename}</span>
          {file.toolUses.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {file.toolUses.length} edit{file.toolUses.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate" title={file.path}>
          {file.path}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDownload}
        disabled={isDownloading}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Download className="w-4 h-4" />
      </Button>
    </div>
  );
}
