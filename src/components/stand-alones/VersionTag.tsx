/**
 * VersionTag - Displays app version and git commit hash
 * 
 * Shows: v{version} • {short-commit}
 * Click to copy full commit hash to clipboard
 * Hover to see build timestamp
 * 
 * Values injected at build time via vite.config.ts:
 * - __APP_VERSION__ from package.json
 * - __GIT_COMMIT__ from Vercel's VERCEL_GIT_COMMIT_SHA
 * - __BUILD_TIME__ ISO timestamp
 */

import { useState } from 'react';

type Props = {
  collapsed?: boolean;
};

export function VersionTag({ collapsed = false }: Props) {
  const [copied, setCopied] = useState(false);
  
  const shortCommit = __GIT_COMMIT__.slice(0, 7);
  const isLocal = __GIT_COMMIT__ === 'local';
  
  const buildDate = new Date(__BUILD_TIME__).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const handleClick = async () => {
    if (isLocal) return;
    
    try {
      await navigator.clipboard.writeText(__GIT_COMMIT__);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available
    }
  };

  if (collapsed) {
    return (
      <div
        className="version-tag version-tag--collapsed"
        title={`v${__APP_VERSION__} • ${shortCommit}\nBuilt: ${buildDate}`}
        onClick={handleClick}
        style={{
          padding: '0.5rem',
          fontSize: '0.65rem',
          color: '#6b7280',
          textAlign: 'center',
          cursor: isLocal ? 'default' : 'pointer',
          userSelect: 'none',
        }}
      >
        {shortCommit}
      </div>
    );
  }

  return (
    <div
      className="version-tag"
      title={`Built: ${buildDate}${!isLocal ? '\nClick to copy full commit hash' : ''}`}
      onClick={handleClick}
      style={{
        padding: '0.5rem 1rem',
        fontSize: '0.7rem',
        color: '#6b7280',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        cursor: isLocal ? 'default' : 'pointer',
        userSelect: 'none',
        transition: 'color 0.15s',
      }}
    >
      <span>v{__APP_VERSION__}</span>
      <span style={{ color: '#9ca3af' }}>•</span>
      <span style={{ fontFamily: 'monospace' }}>
        {copied ? '✓ copied' : shortCommit}
      </span>
    </div>
  );
}
