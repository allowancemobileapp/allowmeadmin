import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { FoodComboGenerator, MenuItem } from '../utils/comboGenerator';

export default function Combos() {
  const { get, post, put, del } = useApi();
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [vendorMenu, setVendorMenu] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAutoForm, setShowAutoForm] = useState(false);
  const [autoCombosList, setAutoCombosList] = useState<any[]>([]);

  // Array of row selections for manual combo creation
  const [manualRows, setManualRows] = useState<{section: string, itemId: number|null, quantity: number, portion?: string}[]>([{section: '', itemId: null, quantity: 1, portion: 'Full'}]);
  const [groupId, setGroupId] = useState<string>('');
  
  // Edit mode tracking
  const [editingComboId, setEditingComboId] = useState<number | null>(null);

  const [foodGroups, setFoodGroups] = useState<any[]>([]); 

  const fetchVendors = async () => {
    try {
      const data = await get<any[]>('/api/vendors');
      setVendors(data);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchFoodGroups = async () => {
    if (!vendorId) return setFoodGroups([]);
    try {
      const data = await get<any[]>(`/api/food_groups?vendor_id=${vendorId}`);
      setFoodGroups(data);
    } catch (e) {
      console.error(e);
      setFoodGroups([]);
    }
  };

  const fetchOptions = async () => {
    if (!vendorId) return setOptions([]);
    try {
      const data = await get<any[]>(`/api/options?vendor_id=${vendorId}`);
      setOptions(data);
    } catch(e) { console.error(e); }
  };

  const fetchVendorMenu = async () => {
    if (!vendorId) return setVendorMenu([]);
    try {
      const data = await get<any[]>(`/api/vendor_menus?vendor_id=${vendorId}`);
      setVendorMenu(data);
    } catch(e) { console.error(e); }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  useEffect(() => {
    fetchOptions();
    fetchVendorMenu();
    fetchFoodGroups();
    setManualRows([{section: '', itemId: null, quantity: 1, portion: 'Full'}]);
    setGroupId('');
    setEditingComboId(null);
    setShowAutoForm(false);
  }, [vendorId]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this combo?')) return;
    try {
      await del(`/api/options/${id}`);
      fetchOptions();
    } catch (e: any) { alert(e.message); }
  };

  const startEditCombo = (opt: any) => {
    setEditingComboId(opt.id);
    setGroupId(opt.group_id ? String(opt.group_id) : '');
    try {
      const parsedItems = typeof opt.items === 'string' ? JSON.parse(opt.items) : (opt.items || []);
      const newRows = parsedItems.map((pi: any) => {
        let matchingMenu = vendorMenu.find(v => v.meal_name === pi.name);
        return {
          section: pi.category || (matchingMenu?.section_name || 'Other'),
          itemId: matchingMenu ? matchingMenu.id : null,
          quantity: pi.quantity || 1,
          portion: pi.portion || 'Full'
        };
      });
      if (newRows.length > 0) {
        setManualRows(newRows);
      } else {
        setManualRows([{section: '', itemId: null, quantity: 1, portion: 'Full'}]);
      }
    } catch(e) { console.error(e); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingComboId(null);
    setGroupId('');
    setManualRows([{section: '', itemId: null, quantity: 1, portion: 'Full'}]);
  };
  
  // -- Auto Generation Popup Logic --
  const handleAutoGenerateClick = () => {
    if (!vendorId) return alert('Select a vendor first');
    if (!vendorMenu || vendorMenu.length === 0) return alert('Vendor has no menu items.');
    
    setIsGenerating(true);
    setTimeout(() => {
      // Group items by section
      const bySection = vendorMenu.reduce((acc, item) => {
        const sec = item.section_name || 'Other';
        if (!acc[sec]) acc[sec] = [];
        acc[sec].push(item);
        return acc;
      }, {} as Record<string, any[]>);
  
      // Format into generator format
      const menuData: Record<string, MenuItem[]> = {};
      const sectionsWithItems = new Set<string>();
      
      vendorMenu.forEach(item => {
        const category = (item.section_name || 'other').toLowerCase();
        if (!menuData[category]) menuData[category] = [];
        const portion = category.includes("main") ? (item.portion || "Half") : "Full";
        menuData[category].push(new MenuItem(
          item.meal_name, parseFloat(item.price), category, portion, 1, item.calories || 0, item.meal_id
        ));
        sectionsWithItems.add(category);
      });
  
      const generator = new FoodComboGenerator(menuData, Array.from(sectionsWithItems));
      const generated = generator.generateCombos(60); // generates ~60 options
      
      setAutoCombosList(generated.map(combo => ({
         description: combo.toString(),
         totalPrice: combo.totalPrice,
         itemsList: combo.items.map(([item, portionOrQuantity]) => ({
             name: item.name, category: item.category, 
             portion: item.category.includes("main") ? portionOrQuantity : null,
             quantity: item.category.includes("main") ? 1 : portionOrQuantity,
             price: item.fullPrice, meal_id: item.meal_id
         })).concat(combo.hasPack ? [{name: 'Pack', category: 'packaging', price: 200, quantity: 1, portion: null, meal_id: 0}] : []),
         signature: combo.getSignature(),
         selected: false // requested feature: unselected by default
      })));
  
      setShowAutoForm(true);
      setIsGenerating(false);
    }, 100);
  };

  const saveSelectedAutoCombos = async () => {
    const toSave = autoCombosList.filter(c => c.selected);
    if (toSave.length === 0) return alert('No combos selected');
    setIsGenerating(true);
    let successCount = 0;
    try {
      for (const combo of toSave) {
        await post('/api/options', {
           vendor_id: vendorId,
           combo_description: combo.description,
           total_price: combo.totalPrice,
           total_calories: 0,
           items: JSON.stringify(combo.itemsList),
           signature: combo.signature,
        });
        successCount++;
      }
      alert(`Successfully saved ${successCount} combos!`);
      setShowAutoForm(false);
      fetchOptions();
    } catch(e: any) {
      alert(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // -- Manual UI Logic --
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId) return alert('Select a vendor first');
    
    const validRows = manualRows.filter(r => r.itemId && r.quantity > 0);
    if (validRows.length === 0) return alert('Select at least one valid meal item.');

    const selected = validRows.map(r => {
      const m = vendorMenu.find(menu => menu.id === r.itemId);
      const isMain = m && m.section_name && m.section_name.toLowerCase().includes('main');
      return { ...m, reqQty: r.quantity, portion: isMain ? r.portion : null };
    });

    const description = selected.map(c => `${c.meal_name}${c.portion ? ` (${c.portion})` : ''}${c.reqQty > 1 && !c.portion ? ' x'+c.reqQty : ''}`).join(' + ');
    
    const totalPrice = selected.reduce((sum, c) => {
       let price = Number(c.price);
       if (c.portion) {
           const multis: Record<string, number> = { "Half": 0.5, "Three-Quarter": 0.75, "Full": 1.0 };
           price = price * (multis[c.portion] || 1.0);
       }
       return sum + (price * c.reqQty);
    }, 0);
    
    const itemsList = selected.map(c => ({ meal_id: c.meal_id, category: c.section_name ? c.section_name.toLowerCase() : 'other', quantity: c.reqQty, name: c.meal_name, portion: c.portion }));

    try {
      const payload = {
         vendor_id: vendorId,
         combo_description: description,
         total_price: totalPrice,
         total_calories: 0,
         items: JSON.stringify(itemsList),
         signature: 'manual_' + Date.now(),
         group_id: groupId ? Number(groupId) : null
      };
      
      if (editingComboId) {
         await put(`/api/options/${editingComboId}`, payload);
         alert('Combo updated manually!');
      } else {
         await post('/api/options', payload);
         alert('Combo added manually!');
      }
      
      setEditingComboId(null);
      setManualRows([{section: '', itemId: null, quantity: 1, portion: 'Full'}]);
      setGroupId('');
      fetchOptions();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const sectionsList = Array.from(new Set(vendorMenu.map(c => c.section_name || 'Other')));

  const currentManualPrice = manualRows.reduce((sum, row) => {
    if (row.itemId) {
      const m = vendorMenu.find(menu => menu.id === row.itemId);
      if (m) {
          let price = Number(m.price);
          const isMain = m.section_name && m.section_name.toLowerCase().includes('main');
          if (isMain && row.portion) {
              const multis: Record<string, number> = { "Half": 0.5, "Three-Quarter": 0.75, "Full": 1.0 };
              price = price * (multis[row.portion] || 1.0);
          }
          return sum + (price * row.quantity);
      }
    }
    return sum;
  }, 0);

  const getGroupName = (grId: number | null) => {
    if (!grId) return null;
    const group = foodGroups.find(g => g.id === grId);
    return group ? group.name : `Group ${grId}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Vendor Combos</h1>
          <p className="text-sm text-slate-500 mt-1">Manage vendor meal combinations, group associations, and permutations.</p>
        </div>
        <div className="flex gap-3 whitespace-nowrap">
            <button 
                onClick={handleAutoGenerateClick}
                disabled={!vendorId || isGenerating}
                className="px-4 py-2 font-bold text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
            >
                {isGenerating && !showAutoForm ? 'Loading Wizard...' : 'Auto-Generate Wizard'}
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-col-reverse relative">
        
        {/* Right Col: Manual Create Form */}
        <div className={`bg-white border border-slate-200 rounded-xl shadow-sm p-6 h-[max-content] xl:sticky xl:top-6 ${editingComboId ? 'border-2 border-indigo-500 ring-4 ring-indigo-50' : ''}`}>
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{editingComboId ? 'Edit Custom Combo' : 'Create Custom Combo'}</h2>
                {editingComboId && <button type="button" onClick={cancelEdit} className="text-xs font-bold text-red-500 hover:text-red-700">CANCEL</button>}
            </div>
            
            {!vendorId ? (
              <p className="text-sm text-slate-400">Select a vendor first to create custom combos.</p>
            ) : (
              <form onSubmit={handleManualSubmit} className="space-y-6">
                <div className="space-y-3">
                  {manualRows.map((row, index) => {
                      const m = row.itemId ? vendorMenu.find(v => v.id === row.itemId) : null;
                      const isMain = m ? m.section_name?.toLowerCase().includes('main') : (row.section.toLowerCase().includes('main'));
                      
                      return (
                      <div key={index} className="flex flex-col gap-2 p-3 border border-slate-200 rounded bg-slate-50 relative">
                        <div className="flex gap-2 w-full">
                          <select 
                            value={row.section} 
                            onChange={e => {
                              const newRows = [...manualRows];
                              newRows[index].section = e.target.value;
                              newRows[index].itemId = null;
                              setManualRows(newRows);
                            }}
                            className="flex-1 bg-white border border-slate-300 text-slate-700 text-xs rounded px-2 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="">-- Section --</option>
                            {sectionsList.map(sec => <option key={sec as string} value={sec as string}>{sec as string}</option>)}
                          </select>
                          {isMain ? (
                             <select 
                                value={row.portion || 'Full'}
                                onChange={e => {
                                  const newRows = [...manualRows];
                                  newRows[index].portion = e.target.value;
                                  newRows[index].quantity = 1;
                                  setManualRows(newRows);
                                }}
                                className="w-24 bg-white border border-slate-300 text-slate-700 text-xs rounded px-2 py-2 focus:ring-indigo-500"
                             >
                               <option value="Half">Half</option>
                               <option value="Three-Quarter">3/4</option>
                               <option value="Full">Full</option>
                             </select>
                          ) : (
                            <input 
                               type="number" min="1" max="10" placeholder="Qty" value={row.quantity}
                               onChange={e => {
                                 const newRows = [...manualRows];
                                 newRows[index].quantity = parseInt(e.target.value) || 1;
                                 setManualRows(newRows);
                               }}
                               className="w-16 bg-white border border-slate-300 text-slate-700 text-xs rounded px-2 py-2 focus:ring-indigo-500"
                            />
                          )}
                        </div>
                        <select 
                            value={row.itemId || ''} 
                            onChange={e => {
                              const newRows = [...manualRows];
                              newRows[index].itemId = parseInt(e.target.value);
                              setManualRows(newRows);
                            }}
                            className="w-full bg-white border border-slate-300 text-slate-700 text-xs rounded px-2 py-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                            disabled={!row.section}
                          >
                            <option value="">-- Select Item --</option>
                            {vendorMenu.filter(md => md.section_name === row.section).map(md => (
                              <option key={md.id} value={md.id}>{md.meal_name} (₦{md.price})</option>
                            ))}
                        </select>
                        {manualRows.length > 1 && (
                          <button type="button" onClick={() => setManualRows(manualRows.filter((_, i) => i !== index))} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow-sm">×</button>
                        )}
                      </div>
                    )
                  })}
                  <button type="button" onClick={() => setManualRows([...manualRows, {section: '', itemId: null, quantity: 1, portion: 'Full'}])} className="w-full py-2 border-2 border-dashed border-slate-300 text-slate-500 text-xs font-bold rounded hover:bg-slate-50 hover:text-indigo-600 transition-colors uppercase tracking-wider">
                    + Add Row
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <label className="font-semibold text-slate-600 text-xs mb-1 block uppercase tracking-wider">Food Group</label>
                  {foodGroups.length > 0 ? (
                      <select
                         value={groupId} onChange={e=>setGroupId(e.target.value)}
                         className="border border-slate-300 rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                         <option value="">-- Unassigned --</option>
                         {foodGroups.map(fg => <option key={fg.id} value={fg.id}>{fg.name}</option>)}
                      </select>
                  ) : (
                      <input 
                        type="number" value={groupId} onChange={e=>setGroupId(e.target.value)}
                        placeholder="e.g. 1"
                        className="border border-slate-300 rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                      />
                  )}
                </div>

                <div className="bg-indigo-50 rounded border border-indigo-100 p-3 flex justify-between items-center">
                  <span className="text-xs uppercase font-bold text-indigo-800">Total Price</span>
                  <span className="text-lg font-bold text-indigo-900">₦{currentManualPrice.toLocaleString()}</span>
                </div>

                <button type="submit" disabled={currentManualPrice === 0} className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold text-sm hover:bg-slate-800 transition-colors disabled:opacity-50">
                    {editingComboId ? 'UPDATE COMBO' : 'SAVE CUSTOM COMBO'}
                </button>
              </form>
            )}
        </div>

        {/* Left Col: Vendor Selection & Combos List */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-6 overflow-x-auto h-[max-content]">
          <div className="max-w-md mb-6 flex items-center gap-4 border-b border-slate-100 pb-6">
            <div className="w-full">
                <label className="font-semibold text-slate-600 text-sm mb-2 block">Choose Vendor to manage</label>
                <select 
                value={vendorId} 
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-4 py-2 bg-slate-50 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                >
                <option value="">-- Choose a vendor --</option>
                {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                ))}
                </select>
            </div>
          </div>

          {vendorId ? (
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Saved Combos ({options.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {options.map((opt) => {
                  const groupName = getGroupName(opt.group_id);
                  return (
                  <div key={opt.id} className="p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors bg-slate-50 flex flex-col relative group">
                    {groupName && <div className="text-[10px] font-bold text-indigo-600 bg-indigo-50 inline-block px-1.5 py-0.5 rounded uppercase tracking-wider mb-2 w-max border border-indigo-100">{groupName}</div>}
                    <h3 className="font-bold text-slate-800 text-sm mb-2">{opt.combo_description}</h3>
                    <div className="flex-1 text-xs text-slate-500">
                       <ul className="list-disc pl-4 space-y-0.5">
                         {(typeof opt.items === 'string' ? JSON.parse(opt.items) : (opt.items || [])).map((item: any, idx: number) => (
                           <li key={idx}>{item.name} {item.portion ? `(${item.portion})` : ''} <span className="font-bold text-slate-700">{item.quantity && item.quantity > 1 ? `x${item.quantity}` : ''}</span></li>
                         ))}
                       </ul>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Price</span>
                        <span className="font-bold text-slate-900">₦{Number(opt.total_price).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                            onClick={() => startEditCombo(opt)}
                            className="text-xs font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors border border-indigo-200/50"
                        >
                            Edit
                        </button>
                        <button 
                            onClick={() => handleDelete(opt.id)}
                            className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )})}
                {options.length === 0 && (
                  <div className="col-span-full py-8 text-center text-slate-500 font-medium bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    No combinations found for this vendor. Auto-generate or add manually.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 font-medium border-2 border-dashed border-slate-100 rounded-lg">
              Please select a vendor to view and manage their combos.
            </div>
          )}
        </div>
      </div>

      {showAutoForm && (
        <div className="fixed inset-0 bg-slate-900/50 flex flex-col z-50">
           <div className="flex-1 overflow-y-auto p-4 md:p-8">
             <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden flex flex-col max-h-full">
               <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                 <div>
                   <h2 className="text-xl font-bold text-slate-800">Auto-Generated Combos</h2>
                   <p className="text-sm text-slate-500 mt-1">Review the generated combinations using your legacy formulation.</p>
                 </div>
                 <button onClick={() => setShowAutoForm(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
               </div>
               <div className="p-6 overflow-y-auto bg-slate-100 flex-1">
                  {autoCombosList.length === 0 ? (
                      <div className="text-center py-12 text-slate-500 font-medium bg-white rounded-lg border border-dashed border-slate-300">
                          Could not generate any valid combos from this vendor's menu based on constraints.
                      </div>
                  ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {autoCombosList.map((c, i) => (
                        <label key={i} className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${c.selected ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                            <input type="checkbox" className="mt-1 w-4 h-4 text-indigo-600 rounded" checked={c.selected} onChange={e => {
                            const newer = [...autoCombosList];
                            newer[i].selected = e.target.checked;
                            setAutoCombosList(newer);
                            }} />
                            <div className="flex-1">
                            <h4 className="font-bold text-slate-800 text-sm leading-tight mb-2">{c.description}</h4>
                            <span className="text-indigo-600 font-bold block">₦{Number(c.totalPrice).toLocaleString()}</span>
                            </div>
                        </label>
                        ))}
                      </div>
                  )}
               </div>
               <div className="p-6 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
                 <span className="text-sm font-bold text-slate-600">{autoCombosList.filter(c => c.selected).length} selected</span>
                 <div className="flex gap-3">
                   <button onClick={() => setShowAutoForm(false)} className="px-4 py-2 font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancel</button>
                   <button onClick={saveSelectedAutoCombos} disabled={isGenerating || autoCombosList.filter(c => c.selected).length === 0} className="px-4 py-2 font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
                     {isGenerating ? 'Saving...' : 'Save Selected Combos'}
                   </button>
                 </div>
               </div>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
