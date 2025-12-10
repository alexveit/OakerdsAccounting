// scripts/file-tree.cjs
// Generates a file tree for the project
// 
// Standalone: node scripts/file-tree.cjs [--output file.txt]
// As module:  const { generateFileTree } = require('./file-tree.cjs');

const fs = require('fs');
const path = require('path');

// ---- CONFIG ----
const IGNORE_PATTERNS = [
  // Directories
  'node_modules',
  '.git',
  'dist',
  'build',
  '.vscode',
  '.idea',
  'coverage',
  'debug_docs_',  // Previous debug outputs (prefix match)
  
  // Files
  '.env',
  '.env.local',
  '.env.production',
  '.gitignore',
  '.eslintrc',
  '.prettierrc',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'vite.config.js',
  'tailwind.config.js',
  'postcss.config.js',
  '.npmrc',
  
  // Sensitive files
  'pg_password.txt',
  'anthropic-key.txt',
  'plaid-recovery-code.txt',
];

const INCLUDE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs',
  '.css', '.scss', '.less',
  '.json',
  '.sql',
  '.txt', '.md',
  '.html',
  '.ps1', '.sh', '.bat',
  '.svg',
];

// ---- HELPERS ----

/**
 * Check if a name should be ignored
 */
function shouldIgnore(name) {
  if (IGNORE_PATTERNS.includes(name)) return true;
  
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.endsWith('_') && name.startsWith(pattern)) return true;
  }
  
  if (name.startsWith('.')) return true;
  
  return false;
}

/**
 * Check if a file extension should be included
 */
function shouldIncludeFile(name) {
  const ext = path.extname(name).toLowerCase();
  return INCLUDE_EXTENSIONS.includes(ext);
}

/**
 * Auto-discover directories and files in a given root
 */
function discoverRootContents(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  
  const directories = [];
  const files = [];
  
  for (const entry of entries) {
    if (shouldIgnore(entry.name)) continue;
    
    if (entry.isDirectory()) {
      directories.push(entry.name);
    } else if (entry.isFile() && shouldIncludeFile(entry.name)) {
      files.push(entry.name);
    }
  }
  
  directories.sort((a, b) => a.localeCompare(b));
  files.sort((a, b) => a.localeCompare(b));
  
  return { directories, files };
}

/**
 * Build a nested object representing the folder structure
 */
function buildFolderTree(srcDir, baseRelative = '') {
  const tree = { name: path.basename(srcDir), type: 'dir', children: [] };
  
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    return tree;
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  
  // Sort: directories first, then files, both alphabetically
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (shouldIgnore(entry.name)) continue;
    
    const srcPath = path.join(srcDir, entry.name);
    
    if (entry.isDirectory()) {
      const childTree = buildFolderTree(srcPath, path.join(baseRelative, entry.name));
      tree.children.push(childTree);
    } else if (entry.isFile() && shouldIncludeFile(entry.name)) {
      tree.children.push({ name: entry.name, type: 'file' });
    }
  }
  
  return tree;
}

/**
 * Render a folder tree object to a string
 */
function renderTree(node, prefix = '', isLast = true, isRoot = true) {
  let result = '';
  
  if (isRoot) {
    result += `${node.name}/\n`;
  } else {
    const connector = isLast ? '`-- ' : '|-- ';
    const suffix = node.type === 'dir' ? '/' : '';
    result += `${prefix}${connector}${node.name}${suffix}\n`;
  }
  
  if (node.children && node.children.length > 0) {
    const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '|   ');
    
    node.children.forEach((child, index) => {
      const childIsLast = index === node.children.length - 1;
      result += renderTree(child, childPrefix, childIsLast, false);
    });
  }
  
  return result;
}

/**
 * Generate a complete file tree string for a project
 * @param {string} rootDir - Project root directory
 * @param {object} options - Optional settings
 * @param {boolean} options.includeHeader - Add header with project name and timestamp (default: true)
 * @returns {string} The rendered file tree
 */
function generateFileTree(rootDir, options = {}) {
  const { includeHeader = true } = options;
  
  const { directories, files } = discoverRootContents(rootDir);
  
  let output = '';
  
  if (includeHeader) {
    output += `Project: ${path.basename(rootDir)}\n`;
    output += `Generated: ${new Date().toISOString()}\n`;
    output += `${'='.repeat(50)}\n\n`;
  }
  
  // Build unified tree with root/ at top
  const rootTree = {
    name: path.basename(rootDir),
    type: 'dir',
    children: []
  };

  // Add directories as children
  for (const dir of directories) {
    const absSrcDir = path.join(rootDir, dir);
    if (fs.existsSync(absSrcDir)) {
      const tree = buildFolderTree(absSrcDir, dir);
      rootTree.children.push(tree);
    }
  }

  // Add root-level files as children
  for (const file of files) {
    rootTree.children.push({ name: file, type: 'file' });
  }

  output += renderTree(rootTree);
  
  return output;
}

// ---- EXPORTS ----
module.exports = {
  generateFileTree,
  buildFolderTree,
  renderTree,
  discoverRootContents,
  shouldIgnore,
  shouldIncludeFile,
  IGNORE_PATTERNS,
  INCLUDE_EXTENSIONS,
};

// ---- CLI ----
if (require.main === module) {
  const args = process.argv.slice(2);
  const printOnly = args.includes('--print');
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : 'file-tree.txt';
  
  const rootDir = process.cwd();
  const tree = generateFileTree(rootDir);
  
  if (printOnly) {
    console.log(tree);
  } else {
    fs.writeFileSync(outputFile, tree, 'utf8');
    console.log(`File tree written to: ${outputFile}`);
  }
}
