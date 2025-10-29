import React, { useState, useEffect } from 'react';
import { Copy, Folder, AlertCircle, Loader2, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { api } from '../../services/api';

export interface CopyProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceDirectory?: string;
  recentDirectories?: Record<string, { lastDate: string; shortname: string }>;
  onSuccess?: (newPath: string) => void;
}

export function CopyProjectDialog({
  open,
  onOpenChange,
  sourceDirectory,
  recentDirectories = {},
  onSuccess,
}: CopyProjectDialogProps) {
  const [selectedSource, setSelectedSource] = useState(sourceDirectory || '');
  const [targetDirectory, setTargetDirectory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Update selected source when prop changes
  useEffect(() => {
    if (sourceDirectory) {
      setSelectedSource(sourceDirectory);
    }
  }, [sourceDirectory]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setTargetDirectory('');
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  // Auto-suggest target directory name based on source
  const suggestTargetName = (sourcePath: string): string => {
    if (!sourcePath) return '';

    const parts = sourcePath.split('/');
    const baseName = parts[parts.length - 1] || parts[parts.length - 2] || '';

    if (baseName) {
      return `${sourcePath.replace(/\/$/, '')}-copy`;
    }

    return '';
  };

  const handleSourceChange = (value: string) => {
    setSelectedSource(value);
    setError(null);

    // Auto-fill target directory suggestion
    if (value && !targetDirectory) {
      setTargetDirectory(suggestTargetName(value));
    }
  };

  const handleCopy = async () => {
    // Validation
    if (!selectedSource) {
      setError('Please select a source directory');
      return;
    }

    if (!targetDirectory) {
      setError('Please enter a target directory path');
      return;
    }

    if (selectedSource === targetDirectory) {
      setError('Source and target directories must be different');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.copyProject(selectedSource, targetDirectory);

      setSuccess(true);

      // Call success callback after a brief delay to show success state
      setTimeout(() => {
        onSuccess?.(result.path);
        onOpenChange(false);
      }, 800);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to copy project';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert recentDirectories to array for dropdown
  const sourceOptions = Object.entries(recentDirectories)
    .map(([path, data]) => ({
      value: path,
      label: data.shortname,
    }))
    .sort((a, b) => {
      const dateA = recentDirectories[a.value].lastDate;
      const dateB = recentDirectories[b.value].lastDate;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

  const displaySourceName = selectedSource
    ? (recentDirectories[selectedSource]?.shortname || selectedSource.split('/').pop() || selectedSource)
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Copy Project
          </DialogTitle>
          <DialogDescription>
            Create a new project based on an existing one. This will copy the .claude folder, CLAUDE.md (if present), and create empty uploads/ and output/ directories.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Source Directory Selection */}
          <div className="space-y-2">
            <Label htmlFor="source-directory">Source Directory</Label>
            <div className="relative">
              <select
                id="source-directory"
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedSource}
                onChange={(e) => handleSourceChange(e.target.value)}
                disabled={isLoading || success}
              >
                <option value="">Select a project...</option>
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Folder className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            {selectedSource && (
              <p className="text-xs text-muted-foreground truncate">{selectedSource}</p>
            )}
          </div>

          {/* Target Directory Input */}
          <div className="space-y-2">
            <Label htmlFor="target-directory">New Directory Path</Label>
            <Input
              id="target-directory"
              type="text"
              placeholder="/path/to/new-project"
              value={targetDirectory}
              onChange={(e) => {
                setTargetDirectory(e.target.value);
                setError(null);
              }}
              disabled={isLoading || success}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Enter an absolute path for the new project directory
            </p>
          </div>

          {/* What will be copied */}
          <div className="rounded-md bg-muted p-3 space-y-1.5">
            <p className="text-sm font-medium">This will create:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3" />
                Copy of .claude/ folder (all configs and history)
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3" />
                Empty uploads/ folder
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3" />
                Empty output/ folder
              </li>
            </ul>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Display */}
          {success && (
            <Alert className="border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription>
                Project copied successfully!
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCopy}
            disabled={isLoading || success || !selectedSource || !targetDirectory}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {success && <Check className="mr-2 h-4 w-4" />}
            {success ? 'Copied' : 'Copy Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}