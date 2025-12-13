import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';

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

type InstallerManageViewProps = {
  initialSelectedId?: number | null;
  onSelectionUsed?: () => void;
};

export function InstallerManageView({ initialSelectedId, onSelectionUsed }: InstallerManageViewProps) {
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

  // Handle initialSelectedId from parent (e.g., click from Overview)
  useEffect(() => {
    if (initialSelectedId != null && installers.length > 0) {
      setSelectedId(initialSelectedId);
      setIsCreating(false);
      onSelectionUsed?.();
    }
  }, [initialSelectedId, installers.length, onSelectionUsed]);

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

  return (
    <div className="list-detail-layout">
      {/* Left: Installer List */}
      <div className="list-panel">
        <div className="list-panel__header">
          <span className="list-panel__title">Installers</span>
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
          <div className="list-panel__empty">Loading…</div>
        ) : filteredInstallers.length === 0 ? (
          <div className="list-panel__empty">No installers found.</div>
        ) : (
          <div className="list-panel__content">
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
                  className={`list-item ${isSelected ? 'list-item--selected' : ''}`}
                >
                  <div className="list-item__name">{name}</div>
                  {installer.company_name && (
                    <div className="list-item__subtitle">{installer.company_name}</div>
                  )}
                  {!installer.is_active && (
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
            Select an installer from the list or click "+ New" to create one.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="detail-panel__header">
              <h3 className="detail-panel__title">
                {isCreating ? 'New Installer' : 'Edit Installer'}
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
                First Name *
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </label>

              <label className="form-label">
                Last Name
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>

              <label className="form-label form-grid--full">
                Company Name
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
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

              <label className="form-label">
                Tax ID (SSN / EIN)
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="XXX-XX-XXXX or XX-XXXXXXX"
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
                {saving ? 'Saving…' : isCreating ? 'Create Installer' : 'Save Changes'}
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
