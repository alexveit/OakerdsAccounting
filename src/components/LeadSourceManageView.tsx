import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type LeadSource = {
  id: number;
  name: string;
  nick_name: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function LeadSourceManageView() {
  // List state
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  // Selection / Edit state
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [nickName, setNickName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Data Loading
  // ─────────────────────────────────────────────────────────────────────────────

  async function loadLeadSources() {
    setLoadingList(true);
    const { data, error } = await supabase
      .from('lead_sources')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error loading lead sources:', error);
    } else {
      setLeadSources((data || []) as LeadSource[]);
    }
    setLoadingList(false);
  }

  useEffect(() => {
    loadLeadSources();
  }, []);

  // Load selected lead source into form
  useEffect(() => {
    if (selectedId === null) {
      if (!isCreating) resetForm();
      return;
    }

    const source = leadSources.find((s) => s.id === selectedId);
    if (source) {
      populateForm(source);
    }
  }, [selectedId, leadSources]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Form Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function resetForm() {
    setName('');
    setNickName('');
    setDescription('');
    setIsActive(true);
    setError(null);
    setSuccess(null);
  }

  function populateForm(source: LeadSource) {
    setName(source.name);
    setNickName(source.nick_name || '');
    setDescription(source.description || '');
    setIsActive(source.is_active);
    setError(null);
    setSuccess(null);
  }

  function startCreate() {
    setSelectedId(null);
    setIsCreating(true);
    resetForm();
  }

  function cancelEdit() {
    setSelectedId(null);
    setIsCreating(false);
    resetForm();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Submit
  // ─────────────────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!name.trim()) {
      setError('Lead source name is required.');
      return;
    }

    setSaving(true);

    const payload = {
      name: name.trim(),
      nick_name: nickName.trim() || null,
      description: description.trim() || null,
      is_active: isActive,
    };

    if (isCreating) {
      // INSERT
      const { data, error: insertError } = await supabase
        .from('lead_sources')
        .insert([payload])
        .select()
        .single();

      setSaving(false);

      if (insertError) {
        console.error('Error creating lead source:', insertError);
        setError(`Failed to create: ${insertError.message}`);
        return;
      }

      setSuccess('Lead source created.');
      setLeadSources((prev) => [...prev, data as LeadSource].sort((a, b) =>
        a.name.localeCompare(b.name)
      ));
      setIsCreating(false);
      setSelectedId((data as LeadSource).id);
    } else if (selectedId !== null) {
      // UPDATE
      const { error: updateError } = await supabase
        .from('lead_sources')
        .update(payload)
        .eq('id', selectedId);

      setSaving(false);

      if (updateError) {
        console.error('Error updating lead source:', updateError);
        setError(`Failed to update: ${updateError.message}`);
        return;
      }

      setSuccess('Lead source updated.');
      setLeadSources((prev) =>
        prev.map((s) =>
          s.id === selectedId ? { ...s, ...payload } : s
        ).sort((a, b) => a.name.localeCompare(b.name))
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const filteredSources = showInactive
    ? leadSources
    : leadSources.filter((s) => s.is_active);

  const isEditing = selectedId !== null || isCreating;

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: 13,
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>
      {/* Left: Lead Source List */}
      <div
        style={{
          border: '1px solid #e0e0e0',
          borderRadius: 8,
          background: '#fff',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>Lead Sources</span>
          <button
            type="button"
            onClick={startCreate}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            + New
          </button>
        </div>

        <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #f0f0f0' }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>

        {loadingList ? (
          <div style={{ padding: '1rem', fontSize: 13, color: '#666' }}>Loading...</div>
        ) : filteredSources.length === 0 ? (
          <div style={{ padding: '1rem', fontSize: 13, color: '#666' }}>No lead sources found.</div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredSources.map((source) => {
              const isSelected = selectedId === source.id;

              return (
                <div
                  key={source.id}
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(source.id);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    background: isSelected ? '#e8f0fe' : 'transparent',
                    borderLeft: isSelected ? '3px solid #1a73e8' : '3px solid transparent',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{source.name}</div>
                  {source.nick_name && (
                    <div style={{ fontSize: 11, color: '#666' }}>{source.nick_name}</div>
                  )}
                  {!source.is_active && (
                    <span
                      style={{
                        fontSize: 10,
                        color: '#b00020',
                        background: '#fee',
                        padding: '1px 4px',
                        borderRadius: 3,
                        marginTop: 2,
                        display: 'inline-block',
                      }}
                    >
                      Inactive
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Edit Form */}
      <div
        style={{
          border: '1px solid #e0e0e0',
          borderRadius: 8,
          background: '#fff',
          padding: '1rem 1.25rem',
        }}
      >
        {!isEditing ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
            Select a lead source from the list or click "+ New" to create one.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ margin: 0 }}>
                {isCreating ? 'New Lead Source' : 'Edit Lead Source'}
              </h3>
              <button
                type="button"
                onClick={cancelEdit}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
            </div>

            {/* Messages */}
            {error && (
              <div
                style={{
                  background: '#fee',
                  color: '#900',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 4,
                  marginBottom: '1rem',
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
            {success && (
              <div
                style={{
                  background: '#efe',
                  color: '#060',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 4,
                  marginBottom: '1rem',
                  fontSize: 13,
                }}
              >
                {success}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={labelStyle}>
                Name *
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="e.g. Google Ads, Referral, Door Knock"
                />
              </label>

              <label style={labelStyle}>
                Nickname / Abbreviation
                <input
                  type="text"
                  value={nickName}
                  onChange={(e) => setNickName(e.target.value)}
                  placeholder="e.g. GA, REF, DK"
                />
              </label>

              <label style={labelStyle}>
                Description
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional notes about this lead source..."
                />
              </label>

              <label
                style={{
                  ...labelStyle,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '0.5rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active
              </label>
            </div>

            <div
              style={{
                marginTop: '1.25rem',
                paddingTop: '1rem',
                borderTop: '1px solid #e0e0e0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
              }}
            >
              <button type="submit" disabled={saving}>
                {saving ? 'Saving...' : isCreating ? 'Create Lead Source' : 'Save Changes'}
              </button>
            </div>

            {/* Metadata */}
            {selectedId !== null && (
              <div
                style={{
                  marginTop: '1rem',
                  fontSize: 11,
                  color: '#999',
                }}
              >
                ID: {selectedId}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
