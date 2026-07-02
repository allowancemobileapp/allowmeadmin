import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApi } from '../hooks/useApi';

const SECTIONS = [
  { id: 1, name: 'Main' },
  { id: 2, name: 'Top' },
  { id: 3, name: 'Side' },
  { id: 5, name: 'Fruits' },
  { id: 4, name: 'Snacks' },
  { id: 6, name: 'Drinks' }
];

export default function VendorMenu() {
  const { vendorId } = useParams();
  const { get, post, del, put } = useApi();
  const [vendor, setVendor] = useState<any>(null);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [masterMeals, setMasterMeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states per section could be complex, we'll use a single form for simplicity, 
  // but let's provide a selected section tab view
  const [activeSection, setActiveSection] = useState(1);
  const [selectedMealId, setSelectedMealId] = useState('');
  const [quantityPortion, setQuantityPortion] = useState('');
  const [price, setPrice] = useState('');

  const [editingItem, setEditingItem] = useState<any>(null);

  const fetchData = async () => {
    try {
      const [vData, mData, mmData] = await Promise.all([
        get<any>(`/api/vendors/${vendorId}`),
        get<any[]>(`/api/vendor_menus?vendor_id=${vendorId}`),
        get<any[]>('/api/meals')
      ]);
      setVendor(vData);
      setMenuItems(mData);
      setMasterMeals(mmData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [vendorId]);

  const handleAddOrEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMealId) return alert('Select a meal');
    try {
      if (editingItem) {
        await put(`/api/vendor_menus/${editingItem.id}`, {
          vendor_id: parseInt(vendorId!),
          meal_id: parseInt(selectedMealId),
          quantity_portion: quantityPortion,
          price: parseFloat(price)
        });
        setEditingItem(null);
      } else {
        await post('/api/vendor_menus', {
          vendor_id: parseInt(vendorId!),
          meal_id: parseInt(selectedMealId),
          quantity_portion: quantityPortion,
          price: parseFloat(price)
        });
      }
      setSelectedMealId('');
      setQuantityPortion(activeSection === 1 ? 'Half' : '1');
      setPrice('');
      fetchData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleStartEdit = (item: any) => {
    setEditingItem(item);
    setSelectedMealId(item.meal_id?.toString() || '');
    setQuantityPortion(item.quantity_portion || '');
    setPrice(item.price?.toString() || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setSelectedMealId('');
    setQuantityPortion(activeSection === 1 ? 'Half' : '1');
    setPrice('');
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this menu item?')) return;
    try {
      await del(`/api/vendor_menus/${id}`);
      fetchData();
    } catch(e: any) {
      alert(e.message);
    }
  };

  const sectionMeals = masterMeals.filter(m => m.section_id === activeSection);
  const sectionItems = menuItems.filter(item => {
      const meal = masterMeals.find(m => m.id === item.meal_id);
      return meal && meal.section_id === activeSection;
  });

  if (loading) return <div className="p-8 text-slate-500">Loading vendor menu...</div>;
  if (!vendor) return <div className="p-8 text-red-500">Vendor not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/vendors" className="p-2 border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Menu: {vendor?.name}</h1>
          <p className="text-sm text-slate-500 mt-1">Manage available items and pricing for this vendor.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
         {SECTIONS.map(s => (
            <button 
               key={s.id}
               onClick={() => { setActiveSection(s.id); setSelectedMealId(''); }}
               className={`px-4 py-2 rounded-t-lg text-sm font-bold transition-colors ${activeSection === s.id ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
            >
               {s.name}
            </button>
         ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-3xl">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex justify-between items-center">
          {editingItem ? `Edit ${SECTIONS.find(s=>s.id===activeSection)?.name} Item` : `Add ${SECTIONS.find(s=>s.id===activeSection)?.name} Item`}
          {editingItem && <button type="button" onClick={handleCancelEdit} className="text-xs text-red-500">Cancel Edit</button>}
        </h2>
        <form onSubmit={handleAddOrEdit} className="flex gap-4 items-end">
          <div className="flex flex-col gap-1 flex-1">
            <label className="font-semibold text-slate-600 text-sm">Select Master Meal</label>
            <select value={selectedMealId} onChange={e=>setSelectedMealId(e.target.value)} className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option value="">-- Choose Meal --</option>
                {sectionMeals.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 w-32">
            <label className="font-semibold text-slate-600 text-sm">{activeSection === 1 ? 'Portion' : 'Quantity'}</label>
            {activeSection === 1 ? (
              <select value={quantityPortion} onChange={e=>setQuantityPortion(e.target.value)} required className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500">
                 <option value="">Select</option>
                 <option value="Quarter">Quarter</option>
                 <option value="Half">Half</option>
                 <option value="Full">Full</option>
              </select>
            ) : (
              <input 
                type="number" min="1" required placeholder="Qty" value={quantityPortion} onChange={e=>setQuantityPortion(e.target.value)}
                className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              />
            )}
          </div>
          <div className="flex flex-col gap-1 w-32">
            <label className="font-semibold text-slate-600 text-sm">Price (₦)</label>
            <input 
              type="number" step="0.01" required placeholder="Price" value={price} onChange={e=>setPrice(e.target.value)}
              className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
            />
          </div>
          <button type="submit" className="py-2 px-4 h-[42px] bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors">
            {editingItem ? 'SAVE' : 'ADD'}
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Meal Name</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Quantity/Portion</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Price</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sectionItems.map(item => (
              <tr key={item.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 text-slate-800 font-medium">{item.meal_name}</td>
                <td className="px-6 py-4 text-slate-600">{item.quantity_portion}</td>
                <td className="px-6 py-4 text-indigo-700 font-bold font-mono">₦{parseFloat(item.price).toFixed(2)}</td>
                <td className="px-6 py-4 flex gap-3">
                  <button onClick={() => handleStartEdit(item)} className="text-xs font-bold text-indigo-600 hover:underline">Edit</button>
                  <button onClick={() => handleDelete(item.id)} className="text-xs font-bold text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
            {sectionItems.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-4 text-center text-slate-400">No menu items active in this section.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
