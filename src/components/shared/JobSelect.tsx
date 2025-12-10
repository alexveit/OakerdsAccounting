// src/components/shared/JobSelect.tsx

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { SearchableSelect } from './SearchableSelect';

type Job = {
  id: number;
  name: string;
};

type JobSelectProps = {
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
};

export function JobSelect({
  value,
  onChange,
  placeholder = 'Type to search jobs...',
  emptyLabel = 'None',
  disabled = false,
}: JobSelectProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadJobs() {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (!error && data) {
        setJobs(data as Job[]);
      }
      setLoading(false);
    }
    void loadJobs();
  }, []);

  const options = jobs.map((j) => ({
    value: j.id,
    label: j.name,
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
