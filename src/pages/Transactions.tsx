import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState('');
  const [activeTab, setActiveTab] = useState<string>('food');
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

  // Group transactions by simple normalized types for the tabs
  const getNormalizedType = (type: string) => {
    if (!type) return 'other';
    const lowerType = type.toLowerCase();
    if (lowerType.includes('food') || lowerType.includes('combo') || lowerType.includes('meal')) return 'food';
    if (lowerType.includes('ticket')) return 'ticket';
    if (lowerType.includes('gist')) return 'gist';
    return 'other';
  };

  const filteredTransactions = transactions.filter(tx => getNormalizedType(tx.type) === activeTab);

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

      {/* Tabs */}
      <div className="flex bg-slate-200 p-1 rounded-lg w-full max-w-sm">
        {['food', 'ticket', 'gist', 'other'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs font-bold py-2 rounded-md transition-all ${activeTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-hidden">
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
            {filteredTransactions.map((tx: any) => (
              <tr key={tx.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 text-slate-800 font-bold uppercase tracking-wider text-xs">{tx.type}</td>
                <td className="px-6 py-4 text-slate-600">{tx.user_email || '-'}</td>
                <td className="px-6 py-4 text-indigo-700 font-mono font-bold text-base">₦{(parseFloat(tx.amount) / 100).toFixed(2)}</td>
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
        {filteredTransactions.length === 0 && <div className="p-6 text-center text-slate-400 font-medium text-sm">No transactions found for this type.</div>}
      </div>
    </div>
  );
}
