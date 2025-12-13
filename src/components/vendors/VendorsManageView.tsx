import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';

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

type VendorManageViewProps = {
  initialSelectedId?: number | null;
  onSelectionUsed?: () => void;
};

export function VendorManageView({ initialSelectedId, onSelectionUsed }: VendorManageViewProps) {
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

  // Handle initialSelectedId from parent (e.g., click from Overview)
  useEffect(() => {
    if (initialSelectedId != null && vendors.length > 0) {
      setSelectedId(initialSelectedId);
      setIsCreating(false);
      onSelectionUsed?.();
    }
  }, [initialSelectedId, vendors.length, onSelectionUsed]);

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
    // Don't clear success here - it would erase the "saved" feedback
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

  return (
    <div className="list-detail-layout">
      {/* Left: Vendor List */}
      <div className="list-panel">
        <div className="list-panel__header">
          <span className="list-panel__title">Vendors</span>
          <button
            type="button"
            onClick={startCreate}
            className="btn btn-sm"
          >
            + New
          </button>
        </div>

        <div className="list-panel__filter">
          <label className="filter-label--sm">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>

        {loadingList ? (
          <div className="list-panel__empty">Loading...</div>
        ) : filteredVendors.length === 0 ? (
          <div className="list-panel__empty">No vendors found.</div>
        ) : (
          <div className="list-panel__content">
            {filteredVendors.map((vendor) => {
              const isSelected = selectedId === vendor.id;

              return (
                <div
                  key={vendor.id}
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(vendor.id);
                  }}
                  className={`list-item ${isSelected ? 'list-item--selected' : ''}`}
                >
                  <div className="list-item__name">{vendor.name}</div>
                  {vendor.nick_name && (
                    <div className="list-item__subtitle">{vendor.nick_name}</div>
                  )}
                  {!vendor.is_active && (
                    <span className="status-badge status-badge--inactive">Inactive</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Edit Form */}
      <div className="detail-panel">
        {!isEditing ? (
          <div className="detail-panel__empty">
            Select a vendor from the list or click "+ New" to create one.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="detail-panel__header">
              <h3 className="detail-panel__title">
                {isCreating ? 'New Vendor' : 'Edit Vendor'}
              </h3>
              <button
                type="button"
                onClick={cancelEdit}
                className="btn-link"
              >
                Cancel
              </button>
            </div>

            {/* Messages */}
            {error && <div className="alert alert--error">{error}</div>}
            {success && <div className="alert alert--success">{success}</div>}

            <div className="form-grid">
              <label className="form-label">
                Vendor Name *
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>

              <label className="form-label">
                Nickname / Abbreviation
                <input
                  type="text"
                  value={nickName}
                  onChange={(e) => setNickName(e.target.value)}
                  placeholder="e.g. HD for Home Depot"
                />
              </label>

              <label className="form-label">
                Contact Name
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </label>

              <label className="form-label">
                Tax ID (EIN)
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="XX-XXXXXXX"
                />
              </label>

              <label className="form-label">
                Phone
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>

              <label className="form-label">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <label className="form-label form-grid--full">
                Address
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>

              <label className="form-label form-label--inline">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active
              </label>
            </div>

            <div className="detail-panel__footer">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving...' : isCreating ? 'Create Vendor' : 'Save Changes'}
              </button>
            </div>

            {/* Metadata */}
            {selectedId !== null && (
              <div className="detail-panel__meta">
                ID: {selectedId}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
