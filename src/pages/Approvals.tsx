
import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Check, X, Building, Briefcase, ExternalLink, ShieldCheck, MoreVertical, Trash2, BadgeCheck } from 'lucide-react';
import { cn } from '../App';

export default function Approvals() {
  const { get, post, del } = useApi();
  const [activeTab, setActiveTab] = useState<'stores' | 'services'>('stores');
  const [stores, setStores] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // For 3-dot menu state
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

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

  const handleAction = async (type: 'stores' | 'services', id: string, action: 'approve' | 'reject' | 'verify') => {
    try {
      await post(`/api/approvals/${type}/${id}/${action}`, {});
      fetchData();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleDelete = async (type: 'stores' | 'services', id: string) => {
    if (window.confirm("Are you sure you want to completely delete this entry? This action cannot be undone.")) {
      try {
        await del(`/api/approvals/${type}/${id}`);
        fetchData();
      } catch (err: any) {
        alert("Error: " + err.message);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">Pending Approvals</h1>
          <p className="text-sm text-slate-500 mt-1">Review business registrations and certifications.</p>
        </div>
        <div className="bg-slate-100 dark:bg-slate-800/50 p-1 rounded-lg flex items-center">
          <button 
            onClick={() => setActiveTab('stores')}
            className={cn("px-4 py-1.5 text-sm font-bold rounded-md transition-colors", activeTab === 'stores' ? "bg-white dark:bg-slate-900 shadow-sm text-slate-800 dark:text-slate-200" : "text-slate-500 hover:text-slate-700")}
          >
            Stores ({stores.length})
          </button>
          <button 
            onClick={() => setActiveTab('services')}
            className={cn("px-4 py-1.5 text-sm font-bold rounded-md transition-colors", activeTab === 'services' ? "bg-white dark:bg-slate-900 shadow-sm text-slate-800 dark:text-slate-200" : "text-slate-500 hover:text-slate-700")}
          >
            Services ({services.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Loading...</div>
      ) : activeTab === 'stores' ? (
        <div className="space-y-6">
          {stores.length === 0 && <p className="py-10 text-center text-slate-500 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 border-dashed">No pending store approvals.</p>}
          {stores.map(store => (
            <div key={store.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex gap-4">
                {store.avatar_url ? (
                  <img src={store.avatar_url} className="w-16 h-16 rounded-xl object-cover bg-slate-100 dark:bg-slate-800/50 shrink-0 border border-slate-200 dark:border-slate-800" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-800 text-slate-400">
                    <Building className="w-6 h-6" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xl">{store.name}</h3>
                      {store.is_plus_verified && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Plus Verified</span>}
                      {store.subscription_tier === 'Membership' && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Plus User</span>}
                    </div>
                    
                    <div className="relative">
                      <button 
                        onClick={() => setMenuOpen(menuOpen === store.id ? null : store.id)}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      {menuOpen === store.id && (
                        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg py-1 z-10">
                          <button 
                            onClick={() => {
                              handleDelete('stores', store.id);
                              setMenuOpen(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium"
                          >
                            <Trash2 className="w-4 h-4" /> Delete Store
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{store.description || "No description provided."}</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">General Info</h4>
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Owner:</span> <span className="font-medium">@{store.owner_username || 'Unknown'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{store.status}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Region:</span> <span className="font-medium">{store.primary_region || 'N/A'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Categories:</span> <span className="font-medium text-right max-w-[200px] truncate">{(store.categories || []).join(', ') || 'N/A'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Hours:</span> <span className="font-medium">{store.open_time || '??'} - {store.close_time || '??'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Transport:</span> <span className="font-medium">{store.use_allowance_transport ? 'Yes' : 'No'}</span></div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Credentials & Documents</h4>
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-3">
                      {store.registration_document_url && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-700 dark:text-slate-300 font-medium">Primary CAC / Doc</span>
                          <a href={store.registration_document_url} target="_blank" rel="noreferrer" className="text-indigo-600 font-medium hover:underline inline-flex items-center gap-1 text-xs">
                            View File <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                      
                      {(!store.credentials || store.credentials.length === 0) && !store.registration_document_url && (
                        <div className="text-sm text-slate-400 italic">No additional credentials uploaded.</div>
                      )}
                      
                      {(store.credentials || []).map((cred: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-sm pt-2 border-t border-slate-100 first:border-0 first:pt-0">
                          <div className="flex flex-col">
                            <span className="text-slate-700 dark:text-slate-300 font-medium">{cred.title}</span>
                            <span className="text-[10px] uppercase text-slate-400 font-bold">{cred.kind}</span>
                          </div>
                          <a href={cred.file_url} target="_blank" rel="noreferrer" className="text-indigo-600 font-medium hover:underline inline-flex items-center gap-1 text-xs">
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Products / Catalog ({store.products?.length || 0})</h4>
                  <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-1 h-64 overflow-y-auto">
                    {!store.products || store.products.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-sm text-slate-400 italic">No products added yet.</div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {store.products.map((prod: any) => (
                          <div key={prod.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{prod.name}</span>
                              <span className="font-bold text-emerald-600 text-sm">₦{prod.standard_price}</span>
                            </div>
                            {prod.description && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{prod.description}</p>}
                            <div className="flex gap-2 text-[10px] font-bold text-slate-500">
                              <span className="bg-slate-100 dark:bg-slate-800/50 px-1.5 py-0.5 rounded">Supply: {prod.total_supply}</span>
                              <span className="bg-slate-100 dark:bg-slate-800/50 px-1.5 py-0.5 rounded">MOQ: {prod.moq}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-3">
                <button 
                  onClick={() => handleAction('stores', store.id, 'approve')}
                  className="flex-1 bg-slate-900 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-slate-800 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                >
                  <Check className="w-4 h-4" /> Approve (Active)
                </button>
                <button 
                  onClick={() => handleAction('stores', store.id, 'verify')}
                  className="flex-1 bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                >
                  <BadgeCheck className="w-4 h-4" /> Verify Store
                </button>
                <button 
                  onClick={() => handleAction('stores', store.id, 'reject')}
                  className="flex-1 bg-red-50 text-red-600 font-bold py-2.5 px-4 rounded-lg hover:bg-red-100 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                >
                  <X className="w-4 h-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {services.length === 0 && <p className="py-10 text-center text-slate-500 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 border-dashed">No pending service approvals.</p>}
          {services.map(service => (
            <div key={service.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
               {/* Header */}
               <div className="p-5 border-b border-slate-100 flex gap-4">
                {service.avatar_url ? (
                  <img src={service.avatar_url} className="w-16 h-16 rounded-xl object-cover bg-slate-100 dark:bg-slate-800/50 shrink-0 border border-slate-200 dark:border-slate-800" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-800 text-slate-400">
                    <Briefcase className="w-6 h-6" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xl">{service.title || service.category_tag || "Unnamed Service"}</h3>
                      {service.subscription_tier === 'Membership' && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Plus User</span>}
                    </div>
                    
                    <div className="relative">
                      <button 
                        onClick={() => setMenuOpen(menuOpen === service.id ? null : service.id)}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      {menuOpen === service.id && (
                        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg py-1 z-10">
                          <button 
                            onClick={() => {
                              handleDelete('services', service.id);
                              setMenuOpen(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium"
                          >
                            <Trash2 className="w-4 h-4" /> Delete Service
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{service.description || "No description provided."}</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">General Info</h4>
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Owner:</span> <span className="font-medium">@{service.owner_username || 'Unknown'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{service.status}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Category:</span> <span className="font-medium">{service.category || service.category_tag || 'N/A'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Occupation:</span> <span className="font-medium">{service.linked_occupation || 'N/A'}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Region:</span> <span className="font-medium">{service.primary_region || 'N/A'}</span></div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Certification</h4>
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      {service.registration_document_url ? (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-700 dark:text-slate-300 font-medium">Document</span>
                          <a href={service.registration_document_url} target="_blank" rel="noreferrer" className="text-indigo-600 font-medium hover:underline inline-flex items-center gap-1 text-xs">
                            View File <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <div className="text-sm text-slate-400 italic">No document uploaded.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Service Offerings ({service.offerings?.length || 0})</h4>
                  <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-1 h-64 overflow-y-auto">
                    {!service.offerings || service.offerings.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-sm text-slate-400 italic">No offerings added yet.</div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {service.offerings.map((offering: any) => (
                          <div key={offering.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{offering.title || offering.name}</span>
                              <span className="font-bold text-emerald-600 text-sm">₦{offering.price || offering.standard_cost}</span>
                            </div>
                            {offering.description && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{offering.description}</p>}
                            <div className="flex gap-2 text-[10px] font-bold text-slate-500">
                              <span className="bg-slate-100 dark:bg-slate-800/50 px-1.5 py-0.5 rounded">Duration: {offering.duration || 'N/A'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap gap-3">
                <button 
                  onClick={() => handleAction('services', service.id, 'approve')}
                  className="flex-1 bg-slate-900 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-slate-800 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                >
                  <Check className="w-4 h-4" /> Approve (Active)
                </button>
                <button 
                  onClick={() => handleAction('services', service.id, 'reject')}
                  className="flex-1 bg-red-50 text-red-600 font-bold py-2.5 px-4 rounded-lg hover:bg-red-100 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
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
