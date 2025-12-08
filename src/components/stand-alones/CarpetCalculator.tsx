import { useState, useRef, useEffect, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

type Measurement = {
  id: number;
  widthFeet: number;
  widthInches: number;
  lengthFeet: number;
  lengthInches: number;
  // Computed
  widthTotal: number;  // Total inches
  lengthTotal: number; // Total inches
  // Placement (set by algorithm)
  x: number;
  y: number;
};

type PlacedPiece = Measurement & {
  x: number;
  y: number;
};

type CalculationResult = {
  standardPieces: Measurement[];  // Full 144" width pieces
  needsPieces: PlacedPiece[];     // Pieces that need optimization
  totalLengthInches: number;
  totalSqFt: number;
  totalSqYd: number;
  usedSqFt: number;
  wasteSqFt: number;
  wasteSqYd: number;
  wastePercent: number;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const ROLL_WIDTH_INCHES = 144; // 12 feet
const ROLL_WIDTH_FEET = 12;
const SCALE = 2; // pixels per inch for display
const CANVAS_WIDTH = ROLL_WIDTH_INCHES * SCALE;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function toTotalInches(feet: number, inches: number): number {
  return feet * 12 + inches;
}

function formatFeetInches(totalInches: number): string {
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  if (inches === 0) return `${feet}'0"`;
  return `${feet}'${inches}"`;
}

function formatDimensions(m: Measurement): string {
  return `${formatFeetInches(m.widthTotal)} x ${formatFeetInches(m.lengthTotal)}`;
}

function createMeasurement(
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
    x: 0,
    y: 0,
  };
}

function invertMeasurement(m: Measurement): Measurement {
  return {
    ...m,
    widthFeet: m.lengthFeet,
    widthInches: m.lengthInches,
    lengthFeet: m.widthFeet,
    lengthInches: m.widthInches,
    widthTotal: m.lengthTotal,
    lengthTotal: m.widthTotal,
  };
}

// ============================================================================
// BIN PACKING ALGORITHM (144-inch precision)
// ============================================================================

function calculatePlacements(
  measurements: Measurement[],
  tryInvert: boolean
): { placed: PlacedPiece[]; standardPieces: Measurement[]; maxLength: number } {
  // Separate full-width pieces (standard) from pieces that need fitting (needs)
  const standard: Measurement[] = [];
  const needs: Measurement[] = [];

  for (const m of measurements) {
    // If width equals roll width, it's a standard piece
    if (m.widthTotal === ROLL_WIDTH_INCHES) {
      standard.push(m);
    } else if (m.widthTotal > ROLL_WIDTH_INCHES) {
      // Too wide - try inverted
      if (m.lengthTotal <= ROLL_WIDTH_INCHES) {
        needs.push(invertMeasurement(m));
      } else {
        // Can't fit either way - would need to be split (future feature)
        console.warn(`Piece ${m.id} too large: ${formatDimensions(m)}`);
      }
    } else {
      needs.push(m);
    }
  }

  // If trying invert, also consider inverted versions
  let bestNeeds = [...needs];
  let bestMaxLength = Infinity;
  let bestPlacements: PlacedPiece[] = [];

  const configurations = tryInvert ? [false, true] : [false];

  for (const invert of configurations) {
    const testNeeds = invert
      ? needs.map((m) => (m.lengthTotal <= ROLL_WIDTH_INCHES ? invertMeasurement(m) : m))
      : [...needs];

    const { placed, maxLength } = runBinPacking(testNeeds);

    if (maxLength < bestMaxLength) {
      bestMaxLength = maxLength;
      bestPlacements = placed;
      bestNeeds = testNeeds;
    }
  }

  // Calculate standard pieces total length
  const standardLength = standard.reduce((sum, m) => sum + m.lengthTotal, 0);

  return {
    placed: bestPlacements,
    standardPieces: standard,
    maxLength: bestMaxLength + standardLength,
  };
}

function runBinPacking(needs: Measurement[]): { placed: PlacedPiece[]; maxLength: number } {
  // Grid: 144 elements, each tracking height used at that inch position
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
      // Place the piece
      const placedPiece: PlacedPiece = {
        ...piece,
        x: position.x,
        y: position.y,
      };
      placed.push(placedPiece);

      // Update grid
      const newHeight = position.y + piece.lengthTotal;
      for (let i = position.x; i < position.x + piece.widthTotal; i++) {
        grid[i] = Math.max(grid[i], newHeight);
      }
    }
  }

  const maxLength = Math.max(...grid);
  return { placed, maxLength };
}

