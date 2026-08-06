"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, LabelList
} from 'recharts';
import { Activity, BarChart3, Filter, BoxSelect, DollarSign, Layers, CheckCircle2, X, Upload, Download } from 'lucide-react';

const COLORS = [
  '#0d9488', '#D97706', '#3B82F6', '#8B5CF6', '#EC4899', 
  '#10B981', '#F59E0B', '#14B8A6', '#6366F1', '#F43F5E',
  '#84CC16', '#64748B', '#0EA5E9', '#D946EF', '#1E40AF'
];

// Custom BoxPlot Shape for Recharts
const BoxPlotShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  const { min, max, q1, median, q3 } = payload;
  
  if (max === min || isNaN(min)) return <rect x={x} y={y} width={width} height={height} fill="#0d9488" />;

  const getPos = (val: number) => y + height * (1 - ((val - min) / (max - min)));
  
  const yQ3 = getPos(q3);
  const yQ1 = getPos(q1);
  const yMed = getPos(median);
  const center = x + width / 2;

  return (
    <g>
      <line x1={center} y1={y} x2={center} y2={yQ3} stroke="#4A4941" strokeWidth={1.5} />
      <line x1={center - width/4} y1={y} x2={center + width/4} y2={y} stroke="#4A4941" strokeWidth={1.5} />
      <rect x={x} y={yQ3} width={width} height={Math.max(1, yQ1 - yQ3)} fill="#0d9488" stroke="#0f766e" strokeWidth={1} />
      <line x1={x} y1={yMed} x2={x + width} y2={yMed} stroke="#ffffff" strokeWidth={2.5} />
      <line x1={center} y1={yQ1} x2={center} y2={y + height} stroke="#4A4941" strokeWidth={1.5} />
      <line x1={center - width/4} y1={y + height} x2={center + width/4} y2={y + height} stroke="#4A4941" strokeWidth={1.5} />
    </g>
  );
};

function quantile(arr: number[], q: number) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

