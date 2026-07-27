import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Check, X, Building, Briefcase, ExternalLink, ShieldCheck } from 'lucide-react';
import { cn } from '../App';

export default function Approvals() {
  const { get, post } = useApi();
  const [activeTab, setActiveTab] = useState<'stores' | 'services'>('stores');
  const [stores, setStores] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sRes, servRes] = await Promise.all([
        get<any[]>('/api/approvals/stores'),
        get<any[]>('/api/approvals/services')
      ]);
      setStores(sRes);
      setServices(servRes);
    } catch (e) {
      console.error("Fetch err", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAction = async (type: 'stores' | 'services', id: string, status: 'active' | 'rejected') => {
    // Optimistically remove from state
    if (type === 'stores') {
      setStores(prev => prev.filter(s => s.id !== id));
    } else {
      setServices(prev => prev.filter(s => s.id !== id));
    }

    try {
      await post(`/api/approvals/${type}/${id}`, { status });
      fetchData();
    } catch (err: any) {
      alert("Error: " + err.message);
      // Revert optimism if failed
      fetchData();
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Pending Approvals</h1>
          <p className="text-sm text-slate-500 mt-1">Review business registrations and certifications.</p>
        </div>
        <div className="bg-slate-100 p-1 rounded-lg flex items-center">
          <button 
            onClick={() => setActiveTab('stores')}
            className={cn("px-4 py-1.5 text-sm font-bold rounded-md transition-colors", activeTab === 'stores' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700")}
          >
            Stores ({stores.length})
          </button>
          <button 
            onClick={() => setActiveTab('services')}
            className={cn("px-4 py-1.5 text-sm font-bold rounded-md transition-colors", activeTab === 'services' ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700")}
          >
            Services ({services.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Loading...</div>
      ) : activeTab === 'stores' ? (
        <div className="space-y-4">
          {stores.length === 0 && <p className="py-10 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed">No pending store approvals.</p>}
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
                </div>
                <p className="text-sm text-slate-600 mb-3">{store.description || "No description provided."}</p>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
                  <div><span className="text-slate-400">Owner:</span> <span className="font-medium">@{store.owner_username || 'Unknown'}</span></div>
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
              
              <div className="flex flex-row md:flex-col gap-2 w-full md:w-32 shrink-0">
                <button 
                  onClick={() => handleAction('stores', store.id, 'active')}
                  className="flex-1 bg-emerald-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-sm"
                >
                  <Check className="w-4 h-4" /> Approve
                </button>
                <button 
                  onClick={() => handleAction('stores', store.id, 'rejected')}
                  className="flex-1 bg-red-100 text-red-600 font-bold py-2 px-3 rounded-lg hover:bg-red-200 transition flex items-center justify-center gap-2 text-sm"
                >
                  <X className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {services.length === 0 && <p className="py-10 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed">No pending service approvals.</p>}
          {services.map(service => (
            <div key={service.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col md:flex-row gap-5 items-start">
              {service.avatar_url ? (
                <img src={service.avatar_url} className="w-16 h-16 rounded-xl object-cover bg-slate-100 shrink-0 border border-slate-200" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 text-slate-400">
                  <Briefcase className="w-6 h-6" />
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-800 text-lg mb-1">{service.category_tag || "Unnamed Service"}</h3>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
                  <div><span className="text-slate-400">Owner:</span> <span className="font-medium">@{service.owner_username || 'Unknown'}</span></div>
                  <div><span className="text-slate-400">Region:</span> <span className="font-medium">{service.primary_region || 'N/A'}</span></div>
                  <div><span className="text-slate-400">Linked Occupation:</span> <span className="font-medium">{service.linked_occupation || 'N/A'}</span></div>
                  <div>
                    <span className="text-slate-400">Certification:</span>{' '}
                    {service.registration_document_url ? (
                      <a href={service.registration_document_url} target="_blank" rel="noreferrer" className="text-indigo-600 font-medium hover:underline inline-flex items-center gap-1">
                        View Document <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-red-500 font-medium">Not provided</span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex flex-row md:flex-col gap-2 w-full md:w-32 shrink-0">
                <button 
                  onClick={() => handleAction('services', service.id, 'active')}
                  className="flex-1 bg-emerald-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-sm"
                >
                  <Check className="w-4 h-4" /> Approve
                </button>
                <button 
                  onClick={() => handleAction('services', service.id, 'rejected')}
                  className="flex-1 bg-red-100 text-red-600 font-bold py-2 px-3 rounded-lg hover:bg-red-200 transition flex items-center justify-center gap-2 text-sm"
                >
                  <X className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
