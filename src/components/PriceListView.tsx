import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

// ============================================================
// TYPES
// ============================================================

type PriceItem = {
  id: number;
  type: string;
  category: string;
  item_name: string;
  price: number | null;
  unit: string;
  is_active: boolean;
};

type FilterType = 'all' | 'wood' | 'tile';

// ============================================================
// COMPONENT
// ============================================================

export function PriceListView() {
  const [items, setItems] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<PriceItem>>({});

  // Add new state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState<Partial<PriceItem>>({
    type: 'wood',
    category: '',
    item_name: '',
    price: null,
    unit: 'each',
  });

  // ----------------------------------------------------------
  // LOAD DATA
  // ----------------------------------------------------------
  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchErr } = await supabase
        .from('price_list')
        .select('*')
        .eq('is_active', true)
        .order('type')
        .order('category')
        .order('item_name');

      if (fetchErr) throw fetchErr;
      setItems(data ?? []);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load price list');
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------------------------------------
  // DERIVED DATA
  // ----------------------------------------------------------
  const categories = useMemo(() => {
    const cats = new Set<string>();
    items
      .filter((i) => filterType === 'all' || i.type === filterType)
      .forEach((i) => cats.add(i.category));
    return Array.from(cats).sort();
  }, [items, filterType]);

  const filteredItems = useMemo(() => {
    let result = items;

    if (filterType !== 'all') {
      result = result.filter((i) => i.type === filterType);
    }

    if (filterCategory !== 'all') {
      result = result.filter((i) => i.category === filterCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.item_name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q)
      );
    }

    return result;
  }, [items, filterType, filterCategory, search]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, PriceItem[]>();
    for (const item of filteredItems) {
      const key = item.category;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return groups;
  }, [filteredItems]);

  // ----------------------------------------------------------
  // HANDLERS
  // ----------------------------------------------------------
  function startEdit(item: PriceItem) {
    setEditingId(item.id);
    setEditForm({ ...item });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  async function saveEdit() {
    if (!editingId || !editForm.item_name) return;

    try {
      const { error: updateErr } = await supabase
        .from('price_list')
        .update({
          type: editForm.type,
          category: editForm.category,
          item_name: editForm.item_name,
          price: editForm.price,
          unit: editForm.unit,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingId);

      if (updateErr) throw updateErr;

      setItems((prev) =>
        prev.map((i) =>
          i.id === editingId ? { ...i, ...editForm } as PriceItem : i
        )
      );
      cancelEdit();
    } catch (err: any) {
      console.error(err);
      alert('Failed to save: ' + err.message);
    }
  }

  async function deleteItem(id: number) {
    if (!confirm('Delete this item?')) return;

    try {
      const { error: delErr } = await supabase
        .from('price_list')
        .update({ is_active: false })
        .eq('id', id);

      if (delErr) throw delErr;
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err: any) {
      console.error(err);
      alert('Failed to delete: ' + err.message);
    }
  }

  async function addItem() {
    if (!newItem.item_name || !newItem.category || !newItem.type) {
      alert('Please fill in type, category, and item name');
      return;
    }

    try {
      const { data, error: insertErr } = await supabase
        .from('price_list')
        .insert({
          type: newItem.type,
          category: newItem.category,
          item_name: newItem.item_name,
          price: newItem.price,
          unit: newItem.unit || 'each',
          is_active: true,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setItems((prev) => [...prev, data]);
      setNewItem({
        type: newItem.type,
        category: newItem.category,
        item_name: '',
        price: null,
        unit: 'each',
      });
      setShowAddForm(false);
    } catch (err: any) {
      console.error(err);
      alert('Failed to add: ' + err.message);
    }
  }

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------
  if (loading) {
    return <div className="view-container"><p>Loading price list...</p></div>;
  }

  if (error) {
    return <div className="view-container"><p className="error">{error}</p></div>;
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <h1>Price List</h1>
      </div>

      {/* Filters Row */}
      <div className="filters-row" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Type Filter */}
        <div className="filter-group">
          <label>Type</label>
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value as FilterType);
              setFilterCategory('all');
            }}
          >
            <option value="all">All</option>
            <option value="wood">Wood</option>
            <option value="tile">Tile</option>
          </select>
        </div>

        {/* Category Filter */}
        <div className="filter-group">
          <label>Category</label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="filter-group" style={{ flex: 1, minWidth: '200px' }}>
          <label>Search</label>
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Add Item Button - Right aligned */}
        <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
          + Add Item
        </button>
      </div>

      {/* Stats */}
      <div style={{ marginBottom: '1rem', color: '#6b7280', fontSize: '0.875rem' }}>
        Showing {filteredItems.length} items
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="modal-overlay" onClick={() => setShowAddForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add New Item</h2>
            <div className="form-grid">
              <div className="form-group">
                <label>Type *</label>
                <select
                  value={newItem.type}
                  onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                >
                  <option value="wood">Wood</option>
                  <option value="tile">Tile</option>
                </select>
              </div>
              <div className="form-group">
                <label>Category *</label>
                <input
                  type="text"
                  value={newItem.category ?? ''}
                  onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  placeholder="e.g., Moldings & Trims"
                  list="category-suggestions"
                />
                <datalist id="category-suggestions">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label>Item Name *</label>
                <input
                  type="text"
                  value={newItem.item_name ?? ''}
                  onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                  placeholder="e.g., Red oak shoe"
                />
              </div>
              <div className="form-group">
                <label>Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={newItem.price ?? ''}
                  onChange={(e) => setNewItem({ ...newItem, price: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Unit</label>
                <select
                  value={newItem.unit ?? 'each'}
                  onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                >
                  <option value="each">each</option>
                  <option value="lf">lf (linear ft)</option>
                  <option value="sf">sf (sq ft)</option>
                  <option value="gal">gal</option>
                  <option value="5gal">5gal</option>
                  <option value="roll">roll</option>
                  <option value="case">case</option>
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={addItem}>
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price List Table */}
      {Array.from(groupedItems.entries()).map(([category, categoryItems]) => (
        <div key={category} className="category-section" style={{ marginBottom: '2rem' }}>
          <h3 style={{ 
            fontSize: '1rem', 
            fontWeight: 600, 
            color: '#374151', 
            marginBottom: '0.5rem',
            borderBottom: '2px solid #e5e7eb',
            paddingBottom: '0.5rem'
          }}>
            {category}
            <span style={{ 
              marginLeft: '0.5rem', 
              fontSize: '0.75rem', 
              color: '#9ca3af',
              fontWeight: 400
            }}>
              ({categoryItems.length})
            </span>
          </h3>
          
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Item</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Price</th>
                <th style={{ width: '10%' }}>Unit</th>
                <th style={{ width: '10%' }}>Type</th>
                <th style={{ width: '25%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categoryItems.map((item) => (
                <tr key={item.id}>
                  {editingId === item.id ? (
                    <>
                      <td>
                        <input
                          type="text"
                          value={editForm.item_name ?? ''}
                          onChange={(e) => setEditForm({ ...editForm, item_name: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.price ?? ''}
                          onChange={(e) => setEditForm({ ...editForm, price: e.target.value ? parseFloat(e.target.value) : null })}
                          style={{ width: '100%', textAlign: 'right' }}
                        />
                      </td>
                      <td>
                        <select
                          value={editForm.unit ?? 'each'}
                          onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                          style={{ width: '100%' }}
                        >
                          <option value="each">each</option>
                          <option value="lf">lf</option>
                          <option value="sf">sf</option>
                          <option value="gal">gal</option>
                          <option value="5gal">5gal</option>
                          <option value="roll">roll</option>
                          <option value="case">case</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={editForm.type ?? 'wood'}
                          onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                          style={{ width: '100%' }}
                        >
                          <option value="wood">wood</option>
                          <option value="tile">tile</option>
                        </select>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-primary" onClick={saveEdit}>Save</button>
                        <button className="btn btn-sm btn-secondary" onClick={cancelEdit} style={{ marginLeft: '0.25rem' }}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{item.item_name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {item.price != null ? `$${item.price.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ color: '#6b7280', fontSize: '0.875rem' }}>{item.unit}</td>
                      <td>
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '9999px',
                          backgroundColor: item.type === 'wood' ? '#fef3c7' : '#dbeafe',
                          color: item.type === 'wood' ? '#92400e' : '#1e40af',
                        }}>
                          {item.type}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => startEdit(item)}>Edit</button>
                        <button 
                          className="btn btn-sm btn-danger" 
                          onClick={() => deleteItem(item.id)}
                          style={{ marginLeft: '0.25rem' }}
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {filteredItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
          No items found. Try adjusting your filters or add a new item.
        </div>
      )}

      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          background: white;
          padding: 1.5rem;
          border-radius: 8px;
          width: 90%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
        }
        .modal-content h2 {
          margin: 0 0 1rem;
          font-size: 1.25rem;
        }
        .form-grid {
          display: grid;
          gap: 1rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .form-group label {
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
        }
        .form-group input,
        .form-group select {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 0.875rem;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-top: 1.5rem;
        }
        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .filter-group label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #6b7280;
        }
        .filter-group select,
        .filter-group input {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 0.875rem;
        }
        .btn-danger {
          background: #ef4444;
          color: white;
          border: none;
        }
        .btn-danger:hover {
          background: #dc2626;
        }
        .data-table {
          border-collapse: collapse;
        }
        .data-table th,
        .data-table td {
          padding: 0.5rem;
          border-bottom: 1px solid #e5e7eb;
          text-align: left;
        }
        .data-table th {
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
        }
        .data-table tbody tr:hover {
          background: #f9fafb;
        }
        .btn-sm {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
}

export default PriceListView;
