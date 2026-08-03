import fs from 'fs';

let content = fs.readFileSync('src/pages/Analytics.tsx', 'utf8');

content = content.replace(
  "  stores: number;\n  services: number;\n}",
  "  stores: number;\n  services: number;\n  members: number;\n  libraryItems: number;\n}"
);

content = content.replace(
  "    const avgServices = Math.round(last3.reduce((sum, d) => sum + d.services, 0) / last3.length);",
  "    const avgServices = Math.round(last3.reduce((sum, d) => sum + d.services, 0) / last3.length);\n    const avgMembers = Math.round(last3.reduce((sum, d) => sum + d.members, 0) / last3.length);\n    const avgLibrary = Math.round(last3.reduce((sum, d) => sum + d.libraryItems, 0) / last3.length);"
);

content = content.replace(
  "      services: avgServices,\n      isProjection: true\n    };",
  "      services: avgServices,\n      members: avgMembers,\n      libraryItems: avgLibrary,\n      isProjection: true\n    };"
);

const newCharts = `
        {/* Subscribers / Members Growth */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-6">Subscribers (Members) Over Time</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMembers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{fill: '#64748b', fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis tick={{fill: '#64748b', fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="members" name="Subscribers" stroke="#ec4899" strokeWidth={3} fillOpacity={1} fill="url(#colorMembers)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Library Items Growth */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-6">Library Items Created (Gists & Tickets)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{fill: '#64748b', fontSize: 12}} tickLine={false} axisLine={false} />
                <YAxis tick={{fill: '#64748b', fontSize: 12}} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{fill: '#f8fafc'}}
                />
                <Bar dataKey="libraryItems" name="Library Items" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
`;

content = content.replace(
  "        {/* Stores & Services Growth */}",
  newCharts + "\n        {/* Stores & Services Growth */}"
);

fs.writeFileSync('src/pages/Analytics.tsx', content);
