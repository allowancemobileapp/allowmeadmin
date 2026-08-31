import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Check, X, FileText, Utensils, Box } from 'lucide-react';

export default function FeedApprovals() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { get, put } = useApi();

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await get<any[]>('/api/approvals/feed-submissions');
      setSubmissions(data);
      setError(null);
    } catch(err: any) {
      console.error(err);
      setError(err?.message || 'Could not load feed submissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    
    try {
      await put(`/api/approvals/feed-submissions/${id}`, { status });
      setSubmissions(submissions.filter(s => s.id !== id));
    } catch (err: any) {
      console.error(err.message);
    }
  };

  const getIcon = (type: string) => {
    if (type === 'library') return <FileText className="w-5 h-5 text-indigo-500" />;
    if (type === 'food-menu') return <Utensils className="w-5 h-5 text-rose-500" />;
    if (type === 'food-combo') return <Box className="w-5 h-5 text-amber-500" />;
    return <FileText className="w-5 h-5 text-slate-500" />;
  };

  
  const renderDetails = (sub: any) => {
    const details = sub.details;
    if (!details) return <div className="text-slate-500">No details provided</div>;
    
    if (sub.submission_type === 'food-menu' || sub.submission_type === 'food-combo') {
      return (
        <div className="space-y-2">
          {details.combo_name && <div className="font-bold text-slate-800 dark:text-slate-200">{details.combo_name}</div>}
          {details.items_description && <div className="text-xs text-slate-500 italic mb-2">{details.items_description}</div>}
          
          <div className="space-y-1">
            {(details.items || []).map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-xs p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                <span className="font-bold text-slate-700 dark:text-slate-300">{item.item_name || item.name} {item.quantity ? `(x${item.quantity})` : ''}</span>
                <span className="text-slate-500">₦{item.price}</span>
              </div>
            ))}
          </div>
          
          {details.total_price && (
            <div className="flex justify-between items-center font-bold text-sm mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <span>Total Combo Price:</span>
              <span className="text-indigo-600 dark:text-indigo-400">₦{details.total_price}</span>
            </div>
          )}
        </div>
      );
    }
    
    if (sub.submission_type === 'library') {
      return (
        <div className="space-y-1 text-sm">
          <div><span className="text-slate-500 text-xs">Title:</span> <span className="font-bold">{details.title}</span></div>
          <div><span className="text-slate-500 text-xs">Course Code:</span> <span className="font-medium">{details.course_code}</span></div>
          <div><span className="text-slate-500 text-xs">Type:</span> <span>{details.material_type}</span></div>
          <div><span className="text-slate-500 text-xs">Faculty:</span> <span>{details.faculty}</span></div>
        </div>
      );
    }
    
    // Fallback
    try {
      return <div className="font-mono text-xs">{Object.entries(details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' | ')}</div>;
    } catch {
      return <div className="font-mono text-xs">{JSON.stringify(details)}</div>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">Feed Approvals</h1>
        <p className="text-sm text-slate-500 mt-1">Review pending library materials, food menus, and combos.</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-400">Could not load.</p>
          <p className="text-xs text-rose-600 dark:text-rose-500 mt-1">{error}</p>
          <button onClick={fetchData}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold">
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 font-medium">Loading submissions...</div>
      ) : submissions.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1">All caught up!</h3>
          <p className="text-slate-500 text-sm">There are no pending submissions to review at this time.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {submissions.map(sub => (
            <div key={sub.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                    {getIcon(sub.submission_type)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 capitalize">
                      {sub.submission_type.replace('-', ' ')}
                    </h3>
                    <p className="text-xs text-slate-500">{sub.username || sub.email || 'Unknown User'}</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider rounded-md">
                  {sub.status}
                </span>
              </div>
              
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 mb-4 break-words">
                {renderDetails(sub)}
              </div>
              
              {sub.evidence_url && (
                <a 
                  href={sub.evidence_url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-block text-xs font-bold text-indigo-600 hover:text-indigo-700 mb-4"
                >
                  View Attachment / Evidence →
                </a>
              )}

              <div className="flex gap-2">
                <button 
                  onClick={() => handleAction(sub.id, 'rejected')}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-bold transition"
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
                <button 
                  onClick={() => handleAction(sub.id, 'approved')}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-bold transition"
                >
                  <Check className="w-3.5 h-3.5" /> Approve (+{sub.points_potential} pts)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
