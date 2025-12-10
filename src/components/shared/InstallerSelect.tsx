// src/components/shared/InstallerSelect.tsx

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { SearchableSelect } from './SearchableSelect';

type Installer = {
  id: number;
  first_name: string | null;
  last_name: string | null;
};

type InstallerSelectProps = {
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
};

function formatInstallerName(installer: Installer): string {
  const name = `${installer.first_name ?? ''} ${installer.last_name ?? ''}`.trim();
  return name || '(unnamed)';
}

export function InstallerSelect({
  value,
  onChange,
  placeholder = 'Type to search installers...',
  emptyLabel = 'None',
  disabled = false,
}: InstallerSelectProps) {
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInstallers() {
      const { data, error } = await supabase
        .from('installers')
        .select('id, first_name, last_name')
        .eq('is_active', true)
        .order('first_name');

      if (!error && data) {
        setInstallers(data as Installer[]);
      }
      setLoading(false);
    }
    void loadInstallers();
  }, []);

  const options = installers.map((i) => ({
    value: i.id,
    label: formatInstallerName(i),
  }));

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={(val) => onChange(val as number | null)}
      placeholder={loading ? 'Loading...' : placeholder}
      emptyLabel={emptyLabel}
      disabled={disabled || loading}
    />
  );
}

// Export the formatter for use elsewhere (e.g., building vendor_installer strings)
export { formatInstallerName };
