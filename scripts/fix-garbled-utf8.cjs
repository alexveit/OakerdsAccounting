// scripts/fix-garbled-utf8.cjs
// Fixes garbled UTF-8 characters caused by encoding issues
// Run: node scripts/fix-garbled-utf8.cjs

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();

// Directories to scan
const SCAN_DIRS = ['src', 'supabase'];

// File extensions to process
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// Mapping of garbled sequences to replacements
const REPLACEMENTS = [
  // Arrows
  { garbled: 'â†', replace: '←' },
  { garbled: "â†'", replace: '→' },
  { garbled: 'â–¶', replace: '▶' },
  { garbled: 'â—€', replace: '◀' },
  { garbled: 'â–²', replace: '▲' },
  { garbled: 'â–¼', replace: '▼' },
  { garbled: 'â–¸', replace: '▶' },
  { garbled: 'â–¾', replace: '▼' },
  
  // Checkmarks and circles
  { garbled: 'âœ"', replace: '✓' },
  { garbled: 'âœ“', replace: '✓' },
  { garbled: 'âœ•', replace: '✕' },
  { garbled: 'â—‹', replace: '○' },
  { garbled: 'â—', replace: '●' },
  
  // Emojis (4-byte UTF-8 sequences)
  { garbled: 'ðŸ"Š', replace: '📊' }, // Dashboard
  { garbled: 'ðŸ“Š', replace: '📊' }, // Dashboard
  { garbled: 'ðŸ"§', replace: '🔧' }, // Jobs
  { garbled: 'ðŸ”§', replace: '🔧' }, // Jobs
  { garbled: "ðŸ'·", replace: '👷' }, // Installers
  { garbled: 'ðŸ‘·', replace: '👷' }, // Installers
  { garbled: 'ðŸª™', replace: '🏪' }, // Vendors
  { garbled: 'ðŸª', replace: '🏪' }, // Vendors
  { garbled: 'ðŸ"£', replace: '📣' }, // Lead Sources
  { garbled: 'ðŸ“£', replace: '📣' }, // Lead Sources
  { garbled: "ðŸ'²", replace: '💲' }, // Price List
  { garbled: 'ðŸ’²', replace: '💲' }, // Price List
  { garbled: 'ðŸ§®', replace: '🧮' }, // Floor Calculator
  { garbled: 'ðŸ"ˆ', replace: '📈' }, // Analytics
  { garbled: 'ðŸ“ˆ', replace: '📈' }, // Analytics
  { garbled: 'ðŸ"—', replace: '🔗' }, // Bank Sync
  { garbled: 'ðŸ”—', replace: '🔗' }, // Bank Sync
  { garbled: 'ðŸ¦', replace: '🏦' }, // Bank Import
  { garbled: 'ðŸ¦', replace: '🏦' }, // Bank Import
  { garbled: 'ðŸ"\'', replace: '📒' }, // Ledger
  { garbled: 'ðŸ“’', replace: '📒' }, // Ledger
  { garbled: 'ðŸ"‹', replace: '📋' }, // Expenses by Category
  { garbled: 'ðŸ“‹', replace: '📋' }, // Expenses by Category
  { garbled: "ðŸ'°", replace: '💰' }, // Profit Summary
  { garbled: 'ðŸ’°', replace: '💰' }, // Profit Summary
  { garbled: 'ðŸ"„', replace: '📄' }, // Tax Exports
  { garbled: 'ðŸ“„', replace: '📄' }, // Tax Exports
  { garbled: 'ðŸ ', replace: '🏠' }, // Rentals
  { garbled: 'ðŸ ', replace: '🏠' }, // Rentals
  { garbled: 'ðŸ"¨', replace: '🔨' }, // Flips
  { garbled: 'ðŸ”¨', replace: '🔨' }, // Flips
  { garbled: 'ðŸ“‹', replace: '📋' }, // Manage Deals
  { garbled: 'ðŸšª', replace: '🚪' }, // Log out
  
  // Menu/UI
  { garbled: 'â˜°', replace: '☰' },
  //{ garbled: 'âž•', replace: '+' },
  { garbled: 'âž•', replace: '➕' },
  { garbled: 'âž–', replace: '-' },
  
  // Punctuation
  { garbled: 'â€¦', replace: '...' },
  { garbled: 'â€"', replace: '—' },
  { garbled: 'â€"', replace: '–' },
  { garbled: 'â€™', replace: "'" },
  { garbled: 'â€œ', replace: '"' },
  { garbled: 'â€', replace: '"' },
  { garbled: 'â€¢', replace: '•' },
  
  // Box drawing (for comments)
  { garbled: 'â"€', replace: '─' },
  { garbled: 'â"‚', replace: '│' },
  { garbled: 'â"Œ', replace: '┌' },
  { garbled: 'â"', replace: '┐' },
  { garbled: 'â""', replace: '└' },
  { garbled: 'â"˜', replace: '┘' },
  { garbled: 'â"œ', replace: '├' },
  { garbled: 'â"¤', replace: '┤' },
  { garbled: 'â"¬', replace: '┬' },
  { garbled: 'â"´', replace: '┴' },
  { garbled: 'â"¼', replace: '┼' },
  
  // Misc symbols
  { garbled: 'â„¢', replace: '™' },
  { garbled: 'Â©', replace: '©' },
  { garbled: 'Â®', replace: '®' },
  { garbled: 'Â°', replace: '°' },
  { garbled: 'Â·', replace: '·' },
  { garbled: 'Ã—', replace: '×' },
  { garbled: 'Ã·', replace: '÷' },

  // New patterns discovered this session
  { garbled: 'â€"', replace: '–' },      // en-dash (different encoding)
  { garbled: 'âš ', replace: '⚠' },     // warning sign
  { garbled: 'â† ', replace: '← ' },    // left arrow
];

// Track stats
let filesScanned = 0;
let filesModified = 0;
let totalReplacements = 0;

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and hidden dirs
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walkDir(fullPath, callback);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (EXTENSIONS.includes(ext)) {
        callback(fullPath);
      }
    }
  }
}

function fixFile(filePath) {
  filesScanned++;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  let fileReplacements = 0;
  
  for (const { garbled, replace } of REPLACEMENTS) {
    const count = (content.match(new RegExp(escapeRegex(garbled), 'g')) || []).length;
    if (count > 0) {
      content = content.split(garbled).join(replace);
      fileReplacements += count;
    }
  }
  
  if (fileReplacements > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    totalReplacements += fileReplacements;
    
    const relativePath = path.relative(projectRoot, filePath);
    console.log(`  ✓ ${relativePath} (${fileReplacements} replacements)`);
  }
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Main
console.log('Fixing garbled UTF-8 characters...\n');

for (const dir of SCAN_DIRS) {
  const absDir = path.join(projectRoot, dir);
  if (fs.existsSync(absDir)) {
    console.log(`Scanning ${dir}/`);
    walkDir(absDir, fixFile);
  }
}

console.log('\n─────────────────────────────────');
console.log(`Files scanned:  ${filesScanned}`);
console.log(`Files modified: ${filesModified}`);
console.log(`Replacements:   ${totalReplacements}`);
console.log('─────────────────────────────────');

if (filesModified > 0) {
  console.log('Done! Review changes with: git diff');
} else {
  console.log('No garbled characters found.');
}
