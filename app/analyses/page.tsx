"use client";

import React, { useState, useEffect } from 'react';
import { 
  Search, Filter, FlaskConical, CheckCircle2, XCircle, 
  ChevronRight, BarChart3, Activity, Info 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';

const COLORS = {
  bg: '#EBE7DC',
  cardBg: '#F5F2EA',
  textMain: '#4A4941',
  textSecondary: '#8B8A81',
  accentGreen: '#00A651',
  accentOrange: '#D97706',
  tableHeaderBg: '#605F55',
  border: '#D1CEC3',
  chartColors: ['#605F55', '#D97706', '#00A651', '#4A4941', '#8B8A81']
};

export default function AnalysisDashboard() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnalysis, setSelectedAnalysis] = useState<any>(null);
  const [details, setDetails] = useState<{screensize: any[], classes: any[]} | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Initial Fetch
  useEffect(() => {
    fetch('/api/batches/analyses')
      .then(res => res.json())
      .then(json => {
        const result = Array.isArray(json) ? json : [];
        setData(result);
        if (result.length > 0) handleSelect(result[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Fetch breakdown details when selection changes
  const handleSelect = async (analysis: any) => {
    setSelectedAnalysis(analysis);
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/batches/analyses/analysis_details/${analysis.id}/details`);
      const json = await res.json();
      
      // Transform class data for stacked line chart
      const transformedClasses = json.classes.reduce((acc: any[], curr: any) => {
        let entry = acc.find(i => i.screen_size === curr.screen_size);
        if (!entry) {
          entry = { screen_size: curr.screen_size };
          acc.push(entry);
        }
        entry[curr.class] = parseFloat(curr.percentage);
        return acc;
      }, []);

      setDetails({ 
        screensize: json.screensize.map((s: any) => ({ ...s, percentage: parseFloat(s.percentage) })), 
        classes: transformedClasses 
      });
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const filteredData = data.filter(item => 
    item.analysis_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.analysis_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Unique classes for the legend/lines
  const uniqueClasses = details?.classes 
    ? Array.from(new Set(details.classes.flatMap(o => Object.keys(o).filter(k => k !== 'screen_size'))))
    : [];

  return (
    <div className="min-h-screen font-['Poppins'] text-[#4A4941]" style={{ backgroundColor: COLORS.bg }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Poppins', sans-serif; }
      `}</style>

      <div className="flex h-screen overflow-hidden">
        {/* LEFT COLUMN: LIST */}
        <div className="w-1/3 flex flex-col border-r border-[#D1CEC3] bg-[#EBE7DC]">
          <div className="p-6 pb-2">
            <h1 className="text-xl font-bold flex items-center gap-2 mb-4">
              <FlaskConical className="w-5 h-5" /> Batch Analysis
            </h1>
            
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8A81]" />
              <input 
                type="text" 
                placeholder="Search Analysis..." 
                className="w-full bg-[#F5F2EA] border border-[#D1CEC3] rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
            {loading ? (
              <p className="text-center py-10 text-sm opacity-50">Loading...</p>
            ) : filteredData.map((row) => (
              <div 
                key={row.id}
                onClick={() => handleSelect(row)}
                className={`p-4 rounded-xl border transition-all cursor-pointer group flex justify-between items-center ${
                  selectedAnalysis?.id === row.id 
                  ? 'bg-white border-[#605F55] shadow-md scale-[1.02]' 
                  : 'bg-[#F5F2EA] border-[#D1CEC3] hover:border-[#8B8A81]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-[#8B8A81]">#{row.id}</span>
                    <span className="font-bold text-sm">{row.analysis_number}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[10px] font-bold uppercase text-[#8B8A81]">{row.analysis_type}</span>
                    <span className="text-[10px] font-bold text-[#D97706]">{row.qc_grade}</span>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 transition-transform ${selectedAnalysis?.id === row.id ? 'translate-x-1' : 'opacity-0'}`} />
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: DETAILS */}
        <div className="flex-1 flex flex-col bg-white overflow-y-auto">
          {selectedAnalysis ? (
            <div className="p-8">
              {/* Top Header Card */}
              <div className="bg-[#F5F2EA] rounded-3xl p-6 border border-[#D1CEC3] mb-8 relative overflow-hidden">
                <div className="relative z-10 flex justify-between items-start">
                  <div>
                    <h2 className="text-3xl font-bold mb-1">{selectedAnalysis.analysis_number}</h2>
                    <p className="text-[#8B8A81] flex items-center gap-2 font-medium uppercase text-xs">
                      {selectedAnalysis.analysis_type} • {selectedAnalysis.qc_quality}
                    </p>
                  </div>
                  <div className={`px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 ${selectedAnalysis.mapped ? 'bg-[#00A651]/10 text-[#00A651]' : 'bg-[#8B8A81]/10 text-[#8B8A81]'}`}>
                    {selectedAnalysis.mapped ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {selectedAnalysis.mapped ? 'MAPPED' : 'UNMAPPED'}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-6 mt-8">
                  {[
                    { label: 'SCA Defect Count', val: selectedAnalysis.sca_defect_count },
                    { label: 'Moisture', val: `${selectedAnalysis.moisture}%` },
                    { label: 'Primary Defects', val: `${selectedAnalysis.primary_defects_percentage}%`, color: '#D97706' },
                    { label: 'Foreign Matter', val: `${selectedAnalysis.forein_matter_percentage}%` }
                  ].map((stat, i) => (
                    <div key={i}>
                      <p className="text-[10px] font-bold uppercase text-[#8B8A81] mb-1">{stat.label}</p>
                      <p className="text-xl font-bold" style={{ color: stat.color }}>{stat.val || '0.00'}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-6 mt-6 border-t border-[#D1CEC3] pt-6">
                  {[
                    { label: 'Grade AA %', val: selectedAnalysis.grade_aa_percentage },
                    { label: 'Grade AB %', val: selectedAnalysis.grade_ab_percentage },
                    { label: 'Grade ABC %', val: selectedAnalysis.grade_abc_percentage },
                    { label: 'Grade Grinder %', val: selectedAnalysis.grade_grinder_percentage }
                  ].map((stat, i) => (
                    <div key={i}>
                      <p className="text-[10px] font-bold uppercase text-[#8B8A81] mb-1">{stat.label}</p>
                      <p className="text-lg font-semibold">{stat.val || '0.00'}%</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Charts Section */}
              <div className="space-y-8">
                {/* Screen Size Bar Chart */}
                <div className="bg-white border border-[#D1CEC3] rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="w-5 h-5 text-[#605F55]" />
                    <h3 className="font-bold text-lg">Screen Size Distribution</h3>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={details?.screensize || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                        <XAxis dataKey="screen_size" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                        <Tooltip 
                          contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} 
                          cursor={{fill: '#F5F2EA'}}
                        />
                        <Bar dataKey="percentage" fill="#605F55" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Class Stacked Line Chart */}
                <div className="bg-white border border-[#D1CEC3] rounded-2xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <Activity className="w-5 h-5 text-[#D97706]" />
                    <h3 className="font-bold text-lg">Defect Class by Screen Size</h3>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={details?.classes || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                        <XAxis dataKey="screen_size" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 600}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                        <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                        <Legend iconType="circle" wrapperStyle={{paddingTop: '20px', fontSize: '11px', fontWeight: 'bold'}} />
                        {uniqueClasses.map((cls, idx) => (
                          <Line 
                            key={cls} 
                            type="monotone" 
                            dataKey={cls} 
                            stroke={COLORS.chartColors[idx % COLORS.chartColors.length]} 
                            strokeWidth={3}
                            dot={{ r: 4, strokeWidth: 2, fill: 'white' }}
                            activeDot={{ r: 6 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[#8B8A81] opacity-50">
              <Info className="w-12 h-12 mb-4" />
              <p className="font-bold uppercase tracking-widest text-sm">Select an analysis to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}