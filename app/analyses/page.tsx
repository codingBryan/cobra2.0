"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, FlaskConical, CheckCircle2, XCircle, 
  ChevronRight, BarChart3, Activity, Info, X, PieChart as PieChartIcon
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
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
  chartColors: ['#605F55', '#D97706', '#00A651', '#4A4941', '#8B8A81', '#3B82F6', '#8B5CF6', '#EC4899', '#10B981']
};

export default function AnalysisDashboard() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnalysis, setSelectedAnalysis] = useState<any>(null);
  const [details, setDetails] = useState<{screensize: any[], classes: any[]} | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [newAnalysis, setNewAnalysis] = useState<any>(null);
  const [moistureInput, setMoistureInput] = useState('');
  const [savingMoisture, setSavingMoisture] = useState(false);

  // Initial Fetch & Lightweight Polling Connection
  useEffect(() => {
    let latestId = 0;

    // 1. Initial Fetch
    const fetchInitialData = async () => {
      try {
        const res = await fetch('/api/batches/analyses');
        const json = await res.json();
        const result = Array.isArray(json) ? json : [];
        setData(result);
        
        if (result.length > 0) {
          handleSelect(result[0]);
          latestId = result[0].id; // Track the newest ID
        }
        setLoading(false);
      } catch (err) {
        setLoading(false);
      }
    };

    fetchInitialData();

    // 2. ⚡ OPTIMIZATION: Lightweight Background Polling (O(1) state updates)
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/batches/analyses');
        const json = await res.json();
        const result = Array.isArray(json) ? json : [];
        
        if (result.length > 0) {
          const newestRecord = result[0];
          
          // If the database has a newer ID than what we currently hold
          if (newestRecord.id > latestId) {
            latestId = newestRecord.id;
            
            // Prepend new record to state instantly
            setData(prev => [newestRecord, ...prev]);
            
            // Trigger Moisture Modal
            setNewAnalysis(newestRecord);
            setMoistureInput('');
            setShowModal(true);
          }
        }
      } catch (err) {
        // Silently catch polling errors (e.g., brief network drops)
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(pollInterval);
  }, []);

  // Fetch breakdown details when selection changes
  const handleSelect = async (analysis: any) => {
    setSelectedAnalysis(analysis);
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/batches/analyses/analysis_details/${analysis.id}`);
      const json = await res.json();
      
      // Transform class data for stacked line chart
      const transformedClasses = json.classes.reduce((acc: any[], curr: any) => {
        let entry = acc.find((i: any) => i.screen_size === curr.screen_size);
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

  // Handle saving moisture to the database
  const handleSaveMoisture = async () => {
    if (!newAnalysis || !moistureInput) return;
    setSavingMoisture(true);
    
    try {
      const response = await fetch('/api/batches/analyses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: newAnalysis.id, 
          moisture: parseFloat(moistureInput) 
        })
      });

      if (response.ok) {
        // ⚡ OPTIMIZATION: Update state locally to instantly reflect the change without fetching
        const updatedMoisture = parseFloat(moistureInput);
        
        setData(prev => prev.map(item => 
          item.id === newAnalysis.id ? { ...item, moisture: updatedMoisture } : item
        ));

        // If the newly added item happens to be selected right now, update it too
        if (selectedAnalysis?.id === newAnalysis.id) {
          setSelectedAnalysis((prev: any) => ({ ...prev, moisture: updatedMoisture }));
        }

        setShowModal(false);
      } else {
        console.error("Failed to update moisture");
      }
    } catch (err) {
      console.error("Update error:", err);
    } finally {
      setSavingMoisture(false);
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

  // ⚡ OPTIMIZATION: Calculate pie chart data efficiently and memoize it to prevent re-calculations on every render
  const pieData = useMemo(() => {
    if (!details?.classes) return [];
    
    const totals: Record<string, number> = {};
    
    details.classes.forEach((row: any) => {
      Object.keys(row).forEach(key => {
        if (key !== 'screen_size') {
          totals[key] = (totals[key] || 0) + row[key];
        }
      });
    });

    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value); // Sort largest slices first
  }, [details?.classes]);

  return (
    <div className="h-screen overflow-hidden font-['Poppins'] text-[#4A4941]" style={{ backgroundColor: COLORS.bg }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Poppins', sans-serif; margin: 0; padding: 0; }
        
        /* Custom scrollbar for the legend */
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D1CEC3; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #8B8A81; }
      `}</style>

      {/* --- MOISTURE MODAL --- */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-[#00A651]" /> New Analysis Detected
                </h3>
                <p className="text-sm text-[#8B8A81] mt-1">Please enter the moisture level.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-[#8B8A81] hover:text-[#4A4941] transition-colors p-1 bg-[#F5F2EA] rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="bg-[#F5F2EA] rounded-xl p-4 mb-6 border border-[#D1CEC3]">
              <p className="font-bold text-lg text-[#4A4941]">{newAnalysis?.analysis_number}</p>
              <p className="text-xs uppercase tracking-wider text-[#D97706] font-bold mt-1">{newAnalysis?.analysis_type}</p>
            </div>

            <div className="mb-8">
              <label className="block text-xs font-bold uppercase text-[#8B8A81] mb-2 ml-1">Moisture Percentage (%)</label>
              <input 
                type="number" 
                step="0.1"
                value={moistureInput}
                onChange={(e) => setMoistureInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveMoisture()}
                className="w-full bg-[#F5F2EA] border border-[#D1CEC3] rounded-xl px-4 py-3 text-lg font-semibold focus:outline-none focus:border-[#00A651] focus:ring-2 focus:ring-[#00A651]/20 transition-all"
                placeholder="e.g. 11.5"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#8B8A81] hover:bg-[#F5F2EA] hover:text-[#4A4941] transition-colors"
              >
                Skip
              </button>
              <button 
                onClick={handleSaveMoisture}
                disabled={savingMoisture || !moistureInput}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[#00A651] text-white hover:bg-[#008A43] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-[#00A651]/20 flex items-center gap-2"
              >
                {savingMoisture ? 'Saving...' : 'Save Moisture'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-screen overflow-hidden">
        {/* LEFT COLUMN: LIST - Reduced width from 33% to 26% to save space */}
        <div className="w-[26%] flex flex-col border-r border-[#D1CEC3] bg-[#EBE7DC]">
          <div className="p-4 pb-2 shrink-0">
            <h1 className="text-lg font-bold flex items-center gap-2 mb-3">
              <FlaskConical className="w-4 h-4" /> Batch Analyses

            </h1>
            <p className='text-sm'>CSMART Analyses</p> 
            
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8A81]" />
              <input 
                type="text" 
                placeholder="Search Analysis..." 
                className="w-full bg-[#F5F2EA] border border-[#D1CEC3] rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 custom-scrollbar">
            {loading ? (
              <p className="text-center py-10 text-sm opacity-50">Loading...</p>
            ) : filteredData.map((row) => (
              <div 
                key={row.id}
                onClick={() => handleSelect(row)}
                className={`p-3 rounded-xl border transition-all cursor-pointer group flex justify-between items-center ${
                  selectedAnalysis?.id === row.id 
                  ? 'bg-white border-[#605F55] shadow-md scale-[1.02]' 
                  : 'bg-[#F5F2EA] border-[#D1CEC3] hover:border-[#8B8A81]'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-[#8B8A81]">#{row.id}</span>
                    <span className="font-bold text-xs truncate">{row.analysis_number}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[9px] font-bold uppercase text-[#8B8A81] truncate">{row.analysis_type}</span>
                  </div>
                </div>
                <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${selectedAnalysis?.id === row.id ? 'translate-x-1' : 'opacity-0'}`} />
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: DETAILS - Uses full remaining width and height strictly bounded */}
        <div className="flex-1 flex flex-col bg-[#F5F2EA] overflow-hidden p-4 sm:p-6 gap-4">
          {selectedAnalysis ? (
            <>
              {/* Top Header Card - Reduced vertical padding & margins to preserve height */}
              <div className="bg-white rounded-2xl p-5 border border-[#D1CEC3] shrink-0 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold mb-1 leading-tight">{selectedAnalysis.analysis_number}</h2>
                    <p className="text-[#8B8A81] flex items-center gap-2 font-medium uppercase text-[10px] tracking-wider">
                      {selectedAnalysis.analysis_type} • {selectedAnalysis.qc_quality}
                    </p>
                  </div>
                  <div className={`px-3 py-1.5 rounded-full font-bold text-[10px] flex items-center gap-1.5 ${selectedAnalysis.mapped ? 'bg-[#00A651]/10 text-[#00A651]' : 'bg-[#8B8A81]/10 text-[#8B8A81]'}`}>
                    {selectedAnalysis.mapped ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {selectedAnalysis.mapped ? 'MAPPED' : 'UNMAPPED'}
                  </div>
                </div>

                <div className="flex flex-row justify-between mt-4">
                  <div className="grid grid-cols-4 gap-4 flex-1">
                    {[
                      { label: 'SCA Defect', val: selectedAnalysis.sca_defect_count },
                      { label: 'Moisture', val: `${selectedAnalysis.moisture || '0.00'}%` },
                      { label: 'Prim. Defects', val: `${selectedAnalysis.primary_defects_percentage}%`, color: '#D97706' },
                      { label: 'Sec. Defects', val: `${selectedAnalysis.secondary_defects_percentage}%`, color: '#D97706' },
                      { label: 'Foreign Mat.', val: `${selectedAnalysis.forein_matter_percentage}%` }
                    ].map((stat, i) => (
                      <div key={i}>
                        <p className="text-[9px] font-bold uppercase text-[#8B8A81] mb-0.5">{stat.label}</p>
                        <p className="text-base font-bold leading-none" style={{ color: stat.color }}>{stat.val || '0.00'}</p>
                      </div>
                    ))}
                  </div>

                  <div className="w-[1px] bg-[#D1CEC3] mx-6 hidden lg:block"></div>

                  <div className="grid grid-cols-4 gap-4 flex-1 mt-4 lg:mt-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-[#D1CEC3]">
                    {[
                      { label: 'Grade AA', val: selectedAnalysis.grade_aa_percentage },
                      { label: 'Grade AB', val: selectedAnalysis.grade_ab_percentage },
                      { label: 'Grade ABC', val: selectedAnalysis.grade_abc_percentage },
                      { label: 'Grinder', val: selectedAnalysis.grade_grinder_percentage }
                    ].map((stat, i) => (
                      <div key={i}>
                        <p className="text-[9px] font-bold uppercase text-[#8B8A81] mb-0.5">{stat.label}</p>
                        <p className="text-sm font-semibold leading-none">{stat.val || '0.00'}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Lower Section: Charts and Composition Side-by-Side (Dynamic min-h-0 prevents overflow) */}
              <div className="flex flex-row gap-4 flex-1 min-h-0">
                
                {/* Mid-Left Column: Stacks Screen Size & Class Lines (Takes up ~60% width) */}
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                  {/* Screen Size Bar Chart */}
                  <div className="flex-1 bg-white border border-[#D1CEC3] rounded-2xl p-4 shadow-sm flex flex-col min-h-0">
                    <div className="flex items-center gap-2 mb-2 shrink-0">
                      <BarChart3 className="w-4 h-4 text-[#605F55]" />
                      <h3 className="font-bold text-sm">Screen Size</h3>
                    </div>
                    <div className="flex-1 w-full min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={details?.screensize || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                          <XAxis dataKey="screen_size" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9}} />
                          <Tooltip 
                            contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px'}} 
                            cursor={{fill: '#F5F2EA'}}
                          />
                          <Bar dataKey="percentage" fill="#605F55" radius={[4, 4, 0, 0]} maxBarSize={30} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Class Stacked Line Chart */}
                  <div className="flex-1 bg-white border border-[#D1CEC3] rounded-2xl p-4 shadow-sm flex flex-col min-h-0">
                    <div className="flex items-center gap-2 mb-0 shrink-0">
                      <Activity className="w-4 h-4 text-[#D97706]" />
                      <h3 className="font-bold text-sm">Class Tracking</h3>
                    </div>
                    <div className="flex-1 w-full min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={details?.classes || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                          <XAxis dataKey="screen_size" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9}} />
                          <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px'}} />
                          <Legend iconType="circle" wrapperStyle={{paddingTop: '5px', fontSize: '10px', fontWeight: 'bold'}} />
                          {uniqueClasses.map((cls, idx) => (
                            <Line 
                              key={cls} 
                              type="monotone" 
                              dataKey={cls} 
                              stroke={COLORS.chartColors[idx % COLORS.chartColors.length]} 
                              strokeWidth={2.5}
                              dot={{ r: 3, strokeWidth: 1.5, fill: 'white' }}
                              activeDot={{ r: 5 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Right Column: Composition Summary (Takes up ~40% width, full flex height) */}
                <div className="w-[35%] lg:w-[32%] bg-white border border-[#D1CEC3] rounded-2xl p-5 shadow-sm flex flex-col min-h-0 shrink-0">
                  <div className="flex items-center gap-2 mb-4 shrink-0">
                    <PieChartIcon className="w-4 h-4 text-[#00A651]" />
                    <h3 className="font-bold text-sm">Composition Summary</h3>
                  </div>
                  
                  {/* The Pie Chart Area */}
                  <div className="h-40 sm:h-48 w-full shrink-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS.chartColors[index % COLORS.chartColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold'}}
                          formatter={(value: number) => `${value.toFixed(2)}%`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    
                    {/* Centered Total Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                       <span className="text-[10px] font-bold text-[#8B8A81] tracking-widest uppercase">Total</span>
                    </div>
                  </div>

                  {/* Scrollable Custom Legend */}
                  <div className="flex-1 overflow-y-auto mt-4 pr-1 custom-scrollbar min-h-0 border-t border-[#EBE7DC] pt-3">
                    <div className="space-y-1.5">
                      {pieData.map((item, idx) => (
                        <div key={item.name} className="flex justify-between items-center text-xs p-2 rounded-lg hover:bg-[#F5F2EA] transition-colors group">
                          <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                            <div 
                              className="w-2.5 h-2.5 rounded-full shrink-0" 
                              style={{ backgroundColor: COLORS.chartColors[idx % COLORS.chartColors.length] }} 
                            />
                            <span className="truncate font-medium text-[#4A4941] group-hover:text-black transition-colors">{item.name}</span>
                          </div>
                          <span className="font-bold text-[#605F55] shrink-0">{item.value.toFixed(2)}%</span>
                        </div>
                      ))}
                      {pieData.length === 0 && !detailsLoading && (
                        <p className="text-center text-[#8B8A81] text-xs py-4">No composition data</p>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-[#8B8A81] opacity-50 h-full">
              <Info className="w-12 h-12 mb-4" />
              <p className="font-bold uppercase tracking-widest text-sm">Select an analysis to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}