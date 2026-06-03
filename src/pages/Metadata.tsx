import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function Metadata() {
  const { get, post } = useApi();
  const [loading, setLoading] = useState(true);
  
  // Example settings for metadata control
  const [appName, setAppName] = useState('');
  const [appCurrency, setAppCurrency] = useState('');
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    // In a real app this would fetch from a specific metadata endpoint
    // For now we'll simulate it, or just use placeholders.
    setAppName('Allowance Admin Dashboard');
    setAppCurrency('NGN');
    setMaintenanceMode(false);
    setLoading(false);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Simulate save
      alert('Metadata details updated successfully.');
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Loading metadata...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">System Metadata</h1>
        <p className="text-sm text-slate-500 mt-1">Configure global application variables and environment settings.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">General App Settings</h2>
            
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Application Name</label>
              <input 
                type="text" required value={appName} onChange={e=>setAppName(e.target.value)}
                className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Default Currency Symbol</label>
              <input 
                type="text" required value={appCurrency} onChange={e=>setAppCurrency(e.target.value)}
                className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              />
            </div>
            
            <div className="flex flex-col gap-1 pt-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                <input 
                  type="checkbox" checked={maintenanceMode} onChange={e=>setMaintenanceMode(e.target.checked)} 
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                />
                Enable Maintenance Mode (Restricts access to the main app)
              </label>
            </div>
          </div>
          
          <button type="submit" className="py-2 px-6 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors">
            SAVE CHANGES
          </button>
        </form>
      </div>
    </div>
  );
}
