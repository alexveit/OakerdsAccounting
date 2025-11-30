import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Installer = {
  id: number;
  first_name: string;
  last_name: string | null;
  company_name: string | null;
  address: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function InstallerManageView() {
  // List state
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  // Selection / Edit state
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isActive, setIsActive] = useState(true);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Data Loading
  // ─────────────────────────────────────────────────────────────────────────────

  async function loadInstallers() {
    setLoadingList(true);
    const { data, error } = await supabase
      .from('installers')
      .select('*')
      .order('first_name', { ascending: true });

    if (error) {
      console.error('Error loading installers:', error);
    } else {
      setInstallers((data || []) as Installer[]);
    }
    setLoadingList(false);
  }

  useEffect(() => {
    loadInstallers();
  }, []);

  // Load selected installer into form
  useEffect(() => {
    if (selectedId === null) {
      if (!isCreating) resetForm();
      return;
    }

    const installer = installers.find((i) => i.id === selectedId);
    if (installer) {
      populateForm(installer);
    }
  }, [selectedId, installers]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Form Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function resetForm() {
    setFirstName('');
    setLastName('');
    setCompanyName('');
    setAddress('');
    setTaxId('');
    setPhone('');
    setEmail('');
    setIsActive(true);
    setError(null);
    setSuccess(null);
  }

  function populateForm(installer: Installer) {
    setFirstName(installer.first_name);
    setLastName(installer.last_name || '');
    setCompanyName(installer.company_name || '');
    setAddress(installer.address || '');
    setTaxId(installer.tax_id || '');
    setPhone(installer.phone || '');
    setEmail(installer.email || '');
    setIsActive(installer.is_active);
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
    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }

    setSaving(true);

    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      company_name: companyName.trim() || null,
      address: address.trim() || null,
      tax_id: taxId.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      is_active: isActive,
    };

    if (isCreating) {
      // INSERT
      const { data, error: insertError } = await supabase
        .from('installers')
        .insert([payload])
        .select()
        .single();

      setSaving(false);

      if (insertError) {
        console.error('Error creating installer:', insertError);
        setError(`Failed to create: ${insertError.message}`);
        return;
      }

      setSuccess('Installer created.');
      setInstallers((prev) => [...prev, data as Installer].sort((a, b) =>
        a.first_name.localeCompare(b.first_name)
      ));
      setIsCreating(false);
      setSelectedId((data as Installer).id);
    } else if (selectedId !== null) {
      // UPDATE
      const { error: updateError } = await supabase
        .from('installers')
        .update(payload)
        .eq('id', selectedId);

      setSaving(false);

      if (updateError) {
        console.error('Error updating installer:', updateError);
        setError(`Failed to update: ${updateError.message}`);
        return;
      }

      setSuccess('Installer updated.');
      setInstallers((prev) =>
        prev.map((i) =>
          i.id === selectedId ? { ...i, ...payload } : i
        ).sort((a, b) => a.first_name.localeCompare(b.first_name))
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const filteredInstallers = showInactive
    ? installers
    : installers.filter((i) => i.is_active);

  const isEditing = selectedId !== null || isCreating;

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: 13,
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.75rem 1rem',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>
      {/* Left: Installer List */}
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
          <span style={{ fontWeight: 600, fontSize: 14 }}>Installers</span>
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
          <div style={{ padding: '1rem', fontSize: 13, color: '#666' }}>Loading…</div>
        ) : filteredInstallers.length === 0 ? (
          <div style={{ padding: '1rem', fontSize: 13, color: '#666' }}>No installers found.</div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredInstallers.map((installer) => {
              const name = `${installer.first_name} ${installer.last_name || ''}`.trim();
              const isSelected = selectedId === installer.id;

              return (
                <div
                  key={installer.id}
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(installer.id);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    background: isSelected ? '#e8f0fe' : 'transparent',
                    borderLeft: isSelected ? '3px solid #1a73e8' : '3px solid transparent',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{name}</div>
                  {installer.company_name && (
                    <div style={{ fontSize: 11, color: '#666' }}>{installer.company_name}</div>
                  )}
                  {!installer.is_active && (
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
            Select an installer from the list or click "+ New" to create one.
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
                {isCreating ? 'New Installer' : 'Edit Installer'}
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

            <div style={gridStyle}>
              <label style={labelStyle}>
                First Name *
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </label>

              <label style={labelStyle}>
                Last Name
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>

              <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
                Company Name
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </label>

              <label style={labelStyle}>
                Phone
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>

              <label style={labelStyle}>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
                Address
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>

              <label style={labelStyle}>
                Tax ID (SSN / EIN)
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="XXX-XX-XXXX or XX-XXXXXXX"
                />
              </label>

              <label
                style={{
                  ...labelStyle,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '1.25rem',
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
                {saving ? 'Saving…' : isCreating ? 'Create Installer' : 'Save Changes'}
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
