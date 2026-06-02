import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState('');
  const { get, post } = useApi();

  useEffect(() => {
    get<any[]>('/api/transactions').then(setTransactions).catch(console.error);
  }, []);

  const handleGenerate = async () => {
    if (!window.confirm("Are you sure you want to generate the monthly account sheets to Google Drive?")) return;
    setGenerating(true);
    setGenerateMsg('');
    try {
      const res = await post<{message: string}>('/api/accounting/generate', {});
      setGenerateMsg(res.message);
    } catch (e: any) {
      setGenerateMsg(e.message || "Failed to generate accounts.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Financial Transactions</h1>
          <p className="text-sm text-slate-500 mt-1">Review revenue flow and generate accounting spreadsheets.</p>
        </div>
        <button 
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Export to Google Sheets'}
        </button>
      </div>

      {generateMsg && (
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-800 font-medium tracking-tight">
          {generateMsg}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Type</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">User</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Amount</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Status</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((tx: any) => (
              <tr key={tx.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 text-slate-800 font-bold uppercase tracking-wider text-xs">{tx.type}</td>
                <td className="px-6 py-4 text-slate-600">{tx.user_email || '-'}</td>
                <td className="px-6 py-4 text-indigo-700 font-mono font-bold text-base">₦{parseFloat(tx.amount).toFixed(2)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${tx.status === 'successful' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-300'}`}>
                    {tx.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-500 text-xs font-mono">{new Date(tx.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {transactions.length === 0 && <div className="p-6 text-center text-slate-400 font-medium text-sm">No transactions recorded yet.</div>}
      </div>
    </div>
  );
}
