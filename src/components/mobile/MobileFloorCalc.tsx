// src/components/mobile/MobileFloorCalc.tsx
// Mobile floor calculator - uses shared calculation module

import { useState, useRef, useEffect, useCallback } from 'react';
import { mobileStyles as styles } from './mobileStyles';
import {
  type Measurement,
  type CarpetResult,
  type HardwoodResult,
  ROLL_WIDTH_INCHES,
  TEST_MEASUREMENTS,
  formatFeetInches,
  createMeasurement,
  calculateCarpet,
  calculateHardwood,
} from '../../utils/floorCalculations';

// ============================================================================
// COMPONENT
// ============================================================================

export function MobileFloorCalc() {
  // Mode
  const [mode, setMode] = useState<'carpet' | 'hardwood'>('carpet');
  
  // Inputs
  const widthFeetRef = useRef<HTMLInputElement>(null);
  const [widthFeet, setWidthFeet] = useState('');
  const [widthInches, setWidthInches] = useState('');
  const [lengthFeet, setLengthFeet] = useState('');
  const [lengthInches, setLengthInches] = useState('');
  
  // Options
  const [stepCount, setStepCount] = useState('');
  const [addSlippage, setAddSlippage] = useState(true);
  const [wastePercent, setWastePercent] = useState('7');
  const [boxSqFt, setBoxSqFt] = useState('25');
  
  // Measurements - pre-populated with test data
  /*
  const [measurements, setMeasurements] = useState<Measurement[]>(() => 
    TEST_MEASUREMENTS.map((t, i) => createMeasurement(i + 1, t.wf, t.wi, t.lf, t.li))
  );
  const [nextId, setNextId] = useState(TEST_MEASUREMENTS.length + 1);
  */


  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [nextId, setNextId] = useState(1);
  
  // Results
  const [carpetResult, setCarpetResult] = useState<CarpetResult | null>(null);
  const [hardwoodResult, setHardwoodResult] = useState<HardwoodResult | null>(null);

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
      const result = calculateCarpet({
        measurements,
        addSlippage,
        steps: parseInt(stepCount) || 0,
      });
      setCarpetResult(result);
      setHardwoodResult(null);
    }
  }

  // -------------------------------------------------------------------------
  // STYLES
  // -------------------------------------------------------------------------

  const inputStyle: React.CSSProperties = {
    width: 50,
    padding: '10px 8px',
    fontSize: '16px',
    border: '1px solid #374151',
    borderRadius: 6,
    backgroundColor: '#1f2937',
    color: '#f3f4f6',
    textAlign: 'center',
  };

  const btnStyle: React.CSSProperties = {
    padding: '12px 20px',
    fontSize: '15px',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  };

  const primaryBtn: React.CSSProperties = {
    ...btnStyle,
    backgroundColor: '#3b82f6',
    color: '#fff',
  };

  const secondaryBtn: React.CSSProperties = {
    ...btnStyle,
    backgroundColor: '#374151',
    color: '#f3f4f6',
  };

  const deleteBtn: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '14px',
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    backgroundColor: '#dc2626',
    color: '#fff',
    cursor: 'pointer',
  };

  const resultCard: React.CSSProperties = {
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 16,
  };

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  return (
    <div style={styles.tabContent}>
      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid #374151' }}>
        <button
          style={{
            flex: 1,
            padding: '12px',
            fontSize: 15,
            fontWeight: 600,
            border: 'none',
            backgroundColor: mode === 'carpet' ? '#3b82f6' : '#1f2937',
            color: mode === 'carpet' ? '#fff' : '#9ca3af',
            cursor: 'pointer',
          }}
          onClick={() => setMode('carpet')}
        >
          Carpet
        </button>
        <button
          style={{
            flex: 1,
            padding: '12px',
            fontSize: 15,
            fontWeight: 600,
            border: 'none',
            backgroundColor: mode === 'hardwood' ? '#3b82f6' : '#1f2937',
            color: mode === 'hardwood' ? '#fff' : '#9ca3af',
            cursor: 'pointer',
          }}
          onClick={() => setMode('hardwood')}
        >
          Hardwood
        </button>
      </div>

      {/* Add Measurement */}
      <div style={sectionTitle}>Add Measurement</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ color: '#9ca3af', fontSize: 14 }}>W:</span>
        <input
          ref={widthFeetRef}
          type="number"
          placeholder="ft"
          value={widthFeet}
          onChange={e => setWidthFeet(e.target.value)}
          style={inputStyle}
        />
        <span style={{ color: '#6b7280' }}>'</span>
        <input
          type="number"
          placeholder="in"
          value={widthInches}
          onChange={e => setWidthInches(e.target.value)}
          style={inputStyle}
        />
        <span style={{ color: '#6b7280' }}>"</span>
        <span style={{ color: '#9ca3af', fontSize: 14, marginLeft: 8 }}>L:</span>
        <input
          type="number"
          placeholder="ft"
          value={lengthFeet}
          onChange={e => setLengthFeet(e.target.value)}
          style={inputStyle}
        />
        <span style={{ color: '#6b7280' }}>'</span>
        <input
          type="number"
          placeholder="in"
          value={lengthInches}
          onChange={e => setLengthInches(e.target.value)}
          style={inputStyle}
        />
        <span style={{ color: '#6b7280' }}>"</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={primaryBtn} onClick={handleAdd}>Add</button>
        <button style={secondaryBtn} onClick={handleClear}>Clear</button>
      </div>

      {/* Options */}
      <div style={sectionTitle}>Options</div>
      {mode === 'carpet' ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>Steps:</span>
            <input
              type="number"
              placeholder="0"
              value={stepCount}
              onChange={e => setStepCount(e.target.value)}
              style={{ ...inputStyle, width: 60 }}
            />
            <span style={{ color: '#6b7280', fontSize: 12 }}>(4'x2' each)</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#f3f4f6', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={addSlippage}
              onChange={e => setAddSlippage(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            Add 4" slippage
          </label>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>Waste:</span>
            <input
              type="number"
              value={wastePercent}
              onChange={e => setWastePercent(e.target.value)}
              style={{ ...inputStyle, width: 50 }}
            />
            <span style={{ color: '#6b7280', fontSize: 12 }}>%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>Box:</span>
            <input
              type="number"
              value={boxSqFt}
              onChange={e => setBoxSqFt(e.target.value)}
              style={{ ...inputStyle, width: 50 }}
            />
            <span style={{ color: '#6b7280', fontSize: 12 }}>sf</span>
          </div>
        </div>
      )}

      {/* Measurements List */}
      <div style={sectionTitle}>Measurements ({measurements.length})</div>
      {measurements.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>No measurements</div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {measurements.map(m => (
            <div key={m.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              backgroundColor: '#1f2937',
              borderRadius: 8,
              marginBottom: 6,
            }}>
              <span style={{ color: '#f3f4f6', fontSize: 14 }}>
                {formatFeetInches(m.widthTotal)} x {formatFeetInches(m.lengthTotal)}
              </span>
              <button style={deleteBtn} onClick={() => handleDelete(m.id)}>-</button>
            </div>
          ))}
        </div>
      )}

      {/* Calculate Button */}
      <button
        style={{ ...primaryBtn, width: '100%', padding: 16, fontSize: 16, marginBottom: 16 }}
        onClick={handleCalculate}
      >
        Calculate
      </button>

      {/* Carpet Results */}
      {mode === 'carpet' && carpetResult && (
        <>
          <div style={sectionTitle}>Results</div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>Standard</div>
              {carpetResult.standard.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13 }}>-</div>
              ) : (
                carpetResult.standard.map((m, i) => (
                  <div key={i} style={{ color: '#f3f4f6', fontSize: 13 }}>
                    12' x {formatFeetInches(m.lengthTotal)}
                  </div>
                ))
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>Needs</div>
              {carpetResult.needs.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13 }}>-</div>
              ) : (
                carpetResult.needs.map((m, i) => (
                  <div key={i} style={{ color: '#f3f4f6', fontSize: 13 }}>
                    {formatFeetInches(m.widthTotal)} x {formatFeetInches(m.lengthTotal)}
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ ...resultCard, backgroundColor: '#fef08a', color: '#000' }}>
              <div style={{ fontSize: 11 }}>Standard</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>12' x {formatFeetInches(carpetResult.standardLength)}</div>
            </div>
            <div style={{ ...resultCard, backgroundColor: '#93c5fd', color: '#000' }}>
              <div style={{ fontSize: 11 }}>Needs</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>12' x {formatFeetInches(carpetResult.needsLength)}</div>
            </div>
          </div>

          <div style={{ ...resultCard, backgroundColor: '#86efac', color: '#000', marginBottom: 12 }}>
            <div style={{ fontSize: 11 }}>Total</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>12' x {formatFeetInches(carpetResult.totalLength)}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{carpetResult.totalSqFt.toFixed(2)} sf | {carpetResult.totalSqYd.toFixed(2)} sy</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div style={{ ...resultCard, backgroundColor: '#86efac', color: '#000' }}>
              <div style={{ fontSize: 11 }}>Actual</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{carpetResult.usedSqFt.toFixed(2)} sf</div>
            </div>
            <div style={{ ...resultCard, backgroundColor: '#fca5a5', color: '#000' }}>
              <div style={{ fontSize: 11 }}>Waste ({carpetResult.wastePercent.toFixed(1)}%)</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{carpetResult.wasteSqFt.toFixed(2)} sf</div>
            </div>
          </div>

          {/* Static Diagram */}
          {carpetResult.needs.length > 0 && (
            <>
              <div style={sectionTitle}>Diagram</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
                Blue = carpet | Red = waste | Grid = 1 foot
              </div>
              <canvas
                ref={canvasRef}
                style={{ display: 'block', borderRadius: 8 }}
              />
            </>
          )}
        </>
      )}

      {/* Hardwood Results */}
      {mode === 'hardwood' && hardwoodResult && (
        <>
          <div style={sectionTitle}>Results</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ ...resultCard, backgroundColor: '#93c5fd', color: '#000' }}>
              <div style={{ fontSize: 11 }}>Room Area</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{hardwoodResult.totalSqFt.toFixed(2)} sf</div>
            </div>
            <div style={{ ...resultCard, backgroundColor: '#fca5a5', color: '#000' }}>
              <div style={{ fontSize: 11 }}>Waste ({wastePercent}%)</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{hardwoodResult.wasteSqFt.toFixed(2)} sf</div>
            </div>
            <div style={{ ...resultCard, backgroundColor: '#86efac', color: '#000' }}>
              <div style={{ fontSize: 11 }}>Total Needed</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{hardwoodResult.totalNeeded.toFixed(2)} sf</div>
            </div>
            <div style={{ ...resultCard, backgroundColor: '#fef08a', color: '#000' }}>
              <div style={{ fontSize: 11 }}>Boxes ({boxSqFt} sf)</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{hardwoodResult.boxesNeeded}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
