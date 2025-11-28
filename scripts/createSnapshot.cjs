// scripts/createSnapshot.js

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const projectRoot = process.cwd();

// ---- CONFIG ----
// These are the only two things you want:
const DIRS_TO_INCLUDE = ['src']; 
const FILES_TO_INCLUDE = ['DB_schema.txt'];

// ---- SNAPSHOT CREATION LOGIC ----

function createSnapshot() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipName = `oakerds_snapshot_${timestamp}.zip`;
  const outputPath = path.join(projectRoot, zipName);

  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`\nSnapshot created: ${zipName}`);
    console.log(`Total bytes: ${archive.pointer()}`);
  });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('Warning:', err.message);
    } else {
      throw err;
    }
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);

  // Include entire directories
  for (const dir of DIRS_TO_INCLUDE) {
    const absDir = path.join(projectRoot, dir);
    if (fs.existsSync(absDir) && fs.statSync(absDir).isDirectory()) {
      console.log(`Including directory: ${dir}`);
      archive.directory(absDir, dir);
    } else {
      console.warn(`Skipping missing directory: ${dir}`);
    }
  }

  // Include specific files
  for (const file of FILES_TO_INCLUDE) {
    const absFile = path.join(projectRoot, file);
    if (fs.existsSync(absFile) && fs.statSync(absFile).isFile()) {
      console.log(`Including file: ${file}`);
      archive.file(absFile, { name: file });
    } else {
      console.warn(`Skipping missing file: ${file}`);
    }
  }

  archive.finalize();
}

createSnapshot();
