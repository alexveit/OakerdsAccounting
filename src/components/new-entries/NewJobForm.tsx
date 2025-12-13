import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { FormEvent } from 'react';
import { todayLocalISO } from '../../utils/date';


type LeadSource = {
  id: number;
  nick_name: string;
};

type JobInsertPayload = {
  name: string;
  address: string | null;
  status: string;
  start_date: string;
  lead_source_id: number;
};

export function NewJobForm() {
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // form fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [leadSourceId, setLeadSourceId] = useState<string>('');

  // Start date: defaults to today
  const [startDate, setStartDate] = useState<string>(() => todayLocalISO());

  useEffect(() => {
    async function loadLeadSources() {
      setError(null);
      const { data, error } = await supabase
        .from('lead_sources')
        .select('id, nick_name')
        .order('nick_name', { ascending: true });

      if (error) {
        console.error(error);
        setError(error.message);
      } else {
        setLeadSources(data || []);
      }
      setLoading(false);
    }

    loadLeadSources();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) {
      setError('Job name is required.');
      return;
    }

    if (!leadSourceId) {
      setError('Lead source is required.');
      return;
    }

    setSaving(true);
    try {
      const payload: JobInsertPayload = {
        name: name.trim(),
        address: address.trim() || null,
        status: 'open',
        start_date: startDate,
        lead_source_id: Number(leadSourceId),
      };

      const { error } = await supabase.from('jobs').insert(payload);

      if (error) throw error;

      setSuccess('Job created.');

      // Clear form (but keep start date as today again)
      setName('');
      setAddress('');
      setLeadSourceId('');
      setStartDate(todayLocalISO());
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error saving job');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading lead sources...</p>;
  if (error) return <p className="text-danger">Error: {error}</p>;

  return (
    <div>
      
      {success && <p className="text-success">{success}</p>}

      <form
        onSubmit={handleSubmit}
        className="tx-form"
      >
        <label>
          Job name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Steward - Main Floor"
          />
        </label>

        <label>
          Address
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, city, state"
          />
        </label>

        <label>
          Lead source
          <select
            value={leadSourceId}
            onChange={(e) => setLeadSourceId(e.target.value)}
          >
            <option value="">Select lead source...</option>
            {leadSources.map((ls) => (
              <option key={ls.id} value={ls.id}>
                {ls.nick_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Job'}
        </button>
      </form>
    </div>
  );
}
