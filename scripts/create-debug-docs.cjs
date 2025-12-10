// scripts/create-debug-docs.cjs
// Creates a debug_docs_<timestamp> folder with a FLAT set of files
// Auto-discovers root directories and files to include
// Also creates a .zip archive of the folder.

// Run: npm run debug-docs

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

// Import shared tree utilities
const {
  generateFileTree,
  discoverRootContents,
  shouldIgnore,
  shouldIncludeFile,
} = require('./file-tree.cjs');

const projectRoot = process.cwd();

// ---- HELPERS ----

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
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
  const { directories, files } = discoverRootContents(projectRoot);
  
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

  // Generate file tree using shared module
  let treeOutput = generateFileTree(projectRoot, { includeHeader: true });

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
