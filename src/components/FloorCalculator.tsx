// src/components/FloorCalculator.tsx
// Desktop floor calculator - uses shared calculation module

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  type Measurement,
  type CarpetResult,
  type HardwoodResult,
  type BulkParseResult,
  ROLL_WIDTH_INCHES,
  ROLL_WIDTH_FEET,
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
  type PersistedState = {
    mode?: 'carpet' | 'hardwood';
    stepCount?: string;
    addSlippage?: boolean;
    wastePercent?: string;
    boxSqFt?: string;
    measurements?: Measurement[];
    nextId?: number;
    result?: CalculationResult | null;
    needsMaxLength?: number;
    standardLength?: number;
    hardwoodResult?: HardwoodResult | null;
  };

  const loadPersistedState = (): PersistedState | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as PersistedState;
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
  const [nextId, setNextId] = useState<number>(persistedState?.nextId || 1);

  // Bulk entry
  const [bulkText, setBulkText] = useState('');
  const [showBulkEntry, setShowBulkEntry] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<BulkParseResult | null>(null);

  // Calculation results - load from persisted state
  const [result, setResult] = useState<CalculationResult | null>(persistedState?.result || null);
  const [needsMaxLength, setNeedsMaxLength] = useState<number>(persistedState?.needsMaxLength || 0);
  const [standardLength, setStandardLength] = useState<number>(persistedState?.standardLength || 0);
  const [isCalculating, setIsCalculating] = useState(false);

  // Hardwood results
  const [hardwoodResult, setHardwoodResult] = useState<HardwoodResult | null>(persistedState?.hardwoodResult || null);

  // Canvas drag state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Ref for debouncing localStorage writes
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist state to localStorage with debounce (prevents rapid-fire saves)
  useEffect(() => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce: save after 500ms of no changes
    saveTimeoutRef.current = setTimeout(() => {
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
    }, 500);

    // Cleanup on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
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
  // RENDER
  // -------------------------------------------------------------------------

  return (
    <div className="calc-container">
      <div className="calc-header">
        <span>Floor Calculator</span>
        <div className="calc-toggle">
          <button
            className={`calc-toggle__btn ${mode === 'carpet' ? 'calc-toggle__btn--active' : ''}`}
            onClick={() => setMode('carpet')}
          >
            Carpet
          </button>
          <button
            className={`calc-toggle__btn ${mode === 'hardwood' ? 'calc-toggle__btn--active' : ''}`}
            onClick={() => setMode('hardwood')}
          >
            Hardwood
          </button>
        </div>
      </div>

      <div className="calc-row">
        {/* LEFT COLUMN - Inputs */}
        <div className="calc-column">
          {/* Top row: Add Measurement + Hardwood Results */}
          <div className="flex gap-4 items-start">
            {/* Measurement Input */}
            <div className="calc-section flex-1">
              <div className="calc-section__title">Add Measurement</div>
              <div className="calc-input-row">
                <span className="calc-label">W:</span>
                <input
                  ref={widthFeetRef}
                  type="number"
                  placeholder="ft"
                  value={widthFeet}
                  onChange={(e) => setWidthFeet(e.target.value)}
                  className="calc-input"
                />
                <span>'</span>
                <input
                  type="number"
                  placeholder="in"
                  value={widthInches}
                  onChange={(e) => setWidthInches(e.target.value)}
                  className="calc-input"
                />
                <span>"</span>
                <span className="calc-label calc-label--spaced">L:</span>
                <input
                  type="number"
                  placeholder="ft"
                  value={lengthFeet}
                  onChange={(e) => setLengthFeet(e.target.value)}
                  className="calc-input"
                />
                <span>'</span>
                <input
                  type="number"
                  placeholder="in"
                  value={lengthInches}
                  onChange={(e) => setLengthInches(e.target.value)}
                  className="calc-input"
                />
                <span>"</span>
              </div>
              <div className="flex gap-2">
                <button className="calc-btn" onClick={handleAdd}>
                  Add
                </button>
                <button className="calc-btn calc-btn--secondary" onClick={handleClear}>
                  Clear All
                </button>
                <button 
                  className="calc-btn calc-btn--secondary" 
                  onClick={() => setShowBulkEntry(!showBulkEntry)}
                >
                  {showBulkEntry ? 'Hide Bulk' : 'Bulk Entry'}
                </button>
              </div>
              
              {/* Bulk Entry Section */}
              {showBulkEntry && (
                <div className="calc-section mt-2">
                  <div className="calc-hint mb-2">
                    Paste measurements (comma or newline separated):<br/>
                    <code className="text-xs">LR 11.6x13.6, BR 10.3*12, Hall 5'6"x8'0"</code>
                  </div>
                  <textarea
                    value={bulkText}
                    onChange={(e) => {
                      setBulkText(e.target.value);
                      setBulkPreview(null);
                    }}
                    placeholder="11.6x13.6, 10.3x12&#10;8.6x9.3"
                    rows={4}
                    className="calc-bulk-textarea"
                  />
                  <div className="flex gap-2 mt-2">
                    <button className="calc-btn" onClick={handleBulkPreview}>
                      Preview
                    </button>
                    {bulkPreview && bulkPreview.valid.length > 0 && (
                      <button className="calc-btn calc-btn--success" onClick={handleBulkAdd}>
                        Add {bulkPreview.validCount} Measurement{bulkPreview.validCount !== 1 ? 's' : ''}
                      </button>
                    )}
                    <button className="calc-btn calc-btn--secondary" onClick={handleBulkClear}>
                      Clear
                    </button>
                  </div>
                  
                  {/* Preview Results */}
                  {bulkPreview && (
                    <div className="mt-2 text-sm">
                      {/* Summary */}
                      <div className="calc-bulk-preview flex gap-3 mb-2">
                        <span className="text-success">✓ {bulkPreview.validCount} valid</span>
                        {bulkPreview.errorCount > 0 && (
                          <span className="text-danger">✗ {bulkPreview.errorCount} errors</span>
                        )}
                        {bulkPreview.warningCount > 0 && (
                          <span className="text-warning">⚠ {bulkPreview.warningCount} warnings</span>
                        )}
                      </div>
                      
                      {/* Entry list */}
                      <div className="scroll-container">
                        {bulkPreview.entries.map((entry, i) => {
                          const bgClass = entry.error ? 'bg-danger-subtle' : entry.warning ? 'bg-warning-subtle' : 'bg-success-subtle';
                          return (
                            <div key={i} className={`calc-list-item text-xs ${bgClass}`}>
                              <span className="font-mono text-muted">{entry.raw}</span>
                              {entry.error ? (
                                <span className="text-danger">✗ {entry.error}</span>
                              ) : entry.measurement ? (
                                <span className={entry.warning ? 'text-warning' : 'text-success'}>
                                  → {formatDimensions(entry.measurement)}
                                  {entry.warning && <span className="ml-1">⚠</span>}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Hardwood Results - inline 2x2 grid */}
            {mode === 'hardwood' && hardwoodResult && (
              <div className="calc-section">
                <div className="calc-section__title">Results</div>
                <div className="grid-2x2 gap-2">
                  <div className="calc-result-box calc-result-box--blue">
                    <div className="calc-result-box__label">Room Area</div>
                    <div className="calc-result-box__value">{hardwoodResult.totalSqFt.toFixed(2)} sf</div>
                  </div>
                  <div className="calc-result-box calc-result-box--red">
                    <div className="calc-result-box__label">Waste ({wastePercent}%)</div>
                    <div className="calc-result-box__value">{hardwoodResult.wasteSqFt.toFixed(2)} sf</div>
                  </div>
                  <div className="calc-result-box calc-result-box--green">
                    <div className="calc-result-box__label">Total Needed</div>
                    <div className="calc-result-box__value">{hardwoodResult.totalNeeded.toFixed(2)} sf</div>
                  </div>
                  <div className="calc-result-box calc-result-box--yellow">
                    <div className="calc-result-box__label">Boxes ({boxSqFt} sf/box)</div>
                    <div className="calc-result-box__value text-lg">{hardwoodResult.boxesNeeded}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Options */}
          <div className="calc-section">
            <div className="calc-section__title">Options</div>
            {mode === 'carpet' ? (
              <>
                <div className="calc-input-row">
                  <span className="calc-label">Steps:</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={stepCount}
                    onChange={(e) => setStepCount(e.target.value)}
                    className="calc-input calc-input--wide"
                  />
                  <span className="calc-hint">(4' x 2' each)</span>
                </div>
                <label className="calc-checkbox-label">
                  <input
                    type="checkbox"
                    checked={addSlippage}
                    onChange={(e) => setAddSlippage(e.target.checked)}
                  />
                  Add 4" slippage (cutting buffer)
                </label>
              </>
            ) : (
              <div className="calc-options-row">
                <div className="calc-option-group">
                  <span className="calc-label">Waste:</span>
                  <input
                    type="number"
                    value={wastePercent}
                    onChange={(e) => setWastePercent(e.target.value)}
                    className="calc-input"
                  />
                  <span className="calc-hint">%</span>
                </div>
                <div className="calc-option-group">
                  <span className="calc-label">Box:</span>
                  <input
                    type="number"
                    value={boxSqFt}
                    onChange={(e) => setBoxSqFt(e.target.value)}
                    className="calc-input"
                  />
                  <span className="calc-hint">sf</span>
                </div>
              </div>
            )}
          </div>

          {/* Measurements List */}
          <div className="calc-section">
            <div className="calc-section__title">Measurements ({measurements.length})</div>
            {measurements.length === 0 ? (
              <div className="calc-empty">No measurements added</div>
            ) : (
              measurements.map((m) => (
                <div key={m.id} className="calc-list-item">
                  <span>{formatDimensions(m)}</span>
                  <button className="calc-btn--delete" onClick={() => handleDelete(m.id)}>
                    -
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Calculate Button */}
          <button
            className={`calc-btn calc-btn--full ${isCalculating ? 'calc-btn--disabled' : ''}`}
            onClick={handleCalculate}
            disabled={isCalculating}
          >
            {isCalculating ? 'Optimizing...' : 'Calculate'}
          </button>
        </div>

        {/* MIDDLE COLUMN - Results */}
        <div className="calc-column">
          {mode === 'carpet' && result && (
            <>
              {/* Results Summary */}
              <div className="calc-section">
                <div className="calc-section__title">Results</div>
                <div className="flex gap-3">
                  {/* Standards Column */}
                  <div className="flex-1">
                    <strong className="text-xs">Standard</strong>
                    {result.standard.length === 0 ? (
                      <div className="text-muted text-xs">-</div>
                    ) : (
                      result.standard.map((m, i) => (
                        <div key={i} className="text-sm">
                          {ROLL_WIDTH_FEET}' x {formatFeetInches(m.lengthTotal)}
                        </div>
                      ))
                    )}
                  </div>
                  {/* Needs Column */}
                  <div className="flex-1">
                    <strong className="text-xs">Needs</strong>
                    {result.needs.length === 0 ? (
                      <div className="text-muted text-xs">-</div>
                    ) : (
                      result.needs.map((m, i) => (
                        <div key={i} className="text-sm">
                          {formatDimensions(m)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="calc-section">
                <div className="calc-section__title">Totals</div>
                <div className="flex gap-2 mb-2">
                  <div className="flex-1 calc-result-box calc-result-box--yellow">
                    <div className="calc-result-box__label">Standard</div>
                    {ROLL_WIDTH_FEET}' x {formatFeetInches(result.standardLength)}
                  </div>
                  <div className="flex-1 calc-result-box calc-result-box--blue">
                    <div className="calc-result-box__label">Needs</div>
                    {ROLL_WIDTH_FEET}' x {formatFeetInches(result.needsLength)}
                  </div>
                </div>
                <div className="calc-result-box calc-result-box--green mb-2">
                  <div className="calc-result-box__label">Total</div>
                  {ROLL_WIDTH_FEET}' x {formatFeetInches(result.totalLength)}
                  <div className="calc-result-box__sub">
                    {result.totalSqFt.toFixed(2)} sf | {result.totalSqYd.toFixed(2)} sy
                  </div>
                </div>
              </div>

              {/* Usage */}
              <div className="calc-section">
                <div className="calc-section__title">Usage</div>
                <div className="flex gap-2 mb-2">
                  <div className="flex-1 calc-result-box calc-result-box--green">
                    <div className="calc-result-box__label">Actual</div>
                    {result.usedSqFt.toFixed(2)} sf
                  </div>
                  <div className="flex-1 calc-result-box calc-result-box--red">
                    <div className="calc-result-box__label">Waste ({result.wastePercent.toFixed(1)}%)</div>
                    {result.wasteSqFt.toFixed(2)} sf
                  </div>
                </div>
                {result.isFlipped && (
                  <div className="calc-warning">
                    ⚠️ <strong>Rotated 90°</strong> — Measurements were flipped (W↔L) to reduce waste. Cut carpet accordingly.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT COLUMN - Diagram (carpet only) */}
        {mode === 'carpet' && (
          <div className="calc-column--wide">
            {result && result.needs.length > 0 && (
              <div className="calc-section">
                <div className="calc-section__title">
                  Diagram (drag pieces to optimize)
                </div>
                <div className="calc-hint mb-2">
                  Blue = carpet pieces | Red = waste | Grid = 1 foot squares
                </div>
                <div className="calc-canvas-container">
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
