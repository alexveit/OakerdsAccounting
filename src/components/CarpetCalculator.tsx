// src/components/stand-alones/CarpetCalculator.tsx
// Desktop floor calculator - uses shared calculation module

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  type Measurement,
  type PlacedPiece,
  type CarpetResult,
  type HardwoodResult,
  ROLL_WIDTH_INCHES,
  ROLL_WIDTH_FEET,
  //TEST_MEASUREMENTS,
  formatFeetInches,
  formatDimensions,
  createMeasurement,
  calculateCarpet,
  calculateHardwood,
} from '../utils/floorCalculations';

// ============================================================================
// CONSTANTS
// ============================================================================

const SCALE = 2; // pixels per inch for display
const CANVAS_WIDTH = ROLL_WIDTH_INCHES * SCALE;

// Extended result type for drag support
type CalculationResult = CarpetResult & {
  standardLengthInches: number;
  needsLengthInches: number;
  totalLengthInches: number;
  wasteSqYd: number;
};

// ============================================================================
// COMPONENT
// ============================================================================

export function CarpetCalculator() {
  // Mode toggle
  const [mode, setMode] = useState<'carpet' | 'hardwood'>('carpet');

  // Input refs
  const widthFeetRef = useRef<HTMLInputElement>(null);

  // Input state
  const [widthFeet, setWidthFeet] = useState('');
  const [widthInches, setWidthInches] = useState('');
  const [lengthFeet, setLengthFeet] = useState('');
  const [lengthInches, setLengthInches] = useState('');
  const [stepCount, setStepCount] = useState('');
  const [addSlippage, setAddSlippage] = useState(true);

  // Hardwood options
  const [wastePercent, setWastePercent] = useState('7');
  const [boxSqFt, setBoxSqFt] = useState('25');

  // Measurements list - pre-populate with test data
  /*
  const [measurements, setMeasurements] = useState<Measurement[]>(() => {
    return TEST_MEASUREMENTS.map((t, i) => createMeasurement(i + 1, t.wf, t.wi, t.lf, t.li));
  });
  const [nextId, setNextId] = useState(TEST_MEASUREMENTS.length + 1);
  */

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [nextId, setNextId] = useState(1);

  // Calculation results
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [needsMaxLength, setNeedsMaxLength] = useState(0);
  const [standardLength, setStandardLength] = useState(0);

  // Hardwood results
  const [hardwoodResult, setHardwoodResult] = useState<HardwoodResult | null>(null);

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

    // Focus back to width feet
    widthFeetRef.current?.focus();
  }

  function handleDelete(id: number) {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }

  function handleClear() {
    setMeasurements([]);
    setResult(null);
    setHardwoodResult(null);
  }

  function handleCalculate() {
    if (measurements.length === 0) {
      alert('Please add some measurements first');
      return;
    }

    if (mode === 'hardwood') {
      const hwResult = calculateHardwood({
        measurements,
        wastePercent: parseFloat(wastePercent) || 7,
        boxSqFt: parseFloat(boxSqFt) || 25,
      });
      setHardwoodResult(hwResult);
      setResult(null);
      return;
    }

    // Carpet mode - use shared calculation
    const carpetResult = calculateCarpet({
      measurements,
      addSlippage,
      steps: parseInt(stepCount) || 0,
    });

    setNeedsMaxLength(carpetResult.needsLength);
    setStandardLength(carpetResult.standardLength);

    // Extend result with aliases for compatibility
    const extendedResult: CalculationResult = {
      ...carpetResult,
      standardLengthInches: carpetResult.standardLength,
      needsLengthInches: carpetResult.needsLength,
      totalLengthInches: carpetResult.totalLength,
      wasteSqYd: carpetResult.wasteSqFt / 9,
    };

    setResult(extendedResult);
    setHardwoodResult(null);
  }

  // -------------------------------------------------------------------------
  // CANVAS DRAWING
  // -------------------------------------------------------------------------

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas only shows needs pieces, not standards
    const canvasHeight = needsMaxLength * SCALE;
    canvas.width = CANVAS_WIDTH;
    canvas.height = Math.max(canvasHeight, 200);

    // Red background (waste)
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines FIRST (every foot) - in waste areas
    ctx.strokeStyle = '#990000';
    ctx.lineWidth = 1;

    for (let x = 0; x <= ROLL_WIDTH_INCHES; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x * SCALE, 0);
      ctx.lineTo(x * SCALE, canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y <= needsMaxLength; y += 12) {
      ctx.beginPath();
      ctx.moveTo(0, y * SCALE);
      ctx.lineTo(canvas.width, y * SCALE);
      ctx.stroke();
    }

    // Draw pieces ON TOP of grid
    for (const piece of result.needs) {
      const px = piece.x * SCALE;
      const py = piece.y * SCALE;
      const pw = piece.widthTotal * SCALE;
      const ph = piece.lengthTotal * SCALE;

      // Fill blue
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(px, py, pw, ph);

      // Black border
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
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

    for (let i = result.needs.length - 1; i >= 0; i--) {
      const piece = result.needs[i];
      const px = piece.x * SCALE;
      const py = piece.y * SCALE;
      const pw = piece.widthTotal * SCALE;
      const ph = piece.lengthTotal * SCALE;

      if (mouseX >= px && mouseX <= px + pw && mouseY >= py && mouseY <= py + ph) {
        setDraggingId(piece.id);
        setDragOffset({ x: mouseX - px, y: mouseY - py });

        const newPieces = [...result.needs];
        const [dragged] = newPieces.splice(i, 1);
        newPieces.push(dragged);
        setResult({ ...result, needs: newPieces });
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

    const SNAP_THRESHOLD = 5; // inches - reduced for tighter snapping

    setResult((prev) => {
      if (!prev) return prev;

      const newPieces = prev.needs.map((piece) => {
        if (piece.id !== draggingId) return piece;

        let newX = Math.round((mouseX - dragOffset.x) / SCALE);
        let newY = Math.round((mouseY - dragOffset.y) / SCALE);

        // Clamp to roll boundaries
        newX = Math.max(0, Math.min(newX, ROLL_WIDTH_INCHES - piece.widthTotal));
        newY = Math.max(0, newY);

        // Snap to other pieces - find CLOSEST edge only
        const otherPieces = prev.needs.filter((p) => p.id !== draggingId);
        
        // Collect all edges to snap to
        const xEdges: number[] = [0, ROLL_WIDTH_INCHES]; // Roll boundaries
        const yEdges: number[] = [0]; // Top of roll
        
        for (const other of otherPieces) {
          xEdges.push(other.x); // Left edge
          xEdges.push(other.x + other.widthTotal); // Right edge
          yEdges.push(other.y); // Top edge
          yEdges.push(other.y + other.lengthTotal); // Bottom edge
        }

        // Find closest X snap (check both left and right edges of dragged piece)
        let bestXSnap: { newX: number; dist: number } | null = null;
        
        for (const edge of xEdges) {
          // Left edge snap
          const leftDist = Math.abs(newX - edge);
          if (leftDist < SNAP_THRESHOLD && (!bestXSnap || leftDist < bestXSnap.dist)) {
            bestXSnap = { newX: edge, dist: leftDist };
          }
          // Right edge snap
          const rightDist = Math.abs((newX + piece.widthTotal) - edge);
          if (rightDist < SNAP_THRESHOLD && (!bestXSnap || rightDist < bestXSnap.dist)) {
            bestXSnap = { newX: edge - piece.widthTotal, dist: rightDist };
          }
        }
        
        if (bestXSnap) {
          newX = bestXSnap.newX;
        }

        // Find closest Y snap (check both top and bottom edges of dragged piece)
        let bestYSnap: { newY: number; dist: number } | null = null;
        
        for (const edge of yEdges) {
          // Top edge snap
          const topDist = Math.abs(newY - edge);
          if (topDist < SNAP_THRESHOLD && (!bestYSnap || topDist < bestYSnap.dist)) {
            bestYSnap = { newY: edge, dist: topDist };
          }
          // Bottom edge snap
          const bottomDist = Math.abs((newY + piece.lengthTotal) - edge);
          if (bottomDist < SNAP_THRESHOLD && (!bestYSnap || bottomDist < bestYSnap.dist)) {
            bestYSnap = { newY: edge - piece.lengthTotal, dist: bottomDist };
          }
        }
        
        if (bestYSnap) {
          newY = bestYSnap.newY;
        }

        // Re-clamp after snapping
        newX = Math.max(0, Math.min(newX, ROLL_WIDTH_INCHES - piece.widthTotal));
        newY = Math.max(0, newY);

        return { ...piece, x: newX, y: newY };
      });

      return { ...prev, needs: newPieces };
    });

    drawCanvas();
  }

  function handleMouseUp() {
    if (draggingId !== null && result) {
      const newNeedsMaxLength = Math.max(...result.needs.map((p) => p.y + p.lengthTotal), 0);
      setNeedsMaxLength(newNeedsMaxLength);

      const totalLengthInches = standardLength + newNeedsMaxLength;
      const totalSqInches = ROLL_WIDTH_INCHES * totalLengthInches;
      const totalSqFt = totalSqInches / 144;
      const totalSqYd = totalSqFt / 9;
      const wasteSqFt = totalSqFt - result.usedSqFt;
      const wasteSqYd = wasteSqFt / 9;
      const wastePercent = totalSqFt > 0 ? (wasteSqFt / totalSqFt) * 100 : 0;

      setResult({
        ...result,
        needsLength: newNeedsMaxLength,
        needsLengthInches: newNeedsMaxLength,
        totalLength: totalLengthInches,
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
    display: 'flex',
    alignItems: 'center',
    gap: 24,
  };

  const toggleContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: 0,
    borderRadius: 6,
    overflow: 'hidden',
    border: '1px solid #ccc',
  };

  const toggleButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    border: 'none',
    background: active ? '#2563eb' : '#f3f4f6',
    color: active ? 'white' : '#666',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: 14,
  });

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
    flexWrap: 'wrap',
  };

  const inputStyle: React.CSSProperties = {
    width: 50,
    padding: '8px 10px',
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
    padding: '4px 8px',
    background: 'white',
    borderRadius: 4,
    marginBottom: 2,
    fontSize: 14,
  };

  const resultBoxStyle: React.CSSProperties = {
    padding: 12,
    borderRadius: 4,
    textAlign: 'center',
    fontWeight: 600,
  };

  const canvasContainerStyle: React.CSSProperties = {
    background: '#fff',
    display: 'inline-block',
  };

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span>Floor Calculator</span>
        <div style={toggleContainerStyle}>
          <button
            style={toggleButtonStyle(mode === 'carpet')}
            onClick={() => setMode('carpet')}
          >
            Carpet
          </button>
          <button
            style={toggleButtonStyle(mode === 'hardwood')}
            onClick={() => setMode('hardwood')}
          >
            Hardwood
          </button>
        </div>
      </div>

      <div style={rowStyle}>
        {/* LEFT COLUMN - Inputs */}
        <div style={columnStyle}>
          {/* Top row: Add Measurement + Hardwood Results */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            {/* Measurement Input */}
            <div style={{ ...sectionStyle, flex: '1 1 auto' }}>
              <div style={sectionTitleStyle}>Add Measurement</div>
              <div style={inputRowStyle}>
                <span style={labelStyle}>W:</span>
                <input
                  ref={widthFeetRef}
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
                <span style={{ ...labelStyle, marginLeft: 12 }}>L:</span>
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

            {/* Hardwood Results - inline 2x2 grid */}
            {mode === 'hardwood' && hardwoodResult && (
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Results</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ ...resultBoxStyle, background: '#93c5fd' }}>
                    <div style={{ fontSize: 11 }}>Room Area</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{hardwoodResult.totalSqFt.toFixed(2)} sf</div>
                  </div>
                  <div style={{ ...resultBoxStyle, background: '#fca5a5' }}>
                    <div style={{ fontSize: 11 }}>Waste ({wastePercent}%)</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{hardwoodResult.wasteSqFt.toFixed(2)} sf</div>
                  </div>
                  <div style={{ ...resultBoxStyle, background: '#86efac' }}>
                    <div style={{ fontSize: 11 }}>Total Needed</div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{hardwoodResult.totalNeeded.toFixed(2)} sf</div>
                  </div>
                  <div style={{ ...resultBoxStyle, background: '#fef08a' }}>
                    <div style={{ fontSize: 11 }}>Boxes ({boxSqFt} sf/box)</div>
                    <div style={{ fontSize: 20, fontWeight: 600 }}>{hardwoodResult.boxesNeeded}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Options */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Options</div>
            {mode === 'carpet' ? (
              <>
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
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={addSlippage}
                    onChange={(e) => setAddSlippage(e.target.checked)}
                  />
                  Add 4" slippage (cutting buffer)
                </label>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: '#666' }}>Waste:</span>
                  <input
                    type="number"
                    value={wastePercent}
                    onChange={(e) => setWastePercent(e.target.value)}
                    style={{ ...inputStyle, width: 50 }}
                  />
                  <span style={{ fontSize: 12, color: '#666' }}>%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: '#666' }}>Box:</span>
                  <input
                    type="number"
                    value={boxSqFt}
                    onChange={(e) => setBoxSqFt(e.target.value)}
                    style={{ ...inputStyle, width: 50 }}
                  />
                  <span style={{ fontSize: 12, color: '#666' }}>sf</span>
                </div>
              </div>
            )}
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
          {mode === 'carpet' && result && (
            <>
              {/* Results Summary */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Results</div>
                <div style={{ display: 'flex', gap: 16 }}>
                  {/* Standards Column */}
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 12 }}>Standard</strong>
                    {result.standard.length === 0 ? (
                      <div style={{ color: '#999', fontSize: 12 }}>-</div>
                    ) : (
                      result.standard.map((m, i) => (
                        <div key={i} style={{ fontSize: 13 }}>
                          {ROLL_WIDTH_FEET}' x {formatFeetInches(m.lengthTotal)}
                        </div>
                      ))
                    )}
                  </div>
                  {/* Needs Column */}
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 12 }}>Needs</strong>
                    {result.needs.length === 0 ? (
                      <div style={{ color: '#999', fontSize: 12 }}>-</div>
                    ) : (
                      result.needs.map((m, i) => (
                        <div key={i} style={{ fontSize: 13 }}>
                          {formatDimensions(m)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Totals</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, ...resultBoxStyle, background: '#fef08a' }}>
                    <div style={{ fontSize: 11 }}>Standard</div>
                    {ROLL_WIDTH_FEET}' x {formatFeetInches(result.standardLength)}
                  </div>
                  <div style={{ flex: 1, ...resultBoxStyle, background: '#93c5fd' }}>
                    <div style={{ fontSize: 11 }}>Needs</div>
                    {ROLL_WIDTH_FEET}' x {formatFeetInches(result.needsLength)}
                  </div>
                </div>
                <div style={{ ...resultBoxStyle, background: '#86efac', marginBottom: 8 }}>
                  <div style={{ fontSize: 11 }}>Total</div>
                  {ROLL_WIDTH_FEET}' x {formatFeetInches(result.totalLength)}
                  <div style={{ fontSize: 14, marginTop: 4 }}>
                    {result.totalSqFt.toFixed(2)} sf | {result.totalSqYd.toFixed(2)} sy
                  </div>
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
                    <div style={{ fontSize: 12 }}>Waste ({result.wastePercent.toFixed(1)}%)</div>
                    {result.wasteSqFt.toFixed(2)} sf
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT COLUMN - Diagram (carpet only) */}
        {mode === 'carpet' && (
          <div style={{ flex: '2 1 400px', minWidth: 320 }}>
            {result && result.needs.length > 0 && (
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
                    style={{ cursor: draggingId ? 'grabbing' : 'grab', display: 'block' }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
