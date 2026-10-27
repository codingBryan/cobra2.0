"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, LabelList
} from 'recharts';
import { Activity, BarChart3, Filter, BoxSelect, DollarSign, Layers, CheckCircle2, X, Upload, Download, Users, TrendingUp } from 'lucide-react';

const COLORS = [
  '#0d9488', '#D97706', '#3B82F6', '#8B5CF6', '#EC4899', 
  '#10B981', '#F59E0B', '#14B8A6', '#6366F1', '#F43F5E',
  '#84CC16', '#64748B', '#0EA5E9', '#D946EF', '#1E40AF'
];

const MAJOR_BUYERS = ['Kenyacof', 'Ibero', 'LDC', 'Taylor Winch', 'C. Dorman', 'Sasini'];

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

// Bar shape for projection charts: solid for historical sales, hatched/translucent for projected ones.
// Recharts forwards the Bar's own `fill` into the shape's props, so no extra plumbing is needed.
const ProjectedBarShape = (props: any) => {
  const { x, y, width, height, payload, fill } = props;
  const isProjected = !!payload?._isProjected;
  return <rect x={x} y={y} width={width} height={Math.max(0, height)} fill={fill} fillOpacity={isProjected ? 0.35 : 1} stroke={isProjected ? fill : 'none'} strokeWidth={isProjected ? 1.5 : 0} strokeDasharray={isProjected ? '3 2' : undefined} />;
};

function quantile(arr: number[], q: number) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

