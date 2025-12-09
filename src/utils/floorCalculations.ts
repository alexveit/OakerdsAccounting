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

// ============================================================================
// BIN PACKING ALGORITHM
// ============================================================================

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

/**
 * Find the best position for a piece using bottom-left bin packing.
 * Returns the position with the lowest Y that can accommodate the piece.
 */
function findBestPosition(
  grid: number[],
  width: number,
  length: number
): { x: number; y: number } | null {
  let bestX = 0;
  let bestY = Infinity;

  for (let x = 0; x <= ROLL_WIDTH_INCHES - width; x++) {
    // Find max height in this position range
    let maxY = 0;
    for (let i = x; i < x + width; i++) {
      maxY = Math.max(maxY, grid[i]);
    }

    if (maxY < bestY) {
      bestY = maxY;
      bestX = x;
    }
  }

  return bestY === Infinity ? null : { x: bestX, y: bestY };
}

/**
 * Run bin packing algorithm on a set of pieces.
 * Places pieces largest-first into a 12' wide roll.
 * Returns placed pieces with coordinates and the total length needed.
 */
export function runBinPacking(needs: Measurement[]): { placed: PlacedPiece[]; maxLength: number } {
  if (needs.length === 0) {
    return { placed: [], maxLength: 0 };
  }

  // Grid tracks height at each inch position across the roll width
  const grid: number[] = new Array(ROLL_WIDTH_INCHES).fill(0);
  const placed: PlacedPiece[] = [];

  // Sort by area (largest first) for better packing
  const sorted = [...needs].sort((a, b) => {
    const areaA = a.widthTotal * a.lengthTotal;
    const areaB = b.widthTotal * b.lengthTotal;
    return areaB - areaA;
  });

  for (const piece of sorted) {
    const position = findBestPosition(grid, piece.widthTotal, piece.lengthTotal);

    if (position) {
      const placedPiece: PlacedPiece = {
        ...piece,
        x: position.x,
        y: position.y,
      };
      placed.push(placedPiece);

      // Update grid heights
      const newHeight = position.y + piece.lengthTotal;
      for (let i = position.x; i < position.x + piece.widthTotal; i++) {
        grid[i] = newHeight;
      }
    }
  }

  const maxLength = Math.max(...grid, 0);
  return { placed, maxLength };
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
 */
export function calculateCarpet(options: CarpetOptions): CarpetResult {
  const { measurements, addSlippage, steps } = options;
  let allMeasurements = [...measurements];

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
  };
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
