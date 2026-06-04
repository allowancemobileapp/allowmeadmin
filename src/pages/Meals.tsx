import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function Meals() {
  const { get, post, put, del } = useApi();
  const [meals, setMeals] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [calories, setCalories] = useState('');
  const [filterSection, setFilterSection] = useState('');

  const [editingMeal, setEditingMeal] = useState<any>(null);

  const fetchData = async () => {
    try {
      const sData = await get<any[]>('/api/meals/sections');
      setSections(sData || []);
      const cData = await get<any[]>('/api/meals/categories');
      setCategories(cData || []);
      
      const url = filterSection ? `/api/meals?section_id=${filterSection}` : '/api/meals';
      const mData = await get<any[]>(url);
      setMeals(mData || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterSection]);

  const handleAddOrEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionId || !categoryId) return alert('Select section and category');
    try {
      if (editingMeal) {
        await put(`/api/meals/${editingMeal.id}`, { 
          name, 
          section_id: parseInt(sectionId), 
          category_id: parseInt(categoryId),
          calorie_count: parseFloat(calories)
        });
        setEditingMeal(null);
      } else {
        await post('/api/meals', { 
           name, 
           section_id: parseInt(sectionId), 
           category_id: parseInt(categoryId),
           calorie_count: parseFloat(calories)
        });
      }
      setName('');
      setCalories('');
      fetchData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleStartEdit = (m: any) => {
    setEditingMeal(m);
    setName(m.name || '');
    setSectionId(m.section_id?.toString() || '');
    setCategoryId(m.category_id?.toString() || '');
    setCalories(m.calorie_count?.toString() || '');
  };

  const handleCancelEdit = () => {
    setEditingMeal(null);
    setName('');
    setCalories('');
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this meal?')) return;
    try {
      await del(`/api/meals/${id}`);
      fetchData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Master Meals</h1>
          <p className="text-sm text-slate-500 mt-1">Manage global meal definitions.</p>
        </div>
        <div>
          <select 
            value={filterSection} 
            onChange={e=>setFilterSection(e.target.value)}
            className="border border-slate-200 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 bg-white"
          >
            <option value="">All Sections</option>
            {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-2xl">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex justify-between items-center">
          {editingMeal ? 'Edit Meal' : 'Add Meal'}
          {editingMeal && <button type="button" onClick={handleCancelEdit} className="text-xs text-red-500">Cancel Edit</button>}
        </h2>
        <form onSubmit={handleAddOrEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Name</label>
              <input 
                type="text" required value={name} onChange={e=>setName(e.target.value)}
                className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Calories</label>
              <input 
                type="number" step="0.01" required value={calories} onChange={e=>setCalories(e.target.value)}
                className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Section</label>
              <select value={sectionId} onChange={e=>setSectionId(e.target.value)} className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                  <option value="">Select Section</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Category</label>
              <select value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="py-2 px-4 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors">
            {editingMeal ? 'SAVE CHANGES' : 'ADD MEAL'}
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Name</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Section</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Category ID</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Calories</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {meals.map(m => (
              <tr key={m.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 text-slate-800 font-medium">{m.name}</td>
                <td className="px-6 py-4 text-slate-500">{m.section_name}</td>
                <td className="px-6 py-4 text-slate-500">{m.category_id}</td>
                <td className="px-6 py-4 text-slate-500 font-mono">{m.calorie_count}</td>
                <td className="px-6 py-4 flex gap-3">
                  <button onClick={() => handleStartEdit(m)} className="text-xs font-bold text-indigo-600 hover:underline">Edit</button>
                  <button onClick={() => handleDelete(m.id)} className="text-xs font-bold text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
            {!loading && meals.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-4 text-center text-slate-400">No meals found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
