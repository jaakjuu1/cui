/**
 * Utility to detect and extract file paths from conversation messages
 */

export interface DetectedFile {
  path: string;
  filename: string;
  mentionedIn: string[]; // Array of message UUIDs where this file was mentioned
  toolUses: Array<{
    tool: string; // 'Write' | 'Edit' | 'Read' | etc.
    messageUuid: string;
  }>;
}

/**
 * Extract file paths from a message's content
 */
export function extractFilePathsFromMessage(
  message: {
    uuid: string;
    type: 'user' | 'assistant' | 'system';
    message: {
      content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    };
  },
  conversationCwd?: string
): DetectedFile[] {
  const detectedFiles: Map<string, DetectedFile> = new Map();

  if (message.type !== 'assistant' && message.type !== 'user') {
    return [];
  }

  const content = message.message.content;
  if (!Array.isArray(content)) {
    return [];
  }

  for (const block of content) {
    // Extract paths from tool uses (Write, Edit, Read, etc.)
    if (block.type === 'tool_use' && block.name && block.input) {
      const toolName = block.name;
      const input = block.input as Record<string, unknown>;

      // Check for file_path in Write/Edit/Read tools
      if (input.file_path && typeof input.file_path === 'string') {
        const filePath = input.file_path;
        if (isValidAbsolutePath(filePath)) {
          addOrUpdateFile(detectedFiles, filePath, message.uuid, toolName);
        }
      }

      // Check for notebook_path in NotebookEdit tool
      if (input.notebook_path && typeof input.notebook_path === 'string') {
        const filePath = input.notebook_path;
        if (isValidAbsolutePath(filePath)) {
          addOrUpdateFile(detectedFiles, filePath, message.uuid, toolName);
        }
      }
    }

    // Extract paths from text content using regex
    if (block.type === 'text' && block.text) {
      const textPaths = extractPathsFromText(block.text, conversationCwd);
      for (const filePath of textPaths) {
        addOrUpdateFile(detectedFiles, filePath, message.uuid);
      }
    }
  }

  return Array.from(detectedFiles.values());
}

/**
 * Extract file paths from all messages in a conversation
 */
export function extractFilePathsFromConversation(
  messages: Array<{
    uuid: string;
    type: 'user' | 'assistant' | 'system';
    message: {
      content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    };
    cwd?: string;
  }>
): DetectedFile[] {
  const allFiles: Map<string, DetectedFile> = new Map();

  const conversationCwd = messages[0]?.cwd;

  for (const message of messages) {
    const filesInMessage = extractFilePathsFromMessage(message, conversationCwd);

    for (const file of filesInMessage) {
      if (allFiles.has(file.path)) {
        // Merge with existing
        const existing = allFiles.get(file.path)!;
        existing.mentionedIn = [...new Set([...existing.mentionedIn, ...file.mentionedIn])];
        existing.toolUses = [...existing.toolUses, ...file.toolUses];
      } else {
        allFiles.set(file.path, file);
      }
    }
  }

  return Array.from(allFiles.values());
}

/**
 * Extract absolute file paths from text using regex
 */
function extractPathsFromText(text: string, conversationCwd?: string): string[] {
  const paths: string[] = [];

  // Regex for Unix/Linux absolute paths: /path/to/file.ext
  const unixPathRegex = /\/(?:[a-zA-Z0-9_\-\.]+\/)*[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+/g;

  // Regex for Windows absolute paths: C:\path\to\file.ext or C:/path/to/file.ext
  const windowsPathRegex = /[A-Z]:\\(?:[a-zA-Z0-9_\-\.]+\\)*[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+/g;
  const windowsPathRegex2 = /[A-Z]:\/(?:[a-zA-Z0-9_\-\.]+\/)*[a-zA-Z0-9_\-\.]+\.[a-zA-Z0-9]+/g;

  // Extract Unix paths
  const unixMatches = text.match(unixPathRegex);
  if (unixMatches) {
    paths.push(...unixMatches);
  }

  // Extract Windows paths
  const windowsMatches = text.match(windowsPathRegex);
  if (windowsMatches) {
    paths.push(...windowsMatches);
  }

  const windowsMatches2 = text.match(windowsPathRegex2);
  if (windowsMatches2) {
    paths.push(...windowsMatches2);
  }

  // Filter paths to only include those within conversation cwd if provided
  if (conversationCwd) {
    return paths.filter(p => p.startsWith(conversationCwd));
  }

  return paths;
}

/**
 * Check if a path is a valid absolute path
 */
function isValidAbsolutePath(path: string): boolean {
  // Unix absolute path
  if (path.startsWith('/')) {
    return true;
  }

  // Windows absolute path
  if (/^[A-Z]:[\\\/]/.test(path)) {
    return true;
  }

  return false;
}

/**
 * Add or update a file in the detected files map
 */
function addOrUpdateFile(
  files: Map<string, DetectedFile>,
  filePath: string,
  messageUuid: string,
  toolName?: string
): void {
  const filename = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;

  if (files.has(filePath)) {
    const existing = files.get(filePath)!;
    if (!existing.mentionedIn.includes(messageUuid)) {
      existing.mentionedIn.push(messageUuid);
    }
    if (toolName) {
      existing.toolUses.push({ tool: toolName, messageUuid });
    }
  } else {
    files.set(filePath, {
      path: filePath,
      filename,
      mentionedIn: [messageUuid],
      toolUses: toolName ? [{ tool: toolName, messageUuid }] : []
    });
  }
}

/**
 * Get unique file paths (deduplicated)
 */
export function getUniqueFilePaths(files: DetectedFile[]): string[] {
  return [...new Set(files.map(f => f.path))];
}
