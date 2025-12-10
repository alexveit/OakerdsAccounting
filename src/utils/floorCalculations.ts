// src/utils/floorCalculations.ts
// Shared calculation logic for carpet and hardwood floor calculators

// ============================================================================
// TYPES
// ============================================================================

export type Measurement = {
  id: number;
  widthFeet: number;
  widthInches: number;
  lengthFeet: number;
  lengthInches: number;
  widthTotal: number;  // Total inches
  lengthTotal: number; // Total inches
};

export type PlacedPiece = Measurement & {
  x: number;
  y: number;
};

export type CarpetResult = {
  standard: Measurement[];
  needs: PlacedPiece[];
  standardLength: number;
  needsLength: number;
  totalLength: number;
  totalSqFt: number;
  totalSqYd: number;
  usedSqFt: number;
  wasteSqFt: number;
  wastePercent: number;
  isFlipped: boolean;  // true if measurements were rotated 90° for better yield
};

export type HardwoodResult = {
  totalSqFt: number;
  wasteSqFt: number;
  totalNeeded: number;
  boxesNeeded: number;
};

// ============================================================================
// CONSTANTS
// ============================================================================

export const ROLL_WIDTH_INCHES = 144; // 12 feet
export const ROLL_WIDTH_FEET = 12;

// Test data for development
export const TEST_MEASUREMENTS = [
  { wf: 12, wi: 6, lf: 8, li: 3 },
  { wf: 14, wi: 4, lf: 13, li: 6 },
  { wf: 5, wi: 0, lf: 9, li: 6 },
  { wf: 25, wi: 3, lf: 3, li: 5 },
  { wf: 7, wi: 3, lf: 3, li: 9 },
  { wf: 2, wi: 4, lf: 2, li: 7 },
  { wf: 5, wi: 4, lf: 3, li: 3 },
  { wf: 6, wi: 1, lf: 3, li: 9 },
  { wf: 15, wi: 6, lf: 20, li: 1 },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function toTotalInches(feet: number, inches: number): number {
  return feet * 12 + inches;
}

export function formatFeetInches(totalInches: number): string {
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  if (inches === 0) return `${feet}'0"`;
  return `${feet}'${inches}"`;
}

export function formatDimensions(m: Measurement): string {
  return `${formatFeetInches(m.widthTotal)} x ${formatFeetInches(m.lengthTotal)}`;
}

export function createMeasurement(
  id: number,
  widthFeet: number,
  widthInches: number,
  lengthFeet: number,
  lengthInches: number
): Measurement {
  return {
    id,
    widthFeet,
    widthInches,
    lengthFeet,
    lengthInches,
    widthTotal: toTotalInches(widthFeet, widthInches),
    lengthTotal: toTotalInches(lengthFeet, lengthInches),
  };
}

/**
 * Parse a single dimension string like "11.6" or "11'6" into feet and inches.
 * Supports formats:
 *   - "11.6" → 11'6" (decimal = inches shorthand)
 *   - "11'6" or "11'6\"" → 11'6"
 *   - "11" → 11'0"
 */
function parseDimension(dim: string): { feet: number; inches: number } {
  const trimmed = dim.trim();
  
  // Format: 11'6" or 11'6
  const ftInMatch = trimmed.match(/^(\d+)'(\d+)"?$/);
  if (ftInMatch) {
    return { feet: parseInt(ftInMatch[1], 10), inches: parseInt(ftInMatch[2], 10) };
  }
  
  // Format: 11.6 (shorthand: decimal = inches)
  if (trimmed.includes('.')) {
    const [ftPart, inPart] = trimmed.split('.');
    return { feet: parseInt(ftPart, 10) || 0, inches: parseInt(inPart, 10) || 0 };
  }
  
  // Format: just feet
  return { feet: parseInt(trimmed, 10) || 0, inches: 0 };
}

/** Result of parsing a single bulk entry */
export type ParsedEntry = {
  raw: string;
  measurement: Measurement | null;
  error: string | null;
  warning: string | null;
};

/** Result of parsing bulk input with validation info */
export type BulkParseResult = {
  entries: ParsedEntry[];
  valid: Measurement[];
  validCount: number;
  errorCount: number;
  warningCount: number;
};

const MAX_REASONABLE_FEET = 50; // Flag anything over 50' as suspicious

/**
 * Parse bulk measurement input with validation feedback.
 * Supports:
 *   - Newline or comma separated entries
 *   - Room labels like "LR 11.6x13.6" (labels stripped)
 *   - Separators: x, *, :
 *   - Format: 11.6x13.6 (decimal = inches) or 11'6"x13'6"
 * 
 * @param input Raw text from bulk entry textarea
 * @param startId Starting ID for measurements
 * @returns BulkParseResult with validation details
 */
export function parseBulkMeasurements(input: string, startId: number): BulkParseResult {
  const entries: ParsedEntry[] = [];
  const valid: Measurement[] = [];
  let currentId = startId;
  let errorCount = 0;
  let warningCount = 0;
  
  // Split by newlines
  const lines = input.split(/\r?\n/);
  
  for (const line of lines) {
    // Split by commas
    const rawEntries = line.split(',');
    
    for (const rawEntry of rawEntries) {
      const raw = rawEntry.trim();
      if (!raw) continue;
      
      // Extract the measurement pattern directly: number[.number] separator number[.number]
      // This handles room names like "Bed2", "Room10", etc.
      const measurementMatch = raw.match(/(\d+\.?\d*)\s*[x*:]\s*(\d+\.?\d*)/i);
      
      if (!measurementMatch) {
        entries.push({ raw, measurement: null, error: 'No dimensions found', warning: null });
        errorCount++;
        continue;
      }
      
      const cleaned = measurementMatch[0];
      
      // Normalize separator to 'x'
      const normalized = cleaned.replace(/[*:]/g, 'x');
      
      // Split into width x length
      const parts = normalized.split('x');
      if (parts.length !== 2) {
        entries.push({ raw, measurement: null, error: 'Invalid format (use WxL)', warning: null });
        errorCount++;
        continue;
      }
      
      const width = parseDimension(parts[0]);
      const length = parseDimension(parts[1]);
      
      // Check for zero dimensions
      if (width.feet === 0 && width.inches === 0) {
        entries.push({ raw, measurement: null, error: 'Width is zero', warning: null });
        errorCount++;
        continue;
      }
      if (length.feet === 0 && length.inches === 0) {
        entries.push({ raw, measurement: null, error: 'Length is zero', warning: null });
        errorCount++;
        continue;
      }
      
      // Normalize inches > 11
      const normalizedWi = width.inches % 12;
      const extraWf = Math.floor(width.inches / 12);
      const normalizedLi = length.inches % 12;
      const extraLf = Math.floor(length.inches / 12);
      
      const finalWidthFeet = width.feet + extraWf;
      const finalLengthFeet = length.feet + extraLf;
      
      // Check for suspicious values
      let warning: string | null = null;
      if (finalWidthFeet > MAX_REASONABLE_FEET || finalLengthFeet > MAX_REASONABLE_FEET) {
        warning = `Large dimension (>${MAX_REASONABLE_FEET}') - typo?`;
        warningCount++;
      }
      
      const measurement = createMeasurement(
        currentId++,
        finalWidthFeet,
        normalizedWi,
        finalLengthFeet,
        normalizedLi
      );
      
      entries.push({ raw, measurement, error: null, warning });
      valid.push(measurement);
    }
  }
  
  return {
    entries,
    valid,
    validCount: valid.length,
    errorCount,
    warningCount,
  };
}

// ============================================================================
// BIN PACKING ALGORITHM - Shelf-Based (No Rotation)
// ============================================================================
// 
// Carpet CANNOT be rotated due to:
// - Nap direction must be consistent
// - Pattern matching requirements  
// - Seam visibility
//
// Strategy: Group pieces by similar length into horizontal "shelves"
// to minimize waste and create clean horizontal seams.

/**
 * Aggregate measurements with the same length into combined pieces.
 * This allows multiple narrow pieces of the same length to be cut from
 * a single strip across the roll width.
 */
export function aggregateSameLengths(
  measurements: Measurement[],
  nextId: { value: number }
): Measurement[] {
  const byLength = new Map<number, Measurement[]>();

  for (const m of measurements) {
    const existing = byLength.get(m.lengthTotal) || [];
    existing.push(m);
    byLength.set(m.lengthTotal, existing);
  }

  const aggregated: Measurement[] = [];

  for (const [lengthTotal, pieces] of byLength.entries()) {
    let totalWidthInches = 0;
    for (const p of pieces) {
      totalWidthInches += p.widthTotal;
    }

    const lengthFeet = Math.floor(lengthTotal / 12);
    const lengthInches = lengthTotal % 12;
    const widthFeet = Math.floor(totalWidthInches / 12);
    const widthInches = totalWidthInches % 12;

    aggregated.push({
      id: nextId.value++,
      widthFeet,
      widthInches,
      lengthFeet,
      lengthInches,
      widthTotal: totalWidthInches,
      lengthTotal,
    });
  }

  return aggregated;
}

type Shelf = {
  y: number;             // Starting Y position
  height: number;        // Shelf height (longest piece length in shelf)
  pieces: PlacedPiece[]; // Pieces placed on this shelf
  usedWidth: number;     // Total width used so far
};

/**
 * Find the best shelf for a piece.
 * Prefers shelves where the piece length closely matches shelf height.
 */
function findBestShelf(
  shelves: Shelf[],
  piece: Measurement,
  tolerance: number // Max difference between piece length and shelf height (inches)
): Shelf | null {
  let bestShelf: Shelf | null = null;
  let bestWaste = Infinity;
  
  for (const shelf of shelves) {
    // Check if piece fits in remaining width
    const remainingWidth = ROLL_WIDTH_INCHES - shelf.usedWidth;
    if (piece.widthTotal > remainingWidth) continue;
    
    // Piece must be <= shelf height (can't extend above shelf)
    const lengthDiff = shelf.height - piece.lengthTotal;
    if (lengthDiff < 0) continue;
    if (lengthDiff > tolerance) continue;
    
    // Prefer shelves with less waste
    const waste = lengthDiff * piece.widthTotal;
    if (waste < bestWaste) {
      bestWaste = waste;
      bestShelf = shelf;
    }
  }
  
  return bestShelf;
}

/**
 * Place a piece on a shelf.
 */
function placeOnShelf(shelf: Shelf, piece: Measurement): PlacedPiece {
  const placed: PlacedPiece = {
    ...piece,
    x: shelf.usedWidth,
    y: shelf.y,
  };
  shelf.pieces.push(placed);
  shelf.usedWidth += piece.widthTotal;
  return placed;
}

/**
 * Run bin packing with multiple strategies and pick the best result.
 */
export function runBinPacking(needs: Measurement[]): { placed: PlacedPiece[]; maxLength: number } {
  if (needs.length === 0) {
    return { placed: [], maxLength: 0 };
  }
  
  const results: { placed: PlacedPiece[]; maxLength: number }[] = [];
  
  // Strategy 1: Shelf packing - sort by length desc, then width desc
  results.push(packWithShelfStrategy(needs, (a, b) => {
    if (b.lengthTotal !== a.lengthTotal) return b.lengthTotal - a.lengthTotal;
    return b.widthTotal - a.widthTotal;
  }, 6)); // 6" tolerance
  
  // Strategy 2: Shelf packing - tighter tolerance
  results.push(packWithShelfStrategy(needs, (a, b) => b.lengthTotal - a.lengthTotal, 4));
  
  // Strategy 3: Length grouping with gap filling
  results.push(packWithLengthGrouping(needs));
  
  // Strategy 4: First-fit decreasing (height map)
  results.push(packFirstFitDecreasing(needs));
  
  // Strategy 5: Two-phase: large pieces first, then fill gaps
  results.push(packTwoPhase(needs));
  
  // Strategy 6: Group identical/similar small pieces horizontally
  results.push(packWithSmallPieceGrouping(needs));
  
  // Strategy 7: Place large first, then aggressively fill gaps
  results.push(packWithAggressiveGapFill(needs));
  
  // Strategy 8: Simulated annealing - optimize best heuristic result
  if (needs.length >= 3) {
    let bestHeuristic = results[0];
    for (const result of results) {
      if (result.maxLength < bestHeuristic.maxLength) {
        bestHeuristic = result;
      }
    }
    const annealedResult = simulatedAnnealing(needs, bestHeuristic);
    results.push(annealedResult);
  }
  
  // Return the best result
  let best = results[0];
  for (const result of results) {
    if (result.maxLength < best.maxLength) {
      best = result;
    }
  }
  
  return best;
}

/**
 * Pack using shelf strategy with a given sort order.
 */
function packWithShelfStrategy(
  needs: Measurement[],
  sortFn: (a: Measurement, b: Measurement) => number,
  tolerance: number
): { placed: PlacedPiece[]; maxLength: number } {
  const sorted = [...needs].sort(sortFn);
  const shelves: Shelf[] = [];
  const placed: PlacedPiece[] = [];
  let currentY = 0;
  
  for (const piece of sorted) {
    let shelf = findBestShelf(shelves, piece, tolerance);
    
    if (!shelf) {
      // Create new shelf
      shelf = {
        y: currentY,
        height: piece.lengthTotal,
        pieces: [],
        usedWidth: 0,
      };
      shelves.push(shelf);
      currentY += shelf.height;
    }
    
    placed.push(placeOnShelf(shelf, piece));
  }
  
  const maxLength = shelves.reduce((max, s) => Math.max(max, s.y + s.height), 0);
  return { placed, maxLength };
}

/**
 * Pack by grouping similar lengths, then filling gaps with small pieces.
 */
function packWithLengthGrouping(needs: Measurement[]): { placed: PlacedPiece[]; maxLength: number } {
  // Separate large and small pieces
  const large = needs.filter(p => p.widthTotal >= 48 || p.lengthTotal >= 48);
  const small = needs.filter(p => p.widthTotal < 48 && p.lengthTotal < 48);
  
  // Sort large by length desc
  large.sort((a, b) => b.lengthTotal - a.lengthTotal);
  // Sort small by area desc
  small.sort((a, b) => (b.widthTotal * b.lengthTotal) - (a.widthTotal * a.lengthTotal));
  
  // Group large pieces by similar length (within 6")
  const groups: Measurement[][] = [];
  
  for (const piece of large) {
    let foundGroup = false;
    for (const group of groups) {
      const groupLength = group[0].lengthTotal;
      const groupWidth = group.reduce((sum, p) => sum + p.widthTotal, 0);
      
      if (Math.abs(piece.lengthTotal - groupLength) <= 6 &&
          groupWidth + piece.widthTotal <= ROLL_WIDTH_INCHES) {
        group.push(piece);
        foundGroup = true;
        break;
      }
    }
    if (!foundGroup) {
      groups.push([piece]);
    }
  }
  
  // Place groups as shelves
  const placed: PlacedPiece[] = [];
  const heightMap: number[] = new Array(ROLL_WIDTH_INCHES).fill(0);
  
  for (const group of groups) {
    const shelfHeight = Math.max(...group.map(p => p.lengthTotal));
    
    // Find lowest Y where entire group fits
    let shelfY = 0;
    let shelfX = 0;
    const groupWidth = group.reduce((sum, p) => sum + p.widthTotal, 0);
    
    for (let x = 0; x <= ROLL_WIDTH_INCHES - groupWidth; x++) {
      let maxH = 0;
      for (let i = x; i < x + groupWidth; i++) {
        maxH = Math.max(maxH, heightMap[i]);
      }
      if (maxH < shelfY || shelfY === 0) {
        shelfY = maxH;
        shelfX = x;
      }
    }
    
    // Place pieces in group
    let x = shelfX;
    for (const piece of group) {
      placed.push({ ...piece, x, y: shelfY });
      // Update height map
      for (let i = x; i < x + piece.widthTotal; i++) {
        heightMap[i] = shelfY + shelfHeight;
      }
      x += piece.widthTotal;
    }
  }
  
  // Now fill gaps with small pieces
  for (const piece of small) {
    let bestX = 0;
    let bestY = Infinity;
    
    for (let x = 0; x <= ROLL_WIDTH_INCHES - piece.widthTotal; x++) {
      let maxH = 0;
      for (let i = x; i < x + piece.widthTotal; i++) {
        maxH = Math.max(maxH, heightMap[i]);
      }
      if (maxH < bestY) {
        bestY = maxH;
        bestX = x;
      }
    }
    
    placed.push({ ...piece, x: bestX, y: bestY });
    const newHeight = bestY + piece.lengthTotal;
    for (let i = bestX; i < bestX + piece.widthTotal; i++) {
      heightMap[i] = newHeight;
    }
  }
  
  const maxLength = Math.max(...heightMap, 0);
  return { placed, maxLength };
}

/**
 * First-fit decreasing by area.
 */
function packFirstFitDecreasing(needs: Measurement[]): { placed: PlacedPiece[]; maxLength: number } {
  const sorted = [...needs].sort((a, b) => 
    (b.widthTotal * b.lengthTotal) - (a.widthTotal * a.lengthTotal)
  );
  
  const heightMap: number[] = new Array(ROLL_WIDTH_INCHES).fill(0);
  const placed: PlacedPiece[] = [];
  
  for (const piece of sorted) {
    let bestX = 0;
    let bestY = Infinity;
    
    for (let x = 0; x <= ROLL_WIDTH_INCHES - piece.widthTotal; x++) {
      let maxH = 0;
      for (let i = x; i < x + piece.widthTotal; i++) {
        maxH = Math.max(maxH, heightMap[i]);
      }
      if (maxH < bestY) {
        bestY = maxH;
        bestX = x;
      }
    }
    
    placed.push({ ...piece, x: bestX, y: bestY });
    const newHeight = bestY + piece.lengthTotal;
    for (let i = bestX; i < bestX + piece.widthTotal; i++) {
      heightMap[i] = newHeight;
    }
  }
  
  return { placed, maxLength: Math.max(...heightMap, 0) };
}

/**
 * Two-phase packing: place large pieces first, then fill gaps with small pieces.
 */
function packTwoPhase(needs: Measurement[]): { placed: PlacedPiece[]; maxLength: number } {
  // Phase 1: Sort by length desc and pack
  const byLength = [...needs].sort((a, b) => b.lengthTotal - a.lengthTotal);
  
  const heightMap: number[] = new Array(ROLL_WIDTH_INCHES).fill(0);
  const placed: PlacedPiece[] = [];
  
  // Place longest pieces first, trying to align them horizontally
  for (const piece of byLength) {
    // Find position that creates least additional height
    let bestX = 0;
    let bestY = Infinity;
    let bestScore = Infinity;
    
    for (let x = 0; x <= ROLL_WIDTH_INCHES - piece.widthTotal; x++) {
      let maxH = 0;
      for (let i = x; i < x + piece.widthTotal; i++) {
        maxH = Math.max(maxH, heightMap[i]);
      }
      
      // Score = resulting height + gap created
      const newHeight = maxH + piece.lengthTotal;
      let gapArea = 0;
      for (let i = x; i < x + piece.widthTotal; i++) {
        gapArea += maxH - heightMap[i];
      }
      const score = newHeight + gapArea * 0.5;
      
      if (score < bestScore) {
        bestScore = score;
        bestY = maxH;
        bestX = x;
      }
    }
    
    placed.push({ ...piece, x: bestX, y: bestY });
    const newHeight = bestY + piece.lengthTotal;
    for (let i = bestX; i < bestX + piece.widthTotal; i++) {
      heightMap[i] = newHeight;
    }
  }
  
  return { placed, maxLength: Math.max(...heightMap, 0) };
}

/**
 * Smart packing that groups identical/similar small pieces side-by-side.
 * Specifically handles repeated pieces like stairs that should share rows.
 */
function packWithSmallPieceGrouping(needs: Measurement[]): { placed: PlacedPiece[]; maxLength: number } {
  // Find groups of identical or very similar pieces
  const pieceGroups = new Map<string, Measurement[]>();
  
  for (const piece of needs) {
    // Key by rounded dimensions (within 2")
    const wKey = Math.round(piece.widthTotal / 2) * 2;
    const lKey = Math.round(piece.lengthTotal / 2) * 2;
    const key = `${wKey}x${lKey}`;
    
    const group = pieceGroups.get(key) || [];
    group.push(piece);
    pieceGroups.set(key, group);
  }
  
  // Separate into: groups of 2+ similar pieces, and unique pieces
  const similarGroups: Measurement[][] = [];
  const uniquePieces: Measurement[] = [];
  
  for (const [_, group] of pieceGroups) {
    if (group.length >= 2) {
      similarGroups.push(group);
    } else {
      uniquePieces.push(...group);
    }
  }
  
  // Sort groups by piece length (longest first)
  similarGroups.sort((a, b) => b[0].lengthTotal - a[0].lengthTotal);
  // Sort unique pieces by length desc
  uniquePieces.sort((a, b) => b.lengthTotal - a.lengthTotal);
  
  const heightMap: number[] = new Array(ROLL_WIDTH_INCHES).fill(0);
  const placed: PlacedPiece[] = [];
  
  // Helper to place a piece at best position
  function placePiece(piece: Measurement): void {
    let bestX = 0;
    let bestY = Infinity;
    let bestScore = Infinity;
    
    for (let x = 0; x <= ROLL_WIDTH_INCHES - piece.widthTotal; x++) {
      let maxH = 0;
      for (let i = x; i < x + piece.widthTotal; i++) {
        maxH = Math.max(maxH, heightMap[i]);
      }
      
      // Score: prefer lower Y, penalize gaps
      let gapArea = 0;
      for (let i = x; i < x + piece.widthTotal; i++) {
        gapArea += maxH - heightMap[i];
      }
      const score = maxH * 100 + gapArea;
      
      if (score < bestScore) {
        bestScore = score;
        bestY = maxH;
        bestX = x;
      }
    }
    
    placed.push({ ...piece, x: bestX, y: bestY });
    const newHeight = bestY + piece.lengthTotal;
    for (let i = bestX; i < bestX + piece.widthTotal; i++) {
      heightMap[i] = newHeight;
    }
  }
  
  // Helper to place multiple pieces side-by-side on same row
  function placeGroupHorizontally(group: Measurement[]): void {
    const totalWidth = group.reduce((sum, p) => sum + p.widthTotal, 0);
    const maxLength = Math.max(...group.map(p => p.lengthTotal));
    
    if (totalWidth <= ROLL_WIDTH_INCHES) {
      // Can fit all on one row - find best Y position
      let bestX = 0;
      let bestY = Infinity;
      
      for (let x = 0; x <= ROLL_WIDTH_INCHES - totalWidth; x++) {
        let maxH = 0;
        for (let i = x; i < x + totalWidth; i++) {
          maxH = Math.max(maxH, heightMap[i]);
        }
        if (maxH < bestY) {
          bestY = maxH;
          bestX = x;
        }
      }
      
      // Place all pieces side by side
      let currentX = bestX;
      for (const piece of group) {
        placed.push({ ...piece, x: currentX, y: bestY });
        currentX += piece.widthTotal;
      }
      
      // Update height map
      for (let i = bestX; i < bestX + totalWidth; i++) {
        heightMap[i] = bestY + maxLength;
      }
    } else {
      // Too wide - split into sub-rows
      let currentRow: Measurement[] = [];
      let currentRowWidth = 0;
      
      for (const piece of group) {
        if (currentRowWidth + piece.widthTotal <= ROLL_WIDTH_INCHES) {
          currentRow.push(piece);
          currentRowWidth += piece.widthTotal;
        } else {
          // Place current row and start new one
          if (currentRow.length > 0) {
            placeGroupHorizontally(currentRow);
          }
          currentRow = [piece];
          currentRowWidth = piece.widthTotal;
        }
      }
      
      // Place remaining row
      if (currentRow.length > 0) {
        placeGroupHorizontally(currentRow);
      }
    }
  }
  
  // First, place unique large pieces (length > 100")
  const largePieces = uniquePieces.filter(p => p.lengthTotal > 100);
  const smallUnique = uniquePieces.filter(p => p.lengthTotal <= 100);
  
  for (const piece of largePieces) {
    placePiece(piece);
  }
  
  // Place similar piece groups (these benefit most from sharing rows)
  for (const group of similarGroups) {
    placeGroupHorizontally(group);
  }
  
  // Finally, place remaining small unique pieces (fill gaps)
  // Sort by length desc for better gap filling
  smallUnique.sort((a, b) => b.lengthTotal - a.lengthTotal);
  for (const piece of smallUnique) {
    placePiece(piece);
  }
  
  return { placed, maxLength: Math.max(...heightMap, 0) };
}

/**
 * Aggressive gap-filling: place large pieces, then scan for gaps and fill them.
 */
function packWithAggressiveGapFill(needs: Measurement[]): { placed: PlacedPiece[]; maxLength: number } {
  // Separate by size
  const sorted = [...needs].sort((a, b) => {
    // Sort by length desc, then width desc
    if (b.lengthTotal !== a.lengthTotal) return b.lengthTotal - a.lengthTotal;
    return b.widthTotal - a.widthTotal;
  });
  
  // Track placed rectangles for gap detection
  const placedRects: { x: number; y: number; w: number; h: number }[] = [];
  const placed: PlacedPiece[] = [];
  let maxY = 0;
  
  // Helper: check if a rectangle overlaps any placed piece
  function overlaps(x: number, y: number, w: number, h: number): boolean {
    for (const rect of placedRects) {
      if (x < rect.x + rect.w && x + w > rect.x &&
          y < rect.y + rect.h && y + h > rect.y) {
        return true;
      }
    }
    return false;
  }
  
  // Helper: find all gaps in the current layout
  function findGaps(): { x: number; y: number; w: number; h: number }[] {
    const gaps: { x: number; y: number; w: number; h: number }[] = [];
    
    // Build height map
    const heightMap: number[] = new Array(ROLL_WIDTH_INCHES).fill(0);
    for (const rect of placedRects) {
      for (let i = rect.x; i < rect.x + rect.w && i < ROLL_WIDTH_INCHES; i++) {
        heightMap[i] = Math.max(heightMap[i], rect.y + rect.h);
      }
    }
    
    // Scan for contiguous gaps below maxY
    let gapStart = -1;
    let gapMinHeight = 0;
    
    for (let x = 0; x <= ROLL_WIDTH_INCHES; x++) {
      const h = x < ROLL_WIDTH_INCHES ? heightMap[x] : maxY;
      
      if (h < maxY && gapStart === -1) {
        // Start of gap
        gapStart = x;
        gapMinHeight = h;
      } else if (gapStart !== -1) {
        if (h >= maxY || x === ROLL_WIDTH_INCHES) {
          // End of gap
          const gapWidth = x - gapStart;
          const gapHeight = maxY - gapMinHeight;
          if (gapWidth >= 12 && gapHeight >= 12) { // Min 1 foot
            gaps.push({ x: gapStart, y: gapMinHeight, w: gapWidth, h: gapHeight });
          }
          gapStart = -1;
        } else {
          gapMinHeight = Math.min(gapMinHeight, h);
        }
      }
    }
    
    return gaps;
  }
  
  // Helper: find best position for a piece (prefer gaps)
  function findBestPosition(piece: Measurement): { x: number; y: number } {
    const gaps = findGaps();
    
    // First, try to fit in an existing gap
    for (const gap of gaps) {
      if (piece.widthTotal <= gap.w && piece.lengthTotal <= gap.h) {
        // Fits in gap!
        if (!overlaps(gap.x, gap.y, piece.widthTotal, piece.lengthTotal)) {
          return { x: gap.x, y: gap.y };
        }
      }
    }
    
    // No gap fits - use height map to find lowest position
    const heightMap: number[] = new Array(ROLL_WIDTH_INCHES).fill(0);
    for (const rect of placedRects) {
      for (let i = rect.x; i < rect.x + rect.w && i < ROLL_WIDTH_INCHES; i++) {
        heightMap[i] = Math.max(heightMap[i], rect.y + rect.h);
      }
    }
    
    let bestX = 0;
    let bestY = Infinity;
    
    for (let x = 0; x <= ROLL_WIDTH_INCHES - piece.widthTotal; x++) {
      let maxH = 0;
      for (let i = x; i < x + piece.widthTotal; i++) {
        maxH = Math.max(maxH, heightMap[i]);
      }
      if (maxH < bestY) {
        bestY = maxH;
        bestX = x;
      }
    }
    
    return { x: bestX, y: bestY };
  }
  
  // Place all pieces
  for (const piece of sorted) {
    const pos = findBestPosition(piece);
    
    placed.push({ ...piece, x: pos.x, y: pos.y });
    placedRects.push({ x: pos.x, y: pos.y, w: piece.widthTotal, h: piece.lengthTotal });
    maxY = Math.max(maxY, pos.y + piece.lengthTotal);
  }
  
  return { placed, maxLength: maxY };
}

/**
 * Simulated Annealing optimization for bin packing.
 * Starts with a heuristic solution and iteratively improves it.
 * 
 * Uses placement ORDER shuffling - repack with different piece orderings
 * to find better arrangements.
 */
function simulatedAnnealing(
  needs: Measurement[],
  initialSolution: { placed: PlacedPiece[]; maxLength: number }
): { placed: PlacedPiece[]; maxLength: number } {
  const n = initialSolution.placed.length;
  
  // Need at least 3 pieces to benefit from reordering
  if (n < 3) {
    return initialSolution;
  }
  
  // Configuration - conservative to avoid hangs
  const maxTimeMs = 3000; // 3 second hard limit
  const maxIterations = 3000;
  
  const startTime = Date.now();
  
  // Current order of pieces (indices into placed array)
  let currentOrder = Array.from({ length: n }, (_, i) => i);
  let currentScore = initialSolution.maxLength;
  
  let bestOrder = [...currentOrder];
  let bestScore = currentScore;
  let bestPlacement = initialSolution.placed;
  
  // Temperature for acceptance probability
  let temperature = 30;
  const coolingRate = 0.99;
  
  // Helper: repack pieces in given order
  function repack(order: number[]): { placed: PlacedPiece[]; maxLength: number } {
    const heightMap: number[] = new Array(ROLL_WIDTH_INCHES).fill(0);
    const placed: PlacedPiece[] = [];
    
    for (const idx of order) {
      const piece = initialSolution.placed[idx];
      
      // Find best position (lowest Y)
      let bestX = 0;
      let bestY = Infinity;
      
      for (let x = 0; x <= ROLL_WIDTH_INCHES - piece.widthTotal; x++) {
        let maxH = 0;
        for (let i = x; i < x + piece.widthTotal; i++) {
          maxH = Math.max(maxH, heightMap[i]);
        }
        if (maxH < bestY) {
          bestY = maxH;
          bestX = x;
        }
      }
      
      placed.push({ ...piece, x: bestX, y: bestY });
      
      // Update height map
      for (let i = bestX; i < bestX + piece.widthTotal; i++) {
        heightMap[i] = bestY + piece.lengthTotal;
      }
    }
    
    const maxLength = Math.max(...heightMap, 0);
    return { placed, maxLength };
  }
  
  // Main loop
  for (let iter = 0; iter < maxIterations; iter++) {
    // Check time every 100 iterations
    if (iter % 100 === 0 && Date.now() - startTime > maxTimeMs) {
      break;
    }
    
    // Generate neighbor by swapping two random positions
    const newOrder = [...currentOrder];
    const i = Math.floor(Math.random() * n);
    const j = Math.floor(Math.random() * n);
    if (i !== j) {
      [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
    }
    
    // Repack with new order
    const result = repack(newOrder);
    const newScore = result.maxLength;
    
    // Decide whether to accept
    const delta = newScore - currentScore;
    
    if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
      currentOrder = newOrder;
      currentScore = newScore;
      
      if (newScore < bestScore) {
        bestOrder = [...newOrder];
        bestScore = newScore;
        bestPlacement = result.placed;
      }
    }
    
    // Cool down
    temperature *= coolingRate;
    if (temperature < 0.1) temperature = 0.1;
  }
  
  return { placed: bestPlacement, maxLength: bestScore };
}

// ============================================================================
// CARPET CALCULATION
// ============================================================================

export type CarpetOptions = {
  measurements: Measurement[];
  addSlippage: boolean;
  steps: number;
};

/**
 * Calculate carpet requirements.
 * - Aggregates same-length pieces
 * - Splits pieces wider than 12' into standard + needs
 * - Uses bin packing to optimize needs placement
 * - Calculates total length, sq ft, and waste
 * - Tries both original and flipped orientations, returns the better result
 */
export function calculateCarpet(options: CarpetOptions): CarpetResult {
  const { measurements, addSlippage, steps } = options;
  
  // Helper function to run full calculation on a set of measurements
  function runCalculation(inputMeasurements: Measurement[]): CarpetResult {
    let allMeasurements = [...inputMeasurements];

    // Add steps (4' x 2' each)
    for (let i = 0; i < steps; i++) {
      allMeasurements.push(createMeasurement(9000 + i, 4, 0, 2, 0));
    }

    // Apply slippage (4" buffer for cutting)
    if (addSlippage) {
      allMeasurements = allMeasurements.map((m) => ({
        ...m,
        widthTotal: m.widthTotal + 4,
        lengthTotal: m.lengthTotal + 4,
      }));
    }

    const nextId = { value: 1000 };
    const aggregated = aggregateSameLengths(allMeasurements, nextId);

    const standard: Measurement[] = [];
    const needsRaw: Measurement[] = [];

    // Split into standard (12' wide) and needs (remainder)
    for (const m of aggregated) {
      let remainingWidth = m.widthTotal;

      // While remaining width > 12', split off 12' wide standard pieces
      while (remainingWidth > ROLL_WIDTH_INCHES) {
        standard.push({
          ...m,
          id: nextId.value++,
          widthFeet: ROLL_WIDTH_FEET,
          widthInches: 0,
          widthTotal: ROLL_WIDTH_INCHES,
        });
        remainingWidth -= ROLL_WIDTH_INCHES;
      }

      // Whatever is left goes to needs (or standards if exactly 12')
      if (remainingWidth > 0) {
        const piece: Measurement = {
          ...m,
          id: nextId.value++,
          widthFeet: Math.floor(remainingWidth / 12),
          widthInches: remainingWidth % 12,
          widthTotal: remainingWidth,
        };

        if (remainingWidth === ROLL_WIDTH_INCHES) {
          standard.push(piece);
        } else {
          needsRaw.push(piece);
        }
      }
    }

    // Calculate actual area used (before slippage adjustment for true comparison)
    const usedSqInches = allMeasurements.reduce(
      (sum, m) => sum + m.widthTotal * m.lengthTotal,
      0
    );
    const usedSqFt = usedSqInches / 144;

    // Calculate lengths
    const standardLength = standard.reduce((sum, m) => sum + m.lengthTotal, 0);
    const { placed: needs, maxLength: needsLength } = runBinPacking(needsRaw);
    const totalLength = standardLength + needsLength;

    // Calculate totals
    const totalSqFt = (ROLL_WIDTH_INCHES * totalLength) / 144;
    const totalSqYd = totalSqFt / 9;
    const wasteSqFt = totalSqFt - usedSqFt;
    const wastePercent = totalSqFt > 0 ? (wasteSqFt / totalSqFt) * 100 : 0;

    return {
      standard,
      needs,
      standardLength,
      needsLength,
      totalLength,
      totalSqFt,
      totalSqYd,
      usedSqFt,
      wasteSqFt,
      wastePercent,
      isFlipped: false,  // Will be overridden if flipped result is better
    };
  }
  
  // Run with original measurements
  const originalResult = runCalculation(measurements);
  
  // Create flipped measurements (swap width and length) on raw input
  const flippedMeasurements: Measurement[] = measurements.map(m => ({
    ...m,
    widthFeet: m.lengthFeet,
    widthInches: m.lengthInches,
    widthTotal: m.lengthTotal,
    lengthFeet: m.widthFeet,
    lengthInches: m.widthInches,
    lengthTotal: m.widthTotal,
  }));
  
  // Run with flipped measurements
  const flippedResult = runCalculation(flippedMeasurements);
  
  // Return whichever has less total length (less waste)
  if (flippedResult.totalLength < originalResult.totalLength) {
    return { ...flippedResult, isFlipped: true };
  }
  
  return originalResult;
}

// ============================================================================
// HARDWOOD CALCULATION
// ============================================================================

export type HardwoodOptions = {
  measurements: Measurement[];
  wastePercent: number;
  boxSqFt: number;
};

/**
 * Calculate hardwood flooring requirements.
 * Simple sq ft calculation with waste percentage and box count.
 */
export function calculateHardwood(options: HardwoodOptions): HardwoodResult {
  const { measurements, wastePercent, boxSqFt } = options;

  const totalSqInches = measurements.reduce(
    (sum, m) => sum + m.widthTotal * m.lengthTotal,
    0
  );
  const totalSqFt = totalSqInches / 144;
  const wasteSqFt = totalSqFt * (wastePercent / 100);
  const totalNeeded = totalSqFt + wasteSqFt;
  const boxesNeeded = Math.ceil(totalNeeded / boxSqFt);

  return {
    totalSqFt,
    wasteSqFt,
    totalNeeded,
    boxesNeeded,
  };
}