// Reusable MultiSelect Component
const MultiSelect = ({ label, options, selected, onChange, placeholder }: any) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  
  const filteredOptions = options.filter((o: string) => !selected.includes(o) && o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mb-4 relative">
      <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">{label}</label>
      
      {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selected.map((sel: string) => (
              <span key={sel} className="inline-flex items-center gap-1 bg-[#ccfbf1] text-[#0f766e] px-2 py-0.5 rounded-md text-[10px] font-bold border border-[#0d9488]/20 shadow-sm max-w-full">
                <span className="truncate">{sel}</span> 
                <X className="w-3 h-3 cursor-pointer shrink-0 hover:text-red-600 transition-colors" onClick={() => onChange(selected.filter((s: string) => s !== sel))} />
              </span>
            ))}
          </div>
      )}

      <input
        type="text"
        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-[#0d9488] focus:border-[#0d9488] shadow-sm transition-colors"
        placeholder={placeholder}
        value={search}
        onChange={e => setSearch(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
      />
      
      {isOpen && filteredOptions.length > 0 && (
         <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
           {filteredOptions.map((opt: string) => (
             <div 
                key={opt} 
                className="px-3 py-2 text-xs cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-0 truncate" 
                onMouseDown={(e) => { 
                    e.preventDefault(); 
                    onChange([...selected, opt]); 
                    setSearch(''); 
                }}
             >
                 {opt}
             </div>
           ))}
         </div>
      )}
    </div>
  );
};

export default function AuctionAnalysis() {
  const [activeTab, setActiveTab] = useState('auction');
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState('Kilos');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadSaleNum, setUploadSaleNum] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Global Filter States
  const [filterStatus, setFilterStatus] = useState('all'); 
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedCounties, setSelectedCounties] = useState<string[]>([]);
  const [selectedCooperatives, setSelectedCooperatives] = useState<string[]>([]);
  const [selectedWetmills, setSelectedWetmills] = useState<string[]>([]);
  const [selectedCertifications, setSelectedCertifications] = useState<string[]>([]);
  const [selectedBuyers, setSelectedBuyers] = useState<string[]>([]);
  const [selectedCertTypes, setSelectedCertTypes] = useState<string[]>([]);
  const [selectedSKL, setSelectedSKL] = useState<boolean>(false);

  // Chart Controls
  const [volumeStack, setVolumeStack] = useState('none'); 
  const [priceStack, setPriceStack] = useState('none'); 
  const [priceMetric, setPriceMetric] = useState('confirmed_price'); 
  const [distMetric, setDistMetric] = useState('confirmed_price');
  const [distGroupBy, setDistGroupBy] = useState('strategy');

  // Legend Visibility State
  const [hiddenVolumeSeries, setHiddenVolumeSeries] = useState<Set<string>>(new Set());
  const [hiddenPriceSeries, setHiddenPriceSeries] = useState<Set<string>>(new Set());

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auction_analysis');
      const json = await res.json();
      const data = Array.isArray(json) ? json : [];
      setRawData(data);

      const seasons = Array.from(new Set(data.map(d => d.season).filter(Boolean))).sort().reverse() as string[];
      if (seasons.length > 0 && selectedSeasons.length === 0) {
        setSelectedSeasons([seasons[0]]);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPurchases = async () => {
    if (!uploadSaleNum.trim() || !uploadFile) {
      showToast('Please provide both a sale number and a CSV file.', 'error');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('sale_number', uploadSaleNum.trim());
    formData.append('file', uploadFile);

    try {
      const response = await fetch('/api/upload_confirmed_purchases', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        showToast(result.message || 'Purchases uploaded successfully!', 'success');
        setShowUploadModal(false);
        setUploadSaleNum('');
        setUploadFile(null);
        fetchData(); // Refresh the dashboard data
      } else {
        showToast(result.error || 'Failed to upload purchases.', 'error');
      }
    } catch (err) {
      console.error('Upload error:', err);
      showToast('An unexpected error occurred during upload.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const getPrice = (row: any, metric: string) => {
    // New logic to handle dynamic Differential calculation on the frontend
    if (metric === 'differential') {
      let price = parseFloat(row.confirmed_price);
      if (isNaN(price)) {
        price = parseFloat(row.floor_price); // Fallback to floor price
      }
      const fobbing = parseFloat(row.fobbing);
      const hedgeLevel = parseFloat(row.hedge_level);

      if (isNaN(price) || isNaN(fobbing) || isNaN(hedgeLevel)) return null;

      // Differential = (((Price + Fobbing) / 50) * 100 * 0.453592) - Hedge Level (NY Price)
      const diff = (((price + fobbing) / 50) * 100 * 0.453592) - hedgeLevel;
      return diff;
    }

    // Standard static metric
    const val = parseFloat(row[metric.replace('_usc', '')]);
    if (isNaN(val)) return null;
    return metric.includes('_usc') ? val / 1.1023 : val;
  };

  const weightMultiplier = unit === 'MT' ? 1/1000 : unit === 'Bags' ? 1/60 : 1;

  const filterOptions = useMemo(() => {
    const getUnique = (key: string) => Array.from(new Set(rawData.map(d => d[key]).filter(v => v && String(v).trim() !== ''))).sort();
    return {
      seasons: getUnique('season'),
      strategies: getUnique('strategy'),
      grades: getUnique('grade'),
      counties: getUnique('region'),
      cooperatives: getUnique('cooperative'),
      wetmills: getUnique('wetmill'),
      certifications: getUnique('certification'),
      buyers: getUnique('buyer'),
    };
  }, [rawData]);

  // --- FILTERING LOGIC ---
  const filteredData = useMemo(() => {
    return rawData.filter(d => {
      // 1. Status Filter
      if (filterStatus === 'confirmed' && (d.confirmed_price === null || isNaN(parseFloat(d.confirmed_price)))) return false;
      if (filterStatus === 'withdrawn' && (d.confirmed_price !== null && !isNaN(parseFloat(d.confirmed_price)))) return false;
      if (filterStatus === 'floor' && (d.floor_price === null || isNaN(parseFloat(d.floor_price)))) return false;

      // 2. Date Range Filter
      if (d.timestamp) {
          if (dateStart && new Date(d.timestamp) < new Date(dateStart)) return false;
          if (dateEnd && new Date(d.timestamp) > new Date(dateEnd + 'T23:59:59')) return false;
      }

      // 3. Multi-Select Filters
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(d.season)) return false;
      if (selectedStrategies.length > 0 && !selectedStrategies.includes(d.strategy)) return false;
      if (selectedGrades.length > 0 && !selectedGrades.includes(d.grade)) return false;
      if (selectedCounties.length > 0 && !selectedCounties.includes(d.region)) return false;
      if (selectedCooperatives.length > 0 && !selectedCooperatives.includes(d.cooperative)) return false;
      if (selectedWetmills.length > 0 && !selectedWetmills.includes(d.wetmill)) return false;
      if (selectedCertifications.length > 0 && !selectedCertifications.includes(d.certification)) return false;
      if (selectedBuyers.length > 0 && !selectedBuyers.includes(d.buyer)) return false;

      const certText = (d.certification || '').toUpperCase() + ' ' + (d.certificate || '').toUpperCase();

      // 4. Checkbox Certifications (AAA, RFA, CAFE)
      if (selectedCertTypes.length > 0) {
        if (!selectedCertTypes.some(type => certText.includes(type.toUpperCase()))) return false;
      }

      // 5. Kenyacof Supply Chain (SKL)
      if (selectedSKL && !certText.includes('SKL')) return false;

      return true;
    });
  }, [rawData, filterStatus, dateStart, dateEnd, selectedSeasons, selectedStrategies, selectedGrades, selectedCounties, selectedCooperatives, selectedWetmills, selectedCertifications, selectedBuyers, selectedCertTypes, selectedSKL]);


  const handleDownloadCSV = () => {
    if (!filteredData || filteredData.length === 0) {
      showToast('No data available to download based on current filters.', 'error');
      return;
    }

    // Capture all headers from the first filtered object
    const baseHeaders = Object.keys(filteredData[0]);
    // Append our dynamically calculated 'differential' column
    const headers = [...baseHeaders, 'differential'];

    const csvRows = filteredData.map(row => {
      // Calculate the differential for this specific row
      const diff = getPrice(row, 'differential');
      
      return headers.map(header => {
        let val = header === 'differential' 
          ? (diff !== null ? Number(diff).toFixed(2) : '') 
          : row[header];

        // Format and escape CSV values
        if (val === null || val === undefined) val = '';
        let str = String(val);
        // Escape quotes by doubling them
        str = str.replace(/"/g, '""');
        // Wrap in quotes if it contains commas, newlines, or quotes
        if (str.search(/("|,|\n)/g) >= 0) str = `"${str}"`;
        return str;
      }).join(',');
    });

    const csvString = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Kenyan_Auction_Data_${dateStr}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // --- KPIs ---
  const kpis = useMemo(() => {
    let totalVol = 0;
    let certVol = 0;
    let fobbingSum = 0;
    let hedgeSum = 0;
    let weightForAvgs = 0;

    let aaaVol = 0;
    let rfaVol = 0;
    let cafeVol = 0;
    let sklVol = 0;

    filteredData.forEach(d => {
      const w = parseFloat(d.weight) || 0;
      const scaledW = w * weightMultiplier;
      totalVol += w;
      
      const certText = (d.certification || '').toUpperCase() + ' ' + (d.certificate || '').toUpperCase();

      if (d.certification || d.certificate) certVol += w;
      
      if (certText.includes('AAA')) aaaVol += scaledW;
      if (certText.includes('RFA')) rfaVol += scaledW;
      if (certText.includes('CAFE')) cafeVol += scaledW;
      if (certText.includes('SKL')) sklVol += scaledW;

      const fob = parseFloat(d.fobbing);
      const hedge = parseFloat(d.hedge_level);
      
      if (!isNaN(fob) && !isNaN(hedge) && w > 0) {
        fobbingSum += (fob * w);
        hedgeSum += (hedge * w);
        weightForAvgs += w;
      }
    });

    return {
      totalVolume: totalVol * weightMultiplier,
      certifiedVolume: certVol * weightMultiplier,
      aaaVol, rfaVol, cafeVol, sklVol,
      avgFobbing: weightForAvgs > 0 ? fobbingSum / weightForAvgs : 0,
      avgHedge: weightForAvgs > 0 ? hedgeSum / weightForAvgs : 0
    };
  }, [filteredData, weightMultiplier]);

  const certChartData = [
    { name: 'AAA', value: kpis.aaaVol },
    { name: 'RFA', value: kpis.rfaVol },
    { name: 'CAFE', value: kpis.cafeVol }
  ];

  // Volume Chart Data
  const { volumeData, volumeKeys } = useMemo(() => {
    const grouped: any = {};
    const keys = new Set<string>();

    filteredData.forEach(d => {
      if (!grouped[d.sale_number]) grouped[d.sale_number] = { sale_number: d.sale_number, total: 0 };
      const w = (parseFloat(d.weight) || 0) * weightMultiplier;
      grouped[d.sale_number].total += w;

      if (volumeStack !== 'none') {
        const stackVal = d[volumeStack === 'county' ? 'region' : volumeStack] || 'Unknown';
        grouped[d.sale_number][stackVal] = (grouped[d.sale_number][stackVal] || 0) + w;
        keys.add(stackVal);
      }
    });

    const data = Object.values(grouped).sort((a: any, b: any) => String(a.sale_number).localeCompare(String(b.sale_number)));
    return { volumeData: data, volumeKeys: Array.from(keys) };
  }, [filteredData, volumeStack, weightMultiplier]);

  // Price Chart Data
  const { priceData, priceKeys } = useMemo(() => {
    const grouped: any = {};
    const keys = new Set<string>();
    const stackField = priceStack === 'none' ? 'strategy' : priceStack === 'county' ? 'region' : priceStack;

    filteredData.forEach(d => {
      if (!grouped[d.sale_number]) grouped[d.sale_number] = { sale_number: d.sale_number, _hedgeSum: 0, _hedgeWeight: 0 };
      
      const val = getPrice(d, priceMetric);
      const w = parseFloat(d.weight) || 0; 
      const hedge = parseFloat(d.hedge_level);
      const key = d[stackField] || 'Unknown';

      if (w > 0) {
        if (!isNaN(hedge)) {
          grouped[d.sale_number]._hedgeSum += (hedge * w);
          grouped[d.sale_number]._hedgeWeight += w;
        }

        if (val !== null) {
          if (!grouped[d.sale_number][key]) grouped[d.sale_number][key] = { sum: 0, weight: 0 };
          grouped[d.sale_number][key].sum += (val * w);
          grouped[d.sale_number][key].weight += w;
          keys.add(key);
        }
      }
    });

    const data = Object.values(grouped).map((saleGroup: any) => {
      const result: any = { sale_number: saleGroup.sale_number };
      if (saleGroup._hedgeWeight > 0) result.avg_hedge = saleGroup._hedgeSum / saleGroup._hedgeWeight;

      Object.keys(saleGroup).forEach(k => {
        if (k !== 'sale_number' && !k.startsWith('_')) result[k] = saleGroup[k].sum / saleGroup[k].weight;
      });
      return result;
    }).sort((a: any, b: any) => String(a.sale_number).localeCompare(String(b.sale_number)));

    return { priceData: data, priceKeys: Array.from(keys) };
  }, [filteredData, priceMetric, priceStack]);

  // Box Plot Data
  const boxData = useMemo(() => {
    const grouped: any = {};
    filteredData.forEach(d => {
      const groupVal = d[distGroupBy] || 'Unknown';
      const val = getPrice(d, distMetric);
      if (val !== null) {
        if (!grouped[groupVal]) grouped[groupVal] = [];
        grouped[groupVal].push(val);
      }
    });

    return Object.keys(grouped).map(key => {
      const arr = grouped[key].sort((a: number, b: number) => a - b);
      if (arr.length === 0) return null;
      return {
        category: key,
        min: arr[0],
        max: arr[arr.length - 1],
        q1: quantile(arr, 0.25),
        median: quantile(arr, 0.5),
        q3: quantile(arr, 0.75)
      };
    }).filter(Boolean).sort((a: any, b: any) => b.median - a.median);
  }, [filteredData, distMetric, distGroupBy]);


  // --- RENDER HELPERS ---
  const formatNum = (num: number) => num.toLocaleString('en-US', { maximumFractionDigits: 2 });

  const renderCustomLegend = (payload: any[], hiddenSet: Set<string>, setHiddenState: Function, allKeys: string[]) => {
    return (
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1 px-4" style={{ userSelect: 'none' }}>
        {payload.map((entry: any, index: number) => (
          <div 
            key={`item-${index}`} 
            className={`cursor-pointer flex items-center gap-1.5 text-[10px] font-medium transition-opacity ${hiddenSet.has(entry.value) ? 'opacity-40 line-through' : 'opacity-100 hover:opacity-80'}`}
            onClick={(e) => {
              const newSet = new Set(hiddenSet);
              if (newSet.has(entry.value)) newSet.delete(entry.value);
              else newSet.add(entry.value);
              setHiddenState(newSet);
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (hiddenSet.size === allKeys.length - 1 && !hiddenSet.has(entry.value)) {
                setHiddenState(new Set());
              } else {
                setHiddenState(new Set(allKeys.filter(k => k !== entry.value)));
              }
            }}
          >
            {entry.dataKey === 'avg_hedge' ? (
              <span className="w-3 h-[2px] border-b-2 border-dashed border-[#4A4941] block"></span>
            ) : (
              <span className="w-2.5 h-2.5 rounded-sm shadow-sm block" style={{ backgroundColor: entry.color }}></span>
            )}
            <span className="text-[#4A4941]">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-sm p-3 border border-[#D1CEC3] shadow-lg rounded-xl text-xs z-50">
          <p className="font-bold text-[#4A4941] mb-2 border-b border-[#EBE7DC] pb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex justify-between gap-4 py-0.5">
              <span style={{ color: entry.color }} className="font-semibold truncate max-w-[150px]">{entry.name}:</span>
              <span className="font-bold">{formatNum(entry.value)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const BoxTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-sm p-3 border border-[#D1CEC3] shadow-lg rounded-xl text-xs z-50">
          <p className="font-bold text-[#4A4941] mb-2 border-b border-[#EBE7DC] pb-1">{label}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-[#8B8A81]">Max:</span> <span className="font-bold text-right">{formatNum(data.max)}</span>
            <span className="text-[#8B8A81]">75th (Q3):</span> <span className="font-bold text-right">{formatNum(data.q3)}</span>
            <span className="text-[#0d9488] font-bold">Median:</span> <span className="font-bold text-right text-[#0d9488]">{formatNum(data.median)}</span>
            <span className="text-[#8B8A81]">25th (Q1):</span> <span className="font-bold text-right">{formatNum(data.q1)}</span>
            <span className="text-[#8B8A81]">Min:</span> <span className="font-bold text-right">{formatNum(data.min)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-[#f3f4f6]">
      <Activity className="w-10 h-10 animate-spin text-[#0d9488]" />
    </div>
  );

  return (
    <div className="relative h-screen flex overflow-hidden bg-[#f3f4f6] font-['Poppins'] text-[#374151]">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Poppins', sans-serif; margin: 0; padding: 0; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #D1CEC3; border-radius: 4px; }
      `}</style>

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 p-4 rounded-xl shadow-2xl z-[100] font-bold text-sm flex items-center gap-3 animate-in slide-in-from-bottom-5 fade-in duration-300 ${toast.type === 'success' ? 'bg-[#0d9488] text-white' : 'bg-red-500 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <X className="w-5 h-5" />}
          {toast.message}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative overflow-hidden">
             
             {isUploading ? (
               <div className="flex flex-col items-center justify-center py-8">
                 <Activity className="w-12 h-12 text-[#0d9488] animate-spin mb-4" />
                 <p className="font-bold text-gray-700">Uploading Purchases...</p>
                 <p className="text-xs text-gray-500 mt-2 text-center">Processing CSV and updating database records.</p>
               </div>
             ) : (
               <>
                 <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800">
                    <Upload className="w-5 h-5 text-[#0d9488]" /> Upload Purchases
                 </h3>
                 
                 <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Sale Number</label>
                 <input 
                    type="text" 
                    placeholder="e.g. 1"
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[#0d9488] focus:border-[#0d9488] transition-colors" 
                    value={uploadSaleNum} 
                    onChange={e => setUploadSaleNum(e.target.value)} 
                 />
                 
                 <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">CSV File</label>
                 <input 
                    type="file" 
                    accept=".csv" 
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full border border-gray-300 rounded-lg p-1.5 mb-6 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#ccfbf1] file:text-[#0f766e] hover:file:bg-[#99f6e4] transition-all cursor-pointer" 
                 />
                 
                 <div className="flex justify-end gap-2">
                   <button 
                      className="px-4 py-2 text-xs font-bold text-gray-600 rounded-lg hover:bg-gray-100 transition-colors" 
                      onClick={() => {
                        setShowUploadModal(false);
                        setUploadSaleNum('');
                        setUploadFile(null);
                      }}
                   >
                      Cancel
                   </button>
                   <button 
                      className="px-4 py-2 text-xs font-bold rounded-lg bg-[#0d9488] text-white hover:bg-[#0f766e] shadow-md transition-colors disabled:opacity-50"
                      onClick={handleUploadPurchases}
                      disabled={!uploadSaleNum.trim() || !uploadFile}
                   >
                      Upload File
                   </button>
                 </div>
               </>
             )}

           </div>
        </div>
      )}

      {/* FILTER SIDEBAR (SLIDE-IN) */}
      <aside className={`fixed inset-y-0 right-0 w-80 bg-[#f9fafb] border-l border-gray-200 shadow-2xl z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Filter className="w-4 h-4 text-[#0d9488]" /> Data Filters</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          
          {/* Status Filter */}
          <div className="mb-5">
            <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Lot Status</label>
            <div className="grid grid-cols-2 gap-1.5">
               {['all', 'confirmed', 'withdrawn', 'floor'].map(s => (
                  <button 
                    key={s} onClick={() => setFilterStatus(s)} 
                    className={`py-1.5 px-2 rounded-md text-[11px] font-bold capitalize transition-all border ${filterStatus === s ? 'bg-[#0d9488] border-[#0d9488] text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                     {s}
                  </button>
               ))}
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="mb-5">
            <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Date Range</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[9px] text-gray-400 block mb-0.5">Start</span>
                <input type="date" className="w-full text-[11px] font-medium p-1.5 border border-gray-300 rounded focus:ring-[#0d9488] focus:border-[#0d9488]" value={dateStart} onChange={e => setDateStart(e.target.value)} />
              </div>
              <div>
                <span className="text-[9px] text-gray-400 block mb-0.5">End</span>
                <input type="date" className="w-full text-[11px] font-medium p-1.5 border border-gray-300 rounded focus:ring-[#0d9488] focus:border-[#0d9488]" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
              </div>
            </div>
          </div>

          <hr className="border-gray-200 my-5" />

          {/* Core Multi-Selects */}
          <MultiSelect label="Seasons" placeholder="Search seasons..." options={filterOptions.seasons} selected={selectedSeasons} onChange={setSelectedSeasons} />
          <MultiSelect label="Strategy" placeholder="Search strategy..." options={filterOptions.strategies} selected={selectedStrategies} onChange={setSelectedStrategies} />
          <MultiSelect label="Buyer" placeholder="Search buyers..." options={filterOptions.buyers} selected={selectedBuyers} onChange={setSelectedBuyers} />
          <MultiSelect label="Grade" placeholder="Search grades..." options={filterOptions.grades} selected={selectedGrades} onChange={setSelectedGrades} />
          <MultiSelect label="County" placeholder="Search counties..." options={filterOptions.counties} selected={selectedCounties} onChange={setSelectedCounties} />
          <MultiSelect label="Cooperative" placeholder="Search cooperatives..." options={filterOptions.cooperatives} selected={selectedCooperatives} onChange={setSelectedCooperatives} />
          <MultiSelect label="Wetmill" placeholder="Search wetmills..." options={filterOptions.wetmills} selected={selectedWetmills} onChange={setSelectedWetmills} />
          <MultiSelect label="Certification (General)" placeholder="Search certifications..." options={filterOptions.certifications} selected={selectedCertifications} onChange={setSelectedCertifications} />

          <hr className="border-gray-200 my-5" />

          {/* Specific Cert Checkboxes */}
          <div className="mb-4">
            <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Certification Types</label>
            <div className="flex flex-col gap-2">
              {['AAA', 'RFA', 'CAFE'].map(cert => (
                 <label key={cert} className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="w-3.5 h-3.5 text-[#0d9488] border-gray-300 rounded focus:ring-[#0d9488]"
                      checked={selectedCertTypes.includes(cert)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedCertTypes([...selectedCertTypes, cert]);
                        else setSelectedCertTypes(selectedCertTypes.filter(c => c !== cert));
                      }}
                    />
                    <span className="text-xs font-bold text-gray-700">{cert} Certified</span>
                 </label>
              ))}
            </div>
          </div>

          {/* SKL Filter */}
          <div className="mb-6">
            <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Kenyacof Supply Chain</label>
            <label className="flex items-center gap-2 cursor-pointer">
               <input 
                 type="checkbox" 
                 className="w-3.5 h-3.5 text-[#0d9488] border-gray-300 rounded focus:ring-[#0d9488]"
                 checked={selectedSKL}
                 onChange={(e) => setSelectedSKL(e.target.checked)}
               />
               <span className="text-xs font-bold text-gray-700">SKL Certified Only</span>
            </label>
          </div>

        </div>
        
        {/* Sidebar Footer */}
        <div className="p-4 border-t border-gray-200 bg-white shrink-0">
           <button 
             onClick={() => {
               setFilterStatus('all'); setDateStart(''); setDateEnd('');
               setSelectedStrategies([]); setSelectedGrades([]); setSelectedCounties([]);
               setSelectedCooperatives([]); setSelectedWetmills([]); setSelectedCertifications([]); setSelectedCertTypes([]);
               setSelectedBuyers([]); setSelectedSKL(false);
               if (filterOptions.seasons.length > 0) setSelectedSeasons([filterOptions.seasons[0]]);
             }}
             className="w-full py-2 bg-gray-100 text-gray-600 font-bold text-xs rounded-lg hover:bg-gray-200 transition-colors"
           >
             Clear All Filters
           </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header */}
        <div className="p-3 md:p-4 shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border-b border-gray-200 z-10">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 leading-tight">Kenyan Coffee Auction Dashboard</h1>
            <p className="text-gray-500 text-xs mt-0.5">Interactive analysis of transaction history</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Upload Button */}
            <button 
              onClick={() => setShowUploadModal(true)}
              className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-[#0d9488]" /> Upload Confirmed Purchases
            </button>

            {/* Download Button */}
            <button 
              onClick={handleDownloadCSV}
              className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#0d9488]" /> Download Data
            </button>

            {/* Unit Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1 shadow-inner border border-gray-200">
              {['Kilos', 'MT', 'Bags'].map(u => (
                <button
                  key={u}
                  className={`px-3 py-1 text-[11px] font-bold rounded-md transition-colors ${unit === u ? 'bg-[#D97706] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}
                  onClick={() => setUnit(u)}
                >
                  {u}
                </button>
              ))}
            </div>

            {/* Filters Sidebar Toggle */}
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Filter className="w-3.5 h-3.5 text-[#0d9488]" /> Filters
            </button>

            {/* Tab Toggles */}
            <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200 hidden sm:flex">
              <button 
                className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-colors ${activeTab === 'season' ? 'bg-[#0d9488] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
                onClick={() => setActiveTab('season')}
              >
                Season Analysis
              </button>
              <button 
                className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-colors ${activeTab === 'auction' ? 'bg-[#0d9488] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
                onClick={() => setActiveTab('auction')}
              >
                Auction Analysis
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Content */}
        {activeTab === 'auction' ? (
          <div className="flex-1 flex flex-col min-h-0 p-3 md:p-4 gap-3 animate-in fade-in duration-300 overflow-y-auto custom-scrollbar">
            
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0 min-h-[110px]">
              
              <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-[#0d9488] flex flex-col justify-center">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <BoxSelect className="w-3.5 h-3.5" /> Total Volume
                </h3>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-gray-800">{formatNum(kpis.totalVolume)}</span>
                  <span className="text-[10px] font-bold text-gray-500">{unit}</span>
                </div>
              </div>

              {/* Certified Volume Card */}
              <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-[#D97706] flex flex-col justify-between">
                
                {/* Header Row with Badges */}
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Certified Volume
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {/* SKL Volume Badge */}
                    <div className="text-[9px] font-bold text-[#0d9488] bg-[#0d9488]/10 px-1.5 py-0.5 rounded">
                      SKL: {formatNum(kpis.sklVol || 0)}
                    </div>
                    {/* Percentage Badge */}
                    <div className="text-[9px] font-bold text-[#D97706] bg-[#D97706]/10 px-1.5 py-0.5 rounded">
                      {kpis.totalVolume > 0 ? formatNum((kpis.certifiedVolume / kpis.totalVolume) * 100) : 0}%
                    </div>
                  </div>
                </div>

                {/* Main Volume Number */}
                <div className="flex items-baseline gap-1.5 mb-1.5">
                  <span className="text-xl font-black text-gray-800 leading-none">{formatNum(kpis.certifiedVolume)}</span>
                  <span className="text-[9px] font-bold text-gray-500">{unit}</span>
                </div>

                {/* Specific Certs Bar Chart */}
                <div className="h-10 w-full mt-auto">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={certChartData} layout="vertical" margin={{ top: 0, right: 35, left: -25, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 8, fill: '#8B8A81', fontWeight: 'bold'}} width={40} />
                        <Bar dataKey="value" fill="#14B8A6" radius={[0, 2, 2, 0]} barSize={6}>
                          <LabelList dataKey="value" position="right" formatter={(v: number) => v > 0 ? formatNum(v) : ''} style={{ fontSize: '8px', fill: '#4A4941', fontWeight: 'bold' }} />
                        </Bar>
                      </BarChart>
                   </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#0d9488] p-3 rounded-xl shadow-sm border border-[#0f766e] text-white flex flex-col justify-center">
                <h3 className="text-[10px] font-bold text-teal-100 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> Trade Averages
                </h3>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-lg font-black leading-tight">{formatNum(kpis.avgFobbing)}</div>
                    <div className="text-[9px] text-teal-100 font-medium">AVG FOBBING</div>
                  </div>
                  <div className="w-[1px] h-6 bg-teal-600"></div>
                  <div className="text-right">
                    <div className="text-lg font-black leading-tight">{formatNum(kpis.avgHedge)}</div>
                    <div className="text-[9px] text-teal-100 font-medium">AVG HEDGE LEVEL</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Container */}
            <div className="flex-1 grid grid-cols-1 lg:grid-rows-3 gap-3 min-h-0">
              
              {/* Chart 1: Volume Over Time */}
              <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[220px] lg:min-h-0">
                <div className="flex flex-wrap justify-between items-center mb-1 shrink-0 gap-2">
                  <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-[#0d9488]" /> Volume Over Time
                  </h2>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Stack By:</label>
                    <select 
                      className="bg-gray-50 border border-gray-300 text-[11px] rounded flex-1 focus:ring-[#0d9488] focus:border-[#0d9488] block px-2 py-1 font-medium"
                      value={volumeStack} onChange={e => setVolumeStack(e.target.value)}
                    >
                      <option value="none">None (Trend Line)</option>
                      <option value="grade">Grade</option>
                      <option value="strategy">Strategy</option>
                      <option value="county">County</option>
                      <option value="buyer">Buyer</option>
                      <option value="certification">Certification</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex-1 min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {volumeStack === 'none' ? (
                      <LineChart data={volumeData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="sale_number" tick={{fontSize: 9}} tickLine={false} axisLine={{stroke: '#e5e7eb'}} />
                        <YAxis tick={{fontSize: 9}} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="total" name={`Total Volume (${unit})`} stroke="#0d9488" strokeWidth={2.5} dot={{r: 3, strokeWidth: 2}} activeDot={{r: 5}} />
                      </LineChart>
                    ) : (
                      <BarChart data={volumeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="sale_number" tick={{fontSize: 9}} tickLine={false} axisLine={{stroke: '#e5e7eb'}} />
                        <YAxis tick={{fontSize: 9}} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend content={(props) => renderCustomLegend(props.payload || [], hiddenVolumeSeries, setHiddenVolumeSeries, volumeKeys)} />
                        {volumeKeys.map((key, i) => (
                          <Bar 
                            key={key} 
                            dataKey={key} 
                            stackId="a" 
                            fill={COLORS[i % COLORS.length]} 
                            hide={hiddenVolumeSeries.has(key)}
                            maxBarSize={50}
                          />
                        ))}
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Price Over Time */}
              <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[220px] lg:min-h-0">
                <div className="flex flex-wrap justify-between items-center mb-1 shrink-0 gap-2">
                  <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-[#D97706]" /> Price Trend 
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Metric:</label>
                      <select 
                        className="bg-gray-50 border border-gray-300 text-[11px] rounded focus:ring-[#0d9488] focus:border-[#0d9488] block px-2 py-1 font-medium"
                        value={priceMetric} onChange={e => setPriceMetric(e.target.value)}
                      >
                        <option value="confirmed_price">Confirmed Price</option>
                        <option value="floor_price">Floor Price</option>
                        <option value="confirmed_price_usc">Confirmed Price (USc/lb)</option>
                        <option value="differential">Differential (USc/lb)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Compare By:</label>
                      <select 
                        className="bg-gray-50 border border-gray-300 text-[11px] rounded focus:ring-[#0d9488] focus:border-[#0d9488] block px-2 py-1 font-medium"
                        value={priceStack} onChange={e => setPriceStack(e.target.value)}
                      >
                        <option value="none">Strategy (Default)</option>
                        <option value="grade">Grade</option>
                        <option value="buyer">Buyer</option>
                        <option value="county">County</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={priceData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="sale_number" tick={{fontSize: 9}} tickLine={false} axisLine={{stroke: '#e5e7eb'}} />
                      <YAxis yAxisId="left" tick={{fontSize: 9}} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                      <YAxis yAxisId="right" orientation="right" tick={{fontSize: 9}} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                      
                      <Tooltip content={<CustomTooltip />} />
                      <Legend content={(props) => renderCustomLegend(props.payload || [], hiddenPriceSeries, setHiddenPriceSeries, priceKeys)} />
                      
                      <Line 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="avg_hedge" 
                        name="Avg Hedge Level" 
                        stroke="#4A4941" 
                        strokeWidth={2.5} 
                        strokeDasharray="6 6" 
                        dot={false}
                        activeDot={{r: 4, fill: '#4A4941'}} 
                      />

                      {priceKeys.map((key, i) => (
                        <Line 
                          yAxisId="left"
                          key={key} type="monotone" dataKey={key} 
                          stroke={COLORS[i % COLORS.length]} strokeWidth={2} 
                          dot={{r: 2.5}} activeDot={{r: 4}}
                          hide={hiddenPriceSeries.has(key)}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 3: Price Distribution (Box Plot) */}
              <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[220px] lg:min-h-0">
                <div className="flex flex-wrap justify-between items-center mb-1 shrink-0 gap-2">
                  <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#3B82F6]" /> Price Distribution
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Metric:</label>
                      <select 
                        className="bg-gray-50 border border-gray-300 text-[11px] rounded focus:ring-[#0d9488] focus:border-[#0d9488] block px-2 py-1 font-medium"
                        value={distMetric} onChange={e => setDistMetric(e.target.value)}
                      >
                        <option value="confirmed_price">Confirmed Price</option>
                        <option value="floor_price">Floor Price</option>
                        <option value="confirmed_price_usc">Confirmed Price (USc/lb)</option>
                        <option value="differential">Differential (USc/lb)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Group By:</label>
                      <select 
                        className="bg-gray-50 border border-gray-300 text-[11px] rounded focus:ring-[#0d9488] focus:border-[#0d9488] block px-2 py-1 font-medium"
                        value={distGroupBy} onChange={e => setDistGroupBy(e.target.value)}
                      >
                        <option value="strategy">Strategy</option>
                        <option value="grade">Grade</option>
                        <option value="buyer">Buyer</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 min-h-0 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={boxData} margin={{ top: 15, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="category" tick={{fontSize: 9}} tickLine={false} axisLine={{stroke: '#e5e7eb'}} />
                      <YAxis tick={{fontSize: 9}} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                      <Tooltip content={<BoxTooltip />} cursor={{fill: '#f3f4f6', opacity: 0.5}} />
                      <Bar dataKey={(data) => [data.min, data.max]} shape={<BoxPlotShape />} maxBarSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                  {boxData.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className="text-gray-400 font-medium text-xs">No valid distribution data to display.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-white m-3 md:m-4 rounded-xl shadow-sm border border-gray-200">
             <Layers className="w-12 h-12 text-gray-300 mb-3" />
             <h2 className="text-xl font-bold text-gray-700">Season Analysis</h2>
             <p className="text-gray-500 mt-1.5 text-sm text-center max-w-md">The season analysis module is currently under construction. Please switch back to the Auction Analysis tab to view the data.</p>
             <button 
                className="mt-4 px-5 py-1.5 bg-[#0d9488] text-white text-sm font-bold rounded-lg hover:bg-[#0f766e] transition-colors"
                onClick={() => setActiveTab('auction')}
              >
                Back to Auction Analysis
              </button>
          </div>
        )}
      </div>

      {isSidebarOpen && (
         <div 
           className="fixed inset-0 bg-black/10 z-40 lg:hidden" 
           onClick={() => setIsSidebarOpen(false)}
         />
      )}

    </div>
  );
}