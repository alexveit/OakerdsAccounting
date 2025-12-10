// src/components/real-estate/FlipsView.tsx

import { FlipDetailView } from './FlipDetailView';

export function FlipsView() {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Flips</h2>
      </div>

      <FlipDetailView />
    </div>
  );
}
