import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { mobileStyles as styles } from './mobileStyles';

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
};

type FilterType = 'wood' | 'tile' | 'all';

// ============================================================
// COMPONENT
// ============================================================

export function PricesTab() {
  const [items, setItems] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('wood');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Edit/Add state
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceItem | null>(null);
  const [formData, setFormData] = useState({
    type: 'wood',
    category: '',
    item_name: '',
    price: '' as string | number,
    unit: 'each',
  });

  // ----------------------------------------------------------
  // LOAD DATA
  // ----------------------------------------------------------
  useEffect(() => {
    loadPrices();
  }, []);

  async function loadPrices() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchErr } = await supabase
        .from('price_list')
        .select('id, type, category, item_name, price, unit')
        .eq('is_active', true)
        .order('type')
        .order('category')
        .order('item_name');

      if (fetchErr) throw fetchErr;
      setItems(data ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load prices');
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

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((i) => cats.add(i.category));
    return Array.from(cats).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filterType !== 'all') result = result.filter((i) => i.type === filterType);
    if (filterCategory !== 'all') result = result.filter((i) => i.category === filterCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) => i.item_name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, filterType, filterCategory, search]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, PriceItem[]>();
    for (const item of filteredItems) {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category)!.push(item);
    }
    return groups;
  }, [filteredItems]);

  // ----------------------------------------------------------
  // HANDLERS
  // ----------------------------------------------------------
  function openAddModal() {
    setEditingItem(null);
    setFormData({
      type: filterType !== 'all' ? filterType : 'wood',
      category: filterCategory !== 'all' ? filterCategory : '',
      item_name: '',
      price: '',
      unit: 'each',
    });
    setShowModal(true);
  }

  function openEditModal(item: PriceItem) {
    setEditingItem(item);
    setFormData({
      type: item.type,
      category: item.category,
      item_name: item.item_name,
      price: item.price ?? '',
      unit: item.unit,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingItem(null);
  }

  async function handleSave() {
    if (!formData.item_name || !formData.category || !formData.type) {
      alert('Please fill in type, category, and item name');
      return;
    }

    const price = formData.price === '' ? null : Number(formData.price);

    try {
      if (editingItem) {
        // Update existing
        const { error: updateErr } = await supabase
          .from('price_list')
          .update({
            type: formData.type,
            category: formData.category,
            item_name: formData.item_name,
            price,
            unit: formData.unit,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingItem.id);

        if (updateErr) throw updateErr;

        setItems((prev) =>
          prev.map((i) =>
            i.id === editingItem.id
              ? { ...i, ...formData, price } as PriceItem
              : i
          )
        );
      } else {
        // Insert new
        const { data, error: insertErr } = await supabase
          .from('price_list')
          .insert({
            type: formData.type,
            category: formData.category,
            item_name: formData.item_name,
            price,
            unit: formData.unit,
            is_active: true,
          })
          .select()
          .single();

        if (insertErr) throw insertErr;
        setItems((prev) => [...prev, data]);
      }

      closeModal();
    } catch (err: any) {
      alert('Failed to save: ' + err.message);
    }
  }

  async function handleDelete(item: PriceItem) {
    if (!confirm(`Delete "${item.item_name}"?`)) return;

    try {
      const { error: delErr } = await supabase
        .from('price_list')
        .update({ is_active: false })
        .eq('id', item.id);

      if (delErr) throw delErr;
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err: any) {
      alert('Failed to delete: ' + err.message);
    }
  }

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------
  if (loading) return <div style={styles.loading}>Loading prices...</div>;
  if (error) return <div style={styles.error}>{error}</div>;

  return (
    <div style={styles.tabContent}>
      <input
        type="text"
        placeholder="Search items..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={styles.searchInput}
      />

      <div style={styles.filterRow}>
        {(['wood', 'tile', 'all'] as FilterType[]).map((type) => (
          <button
            key={type}
            onClick={() => {
              setFilterType(type);
              setFilterCategory('all');
            }}
            style={{ ...styles.filterBtn, ...(filterType === type ? styles.filterBtnActive : {}) }}
          >
            {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ ...styles.selectInput, flex: 1, marginBottom: 0 }}
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <button
          onClick={openAddModal}
          style={localStyles.addBtn}
        >
          + Add
        </button>
      </div>

      <div style={styles.countText}>{filteredItems.length} items</div>

      {Array.from(groupedItems.entries()).map(([category, categoryItems]) => (
        <div key={category} style={styles.priceCategory}>
          <div style={styles.priceCategoryHeader}>{category}</div>
          {categoryItems.map((item) => (
            <div key={item.id} style={localStyles.priceRow}>
              <div style={localStyles.priceLeft} onClick={() => openEditModal(item)}>
                <div style={styles.priceItemName}>{item.item_name}</div>
                <div style={styles.priceAmount}>
                  {item.price != null ? `$${item.price.toFixed(2)}` : '—'}
                </div>
              </div>
              <button
                onClick={() => handleDelete(item)}
                style={localStyles.deleteBtn}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ))}

      {filteredItems.length === 0 && (
        <div style={styles.empty}>No items found</div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={localStyles.modalOverlay} onClick={closeModal}>
          <div style={localStyles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={localStyles.modalTitle}>
              {editingItem ? 'Edit Item' : 'Add Item'}
            </h2>

            <div style={localStyles.formGroup}>
              <label style={localStyles.label}>Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                style={localStyles.input}
              >
                <option value="wood">Wood</option>
                <option value="tile">Tile</option>
              </select>
            </div>

            <div style={localStyles.formGroup}>
              <label style={localStyles.label}>Category</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Moldings & Trims"
                list="cat-list"
                style={localStyles.input}
              />
              <datalist id="cat-list">
                {allCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            <div style={localStyles.formGroup}>
              <label style={localStyles.label}>Item Name</label>
              <input
                type="text"
                value={formData.item_name}
                onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                placeholder="e.g., Red oak shoe"
                style={localStyles.input}
              />
            </div>

            <div style={localStyles.formGroup}>
              <label style={localStyles.label}>Price</label>
              <input
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
                style={localStyles.input}
              />
            </div>

            <div style={localStyles.modalActions}>
              <button onClick={closeModal} style={localStyles.cancelBtn}>
                Cancel
              </button>
              <button onClick={handleSave} style={localStyles.saveBtn}>
                {editingItem ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// LOCAL STYLES
// ============================================================

const localStyles: Record<string, React.CSSProperties> = {
  addBtn: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #1f2937',
    gap: '12px',
  },
  priceLeft: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
  },
  deleteBtn: {
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#374151',
    color: '#9ca3af',
    fontSize: '14px',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '16px',
  },
  modalContent: {
    backgroundColor: '#1f2937',
    borderRadius: '12px',
    padding: '20px',
    width: '100%',
    maxWidth: '400px',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
    margin: '0 0 20px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: '#9ca3af',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    border: '1px solid #374151',
    borderRadius: '8px',
    backgroundColor: '#111827',
    color: '#f3f4f6',
    boxSizing: 'border-box',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  cancelBtn: {
    flex: 1,
    padding: '12px',
    fontSize: '15px',
    fontWeight: 500,
    border: '1px solid #374151',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    cursor: 'pointer',
  },
  saveBtn: {
    flex: 1,
    padding: '12px',
    fontSize: '15px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#10b981',
    color: '#fff',
    cursor: 'pointer',
  },
};

export default PricesTab;
