"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Filter, FlaskConical, CheckCircle2, XCircle, 
  ChevronRight, BarChart3, Activity, Info, X, PieChart as PieChartIcon, GitCompare, RefreshCw, Copy, Coffee
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, LabelList
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
  chartColors: ['#605F55', '#D97706', '#00A651', '#4A4941', '#8B8A81', '#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#14B8A6', '#6366F1']
};

const getCompositionColor = (name: string, index: number) => {
  const lowerName = name.toLowerCase();
  if (lowerName === 'ok coated' || lowerName === 'ok uncoated') return '#14B8A6'; 
  return '#F87171'; 
};

const getCompositionColor_Comparison = (name: string, index: number) => {
  const lowerName = name.toLowerCase();
  if (lowerName === 'ok coated') return '#00A651'; 
  if (lowerName === 'ok uncoated') return '#10B981'; 
  return COLORS.chartColors[index % COLORS.chartColors.length];
};

export default function AnalysisDashboard() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnalysis, setSelectedAnalysis] = useState<any>(null);
  const [details, setDetails] = useState<{screensize: any[], classes: any[]} | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [remappingId, setRemappingId] = useState<number | null>(null);
  
  const [operatorMode, setOperatorMode] = useState(false);
  const [hasSisterLot, setHasSisterLot] = useState(false);
  const [sisterLotNumber, setSisterLotNumber] = useState('');
  const [detailsSisterLotNumber, setDetailsSisterLotNumber] = useState('');
  const [creatingSisterLot, setCreatingSisterLot] = useState(false);
  const latestIdRef = useRef(0);

  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [newAnalysis, setNewAnalysis] = useState<any>(null);
  const [moistureInput, setMoistureInput] = useState('');
  const [savingMoisture, setSavingMoisture] = useState(false);

  const [compareSearchTerm, setCompareSearchTerm] = useState('');
  const [compareSelected, setCompareSelected] = useState<any[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareDetailsData, setCompareDetailsData] = useState<any[]>([]);
  const [fetchingCompare, setFetchingCompare] = useState(false);

  const [showUpdateQcModal, setShowUpdateQcModal] = useState(false);
  const [saleNumberInput, setSaleNumberInput] = useState('');
  const [isUpdatingQc, setIsUpdatingQc] = useState(false);

  const [analysisTypeFilter, setAnalysisTypeFilter] = useState('');
  const [availableAnalysisTypes, setAvailableAnalysisTypes] = useState<string[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // NEW: Fetch all distinct analysis types directly from the database on load
  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const res = await fetch('/api/batches/analyses?fetchTypes=true');
        const json = await res.json();
        if (Array.isArray(json)) {
          setAvailableAnalysisTypes(json);
        }
      } catch (err) {
        console.error("Failed to fetch analysis types", err);
      }
    };
    fetchTypes();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    const searchDatabase = async () => {
      setLoading(true);
      try {
        const url = `/api/batches/analyses?search=${encodeURIComponent(debouncedSearch)}&type=${encodeURIComponent(analysisTypeFilter)}`;
        const res = await fetch(url);
        const json = await res.json();
        setData(Array.isArray(json) ? json : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    if (!operatorMode && (debouncedSearch !== '' || analysisTypeFilter !== '')) {
       searchDatabase();
    } else if (debouncedSearch === '' && analysisTypeFilter === '') {
       fetchInitialData();
    }
  }, [debouncedSearch, analysisTypeFilter, operatorMode]);

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      // FIX: Changed path to match your existing analysis_details endpoint
      const res = await fetch(`/api/batches/analyses/analysis_details/${deletingId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Analysis deleted successfully', 'success');
        setSelectedAnalysis(null);
        setShowDeleteModal(false);
        fetchInitialData();
      } else {
        showToast('Failed to delete analysis', 'error');
      }
    } catch (err) {
      showToast('Error deleting record', 'error');
    }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchInitialData = async () => {
    try {
      const res = await fetch('/api/batches/analyses');
      const json = await res.json();
      const result = Array.isArray(json) ? json : [];
      setData(result);
      
      if (result.length > 0) {
        if (!selectedAnalysis) handleSelect(result[0]); 
        latestIdRef.current = result[0].id;
      }
      setLoading(false);
    } catch (err) {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (operatorMode) {
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch('/api/batches/analyses');
          const json = await res.json();
          const result = Array.isArray(json) ? json : [];
          
          if (result.length > 0) {
            const newestRecord = result[0];
            if (newestRecord.id > latestIdRef.current) {
              latestIdRef.current = newestRecord.id;
              setData(prev => {
                if (prev.some(p => p.id === newestRecord.id)) return prev;
                return [newestRecord, ...prev];
              });
              setNewAnalysis(newestRecord);
              setMoistureInput('');
              setHasSisterLot(false);
              setSisterLotNumber('');
              setShowModal(true);
            }
          }
        } catch (err) { }
      }, 3000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [operatorMode]);

  const handleSelect = async (analysis: any) => {
    setSelectedAnalysis(analysis);
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/batches/analyses/analysis_details/${analysis.id}`);
      const json = await res.json();
      
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

  const handleSaveMoisture = async () => {
    if (!newAnalysis || !moistureInput) return;
    setSavingMoisture(true);
    
    try {
      const response = await fetch('/api/batches/analyses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newAnalysis.id, moisture: parseFloat(moistureInput) })
      });

      if (response.ok) {
        const updatedMoisture = parseFloat(moistureInput);
        
        if (hasSisterLot && sisterLotNumber) {
          const dupRes = await fetch('/api/batches/analyses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              action: 'duplicate_sister', 
              original_id: newAnalysis.id, 
              new_analysis_number: sisterLotNumber 
            })
          });
          
          if (dupRes.ok) {
            showToast('Moisture saved & Sister Lot created', 'success');
            await fetchInitialData(); 
          } else {
            showToast('Moisture saved but failed to create Sister Lot', 'error');
          }
        } else {
          setData(prev => prev.map(item => item.id === newAnalysis.id ? { ...item, moisture: updatedMoisture } : item));
          if (selectedAnalysis?.id === newAnalysis.id) {
            setSelectedAnalysis((prev: any) => ({ ...prev, moisture: updatedMoisture }));
          }
          showToast('Moisture saved successfully', 'success');
        }
        
        setShowModal(false);
      } else {
        showToast('Failed to save moisture', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to server', 'error');
    } finally {
      setSavingMoisture(false);
    }
  };

  const handleCreateSisterLotFromDetails = async () => {
    if (!selectedAnalysis || !detailsSisterLotNumber) return;
    setCreatingSisterLot(true);
    
    try {
      const dupRes = await fetch('/api/batches/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'duplicate_sister', 
          original_id: selectedAnalysis.id, 
          new_analysis_number: detailsSisterLotNumber 
        })
      });
      
      if (dupRes.ok) {
        showToast('Sister Lot created successfully', 'success');
        setDetailsSisterLotNumber('');
        await fetchInitialData();
      } else {
        showToast('Failed to create Sister Lot', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error connecting to server', 'error');
    } finally {
      setCreatingSisterLot(false);
    }
  };

  const handleRemap = async (e: React.MouseEvent, analysisId: number) => {
    e.stopPropagation();
    setRemappingId(analysisId);
    
    try {
      const res = await fetch('/api/batches/analyses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: analysisId })
      });
      
      const result = await res.json();
      
      if (res.ok && result.mapped) {
        setData(prev => prev.map(item => item.id === analysisId ? { ...item, mapped: true } : item));
        if (selectedAnalysis?.id === analysisId) {
          setSelectedAnalysis((prev: any) => ({ ...prev, mapped: true }));
        }
        showToast(result.message || 'Analysis successfully remapped', 'success');
      } else {
        showToast(result.message || 'Analysis could not be mapped', 'error');
      }
    } catch (err) {
      console.error("Remapping Error:", err);
      showToast('Error connecting to server during remapping', 'error');
    } finally {
      setRemappingId(null);
    }
  };

  const handleCompare = async () => {
    if (compareSelected.length === 0) return;
    setFetchingCompare(true);
    setShowCompareModal(true);
    
    try {
      const fullDataPromises = compareSelected.map(async (analysis) => {
        const res = await fetch(`/api/batches/analyses/analysis_details/${analysis.id}`);
        const json = await res.json();
        
        const compositionTotals: Record<string, number> = {};
        if (json.classes) {
           json.classes.forEach((row: any) => {
             const val = parseFloat(row.percentage);
             if (val > 0) {
               compositionTotals[row.class] = (compositionTotals[row.class] || 0) + val;
             }
           });
        }

        return { ...analysis, composition: compositionTotals };
      });

      const results = await Promise.all(fullDataPromises);
      
      const chartData = results.map(r => ({
        name: r.analysis_number,
        Moisture: parseFloat(r.moisture) || 0,
        'SCA Defect': parseFloat(r.sca_defect_count) || 0,
        'Primary Defects': parseFloat(r.primary_defects_percentage) || 0,
        'Secondary Defects': parseFloat(r.secondary_defects_percentage) || 0,
        'Grade AA': parseFloat(r.grade_aa_percentage) || 0,
        'Grade AB': parseFloat(r.grade_ab_percentage) || 0,
        'Grade ABC': parseFloat(r.grade_abc_percentage) || 0,
        'Grinder': parseFloat(r.grade_grinder_percentage) || 0,
        ...r.composition 
      }));
      
      setCompareDetailsData(chartData);
    } catch (e) {
      console.error("Failed to load compare details", e);
      showToast('Failed to load comparison data', 'error');
    } finally {
      setFetchingCompare(false);
    }
  };

  const handleUpdateQcStrategy = async () => {
    if (!saleNumberInput.trim()) {
        showToast('Please enter a valid sale number', 'error');
        return;
    }
    
    setIsUpdatingQc(true);
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_COBRA_MICROSERVICE_URL}/api/update_qc_strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_number: saleNumberInput.trim() })
      });
      
      const responseData = await response.json();
      
      if (response.ok) {
        showToast('QC Strategy updated successfully', 'success');
        setShowUpdateQcModal(false);
        setSaleNumberInput('');
        fetchInitialData(); 
      } else {
        showToast(responseData.message || responseData.error || 'Failed to update QC Strategy', 'error');
      }
    } catch (err) {
      console.error("QC Strategy Update Error:", err);
      showToast('Network error while updating QC strategy', 'error');
    } finally {
      setIsUpdatingQc(false);
    }
  };

  const uniqueCompareClasses = useMemo(() => {
    const defaultKeys = ['name', 'Moisture', 'SCA Defect', 'Primary Defects', 'Secondary Defects', 'Grade AA', 'Grade AB', 'Grade ABC', 'Grinder'];
    const keys = new Set<string>();
    compareDetailsData.forEach(d => {
      Object.keys(d).forEach(k => {
        if (!defaultKeys.includes(k)) keys.add(k);
      });
    });
    return Array.from(keys);
  }, [compareDetailsData]);


  const compareSearchResults = compareSearchTerm 
    ? data.filter(item => 
        (item.analysis_number?.toLowerCase().includes(compareSearchTerm.toLowerCase()) ||
        item.analysis_type?.toLowerCase().includes(compareSearchTerm.toLowerCase())) &&
        !compareSelected.find(s => s.id === item.id)
      ).slice(0, 6)
    : [];

  const uniqueClasses = details?.classes 
    ? Array.from(new Set(details.classes.flatMap(o => Object.keys(o).filter(k => k !== 'screen_size'))))
    : [];

  const compositionData = useMemo(() => {
    if (!details?.classes) return [];
    const totals: Record<string, number> = {};
    details.classes.forEach((row: any) => {
      Object.keys(row).forEach(key => {
        if (key !== 'screen_size') totals[key] = (totals[key] || 0) + row[key];
      });
    });
    
    const mapped = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0);

    mapped.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      
      if (aName === 'ok coated' && bName !== 'ok coated') return -1;
      if (bName === 'ok coated' && aName !== 'ok coated') return 1;
      
      if (aName === 'ok uncoated' && bName !== 'ok uncoated') return -1;
      if (bName === 'ok uncoated' && aName !== 'ok uncoated') return 1;

      return b.value - a.value;
    });

    return mapped;
  }, [details?.classes]);


  const sharedTooltipStyle = {
    borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px'
  };
  const formatVal = (val: any) => Number(val || 0).toFixed(2);

  return (
    <div className="h-screen overflow-hidden font-['Poppins'] text-[#4A4941]" style={{ backgroundColor: COLORS.bg }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Poppins', sans-serif; margin: 0; padding: 0; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D1CEC3; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #8B8A81; }
        
        @keyframes steam-rise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          50% { opacity: 0.8; }
          100% { transform: translateY(-20px) scale(1.5); opacity: 0; }
        }
        .animate-steam-1 { animation: steam-rise 2.5s infinite ease-in; }
        .animate-steam-2 { animation: steam-rise 2.5s infinite ease-in 0.8s; }
        .animate-steam-3 { animation: steam-rise 2.5s infinite ease-in 1.6s; }
      `}</style>

      {loading && (
        <div className="fixed inset-0 bg-[#EBE7DC]/90 backdrop-blur-sm flex flex-col items-center justify-center z-[100]">
          <div className="relative w-32 h-32 mb-6 flex justify-center items-center">
            <svg width="100" height="100" viewBox="0 0 64 64" fill="none">
              <path className="animate-steam-1" d="M 24 22 Q 27 15 24 8" stroke="#605F55" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path className="animate-steam-2" d="M 32 22 Q 35 15 32 8" stroke="#605F55" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path className="animate-steam-3" d="M 40 22 Q 43 15 40 8" stroke="#605F55" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M14 26 C14 26 14 52 32 52 C50 52 50 26 50 26 Z" fill="#008080"/>
              <path d="M50 30 C58 30 58 44 50 44" stroke="#008080" strokeWidth="4" fill="none" />
              <path d="M10 54 C10 54 32 60 54 54" stroke="#008080" strokeWidth="4" fill="none" strokeLinecap="round"/>
              <ellipse cx="32" cy="26" rx="18" ry="4" fill="#008080" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-[#008080] mb-2">Brewing Data...</h3>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 p-4 rounded-xl shadow-2xl z-[100] font-bold text-sm flex items-center gap-3 animate-in slide-in-from-bottom-5 fade-in duration-300 ${toast.type === 'success' ? 'bg-[#00A651] text-white' : 'bg-[#D97706] text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          {toast.message}
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 transition-all duration-300">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-red-600 mb-2 flex items-center gap-2">
              <XCircle className="w-6 h-6" /> Confirm Deletion
            </h3>
            <p className="text-sm text-[#8B8A81] mb-6">
              Are you sure you want to delete this analysis record? This action cannot be undone and will permanently remove the record from the database.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#8B8A81] hover:bg-[#F5F2EA] transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-colors shadow-md">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpdateQcModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 transition-all duration-300">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-300 relative overflow-hidden">
            {!isUpdatingQc && (
                <button onClick={() => setShowUpdateQcModal(false)} className="absolute top-6 right-6 text-[#8B8A81] hover:text-[#4A4941] p-1 bg-[#F5F2EA] rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
            )}

            {!isUpdatingQc ? (
              <>
                <div className="mb-6 pr-8">
                  <h3 className="text-xl font-bold flex items-center gap-2 text-[#4A4941]">
                    <Activity className="w-5 h-5 text-[#D97706]" /> Update QC Strategy
                  </h3>
                  <p className="text-sm text-[#8B8A81] mt-2">
                    Enter the sale number to pull updates from the catalogue and apply the strategy to matching auction samples.
                  </p>
                </div>

                <div className="mb-8">
                  <label className="block text-xs font-bold uppercase text-[#8B8A81] mb-2 ml-1">Sale Number</label>
                  <input 
                    type="text"
                    value={saleNumberInput}
                    onChange={(e) => setSaleNumberInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateQcStrategy()}
                    className="w-full bg-[#F5F2EA] border border-[#D1CEC3] rounded-xl px-4 py-3 text-lg font-semibold focus:outline-none focus:border-[#D97706] transition-all"
                    placeholder="e.g. 1, 47" autoFocus
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowUpdateQcModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#8B8A81] hover:bg-[#F5F2EA] transition-colors">Cancel</button>
                  <button 
                    onClick={handleUpdateQcStrategy} 
                    disabled={!saleNumberInput.trim()} 
                    className="px-6 py-2.5 rounded-xl text-sm font-bold bg-[#605F55] text-white hover:bg-[#4A4941] transition-colors disabled:opacity-50 shadow-md flex items-center gap-2"
                  >
                    Start Update
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center animate-in fade-in duration-500">
                <div className="relative w-32 h-32 mb-6 flex justify-center items-center">
                  <svg width="100" height="100" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path className="animate-steam-1" d="M 24 22 Q 27 15 24 8" stroke="#D1CEC3" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <path className="animate-steam-2" d="M 32 22 Q 35 15 32 8" stroke="#D1CEC3" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <path className="animate-steam-3" d="M 40 22 Q 43 15 40 8" stroke="#D1CEC3" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <path d="M14 26 C14 26 14 52 32 52 C50 52 50 26 50 26 Z" fill="#605F55"/>
                    <path d="M50 30 C58 30 58 44 50 44" stroke="#605F55" strokeWidth="4" fill="none" />
                    <path d="M10 54 C10 54 32 60 54 54" stroke="#D1CEC3" strokeWidth="4" fill="none" strokeLinecap="round"/>
                    <ellipse cx="32" cy="26" rx="18" ry="4" fill="#4A4941" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-[#4A4941] mb-2">Brewing Updates...</h3>
                <p className="text-sm text-[#8B8A81] px-4">
                  Pouring a fresh cup of data and updating QC strategies for sale <span className="font-bold text-[#D97706]">{saleNumberInput}</span>. Hang tight!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 transition-all duration-300">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-[#00A651]" /> New Analysis
                </h3>
                <p className="text-sm text-[#8B8A81] mt-1">Please enter the moisture level.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-[#8B8A81] hover:text-[#4A4941] p-1 bg-[#F5F2EA] rounded-full">
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
                type="number" step="0.1"
                value={moistureInput}
                onChange={(e) => setMoistureInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveMoisture()}
                className="w-full bg-[#F5F2EA] border border-[#D1CEC3] rounded-xl px-4 py-3 text-lg font-semibold focus:outline-none focus:border-[#00A651] transition-all"
                placeholder="e.g. 11.5" autoFocus
              />
            </div>

            <div className="mb-8 p-4 bg-[#F5F2EA] rounded-xl border border-[#D1CEC3]">
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input 
                  type="checkbox" 
                  checked={hasSisterLot} 
                  onChange={(e) => setHasSisterLot(e.target.checked)}
                  className="w-4 h-4 text-[#00A651] rounded border-[#D1CEC3] focus:ring-[#00A651]"
                />
                <span className="text-sm font-bold text-[#4A4941]">Has Sister Lot?</span>
              </label>
              
              {hasSisterLot && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-[10px] font-bold uppercase text-[#8B8A81] mb-1.5">Sister Lot Number</label>
                  <input 
                    type="text"
                    value={sisterLotNumber}
                    onChange={(e) => setSisterLotNumber(e.target.value)}
                    className="w-full bg-white border border-[#D1CEC3] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00A651] transition-all"
                    placeholder="e.g. 504A"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#8B8A81] hover:bg-[#F5F2EA] transition-colors">Skip</button>
              <button onClick={handleSaveMoisture} disabled={savingMoisture || !moistureInput} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[#00A651] text-white hover:bg-[#008A43] transition-colors disabled:opacity-50 shadow-md">
                {savingMoisture ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompareModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-6 transition-all duration-300">
          <div className="bg-[#F5F2EA] rounded-3xl w-full h-full max-w-[1600px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white px-6 py-4 flex justify-between items-start border-b border-[#D1CEC3] shrink-0">
              <div className="flex-1 mr-4">
                <h3 className="text-xl font-bold flex items-center gap-2 mb-1.5">
                  <GitCompare className="w-5 h-5 text-[#00A651]" /> Analysis Comparison
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {compareSelected.map((item, i) => (
                    <React.Fragment key={item.id}>
                      <span className="bg-[#F5F2EA] border border-[#D1CEC3] px-2.5 py-0.5 rounded text-xs font-bold text-[#4A4941]">
                        {item.analysis_number}
                      </span>
                      {i < compareSelected.length - 1 && (
                        <span className="text-[#D1CEC3] text-[10px]">●</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowCompareModal(false)} className="text-[#8B8A81] hover:text-[#4A4941] p-2 bg-[#F5F2EA] hover:bg-[#EBE7DC] rounded-full transition-colors shrink-0 mt-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-4 sm:p-6 flex flex-col">
              {fetchingCompare ? (
                <div className="h-full w-full flex flex-col items-center justify-center text-[#8B8A81]">
                  <Activity className="w-10 h-10 mb-4 animate-spin" />
                  <p className="font-bold tracking-widest text-xs uppercase">Assembling Comparison Data...</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4 h-full">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[220px] shrink-0">
                    <div className="bg-white border border-[#D1CEC3] rounded-2xl p-4 shadow-sm flex flex-col">
                      <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-[#605F55]">Moisture Level</h4>
                      <div className="flex-1 w-full min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={compareDetailsData} margin={{ left: -20, right: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9}} />
                            <Tooltip contentStyle={sharedTooltipStyle} cursor={{fill: '#F5F2EA'}} formatter={(value: number) => formatVal(value)} />
                            <Bar dataKey="Moisture" fill={COLORS.chartColors[10]} radius={[4, 4, 0, 0]} maxBarSize={30}>
                              <LabelList dataKey="Moisture" position="top" style={{ fontSize: '9px', fill: '#4A4941', fontWeight: 'bold' }} formatter={(v: number) => v > 0 ? `${formatVal(v)}%` : ''} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white border border-[#D1CEC3] rounded-2xl p-4 shadow-sm flex flex-col">
                      <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-[#605F55]">SCA Defect Count</h4>
                      <div className="flex-1 w-full min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={compareDetailsData} margin={{ left: -20, right: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9}} />
                            <Tooltip contentStyle={sharedTooltipStyle} cursor={{fill: '#F5F2EA'}} formatter={(value: number) => formatVal(value)} />
                            <Bar dataKey="SCA Defect" fill={COLORS.chartColors[10]} radius={[4, 4, 0, 0]} maxBarSize={30}>
                              <LabelList dataKey="SCA Defect" position="top" style={{ fontSize: '9px', fill: '#4A4941', fontWeight: 'bold' }} formatter={(v: number) => v > 0 ? formatVal(v) : ''} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white border border-[#D1CEC3] rounded-2xl p-4 shadow-sm flex flex-col">
                      <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-[#605F55]">Defects Breakdown</h4>
                      <div className="flex-1 w-full min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={compareDetailsData} margin={{ left: -20, right: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9}} />
                            <Tooltip contentStyle={sharedTooltipStyle} cursor={{fill: '#F5F2EA'}} formatter={(value: number) => formatVal(value)} />
                            <Legend iconType="circle" wrapperStyle={{paddingTop: '5px', fontSize: '10px', fontWeight: 'bold'}} />
                            <Bar dataKey="Primary Defects" stackId="defects" fill={COLORS.chartColors[1]} maxBarSize={30}>
                              <LabelList dataKey="Primary Defects" position="center" style={{ fontSize: '9px', fill: '#fff', fontWeight: 'bold' }} formatter={(v: number) => v > 0 ? `${formatVal(v)}%` : ''} />
                            </Bar>
                            <Bar dataKey="Secondary Defects" stackId="defects" fill={COLORS.chartColors[3]} radius={[4, 4, 0, 0]} maxBarSize={30}>
                              <LabelList dataKey="Secondary Defects" position="center" style={{ fontSize: '9px', fill: '#fff', fontWeight: 'bold' }} formatter={(v: number) => v > 0 ? `${formatVal(v)}%` : ''} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 flex-1 min-h-0">
                    <div className="bg-white border border-[#D1CEC3] rounded-2xl p-4 shadow-sm flex flex-col h-full">
                      <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-[#605F55]">Grade Distribution</h4>
                      <div className="flex-1 w-full min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={compareDetailsData} margin={{ left: -20, right: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9}} />
                            <Tooltip contentStyle={sharedTooltipStyle} formatter={(value: number) => formatVal(value)} />
                            <Legend iconType="circle" wrapperStyle={{paddingTop: '5px', fontSize: '10px', fontWeight: 'bold'}} />
                            <Area type="monotone" dataKey="Grade AA" stackId="grades" stroke={COLORS.chartColors[0]} fill={COLORS.chartColors[0]} fillOpacity={0.6} />
                            <Area type="monotone" dataKey="Grade AB" stackId="grades" stroke={COLORS.chartColors[2]} fill={COLORS.chartColors[2]} fillOpacity={0.6} />
                            <Area type="monotone" dataKey="Grade ABC" stackId="grades" stroke={COLORS.chartColors[8]} fill={COLORS.chartColors[8]} fillOpacity={0.6} />
                            <Area type="monotone" dataKey="Grinder" stackId="grades" stroke={COLORS.chartColors[4]} fill={COLORS.chartColors[4]} fillOpacity={0.6} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white border border-[#D1CEC3] rounded-2xl p-4 shadow-sm flex flex-col h-full">
                      <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-[#605F55]">Composition Summary</h4>
                      <div className="flex-1 w-full min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={compareDetailsData} margin={{ left: -20, right: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9}} />
                            <Tooltip contentStyle={sharedTooltipStyle} cursor={{fill: '#F5F2EA'}} formatter={(value: number) => formatVal(value)} />
                            <Legend iconType="circle" wrapperStyle={{paddingTop: '5px', fontSize: '10px', fontWeight: 'bold'}} />
                            {uniqueCompareClasses.map((cls, idx) => (
                              <Bar key={cls} dataKey={cls} stackId="composition" fill={getCompositionColor_Comparison(cls, idx)} maxBarSize={50}>
                                <LabelList dataKey={cls} position="center" style={{ fontSize: '8px', fill: '#fff', fontWeight: 'bold' }} formatter={(v: number) => v > 0 ? `${formatVal(v)}%` : ''} />
                              </Bar>
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex h-screen overflow-hidden">
        
        <div className="w-[26%] flex flex-col border-r border-[#D1CEC3] bg-[#EBE7DC]">
          <div className="p-4 pb-2 shrink-0 border-b border-[#D1CEC3]/50">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h1 className="text-lg font-bold flex items-center gap-2 mb-1">
                  <FlaskConical className="w-4 h-4" /> Batch Analyses
                </h1>
                <p className='text-sm mb-2'>CSMART Analyses</p> 
              </div>
              <div className="flex flex-col items-end gap-2">
                <label className="flex items-center gap-2 cursor-pointer bg-white px-2.5 py-1.5 rounded-lg border border-[#D1CEC3] shadow-sm hover:bg-[#F5F2EA] transition-colors">
                  <input 
                    type="radio" checked={operatorMode} onClick={() => setOperatorMode(!operatorMode)} readOnly
                    className="w-3.5 h-3.5 text-[#D97706] focus:ring-[#D97706]"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#605F55]">Operator Mode</span>
                </label>
                <button 
                  onClick={() => setShowUpdateQcModal(true)}
                  className="text-[9px] font-bold uppercase bg-[#605F55] text-white px-2 py-1.5 rounded-md hover:bg-[#4A4941] transition-colors shadow-sm"
                >
                  Update Auction Sample Quality
                </button>
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8A81]" />
                <select
                  className="w-full bg-[#F5F2EA] border border-[#D1CEC3] rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:border-[#8B8A81] appearance-none"
                  value={analysisTypeFilter}
                  onChange={(e) => setAnalysisTypeFilter(e.target.value)}
                >
                  <option value="">All Analysis Types</option>
                  {availableAnalysisTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8A81]" />
                <input 
                  type="text" 
                  placeholder="Search Database..." 
                  className="w-full bg-[#F5F2EA] border border-[#D1CEC3] rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:border-[#8B8A81]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="p-4 pt-3 pb-3 shrink-0 border-b border-[#D1CEC3]">
            <p className="text-[10px] font-bold text-[#8B8A81] mb-2 uppercase flex items-center gap-1.5">
              <GitCompare className="w-3 h-3" /> Compare Tools
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8B8A81]" />
              <input 
                type="text" placeholder="Find to compare..." 
                className="w-full bg-white border border-[#D1CEC3] rounded-lg py-1.5 pl-8 pr-3 text-[11px] focus:outline-none focus:border-[#00A651]"
                value={compareSearchTerm} onChange={(e) => setCompareSearchTerm(e.target.value)}
              />
              {compareSearchTerm && compareSearchResults.length > 0 && (
                <div className="absolute z-20 top-full left-0 w-full mt-1 bg-white border border-[#D1CEC3] rounded-xl shadow-lg max-h-40 overflow-y-auto custom-scrollbar">
                  {compareSearchResults.map(res => (
                    <div 
                      key={res.id}
                      className="p-2.5 text-[11px] hover:bg-[#F5F2EA] cursor-pointer flex justify-between items-center transition-colors border-b border-[#EBE7DC] last:border-0"
                      onClick={() => { setCompareSelected([...compareSelected, res]); setCompareSearchTerm(''); }}
                    >
                      <span className="font-bold text-[#4A4941]">{res.analysis_number}</span>
                      <span className="text-[9px] text-[#8B8A81] uppercase font-bold">{res.analysis_type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {compareSelected.length > 0 && (
              <div className="mt-3">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {compareSelected.map(item => (
                    <div key={item.id} className="bg-[#605F55] text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1.5 shadow-sm">
                      <span className="opacity-75">{item.analysis_type}</span> • {item.analysis_number}
                      <X className="w-3 h-3 cursor-pointer hover:text-[#D97706] transition-colors" onClick={() => setCompareSelected(compareSelected.filter(s => s.id !== item.id))} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setCompareSelected([])} className="text-[11px] bg-white border border-[#D1CEC3] text-[#8B8A81] font-bold px-3 py-1.5 rounded-lg hover:bg-[#F5F2EA] transition-colors shadow-sm">Clear</button>
                  <button onClick={handleCompare} className="text-[11px] bg-[#00A651] text-white font-bold px-4 py-1.5 rounded-lg hover:bg-[#008A43] transition-colors shadow-sm shadow-[#00A651]/20 flex items-center gap-1.5">
                    Compare <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 custom-scrollbar">
            {data.map((row) => (
              <div 
                key={row.id}
                onClick={() => handleSelect(row)}
                className={`p-3 rounded-xl border transition-all cursor-pointer group flex justify-between items-center ${
                  selectedAnalysis?.id === row.id 
                  ? 'bg-white border-[#605F55] shadow-md scale-[1.02]' 
                  : 'bg-[#F5F2EA] border-[#D1CEC3] hover:border-[#8B8A81]'
                }`}
              >
                <div className="min-w-0 pr-2 flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[#8B8A81]">#{row.id}</span>
                      <span className="font-bold text-xs truncate">{row.analysis_number}</span>
                    </div>
                    {['Auction sample', 'Auction purchase'].includes(row.analysis_type) && row.sale_number && (
                      <span className="font-black text-sm text-[#D97706]">Sale {row.sale_number}</span>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-[9px] font-bold uppercase text-[#8B8A81] truncate">{row.analysis_type}</span>
                    
                    {!row.mapped && !['Auction sample', 'Auction purchase'].includes(row.analysis_type) && (
                      <button 
                        onClick={(e) => handleRemap(e, row.id)}
                        disabled={remappingId === row.id}
                        className="ml-auto text-[9px] font-bold text-[#D97706] hover:text-[#B45309] bg-[#D97706]/10 px-1.5 py-0.5 rounded transition-colors flex items-center gap-1"
                      >
                        {remappingId === row.id ? <Activity className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                        REMAP
                      </button>
                    )}
                  </div>
                </div>
                <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${selectedAnalysis?.id === row.id ? 'translate-x-1' : 'opacity-0'}`} />
              </div>
            ))}
          </div>

        </div>

        <div className="flex-1 flex flex-col bg-[#F5F2EA] overflow-hidden p-4 sm:p-6 gap-4">
          {selectedAnalysis ? (
            <>
              <div className="bg-white rounded-2xl p-5 border border-[#D1CEC3] shrink-0 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-2xl font-bold leading-tight">{selectedAnalysis.analysis_number}</h2>
                      {['Auction sample', 'Auction purchase'].includes(selectedAnalysis.analysis_type) && selectedAnalysis.sale_number && (
                        <span className="text-xl font-black text-[#D97706] bg-[#D97706]/10 px-3 py-0.5 rounded-lg border border-[#D97706]/20 shadow-sm">
                          Sale {selectedAnalysis.sale_number}
                        </span>
                      )}
                    </div>
                    <p className="text-[#8B8A81] flex items-center gap-2 font-medium uppercase text-[10px] tracking-wider">
                      {selectedAnalysis.analysis_type} • {selectedAnalysis.qc_quality}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    
                    {!['Auction sample', 'Auction purchase'].includes(selectedAnalysis.analysis_type) && (
                      <>
                        {!selectedAnalysis.mapped && (
                          <button 
                            onClick={(e) => handleRemap(e, selectedAnalysis.id)}
                            disabled={remappingId === selectedAnalysis.id}
                            className="px-3 py-1.5 rounded-full font-bold text-[10px] flex items-center gap-1.5 bg-[#D97706]/10 text-[#D97706] hover:bg-[#D97706]/20 transition-colors"
                          >
                            {remappingId === selectedAnalysis.id ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            TRY REMAP
                          </button>
                        )}
                        <div className={`px-3 py-1.5 rounded-full font-bold text-[10px] flex items-center gap-1.5 ${selectedAnalysis.mapped ? 'bg-[#00A651]/10 text-[#00A651]' : 'bg-[#8B8A81]/10 text-[#8B8A81]'}`}>
                          {selectedAnalysis.mapped ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          {selectedAnalysis.mapped ? 'MAPPED' : 'UNMAPPED'}
                        </div>
                      </>
                    )}
                    
                    <button
                      onClick={() => { setDeletingId(selectedAnalysis.id); setShowDeleteModal(true); }}
                      className="px-4 py-1.5 rounded-xl font-bold text-[10px] flex items-center gap-1.5 bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> DELETE
                    </button>

                  </div>
                </div>

                {selectedAnalysis.analysis_type === 'Auction sample' && (
                  <div className="mt-4 p-3 bg-[#EBE7DC] rounded-xl border border-[#D1CEC3] flex items-end gap-3 animate-in fade-in">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold uppercase text-[#8B8A81] mb-1">Sister Lot Number</label>
                      <input 
                        type="text"
                        value={detailsSisterLotNumber}
                        onChange={(e) => setDetailsSisterLotNumber(e.target.value)}
                        className="w-full bg-white border border-[#D1CEC3] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#00A651] transition-all"
                        placeholder="e.g. 702B"
                      />
                    </div>
                    <button 
                      onClick={handleCreateSisterLotFromDetails}
                      disabled={creatingSisterLot || !detailsSisterLotNumber}
                      className="text-xs bg-[#00A651] text-white font-bold px-4 py-1.5 rounded-lg hover:bg-[#008A43] transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 h-[34px]"
                    >
                      {creatingSisterLot ? <Activity className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                      Create Sister Lot
                    </button>
                  </div>
                )}

                <div className="flex flex-row justify-between mt-4">
                  <div className="grid grid-cols-5 gap-3 flex-1">
                    {[
                      { label: 'SCA Defect', val: formatVal(selectedAnalysis.sca_defect_count) },
                      { label: 'Moisture', val: `${formatVal(selectedAnalysis.moisture)}%` },
                      { label: 'Prim. Defects', val: `${formatVal(selectedAnalysis.primary_defects_percentage)}%`, color: '#D97706' },
                      { label: 'Sec. Defects', val: `${formatVal(selectedAnalysis.secondary_defects_percentage)}%`, color: '#D97706' },
                      { label: 'Foreign Mat.', val: `${formatVal(selectedAnalysis.forein_matter_percentage)}%` }
                    ].map((stat, i) => (
                      <div key={i}>
                        <p className="text-[9px] font-bold uppercase text-[#8B8A81] mb-0.5">{stat.label}</p>
                        <p className="text-base font-bold leading-none" style={{ color: stat.color }}>{stat.val}</p>
                      </div>
                    ))}
                  </div>

                  <div className="w-[1px] bg-[#D1CEC3] mx-6 hidden lg:block"></div>

                  <div className="grid grid-cols-4 gap-4 flex-1 mt-4 lg:mt-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-[#D1CEC3]">
                    {[
                      { label: 'Grade AA', val: formatVal(selectedAnalysis.grade_aa_percentage) },
                      { label: 'Grade AB', val: formatVal(selectedAnalysis.grade_ab_percentage) },
                      { label: 'Grade ABC', val: formatVal(selectedAnalysis.grade_abc_percentage) },
                      { label: 'Grinder', val: formatVal(selectedAnalysis.grade_grinder_percentage) }
                    ].map((stat, i) => (
                      <div key={i}>
                        <p className="text-[9px] font-bold uppercase text-[#8B8A81] mb-0.5">{stat.label}</p>
                        <p className="text-sm font-semibold leading-none">{stat.val}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-row gap-4 flex-1 min-h-0">
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                  <div className="flex-1 bg-white border border-[#D1CEC3] rounded-2xl p-4 shadow-sm flex flex-col min-h-0">
                    <div className="flex items-center gap-2 mb-2 shrink-0">
                      <BarChart3 className="w-4 h-4 text-[#14B8A6]" />
                      <h3 className="font-bold text-sm">Screen Size Distribution</h3>
                    </div>
                    <div className="flex-1 w-full min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={details?.screensize || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                          <XAxis dataKey="screen_size" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9}} />
                          <Tooltip contentStyle={sharedTooltipStyle} cursor={{fill: '#F5F2EA'}} formatter={(value: number) => formatVal(value)} />
                          <Bar dataKey="percentage" fill="#14B8A6" radius={[4, 4, 0, 0]} maxBarSize={30}>
                            <LabelList dataKey="percentage" position="top" style={{ fontSize: '9px', fill: '#4A4941', fontWeight: 'bold' }} formatter={(v: number) => v > 0 ? `${formatVal(v)}%` : ''} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="flex-1 bg-white border border-[#D1CEC3] rounded-2xl p-4 shadow-sm flex flex-col min-h-0">
                    <div className="flex items-center gap-2 mb-0 shrink-0">
                      <Activity className="w-4 h-4 text-[#D97706]" />
                      <h3 className="font-bold text-sm">Defect by Screensize Tracking</h3>
                    </div>
                    <div className="flex-1 w-full min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={details?.classes || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                          <XAxis dataKey="screen_size" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9}} />
                          <Tooltip contentStyle={sharedTooltipStyle} formatter={(value: number) => formatVal(value)} />
                          <Legend iconType="circle" wrapperStyle={{paddingTop: '5px', fontSize: '10px', fontWeight: 'bold'}} />
                          {uniqueClasses.map((cls, idx) => (
                            <Line key={cls} type="monotone" dataKey={cls} stroke={COLORS.chartColors[idx % COLORS.chartColors.length]} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 1.5, fill: 'white' }} activeDot={{ r: 5 }} />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="w-[35%] lg:w-[32%] bg-white border border-[#D1CEC3] rounded-2xl p-5 shadow-sm flex flex-col min-h-0 shrink-0">
                  <div className="flex items-center gap-2 mb-4 shrink-0">
                    <BarChart3 className="w-4 h-4 text-[#14B8A6]" />
                    <h3 className="font-bold text-sm">Defects Composition</h3>
                  </div>
                  <div className="flex-1 w-full min-h-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={compositionData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#EBE7DC" />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 9}} />
                        <YAxis type="category" dataKey="name" reversed axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600}} width={85} />
                        <Tooltip contentStyle={sharedTooltipStyle} cursor={{fill: '#F5F2EA'}} formatter={(value: number) => `${formatVal(value)}%`} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                          {compositionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getCompositionColor(entry.name, index)} />
                          ))}
                          <LabelList dataKey="value" position="right" style={{ fontSize: '9px', fill: '#4A4941', fontWeight: 'bold' }} formatter={(v: number) => v > 0 ? `${formatVal(v)}%` : ''} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {compositionData.length === 0 && !detailsLoading && (
                    <p className="text-center text-[#8B8A81] text-xs py-4">No composition data</p>
                  )}
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