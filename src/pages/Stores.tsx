import React, { useState, useEffect } from 'react';
import { Store, Trash2, Building, ShieldCheck, ExternalLink } from 'lucide-react';
import { useApi } from '../hooks/useApi';

export default function Stores() {
  const { get, del } = useApi();
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const data = await get<any[]>('/api/stores');
      setStores(data);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: string) => {
    
    try {
      await del(`/api/stores/${id}`);
      fetchData();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2 rounded-lg">
            <Store className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Stores</h2>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Loading...</div>
      ) : (
        <div className="space-y-4">
          {stores.length === 0 && <p className="py-10 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed">No stores found.</p>}
          {stores.map(store => (
            <div key={store.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row gap-5 items-start">
              {store.avatar_url ? (
                <img src={store.avatar_url} className="w-16 h-16 rounded-xl object-cover bg-slate-100 shrink-0 border border-slate-200" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 text-slate-400">
                  <Building className="w-6 h-6" />
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-slate-800 text-lg">{store.name}</h3>
                  {store.is_plus_verified && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Plus Verified</span>}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${store.status === 'active' ? 'bg-emerald-100 text-emerald-700' : store.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {store.status}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-3">{store.description || "No description provided."}</p>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
                  <div><span className="text-slate-400">Owner:</span> <span className="font-medium">@{store.username || 'Unknown'}</span></div>
                  <div><span className="text-slate-400">Region:</span> <span className="font-medium">{store.primary_region || 'N/A'}</span></div>
                  <div><span className="text-slate-400">Categories:</span> <span className="font-medium">{(store.categories || []).join(', ') || 'N/A'}</span></div>
                  <div>
                    <span className="text-slate-400">CAC / Doc:</span>{' '}
                    {store.registration_document_url ? (
                      <a href={store.registration_document_url} target="_blank" rel="noreferrer" className="text-indigo-600 font-medium hover:underline inline-flex items-center gap-1">
                        View Document <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-red-500 font-medium">Not provided</span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex flex-row md:flex-col gap-2 w-full md:w-auto shrink-0">
                <button 
                  onClick={() => handleDelete(store.id)}
                  className="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100 transition-colors"
                  title="Delete Store"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
