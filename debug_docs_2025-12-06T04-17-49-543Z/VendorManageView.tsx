import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Vendor = {
  id: number;
  name: string;
  nick_name: string | null;
  contact_name: string | null;
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

export function VendorManageView() {
  // List state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  // Selection / Edit state
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [nickName, setNickName] = useState('');
  const [contactName, setContactName] = useState('');
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

  async function loadVendors() {
    setLoadingList(true);
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error loading vendors:', error);
    } else {
      setVendors((data || []) as Vendor[]);
    }
    setLoadingList(false);
  }

  useEffect(() => {
    loadVendors();
  }, []);

  // Load selected vendor into form
  useEffect(() => {
    if (selectedId === null) {
      if (!isCreating) resetForm();
      return;
    }

    const vendor = vendors.find((v) => v.id === selectedId);
    if (vendor) {
      populateForm(vendor);
    }
  }, [selectedId, vendors]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Form Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function resetForm() {
    setName('');
    setNickName('');
    setContactName('');
    setAddress('');
    setTaxId('');
    setPhone('');
    setEmail('');
    setIsActive(true);
    setError(null);
    setSuccess(null);
  }

  function populateForm(vendor: Vendor) {
    setName(vendor.name);
    setNickName(vendor.nick_name || '');
    setContactName(vendor.contact_name || '');
    setAddress(vendor.address || '');
    setTaxId(vendor.tax_id || '');
    setPhone(vendor.phone || '');
    setEmail(vendor.email || '');
    setIsActive(vendor.is_active);
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
      setError('Vendor name is required.');
      return;
    }

    setSaving(true);

    const payload = {
      name: name.trim(),
      nick_name: nickName.trim() || null,
      contact_name: contactName.trim() || null,
      address: address.trim() || null,
      tax_id: taxId.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      is_active: isActive,
    };

    if (isCreating) {
      // INSERT
      const { data, error: insertError } = await supabase
        .from('vendors')
        .insert([payload])
        .select()
        .single();

      setSaving(false);

      if (insertError) {
        console.error('Error creating vendor:', insertError);
        setError(`Failed to create: ${insertError.message}`);
        return;
      }

      setSuccess('Vendor created.');
      setVendors((prev) => [...prev, data as Vendor].sort((a, b) =>
        a.name.localeCompare(b.name)
      ));
      setIsCreating(false);
      setSelectedId((data as Vendor).id);
    } else if (selectedId !== null) {
      // UPDATE
      const { error: updateError } = await supabase
        .from('vendors')
        .update(payload)
        .eq('id', selectedId);

      setSaving(false);

      if (updateError) {
        console.error('Error updating vendor:', updateError);
        setError(`Failed to update: ${updateError.message}`);
        return;
      }

      setSuccess('Vendor updated.');
      setVendors((prev) =>
        prev.map((v) =>
          v.id === selectedId ? { ...v, ...payload } : v
        ).sort((a, b) => a.name.localeCompare(b.name))
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const filteredVendors = showInactive
    ? vendors
    : vendors.filter((v) => v.is_active);

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
      {/* Left: Vendor List */}
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
          <span style={{ fontWeight: 600, fontSize: 14 }}>Vendors</span>
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
        ) : filteredVendors.length === 0 ? (
          <div style={{ padding: '1rem', fontSize: 13, color: '#666' }}>No vendors found.</div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredVendors.map((vendor) => {
              const isSelected = selectedId === vendor.id;

              return (
                <div
                  key={vendor.id}
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(vendor.id);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    background: isSelected ? '#e8f0fe' : 'transparent',
                    borderLeft: isSelected ? '3px solid #1a73e8' : '3px solid transparent',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{vendor.name}</div>
                  {vendor.nick_name && (
                    <div style={{ fontSize: 11, color: '#666' }}>{vendor.nick_name}</div>
                  )}
                  {!vendor.is_active && (
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
            Select a vendor from the list or click "+ New" to create one.
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
                {isCreating ? 'New Vendor' : 'Edit Vendor'}
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
                Vendor Name *
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>

              <label style={labelStyle}>
                Nickname / Abbreviation
                <input
                  type="text"
                  value={nickName}
                  onChange={(e) => setNickName(e.target.value)}
                  placeholder="e.g. HD for Home Depot"
                />
              </label>

              <label style={labelStyle}>
                Contact Name
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </label>

              <label style={labelStyle}>
                Tax ID (EIN)
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="XX-XXXXXXX"
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
                {saving ? 'Saving...' : isCreating ? 'Create Vendor' : 'Save Changes'}
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
