import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ResizableSidebarProps {
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
  className?: string;
}

/**
 * A resizable sidebar component that remembers its width in localStorage
 */
export function ResizableSidebar({
  children,
  defaultWidth = 320,
  minWidth = 240,
  maxWidth = 800,
  storageKey = 'sidebar-width',
  className = '',
}: ResizableSidebarProps) {
  // Load initial width from localStorage or use default
  const [width, setWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        // Validate stored width is within bounds
        if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
          return parsed;
        }
      }
    } catch (error) {
      console.error('Failed to load sidebar width from localStorage:', error);
    }
    return defaultWidth;
  });

  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Save width to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, width.toString());
    } catch (error) {
      console.error('Failed to save sidebar width to localStorage:', error);
    }
  }, [width, storageKey]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;

      const sidebarRect = sidebarRef.current.getBoundingClientRect();
      // Calculate new width based on mouse position from the right edge
      const newWidth = sidebarRect.right - e.clientX;

      // Clamp width between min and max
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(clampedWidth);
    },
    [isResizing, minWidth, maxWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add/remove global mouse event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while resizing
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={sidebarRef}
      className={`relative border-l bg-background overflow-y-auto flex-shrink-0 ${className}`}
      style={{ width: `${width}px` }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-10"
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      >
        {/* Wider hit area for easier grabbing */}
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>

      {/* Content */}
      <div className="p-4 sticky top-0">{children}</div>
    </div>
  );
}