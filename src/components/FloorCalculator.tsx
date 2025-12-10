// src/components/FloorCalculator.tsx
// Desktop floor calculator - uses shared calculation module

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  type Measurement,
  type PlacedPiece,
  type CarpetResult,
  type HardwoodResult,
  type BulkParseResult,
  ROLL_WIDTH_INCHES,
  ROLL_WIDTH_FEET,
  //TEST_MEASUREMENTS,
  formatFeetInches,
  formatDimensions,
  createMeasurement,
  parseBulkMeasurements,
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

export function FloorCalculator() {
  // localStorage key for persisting calculator state
  const STORAGE_KEY = 'oakerds_floor_calc';

  // Load persisted state from localStorage
  const loadPersistedState = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load calculator state:', e);
    }
    return null;
  };

  const persistedState = loadPersistedState();

  // Mode toggle
  const [mode, setMode] = useState<'carpet' | 'hardwood'>(persistedState?.mode || 'carpet');

  // Input refs
  const widthFeetRef = useRef<HTMLInputElement>(null);

  // Input state
  const [widthFeet, setWidthFeet] = useState('');
  const [widthInches, setWidthInches] = useState('');
  const [lengthFeet, setLengthFeet] = useState('');
  const [lengthInches, setLengthInches] = useState('');
  const [stepCount, setStepCount] = useState(persistedState?.stepCount || '');
  const [addSlippage, setAddSlippage] = useState(persistedState?.addSlippage ?? true);

  // Hardwood options
  const [wastePercent, setWastePercent] = useState(persistedState?.wastePercent || '7');
  const [boxSqFt, setBoxSqFt] = useState(persistedState?.boxSqFt || '25');

  // Measurements list
  const [measurements, setMeasurements] = useState<Measurement[]>(persistedState?.measurements || []);
  const [nextId, setNextId] = useState(persistedState?.nextId || 1);

  // Bulk entry
  const [bulkText, setBulkText] = useState('');
  const [showBulkEntry, setShowBulkEntry] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<BulkParseResult | null>(null);

  // Calculation results - load from persisted state
  const [result, setResult] = useState<CalculationResult | null>(persistedState?.result || null);
  const [needsMaxLength, setNeedsMaxLength] = useState(persistedState?.needsMaxLength || 0);
  const [standardLength, setStandardLength] = useState(persistedState?.standardLength || 0);
  const [isCalculating, setIsCalculating] = useState(false);

  // Hardwood results
  const [hardwoodResult, setHardwoodResult] = useState<HardwoodResult | null>(persistedState?.hardwoodResult || null);

  // Canvas drag state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Persist state to localStorage whenever relevant values change
  useEffect(() => {
    const stateToSave = {
      mode,
      stepCount,
      addSlippage,
      wastePercent,
      boxSqFt,
      measurements,
      nextId,
      result,
      needsMaxLength,
      standardLength,
      hardwoodResult,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error('Failed to save calculator state:', e);
    }
  }, [mode, stepCount, addSlippage, wastePercent, boxSqFt, measurements, nextId, result, needsMaxLength, standardLength, hardwoodResult]);

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

  function handleBulkPreview() {
    if (!bulkText.trim()) {
      setBulkPreview(null);
      return;
    }
    const result = parseBulkMeasurements(bulkText, nextId);
    setBulkPreview(result);
  }

  function handleBulkAdd() {
    if (!bulkPreview || bulkPreview.valid.length === 0) {
      alert('No valid measurements to add');
      return;
    }
    
    setMeasurements((prev) => [...prev, ...bulkPreview.valid]);
    setNextId((prev) => prev + bulkPreview.valid.length);
    setBulkText('');
    setBulkPreview(null);
    setShowBulkEntry(false);
  }

  function handleBulkClear() {
    setBulkText('');
    setBulkPreview(null);
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

    // Carpet mode - show loading state, then calculate
    setIsCalculating(true);
    
    // Use setTimeout to allow UI to update before heavy calculation
    setTimeout(() => {
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
      setIsCalculating(false);
    }, 10);
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
                <button 
                  style={secondaryButtonStyle} 
                  onClick={() => setShowBulkEntry(!showBulkEntry)}
                >
                  {showBulkEntry ? 'Hide Bulk' : 'Bulk Entry'}
                </button>
              </div>
              
              {/* Bulk Entry Section */}
              {showBulkEntry && (
                <div style={{ marginTop: 12, padding: 12, background: '#f3f4f6', borderRadius: 6 }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                    Paste measurements (comma or newline separated):<br/>
                    <code style={{ fontSize: 11 }}>LR 11.6x13.6, BR 10.3*12, Hall 5'6"x8'0"</code>
                  </div>
                  <textarea
                    value={bulkText}
                    onChange={(e) => {
                      setBulkText(e.target.value);
                      setBulkPreview(null); // Clear preview on edit
                    }}
                    placeholder="11.6x13.6, 10.3x12&#10;8.6x9.3"
                    rows={4}
                    style={{
                      width: '100%',
                      padding: 8,
                      fontSize: 14,
                      fontFamily: 'monospace',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button style={buttonStyle} onClick={handleBulkPreview}>
                      Preview
                    </button>
                    {bulkPreview && bulkPreview.valid.length > 0 && (
                      <button style={{ ...buttonStyle, background: '#22c55e' }} onClick={handleBulkAdd}>
                        Add {bulkPreview.validCount} Measurement{bulkPreview.validCount !== 1 ? 's' : ''}
                      </button>
                    )}
                    <button style={secondaryButtonStyle} onClick={handleBulkClear}>
                      Clear
                    </button>
                  </div>
                  
                  {/* Preview Results */}
                  {bulkPreview && (
                    <div style={{ marginTop: 12, fontSize: 13 }}>
                      {/* Summary */}
                      <div style={{ 
                        display: 'flex', 
                        gap: 16, 
                        padding: 8, 
                        background: '#fff', 
                        borderRadius: 4,
                        marginBottom: 8 
                      }}>
                        <span style={{ color: '#22c55e' }}>✓ {bulkPreview.validCount} valid</span>
                        {bulkPreview.errorCount > 0 && (
                          <span style={{ color: '#ef4444' }}>✗ {bulkPreview.errorCount} errors</span>
                        )}
                        {bulkPreview.warningCount > 0 && (
                          <span style={{ color: '#f59e0b' }}>⚠ {bulkPreview.warningCount} warnings</span>
                        )}
                      </div>
                      
                      {/* Entry list */}
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {bulkPreview.entries.map((entry, i) => (
                          <div 
                            key={i} 
                            style={{ 
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '4px 8px',
                              background: entry.error ? '#fef2f2' : entry.warning ? '#fffbeb' : '#f0fdf4',
                              borderRadius: 4,
                              marginBottom: 2,
                              fontSize: 12,
                            }}
                          >
                            <span style={{ fontFamily: 'monospace', color: '#666' }}>{entry.raw}</span>
                            {entry.error ? (
                              <span style={{ color: '#ef4444' }}>✗ {entry.error}</span>
                            ) : entry.measurement ? (
                              <span style={{ color: entry.warning ? '#f59e0b' : '#22c55e' }}>
                                → {formatDimensions(entry.measurement)}
                                {entry.warning && <span style={{ marginLeft: 4 }}>⚠</span>}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
            style={{ 
              ...buttonStyle, 
              width: '100%', 
              padding: 16, 
              fontSize: 16,
              opacity: isCalculating ? 0.7 : 1,
              cursor: isCalculating ? 'wait' : 'pointer',
            }}
            onClick={handleCalculate}
            disabled={isCalculating}
          >
            {isCalculating ? 'Optimizing...' : 'Calculate'}
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
                {result.isFlipped && (
                  <div style={{ 
                    background: '#fef3c7', 
                    border: '1px solid #f59e0b', 
                    borderRadius: 6, 
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#92400e',
                  }}>
                    ⚠️ <strong>Rotated 90°</strong> — Measurements were flipped (W↔L) to reduce waste. Cut carpet accordingly.
                  </div>
                )}
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
