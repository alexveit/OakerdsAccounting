// scripts/createDebugDocs.cjs
// Creates a debug_docs_<timestamp> folder with a FLAT set of files
// Auto-discovers root directories and files to include
// Also creates a .zip archive of the folder.

// Run: npm run debug-docs

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

const projectRoot = process.cwd();

// ---- CONFIG ----
// Directories and files to IGNORE (common dev artifacts, secrets, etc.)
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

// File extensions to include (empty = all non-ignored)
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

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Check if a name should be ignored
 */
function shouldIgnore(name) {
  // Check exact match
  if (IGNORE_PATTERNS.includes(name)) return true;
  
  // Check prefix match (for things like debug_docs_*)
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.endsWith('_') && name.startsWith(pattern)) return true;
  }
  
  // Ignore hidden files/folders (starting with .)
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
 * Auto-discover directories and files in project root
 */
function discoverRootContents() {
  const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  
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
  
  // Sort alphabetically
  directories.sort((a, b) => a.localeCompare(b));
  files.sort((a, b) => a.localeCompare(b));
  
  return { directories, files };
}

/**
 * Delete all subdirectories in db_tools (keeps files like .ps1)
 */
function cleanDbToolsFolders() {
  const dbToolsPath = path.join(projectRoot, 'db_tools');
  
  if (!fs.existsSync(dbToolsPath)) {
    console.warn('db_tools folder not found, skipping cleanup');
    return;
  }

  const entries = fs.readdirSync(dbToolsPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const folderPath = path.join(dbToolsPath, entry.name);
      console.log(`Deleting old dump folder: ${entry.name}`);
      fs.rmSync(folderPath, { recursive: true, force: true });
    }
  }
}

/**
 * Run the database backup PowerShell script and wait for completion
 */
function runDbBackup() {
  const backupScript = path.join(projectRoot, 'db_tools', 'my_db_backup.ps1');
  
  if (!fs.existsSync(backupScript)) {
    console.warn('my_db_backup.ps1 not found, skipping DB backup');
    return;
  }

  console.log('Running database backup...');
  
  try {
    execSync(`powershell -ExecutionPolicy Bypass -File "${backupScript}"`, {
      cwd: path.join(projectRoot, 'db_tools'),
      stdio: 'inherit',
    });
    console.log('Database backup complete.\n');
  } catch (err) {
    console.error('Database backup failed:', err.message);
    throw err;
  }
}

// Track used filenames in the debug_docs folder to avoid collisions
const usedNames = new Set();

/**
 * Generate a unique filename in a flat folder, avoiding collisions.
 */
function getUniqueName(baseName) {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);

  let counter = 1;
  let candidate;

  do {
    candidate = `${stem}__${counter}${ext}`;
    counter += 1;
  } while (usedNames.has(candidate));

  usedNames.add(candidate);
  return candidate;
}

/**
 * Build a nested object representing the folder structure
 */
function buildFolderTree(srcDir, baseRelative) {
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
 * Render a folder tree object to a string with box-drawing characters
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
 * Recursively walk a source directory and copy all files into a single flat dest folder.
 */
function collectAndCopyFilesFlat(srcDir, baseRelative, debugRootPath, filesMeta) {
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    console.warn(`Skipping missing directory: ${baseRelative}`);
    return;
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldIgnore(entry.name)) continue;
    
    const srcPath = path.join(srcDir, entry.name);
    const relPath = path.join(baseRelative, entry.name);

    if (entry.isDirectory()) {
      collectAndCopyFilesFlat(srcPath, relPath, debugRootPath, filesMeta);
    } else if (entry.isFile() && shouldIncludeFile(entry.name)) {
      const originalRelativePath = relPath.replace(/\\/g, '/');
      const uniqueName = getUniqueName(entry.name);
      const destPath = path.join(debugRootPath, uniqueName);

      fs.copyFileSync(srcPath, destPath);

      filesMeta.push({
        originalRelativePath,
        debugFileName: uniqueName,
      });
    }
  }
}

