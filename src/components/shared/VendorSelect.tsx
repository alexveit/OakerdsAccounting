// src/components/shared/VendorSelect.tsx

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { SearchableSelect } from './SearchableSelect';

type Vendor = {
  id: number;
  nick_name: string;
};

type VendorSelectProps = {
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
};

export function VendorSelect({
  value,
  onChange,
  placeholder = 'Type to search vendors...',
  emptyLabel = 'None',
  disabled = false,
}: VendorSelectProps) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadVendors() {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, nick_name')
        .eq('is_active', true)
        .order('nick_name');

      if (!error && data) {
        setVendors(data as Vendor[]);
      }
      setLoading(false);
    }
    void loadVendors();
  }, []);

  const handleCreate = async (name: string): Promise<number | null> => {
    const { data, error } = await supabase
      .from('vendors')
      .insert({ name, nick_name: name, is_active: true })
      .select('id')
      .single();

    if (error || !data) return null;

    // Add to local state
    setVendors((prev) => [...prev, { id: data.id, nick_name: name }]);
    return data.id;
  };

  const options = vendors.map((v) => ({
    value: v.id,
    label: v.nick_name,
  }));

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={(val) => onChange(val as number | null)}
      placeholder={loading ? 'Loading...' : placeholder}
      emptyLabel={emptyLabel}
      disabled={disabled || loading}
      allowCreate
      createLabel="Create vendor"
      onCreateNew={handleCreate}
    />
  );
}