// Simple ordinary-least-squares line of best fit, used to project grade volumes/prices forward.
function linearRegression(points: { x: number, y: number }[]) {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  points.forEach(p => { sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumXX += p.x * p.x; });
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

const PROJECTION_HORIZON = 2;

// A tightly-padded [min, max] domain for a numeric axis, computed straight from the actual finite
// values present across the given keys. Using this instead of Recharts' 'auto' avoids the axis
// occasionally "nice-rounding" itself into a much wider range than the data (which reads as the
// line looking flattened/stretched) — most noticeable on charts with very few data points.
function getPaddedDomain(data: any[], keys: string[]): [number, number] {
  let min = Infinity, max = -Infinity;
  data.forEach(row => {
    keys.forEach(k => {
      const v = row[k];
      if (typeof v === 'number' && isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    });
  });
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

// Multiple OLS regression y = b0 + b1*x1 + b2*x2 (via the 3x3 normal-equations, solved with Cramer's rule).
// Used to project a grade's price/differential from BOTH the sale index and its volume, since the two move together.
function multiLinearRegression(points: { x1: number, x2: number, y: number }[]) {
  const n = points.length;
  if (n < 3) return null;
  let sX1 = 0, sX2 = 0, sY = 0, sX1X1 = 0, sX2X2 = 0, sX1X2 = 0, sX1Y = 0, sX2Y = 0;
  points.forEach(p => {
    sX1 += p.x1; sX2 += p.x2; sY += p.y;
    sX1X1 += p.x1 * p.x1; sX2X2 += p.x2 * p.x2; sX1X2 += p.x1 * p.x2;
    sX1Y += p.x1 * p.y; sX2Y += p.x2 * p.y;
  });
  const A = [[n, sX1, sX2], [sX1, sX1X1, sX1X2], [sX2, sX1X2, sX2X2]];
  const B = [sY, sX1Y, sX2Y];
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(A);
  if (Math.abs(D) < 1e-9) return null;
  const withCol = (col: number) => A.map((row, i) => row.map((v, j) => j === col ? B[i] : v));
  return { intercept: det3(withCol(0)) / D, slopeSale: det3(withCol(1)) / D, slopeVolume: det3(withCol(2)) / D };
}

// Reusable MultiSelect Component. `badgeLayout` controls where selected-item badges go:
// 'wrap' (default) — above the input, wrapping to multiple rows.
// 'row' — above the input, on one horizontally-scrollable line.
// 'side' — to the right of the input, stacked vertically in a scrollable column.
const MultiSelect = ({ label, options, selected, onChange, placeholder, badgeLayout = 'wrap' }: any) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Options aren't always strings (e.g. sale numbers can come through as numbers), so coerce before
  // doing string operations on them.
  const filteredOptions = options.filter((o: any) => !selected.includes(o) && String(o).toLowerCase().includes(search.toLowerCase()));

  const badgeContainerClass = badgeLayout === 'side'
    ? 'flex flex-col gap-1.5 max-h-[76px] overflow-y-auto custom-scrollbar shrink-0 w-28'
    : badgeLayout === 'row'
      ? 'flex flex-nowrap overflow-x-auto gap-1.5 mb-2 custom-scrollbar pb-1'
      : 'flex flex-wrap gap-1.5 mb-2';

  const badges = selected.length > 0 && (
    <div className={badgeContainerClass}>
      {selected.map((sel: any) => (
        <span key={sel} className={`inline-flex items-center gap-1 bg-[#ccfbf1] text-[#0f766e] px-2 py-0.5 rounded-md text-[10px] font-bold border border-[#0d9488]/20 shadow-sm max-w-full ${badgeLayout !== 'wrap' ? 'shrink-0' : ''}`}>
          <span className="truncate">{sel}</span>
          <X className="w-3 h-3 cursor-pointer shrink-0 hover:text-red-600 transition-colors" onClick={() => onChange(selected.filter((s: any) => s !== sel))} />
        </span>
      ))}
    </div>
  );

  const inputAndDropdown = (
    <div className="relative flex-1 min-w-0">
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
           {filteredOptions.map((opt: any) => (
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

  return (
    <div className={badgeLayout === 'side' ? '' : 'mb-4'}>
      {label && <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">{label}</label>}
      {badgeLayout === 'side' ? (
        <div className="flex gap-2 items-start">
          {inputAndDropdown}
          {badges}
        </div>
      ) : (
        <>
          {badges}
          {inputAndDropdown}
        </>
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
  const [groupMinorBuyers, setGroupMinorBuyers] = useState(true);

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
  const [availableSeasons, setAvailableSeasons] = useState<string[]>([]);
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
  const [volumeStack, setVolumeStack] = useState('buyer'); 
  const [priceStack, setPriceStack] = useState('none'); 
  const [priceMetric, setPriceMetric] = useState('price'); 
  const [distMetric, setDistMetric] = useState('price');
  const [distGroupBy, setDistGroupBy] = useState('strategy');

  // Legend Visibility State
  const [hiddenVolumeSeries, setHiddenVolumeSeries] = useState<Set<string>>(new Set());
  const [hiddenPriceSeries, setHiddenPriceSeries] = useState<Set<string>>(new Set());

  // Season Analysis Tab Controls
  const [seasonAnalysisSeason, setSeasonAnalysisSeason] = useState('');
  const [seasonAnalysisSales, setSeasonAnalysisSales] = useState<string[]>([]);
  const [projectionMetric, setProjectionMetric] = useState('price');
  const [projectionGroupBy, setProjectionGroupBy] = useState('grade');
  const [seasonBuyers, setSeasonBuyers] = useState<string[]>([]);
  const [buyerPriceMetric, setBuyerPriceMetric] = useState('price');
  const [buyerMixGroupBy, setBuyerMixGroupBy] = useState('grade');

  // Season Summary card: its own independent sale selection (defaults to the last 4 sales),
  // separate from the Grade Projections / Buyer Deep-Dive sale picker above.
  const [summarySales, setSummarySales] = useState<string[]>([]);

  // Raw rows for the last-N-sales-regardless-of-season charts — fetched separately from the main
  // season-scoped `rawData`, since that's always limited to whichever season(s) are selected/loaded.
  const [recentSalesRawData, setRecentSalesRawData] = useState<any[]>([]);

  // Season Analysis Legend Visibility State
  const [hiddenProjectionSeries, setHiddenProjectionSeries] = useState<Set<string>>(new Set());
  const [hiddenBuyerTrendSeries, setHiddenBuyerTrendSeries] = useState<Set<string>>(new Set());
  const [hiddenBuyerMixSeries, setHiddenBuyerMixSeries] = useState<Set<string>>(new Set());
  const [hiddenSummarySeries, setHiddenSummarySeries] = useState<Set<string>>(new Set());

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchData(); // Fetch with no arguments triggers 'initial load' behavior on the backend
  }, []);

  // Season Summary's "last 4 sales" charts need rows that may fall outside whatever season(s) are
  // currently selected/loaded into `rawData` — so they're fetched separately, once, via a
  // season-independent endpoint mode (recentSales=N), and never refetched when the season filter changes.
  useEffect(() => {
    let cancelled = false;
    async function loadRecentSales() {
      try {
        // 4 displayed sales + the 3 sales before the oldest one, so every displayed point has a full rolling window
        const res = await fetch('/api/auction_analysis?recentSales=7');
        if (!cancelled && res.ok) {
          const json = await res.json();
          setRecentSalesRawData(Array.isArray(json.data) ? json.data : []);
        }
      } catch (e) {
        console.error('Failed to load recent sales', e);
      }
    }
    loadRecentSales();
    return () => { cancelled = true; };
  }, []);

  const fetchData = async (seasonsToFetch?: string[]) => {
    setLoading(true);
    try {
      // Build the URL based on whether we have active filters
      let url = '/api/auction_analysis';
      if (seasonsToFetch && seasonsToFetch.length > 0) {
        url += `?seasons=${encodeURIComponent(seasonsToFetch.join(','))}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch data');
      
      const json = await res.json();
      
      // Update Raw Data
      const data = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
      setRawData(data);

      // Update Available Seasons dynamically from the database
      if (json.availableSeasons && Array.isArray(json.availableSeasons)) {
        setAvailableSeasons(json.availableSeasons);
      }

      // Handle the first-load auto-detected season
      if (json.initialSeasonDetected && (!seasonsToFetch || seasonsToFetch.length === 0)) {
        setSelectedSeasons([json.initialSeasonDetected]);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyDataFilters = () => {
    fetchData(selectedSeasons);
    setIsSidebarOpen(false);
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
      const upload_url = process.env.NEXT_PUBLIC_COBRA_MICROSERVICE_URL + '/api/upload_confirmed_purchases'
      const response = await fetch(upload_url,{
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        showToast(result.message || 'Purchases uploaded successfully!', 'success');
        setShowUploadModal(false);
        setUploadSaleNum('');
        setUploadFile(null);
        fetchData(selectedSeasons); 
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
    // Determine the base price (Confirmed Price falling back to Floor Price)
    let basePrice = parseFloat(row.confirmed_price);
    if (isNaN(basePrice) || basePrice === null) {
      basePrice = parseFloat(row.floor_price); 
    }

    // If both are missing, return null to exclude from calculations
    if (isNaN(basePrice)) return null;

    if (metric === 'differential') {
      const fobbing = parseFloat(row.fobbing);
      const hedgeLevel = parseFloat(row.hedge_level);

      if (isNaN(fobbing) || isNaN(hedgeLevel)) return null;
      return (((basePrice + fobbing) / 50) * 100 * 0.453592) - hedgeLevel;
    }

    if (metric === 'price_usc') return basePrice / 1.1023;
    if (metric === 'price') return basePrice;

    return null;
  };

  const weightMultiplier = unit === 'MT' ? 1/1000 : unit === 'Bags' ? 1/60 : 1;

  // Filter options exclusively for local filtering (seasons uses state now)
  const filterOptions = useMemo(() => {
    const getUnique = (key: string) => Array.from(new Set(rawData.map(d => d[key]).filter(v => v && String(v).trim() !== ''))).sort();
    return {
      strategies: getUnique('strategy'),
      grades: getUnique('grade'),
      counties: getUnique('region'),
      cooperatives: getUnique('cooperative'),
      wetmills: getUnique('wetmill'),
      certifications: getUnique('certification'),
      buyers: getUnique('buyer'),
    };
  }, [rawData]);

  const filteredData = useMemo(() => {
    return rawData.filter(d => {
      if (filterStatus === 'confirmed' && (d.confirmed_price === null || isNaN(parseFloat(d.confirmed_price)))) return false;
      if (filterStatus === 'withdrawn' && (d.confirmed_price !== null && !isNaN(parseFloat(d.confirmed_price)))) return false;
      if (filterStatus === 'floor' && (d.floor_price === null || isNaN(parseFloat(d.floor_price)))) return false;

      if (d.timestamp) {
          if (dateStart && new Date(d.timestamp) < new Date(dateStart)) return false;
          if (dateEnd && new Date(d.timestamp) > new Date(dateEnd + 'T23:59:59')) return false;
      }

      // Local fallback in case user toggles a season off before hitting Apply Data Filters
      if (selectedSeasons.length > 0 && !selectedSeasons.includes(d.season)) return false;
      
      if (selectedStrategies.length > 0 && !selectedStrategies.includes(d.strategy)) return false;
      if (selectedGrades.length > 0 && !selectedGrades.includes(d.grade)) return false;
      if (selectedCounties.length > 0 && !selectedCounties.includes(d.region)) return false;
      if (selectedCooperatives.length > 0 && !selectedCooperatives.includes(d.cooperative)) return false;
      if (selectedWetmills.length > 0 && !selectedWetmills.includes(d.wetmill)) return false;
      if (selectedCertifications.length > 0 && !selectedCertifications.includes(d.certification)) return false;
      if (selectedBuyers.length > 0 && !selectedBuyers.includes(d.buyer)) return false;

      const certText = (d.certification || '').toUpperCase() + ' ' + (d.certificate || '').toUpperCase();

      if (selectedCertTypes.length > 0) {
        if (!selectedCertTypes.some(type => certText.includes(type.toUpperCase()))) return false;
      }

      if (selectedSKL && !certText.includes('SKL')) return false;

      return true;
    });
  }, [rawData, filterStatus, dateStart, dateEnd, selectedSeasons, selectedStrategies, selectedGrades, selectedCounties, selectedCooperatives, selectedWetmills, selectedCertifications, selectedBuyers, selectedCertTypes, selectedSKL]);

   const handleDownloadCSV = () => {
    if (!filteredData || filteredData.length === 0) {
      // Adjust this based on how your showToast or alert is implemented
      showToast('No data available to download based on current filters.', 'error');
      return;
    }

    // Extract all unique columns from the entire dataset, not just the first row
    const uniqueKeys = new Set<string>();
    
    // EXPLICITLY REQUIRE THESE COLUMNS TO BE INCLUDED
    uniqueKeys.add('region');
    uniqueKeys.add('grower_code');
    uniqueKeys.add('lot_id');

    filteredData.forEach(row => {
      if (row) {
        Object.keys(row).forEach(key => uniqueKeys.add(key));
      }
    });
    
    // Remove differential if it naturally occurred to avoid duplicates, we append it manually
    uniqueKeys.delete('differential');
    
    const baseHeaders = Array.from(uniqueKeys);
    const headers = [...baseHeaders, 'differential'];

    const csvRows = filteredData.map(row => {
      const diff = getPrice(row, 'differential');
      
      return headers.map(header => {
        let value;
        if (header === 'differential') {
          value = diff;
        } else {
          value = row[header];
        }
        
        // Handle null/undefined and escape commas/quotes to prevent CSV breakage
        const stringValue = value !== null && value !== undefined ? String(value) : '';
        const escapedString = stringValue.replace(/"/g, '""');
        return `"${escapedString}"`;
      }).join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'auction_data_export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const kpis = useMemo(() => {
    let totalVol = 0;
    let certVol = 0;
    let fobbingSum = 0;
    let hedgeSum = 0;
    let weightForAvgs = 0;
    let diffSum = 0;
    let weightForDiff = 0;

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

      // Differential (USc/lb) = floor_price / 1.10231 - hedge_level + fobbing, weighted by the row's weight
      const floor = parseFloat(d.floor_price);
      if (!isNaN(floor) && !isNaN(fob) && !isNaN(hedge) && w > 0) {
        diffSum += ((floor / 1.10231) - hedge + fob) * w;
        weightForDiff += w;
      }
    });

    return {
      totalVolume: totalVol * weightMultiplier,
      certifiedVolume: certVol * weightMultiplier,
      aaaVol, rfaVol, cafeVol, sklVol,
      avgFobbing: weightForAvgs > 0 ? fobbingSum / weightForAvgs : 0,
      avgHedge: weightForAvgs > 0 ? hedgeSum / weightForAvgs : 0,
      avgDifferential: weightForDiff > 0 ? diffSum / weightForDiff : null
    };
  }, [filteredData, weightMultiplier]);

  const { volumeData, volumeKeys } = useMemo(() => {
    const grouped: any = {};
    const keys = new Set<string>();

    filteredData.forEach(d => {
      if (!grouped[d.sale_number]) grouped[d.sale_number] = { sale_number: d.sale_number, total: 0 };
      const w = (parseFloat(d.weight) || 0) * weightMultiplier;
      grouped[d.sale_number].total += w;

      if (volumeStack !== 'none') {
        let stackVal = d[volumeStack === 'county' ? 'region' : volumeStack] || 'Unknown';
        
        if (volumeStack === 'buyer' && groupMinorBuyers) {
            const isMajor = MAJOR_BUYERS.some(mb => mb.toLowerCase() === String(stackVal).toLowerCase());
            if (!isMajor && stackVal !== 'Unknown') {
                stackVal = 'Others';
            } else if (isMajor) {
                stackVal = MAJOR_BUYERS.find(mb => mb.toLowerCase() === String(stackVal).toLowerCase()) || stackVal;
            }
        }
        
        grouped[d.sale_number][stackVal] = (grouped[d.sale_number][stackVal] || 0) + w;
        keys.add(stackVal);
      }
    });

    const data = Object.values(grouped).sort((a: any, b: any) => String(a.sale_number).localeCompare(String(b.sale_number), undefined, {numeric: true}));
    return { volumeData: data, volumeKeys: Array.from(keys) };
  }, [filteredData, volumeStack, groupMinorBuyers, weightMultiplier]);

  const { priceData, priceKeys } = useMemo(() => {
    const grouped: any = {};
    const keys = new Set<string>();
    const stackField = priceStack === 'none' ? 'strategy' : priceStack === 'county' ? 'region' : priceStack;

    filteredData.forEach(d => {
      if (!grouped[d.sale_number]) grouped[d.sale_number] = { sale_number: d.sale_number, _hedgeSum: 0, _hedgeWeight: 0 };
      
      const val = getPrice(d, priceMetric);
      const w = parseFloat(d.weight) || 0; 
      const hedge = parseFloat(d.hedge_level);
      let key = d[stackField] || 'Unknown';

      if (stackField === 'buyer' && groupMinorBuyers) {
          const isMajor = MAJOR_BUYERS.some(mb => mb.toLowerCase() === String(key).toLowerCase());
          if (!isMajor && key !== 'Unknown') {
              key = 'Others';
          } else if (isMajor) {
              key = MAJOR_BUYERS.find(mb => mb.toLowerCase() === String(key).toLowerCase()) || key;
          }
      }

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
    }).sort((a: any, b: any) => String(a.sale_number).localeCompare(String(b.sale_number), undefined, {numeric: true}));

    return { priceData: data, priceKeys: Array.from(keys) };
  }, [filteredData, priceMetric, priceStack, groupMinorBuyers]);

  const boxData = useMemo(() => {
    const grouped: any = {};
    filteredData.forEach(d => {
      let groupVal = d[distGroupBy] || 'Unknown';
      
      if (distGroupBy === 'buyer' && groupMinorBuyers) {
          const isMajor = MAJOR_BUYERS.some(mb => mb.toLowerCase() === String(groupVal).toLowerCase());
          if (!isMajor && groupVal !== 'Unknown') {
              groupVal = 'Others';
          } else if (isMajor) {
              groupVal = MAJOR_BUYERS.find(mb => mb.toLowerCase() === String(groupVal).toLowerCase()) || groupVal;
          }
      }

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
  }, [filteredData, distMetric, distGroupBy, groupMinorBuyers]);

  // ============================================================
  // SEASON ANALYSIS: shared helpers — everything below compares SALE TO SALE
  // within one selected season, not season to season.
  // ============================================================

  // Seasons present in the currently loaded/filtered data, chronological (string) order.
  const seasonsSorted = useMemo(() => {
    return Array.from(new Set(filteredData.map(d => d.season).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
  }, [filteredData]);

  // Default (and auto-correct) the season picker to the most recent loaded season.
  useEffect(() => {
    if (seasonsSorted.length === 0) return;
    if (!seasonAnalysisSeason || !seasonsSorted.includes(seasonAnalysisSeason)) {
      setSeasonAnalysisSeason(seasonsSorted[seasonsSorted.length - 1]);
    }
  }, [seasonsSorted, seasonAnalysisSeason]);

  // Every sale number that belongs to the selected season, in chronological order.
  const salesInSeason = useMemo(() => {
    if (!seasonAnalysisSeason) return [];
    return Array.from(new Set(
      filteredData.filter(d => d.season === seasonAnalysisSeason).map(d => d.sale_number).filter(v => v !== null && v !== undefined && String(v).trim() !== '')
    )).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }, [filteredData, seasonAnalysisSeason]);

  // Default to the last 10 sales of the selected season (most recent), and re-default whenever the season (or its sale list) changes.
  const DEFAULT_SALE_COUNT = 10;
  useEffect(() => {
    setSeasonAnalysisSales(salesInSeason.slice(-DEFAULT_SALE_COUNT));
  }, [salesInSeason]);

  // Season Summary card defaults to just the last 4 sales of the selected season.
  const DEFAULT_SUMMARY_SALE_COUNT = 4;
  useEffect(() => {
    setSummarySales(salesInSeason.slice(-DEFAULT_SUMMARY_SALE_COUNT));
  }, [salesInSeason]);

  // Default the Buyer Deep-Dive to Kenyacof, once, as soon as it's available in the buyer list.
  const buyerDefaultApplied = useRef(false);
  useEffect(() => {
    if (buyerDefaultApplied.current) return;
    const match = filterOptions.buyers.find((b: string) => String(b).toLowerCase() === 'kenyacof');
    if (match) {
      setSeasonBuyers([match]);
      buyerDefaultApplied.current = true;
    }
  }, [filterOptions.buyers]);

  // Whichever sales are actually selected, kept in chronological order for the x-axis.
  const saleAxis = useMemo(() => salesInSeason.filter(s => seasonAnalysisSales.includes(s)), [salesInSeason, seasonAnalysisSales]);

  // The working dataset for every chart/table below: selected season, selected sales only.
  const saleScopedData = useMemo(() => {
    if (!seasonAnalysisSeason || seasonAnalysisSales.length === 0) return [];
    const saleSet = new Set(seasonAnalysisSales);
    return filteredData.filter(d => d.season === seasonAnalysisSeason && saleSet.has(d.sale_number));
  }, [filteredData, seasonAnalysisSeason, seasonAnalysisSales]);

  // Dataset for the Season Summary card only: selected season, its own (independently selectable) sales.
  const summaryScopedData = useMemo(() => {
    if (!seasonAnalysisSeason || summarySales.length === 0) return [];
    const saleSet = new Set(summarySales);
    return filteredData.filter(d => d.season === seasonAnalysisSeason && saleSet.has(d.sale_number));
  }, [filteredData, seasonAnalysisSeason, summarySales]);

  // Weighted-average price/differential and cumulative volume, grouped by `field` ('grade' or
  // 'strategy'), across summaryScopedData. Sorted by volume descending.
  const buildWeightedSummary = (rows: any[], field: string) => {
    const byKey: Record<string, { volume: number; priceSum: number; priceWeight: number; diffSum: number; diffWeight: number }> = {};
    let totalVolume = 0;
    rows.forEach(d => {
      const key = d[field];
      if (!key) return;
      const w = parseFloat(d.weight) || 0;
      if (w <= 0) return;
      const scaledW = w * weightMultiplier;
      if (!byKey[key]) byKey[key] = { volume: 0, priceSum: 0, priceWeight: 0, diffSum: 0, diffWeight: 0 };
      byKey[key].volume += scaledW;
      totalVolume += scaledW;

      const price = getPrice(d, 'price');
      if (price !== null) {
        byKey[key].priceSum += price * w;
        byKey[key].priceWeight += w;
      }
      const diff = getPrice(d, 'differential');
      if (diff !== null) {
        byKey[key].diffSum += diff * w;
        byKey[key].diffWeight += w;
      }
    });

    return Object.entries(byKey)
      .map(([key, v]) => ({
        key,
        volume: v.volume,
        pctOfTotal: totalVolume > 0 ? (v.volume / totalVolume) * 100 : 0,
        avgPrice: v.priceWeight > 0 ? v.priceSum / v.priceWeight : null,
        avgDifferential: v.diffWeight > 0 ? v.diffSum / v.diffWeight : null,
      }))
      .sort((a, b) => b.volume - a.volume);
  };

  const summaryByStrategy = useMemo(() => buildWeightedSummary(summaryScopedData, 'strategy'), [summaryScopedData, weightMultiplier]);

  const rankByVolume = (rows: any[], field: string, topN: number) => {
    const totals: Record<string, number> = {};
    rows.forEach(d => {
      const key = d[field];
      if (!key) return;
      const w = (parseFloat(d.weight) || 0) * weightMultiplier;
      totals[key] = (totals[key] || 0) + w;
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k]) => k);
  };

  // --- Season Summary charts: strategy volume & differential over the last 4 sales REGARDLESS of
  // season — sourced from recentSalesRawData (fetched via ?recentSales=4), which is completely
  // independent of the sidebar's season filter / whatever season(s) are loaded into rawData. ---
  const GLOBAL_LAST_SALES_COUNT = 4;
  // Each displayed point accumulates its own sale plus the (WINDOW - 1) sales before it.
  const ROLLING_WINDOW_SALES = 4;

  // recentSalesRawData holds the last GLOBAL_LAST_SALES_COUNT + (ROLLING_WINDOW_SALES - 1) sales
  // (server-side); this works out their chronological order and axis labels.
  const recentSalesChrono = useMemo(() => {
    const bySale = new Map<string, { key: string; label: string; ts: number }>();
    recentSalesRawData.forEach(d => {
      if (d.sale_number === null || d.sale_number === undefined || String(d.sale_number).trim() === '') return;
      const key = `${d.season}|${d.sale_number}`;
      const ts = new Date(d.timestamp).getTime();
      const existing = bySale.get(key);
      if (!existing) {
        bySale.set(key, { key, label: `${d.season} S${d.sale_number}`, ts: isFinite(ts) ? ts : Infinity });
      } else if (isFinite(ts) && ts < existing.ts) {
        existing.ts = ts;
      }
    });
    return Array.from(bySale.values()).sort((a, b) => a.ts - b.ts);
  }, [recentSalesRawData]);

  // The sales actually plotted on the x-axis.
  const last4Sales = useMemo(() => recentSalesChrono.slice(-GLOBAL_LAST_SALES_COUNT), [recentSalesChrono]);

  // Rows of the plotted sales only — used to pick which strategies get a line.
  const last4ScopedData = useMemo(() => {
    const shown = new Set(last4Sales.map(s => s.key));
    return recentSalesRawData.filter(d => shown.has(`${d.season}|${d.sale_number}`));
  }, [recentSalesRawData, last4Sales]);

  const last4StrategyCategories = useMemo(() => rankByVolume(last4ScopedData, 'strategy', 8), [last4ScopedData, weightMultiplier]);

  // { saleKey -> { strategy -> { sum, weight (for differential), vol } } }
  const last4ByStrategy = useMemo(() => {
    const bySaleCat: Record<string, Record<string, { sum: number; weight: number; vol: number }>> = {};
    recentSalesRawData.forEach(d => {
      const key = `${d.season}|${d.sale_number}`;
      const cat = d.strategy;
      if (!cat || !last4StrategyCategories.includes(cat)) return;
      const w = parseFloat(d.weight) || 0;
      if (w <= 0) return;
      if (!bySaleCat[key]) bySaleCat[key] = {};
      if (!bySaleCat[key][cat]) bySaleCat[key][cat] = { sum: 0, weight: 0, vol: 0 };
      bySaleCat[key][cat].vol += w * weightMultiplier;
      const diff = getPrice(d, 'differential');
      if (diff !== null) {
        bySaleCat[key][cat].sum += diff * w;
        bySaleCat[key][cat].weight += w;
      }
    });
    return bySaleCat;
  }, [recentSalesRawData, last4StrategyCategories, weightMultiplier]);

  // Rolling accumulation: for each plotted sale, pool its own stats with those of the (ROLLING_WINDOW_SALES - 1)
  // sales before it (across seasons). Volume is summed; differential is weighted across all pooled rows.
  // The earliest sales in the data simply use however many prior sales exist.
  const last4Rolling = useMemo(() => {
    const offset = recentSalesChrono.length - last4Sales.length;
    return last4Sales.map((s, i) => {
      const end = offset + i;
      const windowSales = recentSalesChrono.slice(Math.max(0, end - (ROLLING_WINDOW_SALES - 1)), end + 1);
      const pooled: Record<string, { sum: number; weight: number; vol: number }> = {};
      windowSales.forEach(ws => {
        const cats = last4ByStrategy[ws.key] || {};
        Object.entries(cats).forEach(([c, cell]) => {
          if (!pooled[c]) pooled[c] = { sum: 0, weight: 0, vol: 0 };
          pooled[c].sum += cell.sum;
          pooled[c].weight += cell.weight;
          pooled[c].vol += cell.vol;
        });
      });
      return { sale: s, pooled };
    });
  }, [recentSalesChrono, last4Sales, last4ByStrategy]);

  const last4VolumeChartData = useMemo(() => last4Rolling.map(({ sale, pooled }) => {
    const row: any = { label: sale.label };
    last4StrategyCategories.forEach(c => { row[c] = pooled[c]?.vol ?? 0; });
    return row;
  }), [last4Rolling, last4StrategyCategories]);

  const last4DiffChartData = useMemo(() => last4Rolling.map(({ sale, pooled }) => {
    const row: any = { label: sale.label };
    last4StrategyCategories.forEach(c => { const cell = pooled[c]; row[c] = (cell && cell.weight > 0) ? cell.sum / cell.weight : null; });
    return row;
  }), [last4Rolling, last4StrategyCategories]);

  // Grade Projections can group by either Grade or Strategy.
  const projectionField = projectionGroupBy === 'strategy' ? 'strategy' : 'grade';
  const projectionCategories = useMemo(() => rankByVolume(saleScopedData, projectionField, 8), [saleScopedData, projectionField, weightMultiplier]);

  // Builds { sale_number -> { category -> { sum, weight (for price), vol } } } for a given field/metric.
  const buildSaleCategoryStats = (rows: any[], field: string, categories: string[], metric: string) => {
    const bySaleCat: Record<string, Record<string, { sum: number, weight: number, vol: number }>> = {};
    rows.forEach(d => {
      const sale = d.sale_number;
      const cat = d[field];
      if (!sale || !cat || !categories.includes(cat)) return;
      const w = parseFloat(d.weight) || 0;
      if (w <= 0) return;
      if (!bySaleCat[sale]) bySaleCat[sale] = {};
      if (!bySaleCat[sale][cat]) bySaleCat[sale][cat] = { sum: 0, weight: 0, vol: 0 };
      bySaleCat[sale][cat].vol += w * weightMultiplier;
      const price = getPrice(d, metric);
      if (price !== null) {
        bySaleCat[sale][cat].sum += price * w;
        bySaleCat[sale][cat].weight += w;
      }
    });
    return bySaleCat;
  };

  // Overall (all grades/strategies combined) weighted-average of a metric, per sale — used to plot
  // Differential for comparison alongside whatever price metric a chart is currently showing.
  const buildSaleAvgMetric = (rows: any[], metric: string) => {
    const bySale: Record<string, { sum: number, weight: number }> = {};
    rows.forEach(d => {
      const sale = d.sale_number;
      if (!sale) return;
      const w = parseFloat(d.weight) || 0;
      if (w <= 0) return;
      const val = getPrice(d, metric);
      if (val === null) return;
      if (!bySale[sale]) bySale[sale] = { sum: 0, weight: 0 };
      bySale[sale].sum += val * w;
      bySale[sale].weight += w;
    });
    return bySale;
  };

  // Volume by grade/strategy, sale by sale — always shown as its own bar chart alongside the Grade Projections.
  const volumeByCategorySaleData = useMemo(() => {
    const stats = buildSaleCategoryStats(saleScopedData, projectionField, projectionCategories, 'price');
    return saleAxis.map(sale => {
      const row: any = { sale_number: sale };
      projectionCategories.forEach(c => {
        row[c] = stats[sale]?.[c] ? stats[sale][c].vol : 0;
      });
      return row;
    });
  }, [saleScopedData, projectionField, projectionCategories, saleAxis]);

  // Whichever price-like metric is being projected (Price / USc per lb / Differential), by grade/strategy, sale by sale.
  const projectionPriceSource = useMemo(() => {
    const stats = buildSaleCategoryStats(saleScopedData, projectionField, projectionCategories, projectionMetric);
    return saleAxis.map(sale => {
      const row: any = { sale_number: sale };
      projectionCategories.forEach(c => {
        const cell = stats[sale]?.[c];
        row[c] = cell && cell.weight > 0 ? cell.sum / cell.weight : null;
      });
      return row;
    });
  }, [saleScopedData, projectionField, projectionCategories, saleAxis, projectionMetric]);

  // ---- Grade projections ----
  // Volume gets a plain line of best fit over the sale index. Price/differential is then projected with a
  // volume-aware regression (price ~ sale index + volume) so the two move together — e.g. a grade trending
  // toward higher volume gets projected toward whatever price that volume trend implies. Falls back to a
  // plain sale-index trend when there isn't enough paired data for the coupled model.
  const projectionResults = useMemo(() => {
    const n = saleAxis.length;
    const results: Record<string, {
      lastValue: number | null, nextValue: number | null, pctChange: number | null, usedVolumeModel: boolean,
      volumeLast: number | null, volumeNext: number | null, volumePctChange: number | null,
      volReg: { slope: number, intercept: number } | null,
      multiReg: { intercept: number, slopeSale: number, slopeVolume: number } | null,
      simpleReg: { slope: number, intercept: number } | null,
    }> = {};

    projectionCategories.forEach(category => {
      // Volume side: plain trend over the sale index.
      const volPoints: { x: number, y: number }[] = [];
      volumeByCategorySaleData.forEach((row: any, idx: number) => {
        const v = row[category];
        if (v !== null && v !== undefined && !isNaN(v)) volPoints.push({ x: idx, y: v });
      });
      const volReg = volPoints.length >= 2 ? linearRegression(volPoints) : null;
      const volumeLast = volPoints.length > 0 ? volPoints[volPoints.length - 1].y : null;
      const volumeNext = volReg ? Math.max(0, volReg.slope * n + volReg.intercept) : null;
      const volumePctChange = (volumeLast !== null && volumeNext !== null && volumeLast !== 0) ? ((volumeNext - volumeLast) / volumeLast) * 100 : null;

      // Price/differential side: paired with that same sale's volume wherever both exist.
      const pairedPoints: { x1: number, x2: number, y: number }[] = [];
      const simplePoints: { x: number, y: number }[] = [];
      projectionPriceSource.forEach((row: any, idx: number) => {
        const y = row[category];
        if (y === null || y === undefined || isNaN(y)) return;
        simplePoints.push({ x: idx, y });
        const vol = volumeByCategorySaleData[idx]?.[category];
        if (vol !== null && vol !== undefined && !isNaN(vol)) pairedPoints.push({ x1: idx, x2: vol, y });
      });

      const multiReg = pairedPoints.length >= 3 ? multiLinearRegression(pairedPoints) : null;
      const simpleReg = simplePoints.length >= 2 ? linearRegression(simplePoints) : null;
      const lastValue = simplePoints.length > 0 ? simplePoints[simplePoints.length - 1].y : null;

      let nextValue: number | null = null;
      let usedVolumeModel = false;
      if (multiReg && volumeNext !== null) {
        nextValue = multiReg.intercept + multiReg.slopeSale * n + multiReg.slopeVolume * volumeNext;
        usedVolumeModel = true;
      } else if (simpleReg) {
        nextValue = simpleReg.slope * n + simpleReg.intercept;
      }

      const pctChange = (lastValue !== null && nextValue !== null && lastValue !== 0) ? ((nextValue - lastValue) / lastValue) * 100 : null;

      results[category] = { lastValue, nextValue, pctChange, usedVolumeModel, volumeLast, volumeNext, volumePctChange, volReg, multiReg, simpleReg };
    });

    return results;
  }, [projectionCategories, projectionPriceSource, volumeByCategorySaleData, saleAxis]);

  // Project a category's volume/price forward by h sales beyond the last selected one, reusing the fitted regressions above.
  const projectCategoryVolumeAt = (category: string, h: number) => {
    const r = projectionResults[category];
    if (!r || !r.volReg) return null;
    return Math.max(0, r.volReg.slope * (saleAxis.length - 1 + h) + r.volReg.intercept);
  };

  const projectCategoryMetricAt = (category: string, h: number) => {
    const r = projectionResults[category];
    if (!r) return null;
    const n = saleAxis.length;
    if (r.multiReg) {
      const vol = projectCategoryVolumeAt(category, h);
      if (vol !== null) return r.multiReg.intercept + r.multiReg.slopeSale * (n - 1 + h) + r.multiReg.slopeVolume * vol;
    }
    if (r.simpleReg) return r.simpleReg.slope * (n - 1 + h) + r.simpleReg.intercept;
    return null;
  };

  const projectionChartData = useMemo(() => {
    const n = projectionPriceSource.length;
    const rows: any[] = projectionPriceSource.map((row: any, idx: number) => {
      const out: any = { sale_number: row.sale_number };
      projectionCategories.forEach(c => {
        out[c] = row[c] !== undefined ? row[c] : null;
        // Seed the dashed projection series with the last real point so it connects visually.
        out[`${c}_proj`] = idx === n - 1 ? row[c] : null;
      });
      return out;
    });

    for (let h = 1; h <= PROJECTION_HORIZON; h++) {
      const futureRow: any = { sale_number: `+${h}` };
      projectionCategories.forEach(c => {
        futureRow[c] = null;
        futureRow[`${c}_proj`] = projectCategoryMetricAt(c, h);
      });
      rows.push(futureRow);
    }
    return rows;
  }, [projectionCategories, projectionPriceSource, projectionResults]);

  // Volume by category, historical + projected, for the bar chart (projected bars are flagged via _isProjected).
  const volumeProjectionChartData = useMemo(() => {
    const rows: any[] = volumeByCategorySaleData.map((row: any) => ({ ...row, _isProjected: false }));
    for (let h = 1; h <= PROJECTION_HORIZON; h++) {
      const futureRow: any = { sale_number: `+${h}`, _isProjected: true };
      projectionCategories.forEach(c => { futureRow[c] = projectCategoryVolumeAt(c, h) ?? 0; });
      rows.push(futureRow);
    }
    return rows;
  }, [projectionCategories, volumeByCategorySaleData, projectionResults]);

  // ---- Buyer deep-dive (scoped to the selected season + sales) ----
  const buyerData = useMemo(() => {
    if (seasonBuyers.length === 0) return [];
    return saleScopedData.filter(d => seasonBuyers.includes(d.buyer));
  }, [saleScopedData, seasonBuyers]);

  const buyerKpis = useMemo(() => {
    let vol = 0, sum = 0, weight = 0, marketVol = 0, diffSum = 0, diffWeight = 0;
    const gradeVol: Record<string, number> = {};
    const stratVol: Record<string, number> = {};

    saleScopedData.forEach(d => { marketVol += (parseFloat(d.weight) || 0) * weightMultiplier; });

    buyerData.forEach(d => {
      const w = parseFloat(d.weight) || 0;
      const scaledW = w * weightMultiplier;
      vol += scaledW;
      if (d.grade) gradeVol[d.grade] = (gradeVol[d.grade] || 0) + scaledW;
      if (d.strategy) stratVol[d.strategy] = (stratVol[d.strategy] || 0) + scaledW;
      if (w > 0) {
        const price = getPrice(d, buyerPriceMetric);
        if (price !== null) { sum += price * w; weight += w; }
        const diff = getPrice(d, 'differential');
        if (diff !== null) { diffSum += diff * w; diffWeight += w; }
      }
    });

    const topGrade = Object.entries(gradeVol).sort((a, b) => b[1] - a[1])[0];
    const topStrategy = Object.entries(stratVol).sort((a, b) => b[1] - a[1])[0];

    return {
      totalVolume: vol,
      avgPrice: weight > 0 ? sum / weight : 0,
      avgDifferential: diffWeight > 0 ? diffSum / diffWeight : 0,
      marketShare: marketVol > 0 ? (vol / marketVol) * 100 : 0,
      topGrade: topGrade ? topGrade[0] : '-',
      topGradeShare: topGrade && vol > 0 ? (topGrade[1] / vol) * 100 : 0,
      topStrategy: topStrategy ? topStrategy[0] : '-',
      topStrategyShare: topStrategy && vol > 0 ? (topStrategy[1] / vol) * 100 : 0,
      lotCount: buyerData.length,
    };
  }, [buyerData, saleScopedData, weightMultiplier, buyerPriceMetric]);

  const buyerGradeBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    buyerData.forEach(d => {
      if (!d.grade) return;
      totals[d.grade] = (totals[d.grade] || 0) + (parseFloat(d.weight) || 0) * weightMultiplier;
    });
    return Object.entries(totals).map(([grade, volume]) => ({ grade, volume })).sort((a, b) => b.volume - a.volume).slice(0, 10);
  }, [buyerData, weightMultiplier]);

  const buyerStrategyBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    buyerData.forEach(d => {
      if (!d.strategy) return;
      totals[d.strategy] = (totals[d.strategy] || 0) + (parseFloat(d.weight) || 0) * weightMultiplier;
    });
    return Object.entries(totals).map(([strategy, volume]) => ({ strategy, volume })).sort((a, b) => b.volume - a.volume);
  }, [buyerData, weightMultiplier]);

  // Selected buyer(s) vs overall market: price paid, sale by sale, plus overall differential for comparison.
  const buyerTrendData = useMemo(() => {
    const marketBySaleStats: Record<string, { sum: number, weight: number }> = {};
    const diffBySaleStats = buildSaleAvgMetric(saleScopedData, 'differential');
    saleScopedData.forEach(d => {
      const sale = d.sale_number;
      if (!sale) return;
      const w = parseFloat(d.weight) || 0;
      if (w <= 0) return;
      if (!marketBySaleStats[sale]) marketBySaleStats[sale] = { sum: 0, weight: 0 };
      const price = getPrice(d, buyerPriceMetric);
      if (price !== null) { marketBySaleStats[sale].sum += price * w; marketBySaleStats[sale].weight += w; }
    });

    const buyerBySaleStats: Record<string, Record<string, { sum: number, weight: number }>> = {};
    buyerData.forEach(d => {
      const sale = d.sale_number;
      if (!sale) return;
      const w = parseFloat(d.weight) || 0;
      if (w <= 0) return;
      if (!buyerBySaleStats[sale]) buyerBySaleStats[sale] = {};
      if (!buyerBySaleStats[sale][d.buyer]) buyerBySaleStats[sale][d.buyer] = { sum: 0, weight: 0 };
      const price = getPrice(d, buyerPriceMetric);
      if (price !== null) { buyerBySaleStats[sale][d.buyer].sum += price * w; buyerBySaleStats[sale][d.buyer].weight += w; }
    });

    return saleAxis.map(sale => {
      const row: any = { sale_number: sale };
      const m = marketBySaleStats[sale];
      row['Market Avg'] = m && m.weight > 0 ? m.sum / m.weight : null;
      const diff = diffBySaleStats[sale];
      row['Avg Differential'] = diff && diff.weight > 0 ? diff.sum / diff.weight : null;
      seasonBuyers.forEach(b => {
        const cell = buyerBySaleStats[sale]?.[b];
        row[b] = cell && cell.weight > 0 ? cell.sum / cell.weight : null;
      });
      return row;
    });
  }, [saleScopedData, buyerData, saleAxis, seasonBuyers, buyerPriceMetric]);

  // Explicit, tightly-padded domains for the buyer trend chart's two axes (see getPaddedDomain).
  const buyerTrendPriceDomain = useMemo(() => getPaddedDomain(buyerTrendData, ['Market Avg', ...seasonBuyers]), [buyerTrendData, seasonBuyers]);
  const buyerTrendDiffDomain = useMemo(() => getPaddedDomain(buyerTrendData, ['Avg Differential']), [buyerTrendData]);

  // Grade/Strategy mix sale-by-sale — focused on the first selected buyer so it stays legible.
  const buyerMixOverTime = useMemo(() => {
    if (seasonBuyers.length === 0) return { data: [] as any[], keys: [] as string[] };
    const focusBuyer = seasonBuyers[0];
    const field = buyerMixGroupBy === 'strategy' ? 'strategy' : 'grade';
    const rows = saleScopedData.filter(d => d.buyer === focusBuyer);
    const cats = rankByVolume(rows, field, 8);

    const stats: Record<string, Record<string, number>> = {};
    rows.forEach(d => {
      const sale = d.sale_number;
      const cat = d[field];
      if (!sale || !cat || !cats.includes(cat)) return;
      const w = (parseFloat(d.weight) || 0) * weightMultiplier;
      if (!stats[sale]) stats[sale] = {};
      stats[sale][cat] = (stats[sale][cat] || 0) + w;
    });

    const data = saleAxis.map(sale => {
      const row: any = { sale_number: sale };
      cats.forEach(c => { row[c] = stats[sale]?.[c] || 0; });
      return row;
    });
    return { data, keys: cats };
  }, [saleScopedData, seasonBuyers, buyerMixGroupBy, saleAxis, weightMultiplier]);

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

      {}
      <aside className={`fixed inset-y-0 right-0 w-80 bg-[#f9fafb] border-l border-gray-200 shadow-2xl z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Filter className="w-4 h-4 text-[#0d9488]" /> Data Filters</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
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

          {/* Note: Seasons is now driven by availableSeasons state rather than extracted from rawData */}
          <MultiSelect label="Seasons" placeholder="Search seasons..." options={availableSeasons} selected={selectedSeasons} onChange={setSelectedSeasons} />
          
          <MultiSelect label="Strategy" placeholder="Search strategy..." options={filterOptions.strategies} selected={selectedStrategies} onChange={setSelectedStrategies} />
          <MultiSelect label="Buyer" placeholder="Search buyers..." options={filterOptions.buyers} selected={selectedBuyers} onChange={setSelectedBuyers} />
          <MultiSelect label="Grade" placeholder="Search grades..." options={filterOptions.grades} selected={selectedGrades} onChange={setSelectedGrades} />
          <MultiSelect label="County" placeholder="Search counties..." options={filterOptions.counties} selected={selectedCounties} onChange={setSelectedCounties} />
          <MultiSelect label="Cooperative" placeholder="Search cooperatives..." options={filterOptions.cooperatives} selected={selectedCooperatives} onChange={setSelectedCooperatives} />
          <MultiSelect label="Wetmill" placeholder="Search wetmills..." options={filterOptions.wetmills} selected={selectedWetmills} onChange={setSelectedWetmills} />
          <MultiSelect label="Certification (General)" placeholder="Search certifications..." options={filterOptions.certifications} selected={selectedCertifications} onChange={setSelectedCertifications} />

          <hr className="border-gray-200 my-5" />

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
        
        {}
        <div className="p-4 border-t border-gray-200 bg-white shrink-0 space-y-2 flex flex-col">
           <button 
             onClick={handleApplyDataFilters}
             className="w-full py-2 bg-[#0d9488] text-white font-bold text-xs rounded-lg hover:bg-[#0f766e] transition-colors shadow-sm"
           >
             Apply Data Filters & Close
           </button>
           <button 
             onClick={() => {
               setFilterStatus('all'); setDateStart(''); setDateEnd('');
               setSelectedStrategies([]); setSelectedGrades([]); setSelectedCounties([]);
               setSelectedCooperatives([]); setSelectedWetmills([]); setSelectedCertifications([]); setSelectedCertTypes([]);
               setSelectedBuyers([]); setSelectedSKL(false);
               setSelectedSeasons([]); 
               fetchData([]); // Empty array triggers 'First Load' backend logic
             }}
             className="w-full py-2 bg-gray-100 text-gray-600 font-bold text-xs rounded-lg hover:bg-gray-200 transition-colors"
           >
             Clear Filters & Reload Data
           </button>
        </div>
      </aside>

      {}
      <div className="flex-1 flex flex-col min-w-0">
        
        <div className="p-3 md:p-4 shrink-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border-b border-gray-200 z-10">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 leading-tight">Kenyan Coffee Auction Dashboard</h1>
            <p className="text-gray-500 text-xs mt-0.5">Interactive analysis of transaction history</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={() => setShowUploadModal(true)}
              className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-[#0d9488]" /> Upload Confirmed Purchases
            </button>

            <button 
              onClick={handleDownloadCSV}
              className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#0d9488]" /> Download Data
            </button>

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

            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="px-3 py-1.5 text-[11px] font-bold rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Filter className="w-3.5 h-3.5 text-[#0d9488]" /> Filters
              {selectedSeasons.length > 0 && (
                <span className="bg-[#ccfbf1] text-[#0f766e] px-1.5 py-0.5 rounded-full text-[9px] ml-1">
                  {selectedSeasons.length}
                </span>
              )}
            </button>

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

        {}
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

              <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 border-l-4 border-l-[#D97706] flex flex-col justify-between">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Certified Volume
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <div className="text-[9px] font-bold text-[#0d9488] bg-[#0d9488]/10 px-1.5 py-0.5 rounded">
                      SKL: {formatNum(kpis.sklVol || 0)}
                    </div>
                    <div className="text-[9px] font-bold text-[#D97706] bg-[#D97706]/10 px-1.5 py-0.5 rounded">
                      {kpis.totalVolume > 0 ? formatNum((kpis.certifiedVolume / kpis.totalVolume) * 100) : 0}%
                    </div>
                  </div>
                </div>

                <div className="flex items-baseline gap-1.5 mb-1.5">
                  <span className="text-xl font-black text-gray-800 leading-none">{formatNum(kpis.certifiedVolume)}</span>
                  <span className="text-[9px] font-bold text-gray-500">{unit}</span>
                </div>

                <div className="mt-auto flex justify-between items-center pt-2 border-t border-gray-100">
                   <div className="flex flex-col">
                     <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">AAA</span>
                     <span className="text-xs font-black text-gray-700">{formatNum(kpis.aaaVol)}</span>
                   </div>
                   <div className="w-[1px] h-6 bg-gray-200"></div>
                   <div className="flex flex-col">
                     <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">RFA</span>
                     <span className="text-xs font-black text-gray-700">{formatNum(kpis.rfaVol)}</span>
                   </div>
                   <div className="w-[1px] h-6 bg-gray-200"></div>
                   <div className="flex flex-col">
                     <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">CAFE</span>
                     <span className="text-xs font-black text-gray-700">{formatNum(kpis.cafeVol)}</span>
                   </div>
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
                  <div className="w-[1px] h-6 bg-teal-600"></div>
                  <div className="text-right">
                    <div className="text-lg font-black leading-tight">{kpis.avgDifferential !== null ? formatNum(kpis.avgDifferential) : '—'}</div>
                    <div className="text-[9px] text-teal-100 font-medium">AVG DIFFERENTIAL</div>
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
                    {volumeStack === 'buyer' && (
                       <label className="flex items-center gap-1.5 cursor-pointer bg-gray-100 px-2 py-1 rounded transition-colors hover:bg-gray-200">
                         <input type="checkbox" checked={groupMinorBuyers} onChange={e => setGroupMinorBuyers(e.target.checked)} className="w-3.5 h-3.5 text-[#0d9488] rounded border-gray-300 focus:ring-[#0d9488]" />
                         <span className="text-[10px] font-bold text-gray-600 uppercase">Group Minor Buyers</span>
                       </label>
                    )}
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
                        <option value="price">Price</option>
                        <option value="price_usc">Price (USc/lb)</option>
                        <option value="differential">Differential (USc/lb)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      {priceStack === 'buyer' && (
                         <label className="flex items-center gap-1.5 cursor-pointer bg-gray-100 px-2 py-1 rounded transition-colors hover:bg-gray-200">
                           <input type="checkbox" checked={groupMinorBuyers} onChange={e => setGroupMinorBuyers(e.target.checked)} className="w-3.5 h-3.5 text-[#0d9488] rounded border-gray-300 focus:ring-[#0d9488]" />
                           <span className="text-[10px] font-bold text-gray-600 uppercase">Group Minor Buyers</span>
                         </label>
                      )}
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
                        <option value="price">Price</option>
                        <option value="price_usc">Price (USc/lb)</option>
                        <option value="differential">Differential (USc/lb)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      {distGroupBy === 'buyer' && (
                         <label className="flex items-center gap-1.5 cursor-pointer bg-gray-100 px-2 py-1 rounded transition-colors hover:bg-gray-200">
                           <input type="checkbox" checked={groupMinorBuyers} onChange={e => setGroupMinorBuyers(e.target.checked)} className="w-3.5 h-3.5 text-[#0d9488] rounded border-gray-300 focus:ring-[#0d9488]" />
                           <span className="text-[10px] font-bold text-gray-600 uppercase">Group Minor Buyers</span>
                         </label>
                      )}
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
          <div className="flex-1 flex flex-col min-h-0 p-3 md:p-4 gap-2 animate-in fade-in duration-300 overflow-y-auto custom-scrollbar">

            {seasonsSorted.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-gray-200 py-16">
                <Layers className="w-12 h-12 text-gray-300 mb-3" />
                <h2 className="text-xl font-bold text-gray-700">No Season Data Loaded</h2>
                <p className="text-gray-500 mt-1.5 text-sm text-center max-w-md">Open the Filters panel, select one or more seasons, and click &quot;Apply Data Filters&quot; to view sale-by-sale analytics.</p>
                <button
                  className="mt-4 px-5 py-1.5 bg-[#0d9488] text-white text-sm font-bold rounded-lg hover:bg-[#0f766e] transition-colors"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  Open Filters
                </button>
              </div>
            ) : (
              <>
                {/* Sale Selector — everything below compares sale to sale within one season */}
                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-1 shrink-0">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Season</label>
                      <select
                        className="bg-gray-50 border border-gray-300 text-xs rounded-lg focus:ring-[#0d9488] focus:border-[#0d9488] block px-3 py-1.5 font-bold min-w-[160px]"
                        value={seasonAnalysisSeason} onChange={e => setSeasonAnalysisSeason(e.target.value)}
                      >
                        {seasonsSorted.slice().reverse().map(s => (
                          <option key={s} value={s}>{s}{s === seasonsSorted[seasonsSorted.length - 1] ? ' (Most Recent)' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[320px]">
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sales in {seasonAnalysisSeason || 'season'} ({saleAxis.length}/{salesInSeason.length} selected)</label>
                        <button
                          className="text-[9px] font-bold text-[#0d9488] hover:text-[#0f766e] uppercase tracking-wider"
                          onClick={() => setSeasonAnalysisSales(salesInSeason)}
                        >
                          Select All Sales
                        </button>
                      </div>
                      <MultiSelect label="" placeholder="Search sale numbers..." options={salesInSeason} selected={seasonAnalysisSales} onChange={setSeasonAnalysisSales} badgeLayout="side" />
                    </div>
                  </div>
                  <p className="text-[9px] text-gray-400">Grade/strategy pricing, projections, and buyer analytics below compare the selected sales sale-by-sale — defaults to the last {DEFAULT_SALE_COUNT} sales of the most recent season.</p>
                </div>

                {/* Season Summary: weighted-average prices & cumulative volume by Grade / Strategy, over its own independently-selectable set of sales (defaults to the last 4). */}
                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-200 flex flex-col shrink-0">
                  <div className="flex flex-wrap justify-between items-center mb-1 gap-2">
                    <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-[#0d9488]" /> Season Summary
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-end gap-3 mb-2">
                    <div className="flex-1 min-w-[320px]">
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sales in Summary ({summarySales.length}/{salesInSeason.length} selected)</label>
                        <div className="flex gap-2">
                          <button
                            className="text-[9px] font-bold text-[#0d9488] hover:text-[#0f766e] uppercase tracking-wider"
                            onClick={() => setSummarySales(salesInSeason.slice(-DEFAULT_SUMMARY_SALE_COUNT))}
                          >
                            Last {DEFAULT_SUMMARY_SALE_COUNT}
                          </button>
                          <button
                            className="text-[9px] font-bold text-[#0d9488] hover:text-[#0f766e] uppercase tracking-wider"
                            onClick={() => setSummarySales(salesInSeason)}
                          >
                            Select All
                          </button>
                        </div>
                      </div>
                      <MultiSelect label="" placeholder="Search sale numbers..." options={salesInSeason} selected={summarySales} onChange={setSummarySales} badgeLayout="row" />
                    </div>
                  </div>

                  {summaryScopedData.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-xs font-medium">Select at least one sale above to view the summary.</div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {/* By Strategy table — weighted avg price/differential & cumulative volume over the sales selected above */}
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="py-1.5 px-2 font-bold text-gray-500 uppercase text-[9px]">By Strategy</th>
                              <th className="py-1.5 px-2 font-bold text-gray-500 uppercase text-[9px] text-right">Volume ({unit})</th>
                              <th className="py-1.5 px-2 font-bold text-gray-500 uppercase text-[9px] text-right">% of Total</th>
                              <th className="py-1.5 px-2 font-bold text-gray-500 uppercase text-[9px] text-right">Avg Price</th>
                              <th className="py-1.5 px-2 font-bold text-gray-500 uppercase text-[9px] text-right">Avg Diff. (USc/lb)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summaryByStrategy.map(r => (
                              <tr key={r.key} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                <td className="py-1.5 px-2 font-semibold text-gray-700">{r.key}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-gray-700">{formatNum(r.volume)}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-gray-500">{formatNum(r.pctOfTotal)}%</td>
                                <td className="py-1.5 px-2 text-right font-mono text-gray-700">{r.avgPrice !== null ? formatNum(r.avgPrice) : '—'}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-gray-700">{r.avgDifferential !== null ? formatNum(r.avgDifferential) : '—'}</td>
                              </tr>
                            ))}
                            {summaryByStrategy.length === 0 && (
                              <tr><td colSpan={5} className="py-4 text-center text-gray-400">No data for the selected sales.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* By-Strategy Volume & Differential trend — always the last 4 sales chronologically, regardless of season */}
                      <div className="border border-gray-200 rounded-lg p-2 flex flex-col">
                        {last4Sales.length === 0 ? (
                          <div className="flex-1 flex items-center justify-center text-gray-400 text-xs font-medium py-10">No sales available.</div>
                        ) : (
                          <>
                            {renderCustomLegend(last4StrategyCategories.map((c, i) => ({ value: c, dataKey: c, color: COLORS[i % COLORS.length] })), hiddenSummarySeries, setHiddenSummarySeries, last4StrategyCategories)}

                            <h3 className="text-[10px] font-bold text-gray-600 mt-1 mb-1">Volume by Strategy ({unit}) — last {last4Sales.length} sales, each point = that sale + {ROLLING_WINDOW_SALES - 1} prior</h3>
                            <div className="flex-1 relative" style={{ minHeight: 160 }}>
                              <ResponsiveContainer width="100%" height="100%" className="!absolute inset-0">
                                <LineChart data={last4VolumeChartData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                  <XAxis dataKey="label" interval={0} tick={{ fontSize: 8 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                                  <YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                                  <Tooltip content={<CustomTooltip />} />
                                  {last4StrategyCategories.map((c, i) => (
                                    <Line key={c} type="monotone" dataKey={c} name={c} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} hide={hiddenSummarySeries.has(c)} connectNulls={false} />
                                  ))}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>

                            <h3 className="text-[10px] font-bold text-gray-600 mt-3 mb-1">Differential by Strategy (USc/lb) — last {last4Sales.length} sales, each point = that sale + {ROLLING_WINDOW_SALES - 1} prior</h3>
                            <div className="flex-1 relative" style={{ minHeight: 160 }}>
                              <ResponsiveContainer width="100%" height="100%" className="!absolute inset-0">
                                <LineChart data={last4DiffChartData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                  <XAxis dataKey="label" interval={0} tick={{ fontSize: 8 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                                  <YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                                  <Tooltip content={<CustomTooltip />} />
                                  {last4StrategyCategories.map((c, i) => (
                                    <Line key={c} type="monotone" dataKey={c} name={c} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} hide={hiddenSummarySeries.has(c)} connectNulls={false} />
                                  ))}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  <p className="text-[9px] text-gray-400 mt-2">By Strategy table is weighted by volume across the sales selected above. The two charts on the right always show the last {GLOBAL_LAST_SALES_COUNT} sales chronologically regardless of season; each point accumulates that sale and the {ROLLING_WINDOW_SALES - 1} sales before it (volume summed, differential weighted across all of them), and they are independent of both sale pickers on this tab.</p>
                </div>

                {saleScopedData.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl shadow-sm border border-gray-200 py-16">
                    <Layers className="w-12 h-12 text-gray-300 mb-3" />
                    <h2 className="text-lg font-bold text-gray-700">No Sales Selected</h2>
                    <p className="text-gray-500 mt-1.5 text-sm text-center max-w-md">Select at least one sale above to view analytics.</p>
                  </div>
                ) : (
                <>
                {/* Grade Projections */}
                <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-200 flex flex-col shrink-0">
                  <div className="flex flex-wrap justify-between items-center mb-1 shrink-0 gap-2">
                    <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-[#8B5CF6]" /> {projectionGroupBy === 'strategy' ? 'Strategy' : 'Grade'} Projections (Volume-Aware Line of Best Fit)
                    </h2>
                    <div className="flex items-center gap-3">
                      <div className="flex bg-gray-100 rounded-lg p-0.5 shadow-inner border border-gray-200">
                        {['grade', 'strategy'].map(opt => (
                          <button
                            key={opt}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-md capitalize transition-colors ${projectionGroupBy === opt ? 'bg-[#8B5CF6] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'}`}
                            onClick={() => setProjectionGroupBy(opt)}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Price Metric:</label>
                        <select
                          className="bg-gray-50 border border-gray-300 text-[11px] rounded focus:ring-[#0d9488] focus:border-[#0d9488] block px-2 py-1 font-medium"
                          value={projectionMetric} onChange={e => setProjectionMetric(e.target.value)}
                        >
                          <option value="price">Price</option>
                          <option value="price_usc">Price (USc/lb)</option>
                          <option value="differential">Differential (USc/lb)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {saleAxis.length < 2 ? (
                    <div className="py-10 text-center text-gray-400 text-xs font-medium">Select at least 2 sales above to generate a linear projection.</div>
                  ) : (
                    <>
                      {/* Shared legend — toggling a series here hides/shows it in both charts below, since they cover the same categories. */}
                      {renderCustomLegend(projectionCategories.map((c, i) => ({ value: c, dataKey: c, color: COLORS[i % COLORS.length] })), hiddenProjectionSeries, setHiddenProjectionSeries, projectionCategories)}

                      <h3 className="text-[11px] font-bold text-gray-600 mt-0.5 mb-0.5">Price / Differential Trend</h3>
                      <div style={{ height: 150 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={projectionChartData} margin={{ top: 6, right: 20, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis dataKey="sale_number" interval={0} tick={{ fontSize: 9 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                            <Tooltip content={<CustomTooltip />} />
                            {projectionCategories.map((c, i) => (
                              <Line key={c} type="monotone" dataKey={c} name={c} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} hide={hiddenProjectionSeries.has(c)} connectNulls={false} />
                            ))}
                            {projectionCategories.map((c, i) => (
                              <Line key={`${c}_proj`} type="monotone" dataKey={`${c}_proj`} name={`${c} (Projected)`} legendType="none" stroke={COLORS[i % COLORS.length]} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} hide={hiddenProjectionSeries.has(c)} connectNulls />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      <h3 className="text-[11px] font-bold text-gray-600 mt-1.5 mb-0.5">Volume Trend ({unit}) — feeds the price projection above</h3>
                      <div style={{ height: 150 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={volumeProjectionChartData} margin={{ top: 6, right: 20, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis dataKey="sale_number" interval={0} tick={{ fontSize: 9 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                            <Tooltip content={<CustomTooltip />} />
                            {projectionCategories.map((c, i) => (
                              <Bar key={c} dataKey={c} name={c} stackId="a" fill={COLORS[i % COLORS.length]} shape={<ProjectedBarShape />} hide={hiddenProjectionSeries.has(c)} maxBarSize={50} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <p className="text-[9px] text-gray-400 mt-1 mb-0">
                        Dashed lines and hatched bars (sale labels &quot;+1&quot;/&quot;+2&quot;) are a linear (least-squares) extrapolation across the selected sales.
                        Where enough data exists, the price/differential trend is fitted jointly against both the sale sequence and each {projectionGroupBy}&apos;s volume, so a projected shift in volume moves the projected price with it — otherwise it falls back to a simple sale-index trend.
                      </p>
                    </>
                  )}
                </div>

                {/* Buyer Deep-Dive */}
                <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-3 shrink-0">
                  <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#EC4899]" /> Buyer Deep-Dive
                  </h2>
                  <div className="max-w-md">
                    <MultiSelect label="Search &amp; Select Buyer(s)" placeholder="Type a buyer name..." options={filterOptions.buyers} selected={seasonBuyers} onChange={setSeasonBuyers} />
                  </div>

                  {seasonBuyers.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-xs font-medium">Search and select one or more buyers above to see their buying patterns — grades, strategies, prices paid, and how these shift sale by sale.</div>
                  ) : (
                    <>
                      {/* Buyer KPIs */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex flex-col justify-center">
                          <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Volume Bought</h3>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-lg font-black text-gray-800">{formatNum(buyerKpis.totalVolume)}</span>
                            <span className="text-[10px] font-bold text-gray-500">{unit}</span>
                          </div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex flex-col justify-center">
                          <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Market Share</h3>
                          <div className="text-lg font-black text-gray-800">{formatNum(buyerKpis.marketShare)}%</div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex flex-col justify-center">
                          <div className="flex justify-between items-center mb-1">
                            <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Avg Price Paid</h3>
                            <select
                              className="bg-white border border-gray-300 text-[9px] rounded px-1 py-0.5 font-medium focus:ring-[#0d9488] focus:border-[#0d9488]"
                              value={buyerPriceMetric} onChange={e => setBuyerPriceMetric(e.target.value)}
                            >
                              <option value="price">Price</option>
                              <option value="price_usc">USc/lb</option>
                              <option value="differential">Diff.</option>
                            </select>
                          </div>
                          <div className="text-lg font-black text-gray-800">{formatNum(buyerKpis.avgPrice)}</div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex flex-col justify-center">
                          <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Top Grade / Strategy</h3>
                          <div className="text-xs font-black text-gray-800 truncate">{buyerKpis.topGrade} ({formatNum(buyerKpis.topGradeShare)}%)</div>
                          <div className="text-[10px] font-bold text-gray-500 truncate">{buyerKpis.topStrategy} ({formatNum(buyerKpis.topStrategyShare)}%)</div>
                        </div>
                      </div>

                      {/* Grade & Strategy breakdown */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="flex flex-col" style={{ minHeight: '240px' }}>
                          <h3 className="text-[11px] font-bold text-gray-600 mb-1">Volume by Grade</h3>
                          <div className="flex-1 min-h-0 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={buyerGradeBreakdown} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                                <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                                <YAxis type="category" dataKey="grade" interval={0} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={80} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="volume" name={`Volume (${unit})`} fill="#0d9488" radius={[0, 4, 4, 0]} maxBarSize={18}>
                                  <LabelList dataKey="volume" position="right" style={{ fontSize: 9, fill: '#4A4941', fontWeight: 700 }} formatter={(v: number) => formatNum(v)} />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        <div className="flex flex-col" style={{ minHeight: '240px' }}>
                          <h3 className="text-[11px] font-bold text-gray-600 mb-1">Volume by Strategy</h3>
                          <div className="flex-1 min-h-0 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={buyerStrategyBreakdown} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                                <XAxis type="number" tick={{ fontSize: 9 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                                <YAxis type="category" dataKey="strategy" interval={0} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={80} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="volume" name={`Volume (${unit})`} fill="#D97706" radius={[0, 4, 4, 0]} maxBarSize={18}>
                                  <LabelList dataKey="volume" position="right" style={{ fontSize: 9, fill: '#4A4941', fontWeight: 700 }} formatter={(v: number) => formatNum(v)} />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      {/* Price trend vs market & grade/strategy mix, sale by sale */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="flex flex-col">
                          <h3 className="text-[11px] font-bold text-gray-600 mb-1">Price Paid vs Market Avg (Sale-by-Sale)</h3>
                          <div style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={buyerTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="sale_number" interval={0} tick={{ fontSize: 9 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                                <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} domain={buyerTrendPriceDomain} tickFormatter={(v) => v.toFixed(2)} />
                                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} domain={buyerTrendDiffDomain} tickFormatter={(v) => v.toFixed(2)} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend content={(props) => renderCustomLegend(props.payload || [], hiddenBuyerTrendSeries, setHiddenBuyerTrendSeries, ['Market Avg', 'Avg Differential', ...seasonBuyers])} />
                                <Line yAxisId="left" type="monotone" dataKey="Market Avg" name="Market Avg" stroke="#4A4941" strokeWidth={2} strokeDasharray="6 6" dot={false} activeDot={{ r: 4 }} hide={hiddenBuyerTrendSeries.has('Market Avg')} connectNulls />
                                <Line yAxisId="right" type="monotone" dataKey="Avg Differential" name="Avg Differential" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="2 3" dot={false} activeDot={{ r: 4 }} hide={hiddenBuyerTrendSeries.has('Avg Differential')} connectNulls />
                                {seasonBuyers.map((b, i) => (
                                  <Line yAxisId="left" key={b} type="monotone" dataKey={b} name={b} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} hide={hiddenBuyerTrendSeries.has(b)} connectNulls />
                                ))}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="flex flex-col" style={{ minHeight: '260px' }}>
                          <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
                            <h3 className="text-[11px] font-bold text-gray-600 truncate">{seasonBuyers[0]}&apos;s Mix, Sale-by-Sale{seasonBuyers.length > 1 ? ' (1st selected buyer)' : ''}</h3>
                            <select
                              className="bg-gray-50 border border-gray-300 text-[9px] rounded px-1.5 py-0.5 font-medium focus:ring-[#0d9488] focus:border-[#0d9488]"
                              value={buyerMixGroupBy} onChange={e => setBuyerMixGroupBy(e.target.value)}
                            >
                              <option value="grade">By Grade</option>
                              <option value="strategy">By Strategy</option>
                            </select>
                          </div>
                          <div className="flex-1 min-h-0 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={buyerMixOverTime.data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="sale_number" interval={0} tick={{ fontSize: 9 }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend content={(props) => renderCustomLegend(props.payload || [], hiddenBuyerMixSeries, setHiddenBuyerMixSeries, buyerMixOverTime.keys)} />
                                {buyerMixOverTime.keys.map((key, i) => (
                                  <Bar key={key} dataKey={key} name={key} stackId="a" fill={COLORS[i % COLORS.length]} hide={hiddenBuyerMixSeries.has(key)} maxBarSize={50} />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                </>
                )}
              </>
            )}
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