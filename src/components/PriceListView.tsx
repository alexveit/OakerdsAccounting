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
      <div className="filter-row mb-2">
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
        <div className="filter-group filter-group--grow">
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
      <div className="stats-line">
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
        <div key={category} className="category-section">
          <h3 className="category-header">
            {category}
            <span className="category-header__count">
              ({categoryItems.length})
            </span>
          </h3>
          
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '50%' }}>Item</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Price</th>
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
                          className="data-table__input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.price ?? ''}
                          onChange={(e) => setEditForm({ ...editForm, price: e.target.value ? parseFloat(e.target.value) : null })}
                          className="data-table__input--right"
                        />
                      </td>
                      <td>
                        <select
                          value={editForm.type ?? 'wood'}
                          onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                          className="data-table__input"
                        >
                          <option value="wood">wood</option>
                          <option value="tile">tile</option>
                        </select>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-primary" onClick={saveEdit}>Save</button>
                        <button className="btn btn-sm btn-secondary ml-1" onClick={cancelEdit}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{item.item_name}</td>
                      <td className="text-right font-mono">
                        {item.price != null ? `$${item.price.toFixed(2)}` : '—'}
                      </td>
                      <td>
                        <span className={`type-badge type-badge--${item.type}`}>
                          {item.type}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => startEdit(item)}>Edit</button>
                        <button 
                          className="btn btn-sm btn-danger ml-1" 
                          onClick={() => deleteItem(item.id)}
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
        <div className="empty-state">
          No items found. Try adjusting your filters or add a new item.
        </div>
      )}
    </div>
  );
}

export default PriceListView;
