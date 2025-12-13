// src/components/mobile/MobileFloorCalc.tsx
// Mobile floor calculator - uses shared calculation module

import { useState, useRef, useEffect, useCallback } from 'react';
import { mobileStyles as styles } from './mobileStyles';
import {
  type Measurement,
  type CarpetResult,
  type HardwoodResult,
  type BulkParseResult,
  ROLL_WIDTH_INCHES,
  TEST_MEASUREMENTS,
  formatFeetInches,
  createMeasurement,
  parseBulkMeasurements,
  calculateCarpet,
  calculateHardwood,
} from '../../utils/floorCalculations';

// ============================================================================
// COMPONENT
// ============================================================================

export function MobileFloorCalc() {
  // localStorage key for persisting calculator state
  const STORAGE_KEY = 'oakerds_mobile_floor_calc';

  // Persisted state shape from localStorage
  type PersistedState = {
    mode?: 'carpet' | 'hardwood';
    stepCount?: string;
    addSlippage?: boolean;
    wastePercent?: string;
    boxSqFt?: string;
    measurements?: Measurement[];
    nextId?: number;
    carpetResult?: CarpetResult | null;
    hardwoodResult?: HardwoodResult | null;
  };

  // Load persisted state from localStorage
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

  // Mode
  const [mode, setMode] = useState<'carpet' | 'hardwood'>(persistedState?.mode || 'carpet');
  
  // Inputs
  const widthFeetRef = useRef<HTMLInputElement>(null);
  const [widthFeet, setWidthFeet] = useState('');
  const [widthInches, setWidthInches] = useState('');
  const [lengthFeet, setLengthFeet] = useState('');
  const [lengthInches, setLengthInches] = useState('');
  
  // Options
  const [stepCount, setStepCount] = useState(persistedState?.stepCount || '');
  const [addSlippage, setAddSlippage] = useState(persistedState?.addSlippage ?? true);
  const [wastePercent, setWastePercent] = useState(persistedState?.wastePercent || '7');
  const [boxSqFt, setBoxSqFt] = useState(persistedState?.boxSqFt || '25');
  
  // Measurements
  const [measurements, setMeasurements] = useState<Measurement[]>(persistedState?.measurements || []);
  const [nextId, setNextId] = useState<number>(persistedState?.nextId || 1);
  
  // Bulk entry
  const [bulkText, setBulkText] = useState('');
  const [showBulkEntry, setShowBulkEntry] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<BulkParseResult | null>(null);
  
  // Results - load from persisted state
  const [carpetResult, setCarpetResult] = useState<CarpetResult | null>(persistedState?.carpetResult || null);
  const [hardwoodResult, setHardwoodResult] = useState<HardwoodResult | null>(persistedState?.hardwoodResult || null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(280);

  // Calculate canvas width based on screen size
  useEffect(() => {
    function updateCanvasWidth() {
      // Screen width minus padding (16px each side) minus a bit of safety margin
      const width = Math.min(window.innerWidth - 48, 320);
      setCanvasWidth(width);
    }
    
    updateCanvasWidth();
    window.addEventListener('resize', updateCanvasWidth);
    return () => window.removeEventListener('resize', updateCanvasWidth);
  }, []);

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
      carpetResult,
      hardwoodResult,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error('Failed to save calculator state:', e);
    }
  }, [mode, stepCount, addSlippage, wastePercent, boxSqFt, measurements, nextId, carpetResult, hardwoodResult]);

  // Draw static diagram using bin-packed positions
  const drawDiagram = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !carpetResult || carpetResult.needs.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use responsive width
    const scale = canvasWidth / ROLL_WIDTH_INCHES;
    
    // Use needsLength from bin packing result
    const needsMaxLength = carpetResult.needsLength;
    
    canvas.width = canvasWidth;
    canvas.height = needsMaxLength * scale;

    // Red background (waste)
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines (every foot)
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 1;

    for (let x = 0; x <= ROLL_WIDTH_INCHES; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x * scale, 0);
      ctx.lineTo(x * scale, canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y <= needsMaxLength; y += 12) {
      ctx.beginPath();
      ctx.moveTo(0, y * scale);
      ctx.lineTo(canvas.width, y * scale);
      ctx.stroke();
    }

    // Draw pieces using bin-packed positions (x, y from PlacedPiece)
    for (const piece of carpetResult.needs) {
      const px = piece.x * scale;
      const py = piece.y * scale;
      const pw = piece.widthTotal * scale;
      const ph = piece.lengthTotal * scale;

      // Blue fill
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(px, py, pw, ph);

      // Border
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    }
  }, [carpetResult, canvasWidth]);

  useEffect(() => {
    drawDiagram();
  }, [drawDiagram]);

  // -------------------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------------------

  function handleAdd() {
    const wf = parseInt(widthFeet) || 0;
    const wi = parseInt(widthInches) || 0;
    const lf = parseInt(lengthFeet) || 0;
    const li = parseInt(lengthInches) || 0;

    if (wf === 0 && wi === 0) return;
    if (lf === 0 && li === 0) return;

    const normalizedWi = wi % 12;
    const extraWf = Math.floor(wi / 12);
    const normalizedLi = li % 12;
    const extraLf = Math.floor(li / 12);

    const m = createMeasurement(nextId, wf + extraWf, normalizedWi, lf + extraLf, normalizedLi);
    setMeasurements(prev => [...prev, m]);
    setNextId(prev => prev + 1);

    setWidthFeet('');
    setWidthInches('');
    setLengthFeet('');
    setLengthInches('');
    widthFeetRef.current?.focus();
  }

  function handleDelete(id: number) {
    setMeasurements(prev => prev.filter(m => m.id !== id));
  }

  function handleClear() {
    setMeasurements([]);
    setCarpetResult(null);
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
    
    setMeasurements(prev => [...prev, ...bulkPreview.valid]);
    setNextId(prev => prev + bulkPreview.valid.length);
    setBulkText('');
    setBulkPreview(null);
    setShowBulkEntry(false);
  }

  function handleBulkClear() {
    setBulkText('');
    setBulkPreview(null);
  }

  function handleCalculate() {
    if (measurements.length === 0) return;

    if (mode === 'hardwood') {
      const result = calculateHardwood({
        measurements,
        wastePercent: parseFloat(wastePercent) || 7,
        boxSqFt: parseFloat(boxSqFt) || 25,
      });
      setHardwoodResult(result);
      setCarpetResult(null);
    } else {
      // Carpet mode - show loading state, then calculate
      setIsCalculating(true);
      
      setTimeout(() => {
        const result = calculateCarpet({
          measurements,
          addSlippage,
          steps: parseInt(stepCount) || 0,
        });
        setCarpetResult(result);
        setHardwoodResult(null);
        setIsCalculating(false);
      }, 10);
    }
  }

  // -------------------------------------------------------------------------
  // STYLES
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  return (
    <div style={styles.tabContent}>
      {/* Mode Toggle */}
      <div className="mfc-mode-toggle">
        <button
          className={`mfc-mode-btn ${mode === 'carpet' ? 'active' : ''}`}
          onClick={() => setMode('carpet')}
        >
          Carpet
        </button>
        <button
          className={`mfc-mode-btn ${mode === 'hardwood' ? 'active' : ''}`}
          onClick={() => setMode('hardwood')}
        >
          Hardwood
        </button>
      </div>

      {/* Add Measurement */}
      <div className="mfc-section-title">Add Measurement</div>
      <div className="mfc-input-row">
        <span className="mfc-input-label">W:</span>
        <input
          ref={widthFeetRef}
          type="number"
          placeholder="ft"
          value={widthFeet}
          onChange={e => setWidthFeet(e.target.value)}
          className="mfc-input"
        />
        <span className="mfc-input-symbol">'</span>
        <input
          type="number"
          placeholder="in"
          value={widthInches}
          onChange={e => setWidthInches(e.target.value)}
          className="mfc-input"
        />
        <span className="mfc-input-symbol">"</span>
        <span className="mfc-input-label mfc-input-label--spaced">L:</span>
        <input
          type="number"
          placeholder="ft"
          value={lengthFeet}
          onChange={e => setLengthFeet(e.target.value)}
          className="mfc-input"
        />
        <span className="mfc-input-symbol">'</span>
        <input
          type="number"
          placeholder="in"
          value={lengthInches}
          onChange={e => setLengthInches(e.target.value)}
          className="mfc-input"
        />
        <span className="mfc-input-symbol">"</span>
      </div>
      <div className="mfc-btn-row">
        <button className="mfc-btn mfc-btn--primary" onClick={handleAdd}>Add</button>
        <button className="mfc-btn mfc-btn--secondary" onClick={handleClear}>Clear</button>
        <button 
          className="mfc-btn mfc-btn--secondary" 
          onClick={() => setShowBulkEntry(!showBulkEntry)}
        >
          {showBulkEntry ? 'Hide' : 'Bulk'}
        </button>
      </div>
      
      {/* Bulk Entry Section */}
      {showBulkEntry && (
        <div className="mfc-bulk-section">
          <div className="mfc-bulk-hint">
            Paste measurements (comma or newline separated):<br/>
            <code>LR 11.6x13.6, BR 10.3*12</code>
          </div>
          <textarea
            value={bulkText}
            onChange={(e) => {
              setBulkText(e.target.value);
              setBulkPreview(null);
            }}
            placeholder="11.6x13.6, 10.3x12&#10;8.6x9.3"
            rows={3}
            className="mfc-bulk-textarea"
          />
          <div className="mfc-btn-row mfc-btn-row--mt">
            <button className="mfc-btn mfc-btn--primary mfc-btn--flex" onClick={handleBulkPreview}>
              Preview
            </button>
            <button className="mfc-btn mfc-btn--secondary mfc-btn--flex" onClick={handleBulkClear}>
              Clear
            </button>
          </div>
          
          {/* Preview Results */}
          {bulkPreview && (
            <div className="mfc-bulk-preview">
              {/* Summary */}
              <div className="mfc-bulk-preview-header">
                <span className="valid">✓ {bulkPreview.validCount}</span>
                {bulkPreview.errorCount > 0 && (
                  <span className="error">× {bulkPreview.errorCount}</span>
                )}
                {bulkPreview.warningCount > 0 && (
                  <span className="warning">⚠ {bulkPreview.warningCount}</span>
                )}
              </div>
              
              {/* Entry list */}
              <div className="mfc-bulk-preview-list">
                {bulkPreview.entries.map((entry, i) => (
                  <div 
                    key={i} 
                    className={`mfc-bulk-preview-item ${entry.error ? 'mfc-bulk-preview-item--error' : entry.warning ? 'mfc-bulk-preview-item--warning' : 'mfc-bulk-preview-item--success'}`}
                  >
                    <code>{entry.raw}</code>
                    {entry.error ? (
                      <span className="error">×</span>
                    ) : entry.measurement ? (
                      <span className={entry.warning ? "icon-warning" : "icon-success"}>
                        {formatFeetInches(entry.measurement.widthTotal)}×{formatFeetInches(entry.measurement.lengthTotal)}
                        {entry.warning && ' ⚠'}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
              
              {/* Add button */}
              {bulkPreview.valid.length > 0 && (
                <button 
                  className="mfc-btn mfc-btn--primary mfc-btn--success mfc-btn--full mfc-btn--mt" 
                  onClick={handleBulkAdd}
                >
                  Add {bulkPreview.validCount} Measurement{bulkPreview.validCount !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Options */}
      <div className="mfc-section-title">Options</div>
      {mode === 'carpet' ? (
        <div className="mfc-options">
          <div className="mfc-option-row">
            <span className="mfc-input-label">Steps:</span>
            <input
              type="number"
              placeholder="0"
              value={stepCount}
              onChange={e => setStepCount(e.target.value)}
              className="mfc-input mfc-input--wide"
            />
            <span className="mfc-option-hint">(4'x2' each)</span>
          </div>
          <label className="mfc-checkbox-label">
            <input
              type="checkbox"
              checked={addSlippage}
              onChange={e => setAddSlippage(e.target.checked)}
              className="mfc-checkbox"
            />
            Add 4" slippage
          </label>
        </div>
      ) : (
        <div className="mfc-option-group">
          <div className="mfc-option-field">
            <span className="mfc-input-label">Waste:</span>
            <input
              type="number"
              value={wastePercent}
              onChange={e => setWastePercent(e.target.value)}
              className="mfc-input"
            />
            <span className="mfc-option-hint">%</span>
          </div>
          <div className="mfc-option-field">
            <span className="mfc-input-label">Box:</span>
            <input
              type="number"
              value={boxSqFt}
              onChange={e => setBoxSqFt(e.target.value)}
              className="mfc-input"
            />
            <span className="mfc-option-hint">sf</span>
          </div>
        </div>
      )}

      {/* Measurements List */}
      <div className="mfc-section-title">Measurements ({measurements.length})</div>
      {measurements.length === 0 ? (
        <div className="mfc-empty-msg">No measurements</div>
      ) : (
        <div className="mfc-measurements">
          {measurements.map(m => (
            <div key={m.id} className="mfc-measurement">
              <span className="mfc-measurement-text">
                {formatFeetInches(m.widthTotal)} x {formatFeetInches(m.lengthTotal)}
              </span>
              <button className="mfc-btn--delete" onClick={() => handleDelete(m.id)}>-</button>
            </div>
          ))}
        </div>
      )}

      {/* Calculate Button */}
      <button
        className="mfc-calc-btn"
        onClick={handleCalculate}
        disabled={isCalculating}
      >
        {isCalculating ? 'Optimizing...' : 'Calculate'}
      </button>

      {/* Carpet Results */}
      {mode === 'carpet' && carpetResult && (
        <>
          <div className="mfc-section-title">Results</div>
          <div className="mfc-result-columns">
            <div className="mfc-result-column">
              <div className="mfc-result-column-title">Standard</div>
              {carpetResult.standard.length === 0 ? (
                <div className="mfc-result-column-empty">-</div>
              ) : (
                carpetResult.standard.map((m, i) => (
                  <div key={i} className="mfc-result-column-item">
                    12' x {formatFeetInches(m.lengthTotal)}
                  </div>
                ))
              )}
            </div>
            <div className="mfc-result-column">
              <div className="mfc-result-column-title">Needs</div>
              {carpetResult.needs.length === 0 ? (
                <div className="mfc-result-column-empty">-</div>
              ) : (
                carpetResult.needs.map((m, i) => (
                  <div key={i} className="mfc-result-column-item">
                    {formatFeetInches(m.widthTotal)} x {formatFeetInches(m.lengthTotal)}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mfc-result-grid">
            <div className="mfc-result-card mfc-result-card--yellow">
              <div className="mfc-result-card__label">Standard</div>
              <div className="mfc-result-card__value">12' x {formatFeetInches(carpetResult.standardLength)}</div>
            </div>
            <div className="mfc-result-card mfc-result-card--blue">
              <div className="mfc-result-card__label">Needs</div>
              <div className="mfc-result-card__value">12' x {formatFeetInches(carpetResult.needsLength)}</div>
            </div>
          </div>

          <div className="mfc-result-card mfc-result-card--green mfc-result-card--full">
            <div className="mfc-result-card__label">Total</div>
            <div className="mfc-result-card__value mfc-result-card__value--lg">12' x {formatFeetInches(carpetResult.totalLength)}</div>
            <div className="mfc-result-card__sub">{carpetResult.totalSqFt.toFixed(2)} sf | {carpetResult.totalSqYd.toFixed(2)} sy</div>
          </div>

          <div className="mfc-result-grid mfc-result-grid--mb">
            <div className="mfc-result-card mfc-result-card--green">
              <div className="mfc-result-card__label">Actual</div>
              <div className="mfc-result-card__value">{carpetResult.usedSqFt.toFixed(2)} sf</div>
            </div>
            <div className="mfc-result-card mfc-result-card--red">
              <div className="mfc-result-card__label">Waste ({carpetResult.wastePercent.toFixed(1)}%)</div>
              <div className="mfc-result-card__value">{carpetResult.wasteSqFt.toFixed(2)} sf</div>
            </div>
          </div>

          {carpetResult.isFlipped && (
            <div className="mfc-flipped-warning">
              ⚠ï¸ <strong>Rotated 90°</strong> "” Measurements flipped (W←”L) to reduce waste.
            </div>
          )}

          {/* Static Diagram */}
          {carpetResult.needs.length > 0 && (
            <>
              <div className="mfc-section-title">Diagram</div>
              <div className="mfc-diagram-hint">
                Blue = carpet | Red = waste | Grid = 1 foot
              </div>
              <canvas
                ref={canvasRef}
                className="mfc-diagram-canvas"
              />
            </>
          )}
        </>
      )}

      {/* Hardwood Results */}
      {mode === 'hardwood' && hardwoodResult && (
        <>
          <div className="mfc-section-title">Results</div>
          <div className="mfc-result-grid">
            <div className="mfc-result-card mfc-result-card--blue">
              <div className="mfc-result-card__label">Room Area</div>
              <div className="mfc-result-card__value mfc-result-card__value--lg">{hardwoodResult.totalSqFt.toFixed(2)} sf</div>
            </div>
            <div className="mfc-result-card mfc-result-card--red">
              <div className="mfc-result-card__label">Waste ({wastePercent}%)</div>
              <div className="mfc-result-card__value mfc-result-card__value--lg">{hardwoodResult.wasteSqFt.toFixed(2)} sf</div>
            </div>
            <div className="mfc-result-card mfc-result-card--green">
              <div className="mfc-result-card__label">Total Needed</div>
              <div className="mfc-result-card__value mfc-result-card__value--lg">{hardwoodResult.totalNeeded.toFixed(2)} sf</div>
            </div>
            <div className="mfc-result-card mfc-result-card--yellow">
              <div className="mfc-result-card__label">Boxes ({boxSqFt} sf)</div>
              <div className="mfc-result-card__value mfc-result-card__value--xl">{hardwoodResult.boxesNeeded}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