function findBestPosition(
  grid: number[],
  width: number,
  length: number
): { x: number; y: number } | null {
  if (width > ROLL_WIDTH_INCHES) return null;

  let bestX = 0;
  let bestY = Infinity;

  // Try each starting position
  for (let x = 0; x <= ROLL_WIDTH_INCHES - width; x++) {
    // Find the maximum height in this span
    let maxHeightInSpan = 0;
    for (let i = x; i < x + width; i++) {
      maxHeightInSpan = Math.max(maxHeightInSpan, grid[i]);
    }

    // Check if this is a better position (lower Y)
    if (maxHeightInSpan < bestY) {
      bestY = maxHeightInSpan;
      bestX = x;
    }
  }

  return { x: bestX, y: bestY };
}

function calculateResults(
  measurements: Measurement[],
  placed: PlacedPiece[],
  standardPieces: Measurement[],
  needsMaxLength: number
): CalculationResult {
  // Calculate used square footage from measurements
  const usedSqInches = measurements.reduce(
    (sum, m) => sum + m.widthTotal * m.lengthTotal,
    0
  );
  const usedSqFt = usedSqInches / 144;

  // Calculate total from placement
  const standardLength = standardPieces.reduce((sum, m) => sum + m.lengthTotal, 0);
  const totalLengthInches = standardLength + needsMaxLength;
  const totalSqInches = ROLL_WIDTH_INCHES * totalLengthInches;
  const totalSqFt = totalSqInches / 144;
  const totalSqYd = totalSqFt / 9;

  const wasteSqFt = totalSqFt - usedSqFt;
  const wasteSqYd = wasteSqFt / 9;
  const wastePercent = totalSqFt > 0 ? (wasteSqFt / totalSqFt) * 100 : 0;

  return {
    standardPieces,
    needsPieces: placed,
    totalLengthInches,
    totalSqFt,
    totalSqYd,
    usedSqFt,
    wasteSqFt,
    wasteSqYd,
    wastePercent,
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CarpetCalculator() {
  // Input state
  const [widthFeet, setWidthFeet] = useState('');
  const [widthInches, setWidthInches] = useState('');
  const [lengthFeet, setLengthFeet] = useState('');
  const [lengthInches, setLengthInches] = useState('');
  const [stepCount, setStepCount] = useState('');
  const [costPerSqYd, setCostPerSqYd] = useState('');

  // Options
  const [tryInverting, setTryInverting] = useState(true);

  // Measurements list
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [nextId, setNextId] = useState(1);

  // Calculation results
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [needsMaxLength, setNeedsMaxLength] = useState(0);

  // Canvas drag state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // -------------------------------------------------------------------------
  // INPUT HANDLERS
  // -------------------------------------------------------------------------

  function handleAdd() {
    const wf = parseInt(widthFeet) || 0;
    const wi = parseInt(widthInches) || 0;
    const lf = parseInt(lengthFeet) || 0;
    const li = parseInt(lengthInches) || 0;

    if (wf === 0 && wi === 0) {
      alert('Please enter a width');
      return;
    }
    if (lf === 0 && li === 0) {
      alert('Please enter a length');
      return;
    }

    // Normalize inches > 11
    const normalizedWi = wi % 12;
    const extraWf = Math.floor(wi / 12);
    const normalizedLi = li % 12;
    const extraLf = Math.floor(li / 12);

    const m = createMeasurement(
      nextId,
      wf + extraWf,
      normalizedWi,
      lf + extraLf,
      normalizedLi
    );

    setMeasurements((prev) => [...prev, m]);
    setNextId((prev) => prev + 1);

    // Clear inputs
    setWidthFeet('');
    setWidthInches('');
    setLengthFeet('');
    setLengthInches('');
  }

  function handleDelete(id: number) {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }

  function handleClear() {
    setMeasurements([]);
    setResult(null);
  }

  function handleCalculate() {
    if (measurements.length === 0) {
      alert('Please add some measurements first');
      return;
    }

    // Add steps if specified
    let allMeasurements = [...measurements];
    const steps = parseInt(stepCount) || 0;
    for (let i = 0; i < steps; i++) {
      allMeasurements.push(createMeasurement(nextId + i, 4, 0, 2, 0)); // 4'x2' per step
    }

    const { placed, standardPieces, maxLength } = calculatePlacements(
      allMeasurements,
      tryInverting
    );

    // Calculate needs portion max length (exclude standard)
    const standardLength = standardPieces.reduce((sum, m) => sum + m.lengthTotal, 0);
    const needsLength = maxLength - standardLength;
    setNeedsMaxLength(needsLength);

    const calcResult = calculateResults(allMeasurements, placed, standardPieces, needsLength);
    setResult(calcResult);
  }

  // -------------------------------------------------------------------------
  // CANVAS DRAWING
  // -------------------------------------------------------------------------

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasHeight = needsMaxLength * SCALE;
    canvas.width = CANVAS_WIDTH;
    canvas.height = Math.max(canvasHeight, 200);

    // Red background (waste)
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines (every foot)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;

    // Vertical lines (every 12 inches = 1 foot)
    for (let x = 0; x <= ROLL_WIDTH_INCHES; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x * SCALE, 0);
      ctx.lineTo(x * SCALE, canvas.height);
      ctx.stroke();
    }

    // Horizontal lines (every 12 inches = 1 foot)
    for (let y = 0; y <= needsMaxLength; y += 12) {
      ctx.beginPath();
      ctx.moveTo(0, y * SCALE);
      ctx.lineTo(canvas.width, y * SCALE);
      ctx.stroke();
    }

    // Draw pieces (blue rectangles)
    for (const piece of result.needsPieces) {
      const px = piece.x * SCALE;
      const py = piece.y * SCALE;
      const pw = piece.widthTotal * SCALE;
      const ph = piece.lengthTotal * SCALE;

      // Blue fill
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(px, py, pw, ph);

      // Black border
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, pw, ph);

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px sans-serif';
      const label = formatDimensions(piece);
      ctx.fillText(label, px + 4, py + 18);
    }
  }, [result, needsMaxLength]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // -------------------------------------------------------------------------
  // DRAG HANDLERS
  // -------------------------------------------------------------------------

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!result) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Find clicked piece (reverse order so topmost is selected)
    for (let i = result.needsPieces.length - 1; i >= 0; i--) {
      const piece = result.needsPieces[i];
      const px = piece.x * SCALE;
      const py = piece.y * SCALE;
      const pw = piece.widthTotal * SCALE;
      const ph = piece.lengthTotal * SCALE;

      if (mouseX >= px && mouseX <= px + pw && mouseY >= py && mouseY <= py + ph) {
        setDraggingId(piece.id);
        setDragOffset({ x: mouseX - px, y: mouseY - py });

        // Move to front (end of array)
        const newPieces = [...result.needsPieces];
        const [dragged] = newPieces.splice(i, 1);
        newPieces.push(dragged);
        setResult({ ...result, needsPieces: newPieces });
        break;
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (draggingId === null || !result) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setResult((prev) => {
      if (!prev) return prev;

      const newPieces = prev.needsPieces.map((piece) => {
        if (piece.id !== draggingId) return piece;

        // Calculate new position in inches
        let newX = Math.round((mouseX - dragOffset.x) / SCALE);
        let newY = Math.round((mouseY - dragOffset.y) / SCALE);

        // Clamp to canvas bounds
        newX = Math.max(0, Math.min(newX, ROLL_WIDTH_INCHES - piece.widthTotal));
        newY = Math.max(0, newY);

        return { ...piece, x: newX, y: newY };
      });

      // Recalculate max length based on new positions
      const newMaxLength = Math.max(...newPieces.map((p) => p.y + p.lengthTotal));

      return { ...prev, needsPieces: newPieces };
    });

    drawCanvas();
  }

  function handleMouseUp() {
    if (draggingId !== null && result) {
      // Recalculate waste based on new positions
      const newMaxLength = Math.max(...result.needsPieces.map((p) => p.y + p.lengthTotal));
      setNeedsMaxLength(newMaxLength);

      const standardLength = result.standardPieces.reduce((sum, m) => sum + m.lengthTotal, 0);
      const totalLengthInches = standardLength + newMaxLength;
      const totalSqInches = ROLL_WIDTH_INCHES * totalLengthInches;
      const totalSqFt = totalSqInches / 144;
      const totalSqYd = totalSqFt / 9;
      const wasteSqFt = totalSqFt - result.usedSqFt;
      const wasteSqYd = wasteSqFt / 9;
      const wastePercent = totalSqFt > 0 ? (wasteSqFt / totalSqFt) * 100 : 0;

      setResult({
        ...result,
        totalLengthInches,
        totalSqFt,
        totalSqYd,
        wasteSqFt,
        wasteSqYd,
        wastePercent,
      });
    }
    setDraggingId(null);
  }

  // -------------------------------------------------------------------------
  // COST CALCULATION
  // -------------------------------------------------------------------------

  const cost = result && costPerSqYd ? result.totalSqYd * parseFloat(costPerSqYd) : 0;

  // -------------------------------------------------------------------------
  // STYLES
  // -------------------------------------------------------------------------

  const containerStyle: React.CSSProperties = {
    padding: 24,
    maxWidth: 1400,
  };

  const headerStyle: React.CSSProperties = {
    fontSize: 24,
    fontWeight: 600,
    marginBottom: 24,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap',
  };

  const columnStyle: React.CSSProperties = {
    flex: '1 1 300px',
    minWidth: 280,
  };

  const sectionStyle: React.CSSProperties = {
    background: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontWeight: 600,
    marginBottom: 12,
    fontSize: 14,
    textTransform: 'uppercase',
    color: '#666',
  };

  const inputRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  };

  const inputStyle: React.CSSProperties = {
    width: 60,
    padding: '8px 12px',
    border: '1px solid #ccc',
    borderRadius: 4,
    textAlign: 'center',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    color: '#666',
    minWidth: 20,
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px 20px',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 500,
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: '#6b7280',
  };

  const deleteButtonStyle: React.CSSProperties = {
    padding: '4px 8px',
    background: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
  };

  const listItemStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    background: 'white',
    borderRadius: 4,
    marginBottom: 4,
  };

  const resultBoxStyle: React.CSSProperties = {
    padding: 12,
    borderRadius: 4,
    textAlign: 'center',
    fontWeight: 600,
  };

  const canvasContainerStyle: React.CSSProperties = {
    border: '2px solid #333',
    overflow: 'auto',
    maxHeight: 600,
    background: '#fff',
  };

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Carpet Calculator</div>

      <div style={rowStyle}>
        {/* LEFT COLUMN - Inputs */}
        <div style={columnStyle}>
          {/* Measurement Input */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Add Measurement</div>
            <div style={inputRowStyle}>
              <span style={labelStyle}>W:</span>
              <input
                type="number"
                placeholder="ft"
                value={widthFeet}
                onChange={(e) => setWidthFeet(e.target.value)}
                style={inputStyle}
              />
              <span>'</span>
              <input
                type="number"
                placeholder="in"
                value={widthInches}
                onChange={(e) => setWidthInches(e.target.value)}
                style={inputStyle}
              />
              <span>"</span>
            </div>
            <div style={inputRowStyle}>
              <span style={labelStyle}>L:</span>
              <input
                type="number"
                placeholder="ft"
                value={lengthFeet}
                onChange={(e) => setLengthFeet(e.target.value)}
                style={inputStyle}
              />
              <span>'</span>
              <input
                type="number"
                placeholder="in"
                value={lengthInches}
                onChange={(e) => setLengthInches(e.target.value)}
                style={inputStyle}
              />
              <span>"</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={buttonStyle} onClick={handleAdd}>
                Add
              </button>
              <button style={secondaryButtonStyle} onClick={handleClear}>
                Clear All
              </button>
            </div>
          </div>

          {/* Options */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Options</div>
            <div style={inputRowStyle}>
              <span style={labelStyle}>Steps:</span>
              <input
                type="number"
                placeholder="0"
                value={stepCount}
                onChange={(e) => setStepCount(e.target.value)}
                style={{ ...inputStyle, width: 80 }}
              />
              <span style={{ fontSize: 12, color: '#666' }}>(4' x 2' each)</span>
            </div>
            <div style={inputRowStyle}>
              <span style={labelStyle}>Cost:</span>
              <span>$</span>
              <input
                type="number"
                placeholder="0.00"
                value={costPerSqYd}
                onChange={(e) => setCostPerSqYd(e.target.value)}
                style={{ ...inputStyle, width: 80 }}
              />
              <span style={{ fontSize: 12, color: '#666' }}>/sq yd</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={tryInverting}
                onChange={(e) => setTryInverting(e.target.checked)}
              />
              Try Inverting (rotate pieces for better fit)
            </label>
          </div>

          {/* Measurements List */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Measurements ({measurements.length})</div>
            {measurements.length === 0 ? (
              <div style={{ color: '#999', fontStyle: 'italic' }}>No measurements added</div>
            ) : (
              measurements.map((m) => (
                <div key={m.id} style={listItemStyle}>
                  <span>{formatDimensions(m)}</span>
                  <button style={deleteButtonStyle} onClick={() => handleDelete(m.id)}>
                    -
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Calculate Button */}
          <button
            style={{ ...buttonStyle, width: '100%', padding: 16, fontSize: 16 }}
            onClick={handleCalculate}
          >
            Calculate
          </button>
        </div>

        {/* MIDDLE COLUMN - Results */}
        <div style={columnStyle}>
          {result && (
            <>
              {/* Results Summary */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Results</div>

                {result.standardPieces.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong>Standard (full width):</strong>
                    {result.standardPieces.map((m, i) => (
                      <div key={i} style={{ marginLeft: 12 }}>
                        {ROLL_WIDTH_FEET}' x {formatFeetInches(m.lengthTotal)}
                      </div>
                    ))}
                  </div>
                )}

                {result.needsPieces.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong>Needs (optimized):</strong>
                    {result.needsPieces.map((m, i) => (
                      <div key={i} style={{ marginLeft: 12 }}>
                        {formatDimensions(m)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Totals</div>
                <div style={{ ...resultBoxStyle, background: '#fef08a', marginBottom: 8 }}>
                  {ROLL_WIDTH_FEET}' x {formatFeetInches(result.totalLengthInches)}
                </div>
                <div style={{ ...resultBoxStyle, background: '#86efac', marginBottom: 8 }}>
                  {result.totalSqFt.toFixed(2)} sq ft | {result.totalSqYd.toFixed(2)} sq yd
                </div>
              </div>

              {/* Usage */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Usage</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, ...resultBoxStyle, background: '#86efac' }}>
                    <div style={{ fontSize: 12 }}>Actual</div>
                    {result.usedSqFt.toFixed(2)} sf
                  </div>
                  <div style={{ flex: 1, ...resultBoxStyle, background: '#fca5a5' }}>
                    <div style={{ fontSize: 12 }}>Waste</div>
                    {result.wasteSqFt.toFixed(2)} sf
                  </div>
                </div>
                <div style={{ textAlign: 'center', color: '#666' }}>
                  Waste: {result.wastePercent.toFixed(1)}%
                </div>
              </div>

              {/* Cost Estimate */}
              {cost > 0 && (
                <div style={sectionStyle}>
                  <div style={sectionTitleStyle}>Estimate</div>
                  <div style={{ ...resultBoxStyle, background: '#22c55e', color: 'white', fontSize: 24 }}>
                    ${cost.toFixed(2)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT COLUMN - Diagram */}
        <div style={{ flex: '2 1 400px', minWidth: 320 }}>
          {result && result.needsPieces.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>
                Diagram (drag pieces to optimize)
              </div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                Blue = carpet pieces | Red = waste | Grid = 1 foot squares
              </div>
              <div style={canvasContainerStyle}>
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{ cursor: draggingId ? 'grabbing' : 'grab' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
