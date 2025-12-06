// scripts/createDebugDocs.js
// Creates a debug_docks_<timestamp> folder with a FLAT set of files
// from src/, scripts/, db_debug/ and a folder_file_architecture.json
// describing the original folder/file structure.

// Run: npm run debug-docs

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();

// ---- CONFIG ----
const DIRS_TO_INCLUDE = ['src', 'scripts', 'db_tools'];
const FILES_TO_INCLUDE = ['CODING_RULES.txt'];

// ---- HELPERS ----

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Track used filenames in the debug_docks folder to avoid collisions
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
 * Recursively walk a source directory and copy all files into a single flat dest folder.
 *
 * @param {string} srcDir         Absolute path of source directory
 * @param {string} baseRelative   Relative path from project root (e.g. 'src', 'src/components/Button.tsx')
 * @param {string} debugRootPath  Absolute path to debug_docks_<timestamp> root
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
      const originalRelativePath = relPath.replace(/\\/g, '/');
      const uniqueName = getUniqueName(entry.name);
      const destPath = path.join(debugRootPath, uniqueName);

      // Copy the file into the flat debug root folder
      fs.copyFileSync(srcPath, destPath);

      const stats = fs.statSync(srcPath);

      filesMeta.push({
        originalRelativePath,         // e.g. "src/components/Button.tsx"
        debugFileName: uniqueName,    // e.g. "Button.tsx" or "index__1.tsx"
        sizeBytes: stats.size,
        lastModified: stats.mtime.toISOString(),
      });
    }
  }
}

// ---- MAIN LOGIC ----

function createDebugDocs() {
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
      const stats = fs.statSync(srcPath);
      filesMeta.push({
        originalRelativePath: file,
        debugFileName: uniqueName,
        sizeBytes: stats.size,
        lastModified: stats.mtime.toISOString(),
      });
      console.log(`Including file: ${file}`);
    } else {
      console.warn(`Skipping missing file: ${file}`);
    }
  }

  // Build folder/file architecture description
  const architecture = {
    generatedAt: new Date().toISOString(),
    projectRootName: path.basename(projectRoot),
    debugFolderName,
    includedDirectories: DIRS_TO_INCLUDE,
    files: filesMeta,
  };

  const architecturePath = path.join(
    debugFolderPath,
    'folder_file_architecture.json'
  );

  fs.writeFileSync(
    architecturePath,
    JSON.stringify(architecture, null, 2),
    'utf8'
  );

  console.log('\nDebug docs created (flat layout):');
  console.log(`- Root: ${debugFolderName}`);
  console.log(
    `- Architecture JSON: ${path.join(
      debugFolderName,
      'folder_file_architecture.json'
    )}`
  );
}

createDebugDocs();
