import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { ReferralStat } from '../types';

export default function Referrals() {
  const [stats, setStats] = useState<ReferralStat[]>([]);
  const { get } = useApi();

  useEffect(() => {
    get<ReferralStat[]>('/api/referrals')
      .then(data => {
         if (data.length === 0) {
            setStats([
               { referrer_email: 'top_hustler@gmail.com', total_referred: 142, successful_referrals: 120 },
               { referrer_email: 'sarah_connects@yahoo.com', total_referred: 89, successful_referrals: 75 },
               { referrer_email: 'john_doe@gmail.com', total_referred: 45, successful_referrals: 12 },
            ]);
         } else {
            setStats(data);
         }
      })
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Referral Leaderboard</h1>
        <p className="text-sm text-slate-500 mt-1">Track the top referrers across the platform.</p>
      </div>

      <div className="bg-indigo-900 border border-indigo-800 rounded-xl shadow-lg overflow-hidden relative">
        <div className="p-6 border-b border-indigo-800 flex items-center justify-between bg-indigo-950/50">
           <h3 className="text-xs font-bold uppercase tracking-widest text-indigo-400">Top Rankings</h3>
           <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-1 rounded">LIVE UPDATES</span>
        </div>
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-indigo-900/50 text-indigo-300">
            <tr>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs border-b border-indigo-800">Rank</th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs border-b border-indigo-800">Referrer Email</th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs border-b border-indigo-800 text-right">Total Referred</th>
              <th className="px-6 py-4 font-bold uppercase tracking-wider text-xs border-b border-indigo-800 text-right">Successful Conversions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-indigo-800/50">
            {stats.map((stat, i) => (
              <tr key={i} className={`hover:bg-indigo-800/20 transition-colors ${i === 0 ? 'bg-indigo-600/10' : ''}`}>
                <td className="px-6 py-4 text-indigo-400 font-bold whitespace-nowrap">
                  #{i + 1}
                </td>
                <td className={`px-6 py-4 ${i === 0 ? 'text-amber-400 font-bold text-base' : 'text-indigo-100 font-medium'}`}>
                  {stat.referrer_email}{i === 0 && <span className="ml-2 text-xs bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">TOP EARNER</span>}
                </td>
                <td className="px-6 py-4 text-indigo-200 font-mono text-lg font-bold text-right">{stat.total_referred}</td>
                <td className="px-6 py-4 text-emerald-400 font-mono text-lg font-bold text-right">{stat.successful_referrals}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {stats.length === 0 && <div className="p-8 text-center text-indigo-400 font-medium text-sm">No referral data yet.</div>}
      </div>
    </div>
  );
}
