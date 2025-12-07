// scripts/createDebugDocs.cjs
// Creates a debug_docs_<timestamp> folder with a FLAT set of files
// from src/, scripts/, db_tools/ and a folder_structure.txt tree view
// describing the original folder/file structure.
// Also creates a .zip archive of the folder.

// Run: npm run debug-docs

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

const projectRoot = process.cwd();

// ---- CONFIG ----
const DIRS_TO_INCLUDE = ['src', 'scripts', 'db_tools'];
const FILES_TO_INCLUDE = ['CODING_RULES.txt', 'README.md'];
const FILES_TO_IGNORE = ['pg_password.txt'];

// ---- HELPERS ----

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Delete all subdirectories in db_tools (keeps files like .ps1, pg_password.txt)
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
      stdio: 'inherit', // Show output in real-time
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
 * If "index.ts" already exists, next ones become "index__1.ts", "index__2.ts", etc.
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
    if (FILES_TO_IGNORE.includes(entry.name)) continue;
    
    const srcPath = path.join(srcDir, entry.name);
    
    if (entry.isDirectory()) {
      const childTree = buildFolderTree(srcPath, path.join(baseRelative, entry.name));
      tree.children.push(childTree);
    } else if (entry.isFile()) {
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
 *
 * @param {string} srcDir         Absolute path of source directory
 * @param {string} baseRelative   Relative path from project root (e.g. 'src', 'src/components/Button.tsx')
 * @param {string} debugRootPath  Absolute path to debug_docs_<timestamp> root
 * @param {Array}  filesMeta      Array to push file metadata objects into
 */
function collectAndCopyFilesFlat(srcDir, baseRelative, debugRootPath, filesMeta) {
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    console.warn(`Skipping missing directory: ${baseRelative}`);
    return;
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const relPath = path.join(baseRelative, entry.name); // relative to project root

    if (entry.isDirectory()) {
      collectAndCopyFilesFlat(srcPath, relPath, debugRootPath, filesMeta);
    } else if (entry.isFile()) {
      if (FILES_TO_IGNORE.includes(entry.name)) continue;
      const originalRelativePath = relPath.replace(/\\/g, '/');
      const uniqueName = getUniqueName(entry.name);
      const destPath = path.join(debugRootPath, uniqueName);

      // Copy the file into the flat debug root folder
      fs.copyFileSync(srcPath, destPath);

      filesMeta.push({
        originalRelativePath,         // e.g. "src/components/Button.tsx"
        debugFileName: uniqueName,    // e.g. "Button.tsx" or "index__1.tsx"
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
  // Step 1: Clean up old dump folders in db_tools
  console.log('Cleaning up old database dumps...');
  cleanDbToolsFolders();

  // Step 2: Run fresh database backup
  runDbBackup();

  // Step 3: Create debug docs folder
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const debugFolderName = `debug_docs_${timestamp}`;
  const debugFolderPath = path.join(projectRoot, debugFolderName);

  ensureDir(debugFolderPath);

  console.log(`Creating debug docs folder: ${debugFolderName}`);

  const filesMeta = [];

  // For each configured directory, copy all files into the flat debug folder
  for (const dir of DIRS_TO_INCLUDE) {
    const absSrcDir = path.join(projectRoot, dir);
    console.log(`Including directory: ${dir}`);
    collectAndCopyFilesFlat(absSrcDir, dir, debugFolderPath, filesMeta);
  }

  // Copy individual files
  for (const file of FILES_TO_INCLUDE) {
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
    } else {
      console.warn(`Skipping missing file: ${file}`);
    }
  }

  // Build and write folder structure tree
  let treeOutput = `Project: ${path.basename(projectRoot)}\n`;
  treeOutput += `Generated: ${new Date().toISOString()}\n`;
  treeOutput += `${'='.repeat(50)}\n\n`;

  // Build tree for each included directory
  for (const dir of DIRS_TO_INCLUDE) {
    const absSrcDir = path.join(projectRoot, dir);
    if (fs.existsSync(absSrcDir)) {
      const tree = buildFolderTree(absSrcDir, dir);
      treeOutput += renderTree(tree);
      treeOutput += '\n';
    }
  }

  // Add root-level files
  if (FILES_TO_INCLUDE.length > 0) {
    treeOutput += 'Root files:\n';
    FILES_TO_INCLUDE.forEach((file, i) => {
      const connector = i === FILES_TO_INCLUDE.length - 1 ? '`-- ' : '|-- ';
      treeOutput += `${connector}${file}\n`;
    });
  }

  // Add file mapping reference (debug filename -> original path)
  treeOutput += `\n${'='.repeat(50)}\n`;
  treeOutput += `File Mapping (${filesMeta.length} files)\n`;
  treeOutput += `${'='.repeat(50)}\n\n`;
  
  for (const meta of filesMeta) {
    if (meta.debugFileName !== path.basename(meta.originalRelativePath)) {
      // Only show mapping if name changed (collision)
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