/**
 * Create a zip archive of the debug folder
 */
function createZipArchive(debugFolderPath, debugFolderName) {
  return new Promise((resolve, reject) => {
    const zipPath = path.join(debugFolderPath, `${debugFolderName}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`- Zip archive: ${debugFolderName}.zip (${sizeMB} MB)`);
      resolve(zipPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(debugFolderPath, false);
    archive.finalize();
  });
}

// ---- MAIN LOGIC ----

async function createDebugDocs() {
  // Step 1: Auto-discover root contents
  console.log('Discovering project structure...');
  const { directories, files } = discoverRootContents();
  
  console.log(`Found ${directories.length} directories: ${directories.join(', ')}`);
  console.log(`Found ${files.length} root files: ${files.join(', ')}\n`);

  // Step 2: Clean up old dump folders in db_tools
  if (directories.includes('db_tools')) {
    console.log('Cleaning up old database dumps...');
    cleanDbToolsFolders();
    runDbBackup();
  }

  // Step 3: Create debug docs folder
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const debugFolderName = `debug_docs_${timestamp}`;
  const debugFolderPath = path.join(projectRoot, debugFolderName);

  ensureDir(debugFolderPath);

  console.log(`Creating debug docs folder: ${debugFolderName}`);

  const filesMeta = [];

  // For each discovered directory, copy all files into the flat debug folder
  for (const dir of directories) {
    const absSrcDir = path.join(projectRoot, dir);
    console.log(`Including directory: ${dir}/`);
    collectAndCopyFilesFlat(absSrcDir, dir, debugFolderPath, filesMeta);
  }

  // Copy root-level files
  for (const file of files) {
    const srcPath = path.join(projectRoot, file);
    if (fs.existsSync(srcPath)) {
      const uniqueName = getUniqueName(path.basename(file));
      const destPath = path.join(debugFolderPath, uniqueName);
      fs.copyFileSync(srcPath, destPath);
      filesMeta.push({
        originalRelativePath: file,
        debugFileName: uniqueName,
      });
      console.log(`Including file: ${file}`);
    }
  }

  // Build and write folder structure tree
  let treeOutput = `Project: ${path.basename(projectRoot)}\n`;
  treeOutput += `Generated: ${new Date().toISOString()}\n`;
  treeOutput += `${'='.repeat(50)}\n\n`;

  // Build unified tree with root/ at top
  const rootTree = {
    name: path.basename(projectRoot),
    type: 'dir',
    children: []
  };

  // Add directories as children
  for (const dir of directories) {
    const absSrcDir = path.join(projectRoot, dir);
    if (fs.existsSync(absSrcDir)) {
      const tree = buildFolderTree(absSrcDir, dir);
      rootTree.children.push(tree);
    }
  }

  // Add root-level files as children
  for (const file of files) {
    rootTree.children.push({ name: file, type: 'file' });
  }

  treeOutput += renderTree(rootTree);

  // Add file mapping reference (debug filename -> original path)
  treeOutput += `\n${'='.repeat(50)}\n`;
  treeOutput += `File Mapping (${filesMeta.length} files)\n`;
  treeOutput += `${'='.repeat(50)}\n\n`;
  
  for (const meta of filesMeta) {
    if (meta.debugFileName !== path.basename(meta.originalRelativePath)) {
      treeOutput += `${meta.debugFileName} <- ${meta.originalRelativePath}\n`;
    }
  }

  const treePath = path.join(debugFolderPath, 'folder_structure.txt');
  fs.writeFileSync(treePath, treeOutput, 'utf8');

  // Create zip archive
  await createZipArchive(debugFolderPath, debugFolderName);

  console.log('\nDebug docs created (flat layout):');
  console.log(`- Folder: ${debugFolderName}/`);
  console.log(`- Structure: ${debugFolderName}/folder_structure.txt`);
  console.log(`- Total files: ${filesMeta.length}`);
}

createDebugDocs().catch((err) => {
  console.error('Error creating debug docs:', err);
  process.exit(1);
});
