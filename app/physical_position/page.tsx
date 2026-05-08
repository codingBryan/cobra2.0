"use client"
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Box, 
  TrendingDown, 
  TrendingUp,
  Plus,
  X,
  CloudUpload,
  FileSpreadsheet,
  Pencil,
  Check,
  Combine,
  Search,
  ChevronRight,
  CheckCircle,
  Circle,
  PackageCheck,
  AlertCircle,
  LineChart as LineChartIcon,
  RefreshCw,
  Copy
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// --- Constants & Types ---
type Unit = 'kg' | 'bag' | 'mt';
type MainTab = 'physical' | 'contracts' | 'blends';

const CONTRACT_QUALITIES = [
  "AA - TOP", "AB - TOP", "PB - TOP", 
  "AA - PLUS", "AB - PLUS", "ABC - PLUS", "PB - PLUS", 
  "AA - FAQ", "AB - FAQ", "ABC - FAQ", "PB - FAQ", 
  "REJECTS", "MBUNIS", "TRIAGE", "GRINDER BOLD", "GRINDER LIGHT"
];

const BLEND_COMPONENTS = [
  { key: 'finished', label: 'FINISHED' },
  { key: 'post_natural', label: 'POST NATURAL' },
  { key: 'post_specialty_washed', label: 'POST SPECIALTY WASHED' },
  { key: 'post_17_up_top', label: 'POST 17 UP TOP' },
  { key: 'post_16_top', label: 'POST 16 TOP' },
  { key: 'post_15_top', label: 'POST PB TOP' },
  { key: 'post_pb_top', label: 'POST PB TOP' },
  { key: 'post_17_up_plus', label: 'POST 17 UP PLUS' },
  { key: 'post_16_plus', label: 'POST 16 PLUS' },
  { key: 'post_15_plus', label: 'POST 15 PLUS' },
  { key: 'post_14_plus', label: 'POST 14 PLUS' },
  { key: 'post_pb_plus', label: 'POST PB PLUS' },
  { key: 'post_17_up_faq', label: 'POST 17 UP FAQ' },
  { key: 'post_16_faq', label: 'POST 16 FAQ' },
  { key: 'post_15_faq', label: 'POST 15 FAQ' },
  { key: 'post_14_faq', label: 'POST 14 FAQ' },
  { key: 'post_pb_faq', label: 'POST PB FAQ' },
  { key: 'post_faq_minus', label: 'POST FAQ MINUS' },
  { key: 'post_grinder_bold', label: 'POST GRINDER BOLD' },
  { key: 'post_grinder_light', label: 'POST GRINDER LIGHT' },
  { key: 'post_mh', label: 'POST MH' },
  { key: 'post_ml', label: 'POST ML' },
  { key: 'post_rejects_s', label: 'POST REJECTS S' },
  { key: 'post_rejects_p', label: 'POST REJECTS P' }
];

const INITIAL_BLEND_FORM = {
  name: '', client: '', grade: '', cup_profile: '', blend_no: '',
  ...BLEND_COMPONENTS.reduce((acc, curr) => ({ ...acc, [curr.key]: '' }), {})
};

interface Blend {
  id: number;
  name: string;
  client?: string;
  grade?: string;
  cup_profile?: string;
  blend_no?: string;
  [key: string]: any;
}

interface SaleContract {
  id: number;
  contract_number: string;
  weight_kilos: number;
  shipping_date: string;
  strategy?: string; 
  quality?: string; 
  grade?: string; 
  certifications: any; 
  client?: string; 
  weight?: number; 
  SMT?: number; 
  blend_id?: number;
  blend_name?: string;
  executed?: boolean;
  pending_dispatch?: boolean;
}

interface PhysicalPositionRecord {
  stack: string;
  theoretical_volume: number;
  months: Record<string, number>;
  total_shorts: number;
  net_position: number;
}

// --- Helper Functions ---
const convertQty = (kg: number, unit: Unit): number => {
  if (unit === 'bag') return kg / 60;
  if (unit === 'mt') return kg / 1000;
  return kg;
};

const formatNumber = (num: number, decimals = 0) => {
  if (num === undefined || num === null || isNaN(num)) return "0";
  return new Intl.NumberFormat('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  }).format(num);
};

const formatQty = (value: number, unit: Unit, decimals?: number) => {
  const nextDecimals = decimals ?? (unit === "mt" ? 2 : 0);
  const converted = convertQty(value, unit);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: nextDecimals, minimumFractionDigits: nextDecimals }).format(converted);
};

const unitText = (unit: Unit) => {
  return unit === "bag" ? "BAGS" : unit.toUpperCase();
};

const formatDateToMonthYear = (dateStr: string) => {
  if (!dateStr) return 'Unscheduled';
  const d = new Date(dateStr);
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return 'Unscheduled'; 
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const parseCerts = (rawCerts: any): string[] => {
  let certs = rawCerts || [];
  if (typeof certs === 'string') {
    try { 
        const parsed = JSON.parse(certs); 
        certs = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) { 
        certs = certs.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')); 
    }
  }
  return Array.isArray(certs) ? Array.from(new Set(certs.flat(Infinity).filter(Boolean).map(String))) : [];
};

const formatStackName = (key: string) => {
  const match = BLEND_COMPONENTS.find(b => b.key === key);
  if (match) return match.label;
  return key.replace(/_/g, ' ').toUpperCase();
};

function asNumber(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function getBlendCompositionRow(blend: Blend) {
  return BLEND_COMPONENTS
    .map((comp) => ({
      key: comp.key,
      label: comp.label,
      value: asNumber(blend?.[comp.key] ?? 0),
    }))
    .filter((item) => item.value > 0);
}

// --- Reusable Components ---
const Card = ({ 
  children, 
  className = "", 
  variant = "default", 
  style 
}: { 
  children: React.ReactNode; 
  className?: string; 
  variant?: "default" | "dark";
  style?: React.CSSProperties;
}) => {
  const bgClass = variant === "dark" ? "bg-[#51534a] text-white border-none" : "bg-white border border-[#968C83]/20";
  return (
    <div 
      className={`rounded-xl shadow-sm ${bgClass} ${className}`} 
      style={style}
    >
      {children}
    </div>
  );
};

const SectionCard = ({ title, subtitle, children, right }: { title: string; subtitle?: string; children?: React.ReactNode; right?: React.ReactNode; }) => {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-[#F5F5F3] px-5 py-4">
        <div>
          <div className="text-sm font-bold text-[#51534a]">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-[#968C83]">{subtitle}</div> : null}
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
};

const FileDropZone = ({ 
    label, 
    accept, 
    file, 
    onFileAdded, 
    onRemoveFile,
    disabled = false 
  }: { 
    label: string, 
    accept: string, 
    file: File | null, 
    onFileAdded: (f: File) => void, 
    onRemoveFile: () => void,
    disabled?: boolean
  }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
  
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    };
  
    const handleDragLeave = () => {
      setIsDragging(false);
    };
  
    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!disabled && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFileAdded(e.dataTransfer.files[0]);
      }
    };
  
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!disabled && e.target.files && e.target.files.length > 0) {
        onFileAdded(e.target.files[0]);
      }
    };
  
    return (
      <div className={`flex flex-col gap-1 w-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider block">
          {label}
        </label>
        
        <div 
          className={`border border-dashed rounded p-3 transition-colors text-center cursor-pointer min-h-[80px] flex flex-col items-center justify-center ${isDragging ? 'border-[#007680] bg-[#007680]/5' : 'border-[#D6D2C4] hover:border-[#007680]/50'} bg-white`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input 
            ref={inputRef}
            type="file" 
            accept={accept} 
            className="hidden" 
            onChange={handleChange}
            disabled={disabled}
          />
          {!file ? (
            <>
              <CloudUpload size={20} className="text-[#968C83] mb-1" />
              <span className="text-xs text-[#51534a]">Click or Drag File</span>
            </>
          ) : (
            <div className="w-full flex items-center justify-between bg-[#F5F5F3] border border-[#D6D2C4] px-2 py-1.5 rounded">
              <div className="flex items-center gap-2 overflow-hidden">
                <FileSpreadsheet size={14} className="text-[#007680] shrink-0" />
                <span className="truncate text-xs text-[#51534a] font-medium max-w-[150px]">{file.name}</span>
              </div>
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFile();
                }}
                className="text-[#968C83] hover:text-red-500 transition-colors p-1"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
};

export default function PhysicalPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('physical');
  const [unit, setUnit] = useState<Unit>('kg');

  const [sales, setSales] = useState<SaleContract[]>([]);
  const [blends, setBlends] = useState<Blend[]>([]);
  const [historyData, setHistoryData] = useState<any[]>([]); 
  const [globalVariables, setGlobalVariables] = useState<any[]>([]);
  const [positionFilter, setPositionFilter] = useState<'all' | 'long' | 'short'>('all');
  
  // Physical Data state
  const [physicalData, setPhysicalData] = useState<{
    gridData: PhysicalPositionRecord[],
    months: string[],
    kpis: { totalTheoretical: number, totalShorts: number, totalNet: number }
  } | null>(null);
  
  const [isPhysicalLoading, setIsPhysicalLoading] = useState(false);
  const [hasFetchedPhysical, setHasFetchedPhysical] = useState(false);

  const [loading, setLoading] = useState(true);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManualSalesModalOpen, setIsManualSalesModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isAddBlendModalOpen, setIsAddBlendModalOpen] = useState(false);
  const [isUpdatePositionsModalOpen, setIsUpdatePositionsModalOpen] = useState(false);
  const [isChartDrawerOpen, setIsChartDrawerOpen] = useState(false);
  
  // Execution Modal State
  const [isExecuteModalOpen, setIsExecuteModalOpen] = useState(false);
  const [executeContractId, setExecuteContractId] = useState<number | null>(null);
  const [executeForm, setExecuteForm] = useState({ containers: '', dispatchDate: '', finishedBatchId: null as number | null, finishedBatchNumber: '' });
  
  // Search Batch State
  const [batchSearchQuery, setBatchSearchQuery] = useState('');
  const [searchedBatch, setSearchedBatch] = useState<{id: number, batch_number: string, output_qty: number} | null>(null);
  const [isSearchingBatch, setIsSearchingBatch] = useState(false);

  const [isDirectSale, setIsDirectSale] = useState(true);
  const [purchaseSaleNumber, setPurchaseSaleNumber] = useState('');

  // Physical calculation files state
  const [stockFile, setStockFile] = useState<File | null>(null);
  const [procFile, setProcFile] = useState<File | null>(null);
  const [testFile, setTestFile] = useState<File | null>(null);

  const [editingContractId, setEditingContractId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ quality: string, grade: string, certifications: string[], blend_id: number | '' }>({
      quality: '', grade: '', certifications: [], blend_id: ''
  });

  const [blendForm, setBlendForm] = useState<Record<string, any>>(INITIAL_BLEND_FORM);
  const [editingBlendId, setEditingBlendId] = useState<number | null>(null);

  const [solFile, setSolFile] = useState<File | null>(null);
  const [dnpFile, setDnpFile] = useState<File | null>(null);
  const [purchaseFile, setPurchaseFile] = useState<File | null>(null);

  const [manualSaleForm, setManualSaleForm] = useState({
    contractNumber: '',
    client: '',
    weight: '',
    quality: '',
    grade: '',
    shippingDate: '',
    certifications: [] as string[] 
  });

  // Blend states
  const [blendSearch, setBlendSearch] = useState("");
  const [selectedBlendId, setSelectedBlendId] = useState<number | null>(null);
  const [blendAllocContractId, setBlendAllocContractId] = useState<number | "">("");
  const [blendBusy, setBlendBusy] = useState(false);
  
  // Contracts UI View Filters
  const [showExecutedContracts, setShowExecutedContracts] = useState(false);
  const [contractSearch, setContractSearch] = useState('');

  const certOptions: string[] = ['RFA', 'CAFE', 'NET ZERO', 'EUDR', 'AAA'];

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [salesRes, blendsRes, historyRes, varsRes] = await Promise.all([
          fetch('/api/contracts', { cache: 'no-store' }),
          fetch('/api/blends', { cache: 'no-store' }),
          fetch('/api/physical_stock_position', { cache: 'no-store' }).catch(() => null),
          fetch('/api/contracts?fetchVariables=true', { cache: 'no-store' }).catch(() => null)
        ]);
        
        if (salesRes.ok) setSales(await salesRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
        if (blendsRes.ok) setBlends(await blendsRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
        if (historyRes && historyRes.ok) setHistoryData(await historyRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
        if (varsRes && varsRes.ok) setGlobalVariables(await varsRes.json());
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const getVariableValue = (name: string) => {
    const variable = globalVariables.find(v => v.name === name);
    return variable ? variable.value : 0;
  };

  useEffect(() => {
    if (!selectedBlendId && blends.length > 0) setSelectedBlendId(blends[0].id);
  }, [blends, selectedBlendId]);

  // Chart Data pivot
  const chartData = useMemo(() => {
    const grouped: Record<string, any> = {};
    const stackNames = new Set<string>();
    const latestPositions: Record<string, number> = {};

    historyData.forEach(row => {
      if (!row.recorded_date) return;
      const d = new Date(row.recorded_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!grouped[d]) grouped[d] = { date: d };
      
      const pos = Number(row.position);
      grouped[d][row.stack] = pos;
      stackNames.add(row.stack);
      
      latestPositions[row.stack] = pos;
    });

    let stacks = Array.from(stackNames);
    if (positionFilter === 'long') {
        stacks = stacks.filter(stack => latestPositions[stack] > 0);
    } else if (positionFilter === 'short') {
        stacks = stacks.filter(stack => latestPositions[stack] < 0);
    }

    return { 
      data: Object.values(grouped).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()), 
      stacks
    };
  }, [historyData, positionFilter]);

  const handleFetchPhysicalPositions = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!stockFile || !procFile || !testFile) {
        alert("All three files are required to run the position calculation.");
        return;
    }

    try {
      setIsPhysicalLoading(true);
      
      const formData = new FormData();
      formData.append('stock', stockFile);
      formData.append('proc', procFile);
      formData.append('test', testFile);

      const physicalRes = await fetch('/api/physical_stock_position', { 
          method: 'POST',
          body: formData
      });
      
      if (!physicalRes.ok) {
          const errData = await physicalRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to calculate positions");
      }
      
      const data = await physicalRes.json();
      setPhysicalData(data);
      setHasFetchedPhysical(true);
      setIsUpdatePositionsModalOpen(false);

    } catch (error: any) {
      console.error("Error fetching physical positions:", error);
      alert(`There was an error updating positions: ${error.message}`);
    } finally {
      setIsPhysicalLoading(false);
    }
  };

  const handleSearchBatch = async () => {
    if (!batchSearchQuery.trim()) return;
    setIsSearchingBatch(true);
    setSearchedBatch(null);
    try {
        const res = await fetch(`/api/contracts?searchBatch=${encodeURIComponent(batchSearchQuery.trim())}`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        
        if (Array.isArray(data) && data.length > 0) {
            setSearchedBatch(data[0]);
        } else {
            alert("No finished batch found matching this query.");
        }
    } catch (e) {
        console.error(e);
        alert("Error searching for batch.");
    } finally {
        setIsSearchingBatch(false);
    }
  };

  // Execution Toggle Flow
  const toggleContractExecution = async (id: number, currentStatus: boolean) => {
    if (!currentStatus) {
        setExecuteContractId(id);
        setExecuteForm({ containers: '', dispatchDate: '', finishedBatchId: null, finishedBatchNumber: '' });
        setBatchSearchQuery('');
        setSearchedBatch(null);
        setIsSearchingBatch(false);
        setIsExecuteModalOpen(true);
        return;
    }

    try {
      const response = await fetch('/api/contracts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, executed: false })
      });
      if (!response.ok) throw new Error("Failed to update status");
      
      setSales(prev => prev.map(sale => sale.id === id ? { ...sale, executed: false } : sale));
    } catch(e) {
      alert("Failed to toggle contract execution status.");
    }
  };

  const handleExecuteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!executeContractId) return;

    try {
        const response = await fetch('/api/contracts', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id: executeContractId, 
                executed: true,
                containers: executeForm.containers,
                dispatchDate: executeForm.dispatchDate,
                finishedBatchId: executeForm.finishedBatchId
            })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to execute contract");
        }
        
        setSales(prev => prev.map(sale => sale.id === executeContractId ? { ...sale, executed: true } : sale));
        setIsExecuteModalOpen(false);
        setExecuteContractId(null);
    } catch (error: any) {
        alert(`Execution failed: ${error.message}`);
    }
  };

  const filteredContracts = useMemo(() => {
    return sales.filter(sale => {
      if (!showExecutedContracts && bool(sale.executed)) return false;
      if (contractSearch) {
        const q = contractSearch.toLowerCase();
        return [sale.contract_number, sale.client, sale.quality, sale.strategy, sale.grade, sale.blend_name].some(val => String(val || '').toLowerCase().includes(q));
      }
      return true;
    });
  }, [sales, showExecutedContracts, contractSearch]);

  const uniqueClients = useMemo(() => {
      const clients = sales.map(s => s.client).filter(Boolean) as string[];
      return Array.from(new Set(clients)).sort();
  }, [sales]);

  // COMPUTE PHYSICAL GRID VIEW
  const physicalGridView = useMemo(() => {
    let sourceTheoretical: Record<string, number> = {};
    let initialKpis = { totalTheoretical: 0, totalShorts: 0, totalNet: 0 };
    let monthSet = new Set<string>();

    if (hasFetchedPhysical && physicalData) {
      physicalData.gridData.forEach(row => {
        sourceTheoretical[row.stack] = row.theoretical_volume;
      });
      initialKpis.totalTheoretical = physicalData.kpis.totalTheoretical;
      physicalData.months.forEach(m => monthSet.add(m));
    } 
    else if (historyData.length > 0) {
      const uniqueDates = Array.from(new Set(historyData.map(d => d.recorded_date))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      const latestDate = uniqueDates[0];
      const snapshot = historyData.filter(d => d.recorded_date === latestDate);
      
      snapshot.forEach(row => {
        const vol = asNumber(row.theoretical_volume);
        sourceTheoretical[row.stack] = vol;
        initialKpis.totalTheoretical += vol;
      });
    }

    const gridMap = new Map<string, PhysicalPositionRecord>();
    const blendMap = new Map(blends.map(b => [b.id, b]));

    BLEND_COMPONENTS.forEach(comp => {
      const theoretical = sourceTheoretical[comp.key] || 0;
      gridMap.set(comp.key, {
        stack: comp.key,
        theoretical_volume: theoretical,
        months: {},
        total_shorts: 0,
        net_position: theoretical
      });
    });

    sales.forEach(sale => {
      if (bool(sale.executed) || !sale.blend_id || sale.pending_dispatch) return;
      const blend = blendMap.get(Number(sale.blend_id));
      if (!blend) return;

      const monthKey = sale.shipping_date ? formatDateToMonthYear(sale.shipping_date) : 'Unscheduled';
      const weight = Math.abs(asNumber(sale.weight_kilos || sale.weight || sale.SMT || 0));
      monthSet.add(monthKey);

      BLEND_COMPONENTS.forEach(comp => {
        const compPercent = asNumber(blend[comp.key]) / 100;
        if (compPercent > 0) {
          const shortVol = weight * compPercent;
          const record = gridMap.get(comp.key)!;
          record.months[monthKey] = (record.months[monthKey] || 0) + shortVol;
          record.total_shorts += shortVol;
          record.net_position -= shortVol;
        }
      });
    });

    const gridData = Array.from(gridMap.values());
    const sortedMonths = Array.from(monthSet).sort((a, b) => {
        if (a === 'Unscheduled') return 1;
        if (b === 'Unscheduled') return -1;
        return new Date(a).getTime() - new Date(b).getTime();
    });

    let totalShorts = 0;
    let totalNet = 0;
    gridData.forEach(row => {
      totalShorts += row.total_shorts;
      totalNet += row.net_position;
    });

    return { 
      data: gridData, 
      months: sortedMonths, 
      kpis: {
        totalTheoretical: initialKpis.totalTheoretical,
        totalShorts,
        totalNet
      }
    };
  }, [physicalData, hasFetchedPhysical, sales, blends, historyData]);

  const visibleBlends = useMemo(() => {
    const q = blendSearch.trim().toLowerCase();
    return blends.map((blend) => ({ blend, composition: getBlendCompositionRow(blend), linkedContracts: sales.filter((sale) => Number(sale.blend_id) === blend.id) }))
      .filter(({ blend }) => !q || [blend.name, blend.client, blend.grade, blend.cup_profile, blend.blend_no].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [blends, sales, blendSearch]);

  const selectedBlendData = useMemo(() => {
    const blend = selectedBlendId ? blends.find((b) => b.id === selectedBlendId) ?? null : blends[0] ?? null;
    if (!blend) return null;
    return { blend, composition: getBlendCompositionRow(blend), linkedContracts: sales.filter((sale) => Number(sale.blend_id) === blend.id) };
  }, [blends, sales, selectedBlendId]);

  const blendCompositionTotal = useMemo(() => BLEND_COMPONENTS.reduce((sum, comp) => sum + asNumber(blendForm[comp.key]), 0), [blendForm]);

  const blendValidationMessage = useMemo(() => {
    const entered = BLEND_COMPONENTS.some((comp) => asNumber(blendForm[comp.key]) > 0);
    if (!isAddBlendModalOpen || !entered) return "";
    if (Math.abs(blendCompositionTotal - 100) < 0.01) return "";
    return blendCompositionTotal > 100 ? `Over 100% (${blendCompositionTotal.toFixed(2)}%).` : `Under 100% (${blendCompositionTotal.toFixed(2)}%).`;
  }, [isAddBlendModalOpen, blendCompositionTotal, blendForm]);

  const handleUploadSol = async () => {
    if (!solFile) return;
    const formData = new FormData();
    formData.append('sol_file', solFile);
    if (dnpFile) formData.append('daily_net_position_file', dnpFile);

    try {
      const response = await fetch('http://localhost:8100/api/upload_sol_report', { method: 'POST', body: formData });
      if (!response.ok) throw new Error("Failed to upload reports.");
      alert("Reports uploaded successfully!");
      setIsAddModalOpen(false);
      window.location.reload(); 
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleUploadPurchasesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseFile) return;
    const formData = new FormData();
    formData.append('xbs_file', purchaseFile);
    if (!isDirectSale && purchaseSaleNumber.trim()) formData.append('sale_number', purchaseSaleNumber.trim());
    try {
      const response = await fetch('http://localhost:8100/api/xbs_purchase_upload', { method: 'POST', body: formData });
      if (!response.ok) throw new Error("Failed to upload purchases.");
      alert("Purchases uploaded successfully!");
      setIsPurchaseModalOpen(false);
      setIsAddModalOpen(false);
    } catch (error) {
      alert("Error uploading file.");
    }
  };

  const handleManualSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(manualSaleForm) });
      if (!response.ok) throw new Error("Failed to save.");
      const data = await response.json();
      if (data.success && data.sale) setSales(prev => [...prev, data.sale]);
      setIsManualSalesModalOpen(false);
      setManualSaleForm({ contractNumber: '', client: '', weight: '', quality: '', grade: '', shippingDate: '', certifications: [] });
    } catch (error) {
      alert("Failed to save manual sale.");
    }
  };

  const handleEditClick = (sale: SaleContract) => {
      setEditingContractId(sale.id);
      setEditForm({
          quality: sale.quality || sale.strategy || '',
          grade: sale.grade || '',
          certifications: parseCerts(sale.certifications),
          blend_id: sale.blend_id || ''
      });
  };

  const handleSaveEdit = async (id: number) => {
      try {
          const payloadBlendId = editForm.blend_id === '' ? null : editForm.blend_id;
          const response = await fetch('/api/contracts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...editForm, blend_id: payloadBlendId }) });
          if (!response.ok) throw new Error("Failed to update");
          const selectedBlend = blends.find(b => b.id === Number(editForm.blend_id));
          setSales(prev => prev.map(sale => sale.id === id ? { ...sale, quality: editForm.quality, grade: editForm.grade, certifications: editForm.certifications, blend_id: payloadBlendId !== null ? Number(payloadBlendId) : undefined, blend_name: selectedBlend ? selectedBlend.name : undefined } : sale));
          setEditingContractId(null);
      } catch (e) {
          alert("Failed to update contract");
      }
  };

  async function updateContractBlend(contractId: number, blendId: number | null) {
    const contract = sales.find((sale) => sale.id === contractId);
    if (!contract) return;
    const response = await fetch("/api/contracts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contractId, quality: contract.quality || contract.strategy || "", grade: contract.grade || "", certifications: parseCerts(contract.certifications), blend_id: blendId }),
    });
    if (!response.ok) throw new Error("Failed to update contract");
    const selected = blends.find((b) => b.id === blendId);
    setSales((prev) => prev.map((sale) => (sale.id === contractId ? { ...sale, blend_id: blendId ?? undefined, blend_name: selected?.name ?? undefined } : sale)));
  }

  const openEditBlendModal = (blend: Blend) => {
    setEditingBlendId(blend.id);
    const formPopulate: Record<string, any> = { ...INITIAL_BLEND_FORM };
    
    // Map existing blend properties to the form state
    Object.keys(INITIAL_BLEND_FORM).forEach(key => {
        if (blend[key] !== undefined && blend[key] !== null) {
            formPopulate[key] = blend[key];
        }
    });
    
    setBlendForm(formPopulate);
    setIsAddBlendModalOpen(true);
  };

  const handleCreateBlendSubmit = async (e: React.MouseEvent | React.FormEvent, isDuplicate = false) => {
    e.preventDefault();
    const payload: any = Object.fromEntries(Object.entries(blendForm).filter(([_, v]) => v !== ''));

    if (isDuplicate) {
        payload.name = `${payload.name || 'Blend'}-Copy`;
    }

    const isUpdating = editingBlendId !== null && !isDuplicate;
    const method = isUpdating ? 'PUT' : 'POST';
    
    if (isUpdating) {
        payload.id = editingBlendId;
    }

    try {
      const response = await fetch('/api/blends', { 
          method, 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(payload) 
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Failed to ${isUpdating ? 'update' : 'create'} blend`);
      
      if (data.success) {
        if (isUpdating) {
            setBlends(prev => prev.map(b => b.id === editingBlendId ? { ...b, ...payload } as Blend : b));
        } else {
            setBlends(prev => [{ id: data.id, ...payload } as Blend, ...prev]);
            setSelectedBlendId(data.id);
        }
        setIsAddBlendModalOpen(false);
        setEditingBlendId(null);
        setBlendForm(INITIAL_BLEND_FORM);
      }
    } catch (error: any) {
      alert(error.message);
    }
  };

  async function deleteBlend(blendId: number) {
    try {
      const linked = sales.filter((sale) => Number(sale.blend_id) === blendId);
      await Promise.allSettled(linked.map(s => updateContractBlend(s.id, null)));
      const response = await fetch(`/api/blends?id=${blendId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Deletion failed");
      setBlends((prev) => prev.filter((b) => b.id !== blendId));
      if (selectedBlendId === blendId) setSelectedBlendId(null);
      alert("Blend deleted successfully.");
    } catch (error) {
      alert("Failed to delete blend.");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#D6D2C4] flex flex-col items-center justify-center text-[#51534a] font-bold gap-4">
        <RefreshCw className="animate-spin text-[#007680]" size={40} />
        <div>Brewing Coffee Data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#D6D2C4] font-sans text-[#51534a] relative overflow-x-hidden">
      
      {/* --- CHART SIDE DRAWER --- */}
      <div className={`fixed inset-0 z-[100] transition-opacity duration-300 ${isChartDrawerOpen ? 'bg-black/40 visible' : 'bg-transparent invisible pointer-events-none'}`} onClick={() => setIsChartDrawerOpen(false)}>
         <div 
           className={`absolute top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl transition-transform duration-300 transform p-6 flex flex-col ${isChartDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
           onClick={e => e.stopPropagation()}
         >
            <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-[#51534a]">Position History</h3>
                  <p className="text-sm text-[#968C83]">7-Day trend of net positions</p>
                </div>
                <button onClick={() => setIsChartDrawerOpen(false)} className="p-2 hover:bg-[#F5F5F3] rounded-full transition-colors"><X size={24} /></button>
            </div>

            <div className="flex bg-[#F5F5F3] rounded-lg p-1 border border-[#D6D2C4] shadow-inner mb-6 w-max">
                <button onClick={() => setPositionFilter('all')} className={`px-4 py-1.5 text-xs font-bold rounded transition-colors ${positionFilter === 'all' ? 'bg-white shadow text-[#51534a]' : 'text-[#968C83] hover:text-[#51534a]'}`}>ALL</button>
                <button onClick={() => setPositionFilter('long')} className={`px-4 py-1.5 text-xs font-bold rounded transition-colors ${positionFilter === 'long' ? 'bg-white shadow text-[#007680]' : 'text-[#968C83] hover:text-[#007680]'}`}>LONG</button>
                <button onClick={() => setPositionFilter('short')} className={`px-4 py-1.5 text-xs font-bold rounded transition-colors ${positionFilter === 'short' ? 'bg-white shadow text-red-500' : 'text-[#968C83] hover:text-red-500'}`}>SHORT</button>
            </div>

            <div className="flex-1 min-h-0">
                {chartData.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData.data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFEFE9" />
                      <XAxis dataKey="date" tick={{fontSize: 11, fill: '#968C83'}} axisLine={false} tickLine={false} />
                      <YAxis tick={{fontSize: 11, fill: '#968C83'}} axisLine={false} tickLine={false} tickFormatter={(val) => formatNumber(convertQty(val, unit))} />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                                const activePayload = payload.filter((p: any) => Math.abs(p.value) > 0.01).sort((a: any, b: any) => Math.abs(b.value) - Math.abs(a.value));
                                if (activePayload.length === 0) return null;
                                return (
                                    <div className="bg-white/95 backdrop-blur-sm p-4 border border-[#D6D2C4] shadow-xl rounded-xl text-xs min-w-[180px]">
                                        <p className="font-bold mb-3 text-[#51534a] border-b border-[#D6D2C4] pb-2">{label}</p>
                                        <div className="space-y-1.5">
                                            {activePayload.map((entry: any) => (
                                                <div key={entry.name} className="flex justify-between items-center gap-4">
                                                    <span style={{ color: entry.color }} className="font-medium truncate max-w-[140px]">{entry.name}</span>
                                                    <span className="font-bold text-[#51534a]">{formatNumber(convertQty(entry.value, unit))}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }}
                      />
                      {chartData.stacks.map((stack, i) => (
                        <Line key={stack} type="monotone" dataKey={stack} name={formatStackName(stack)} stroke={`hsl(${(i * 137.5) % 360}, 65%, 45%)`} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-[#968C83] italic">No history data available.</div>
                )}
            </div>
         </div>
      </div>

      {/* --- ADD / UPLOAD RECORDS MODAL --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-[#EFEFE9] w-full max-w-4xl rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#D6D2C4] bg-white">
              <h2 className="text-lg font-bold text-[#51534a] flex items-center gap-2">
                <div className="w-8 h-8 bg-[#007680] rounded flex items-center justify-center text-white"><Plus size={18} /></div>
                Add / Upload Records
              </h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-[#968C83] hover:text-[#51534a]"><X size={20} /></button>
            </div>
            <div className="flex flex-col md:flex-row divide-[#D6D2C4] bg-[#F5F5F3]">
              <div className="flex-1 p-6 flex flex-col gap-6">
                <div><h3 className="font-bold text-[#51534a] text-sm">Upload Purchases</h3></div>
                <FileDropZone label="XBS Template" accept=".xls,.xlsx" file={purchaseFile} onFileAdded={setPurchaseFile} onRemoveFile={() => setPurchaseFile(null)} />
                <button onClick={() => setIsPurchaseModalOpen(true)} disabled={!purchaseFile} className="w-full bg-[#51534a] text-white px-4 py-2 rounded text-sm font-medium">Next</button>
              </div>
              <div className="flex-1 p-6 flex flex-col gap-6 bg-white/50 border-l border-[#D6D2C4]">
                <div><h3 className="font-bold text-[#51534a] text-sm">Add Sales & Daily Position</h3></div>
                <div className="grid grid-cols-1 gap-4">
                  <FileDropZone label="SOL Report *" accept=".xls,.xlsx" file={solFile} onFileAdded={setSolFile} onRemoveFile={() => setSolFile(null)} />
                  <FileDropZone label="Daily Net Position (Optional)" accept=".xls,.xlsx" file={dnpFile} onFileAdded={setDnpFile} onRemoveFile={() => setDnpFile(null)} />
                  {solFile && <button onClick={handleUploadSol} className="w-full bg-[#007680] text-white px-4 py-2 rounded text-sm font-medium flex justify-center items-center gap-2"><CloudUpload size={16}/> Upload Reports</button>}
                </div>
                <div className="flex items-center gap-4 my-2"><div className="h-px bg-[#D6D2C4] flex-1"></div><span className="text-[10px] font-bold text-[#968C83]">OR</span><div className="h-px bg-[#D6D2C4] flex-1"></div></div>
                <button onClick={() => setIsManualSalesModalOpen(true)} disabled={!!solFile} className="w-full bg-white border-2 border-[#007680] text-[#007680] px-4 py-2 rounded text-sm font-bold">Manual Entry</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- RECALCULATE POSITIONS MODAL --- */}
      {isUpdatePositionsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#D6D2C4] bg-[#F5F5F3]">
              <h3 className="font-bold text-[#51534a]">Recalculate theoretical volumes</h3>
              <button onClick={() => setIsUpdatePositionsModalOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleFetchPhysicalPositions} className="p-5 flex flex-col gap-4">
              <p className="text-xs text-[#968C83]">Upload reports to update the theoretical base. Without this, the system defaults to the last known base snapshot.</p>
              <div className="space-y-3">
                  <FileDropZone label="Current Stock (CSV)" accept=".csv" file={stockFile} onFileAdded={setStockFile} onRemoveFile={() => setStockFile(null)} />
                  <FileDropZone label="Proc. Analysis (XLSX)" accept=".xls,.xlsx" file={procFile} onFileAdded={setProcFile} onRemoveFile={() => setProcFile(null)} />
                  <FileDropZone label="Test Details (XLSX)" accept=".xls,.xlsx" file={testFile} onFileAdded={setTestFile} onRemoveFile={() => setTestFile(null)} />
              </div>
              <div className="pt-4 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setIsUpdatePositionsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-[#968C83]">Cancel</button>
                <button type="submit" disabled={!stockFile || !procFile || !testFile || isPhysicalLoading} className="bg-[#007680] text-white px-6 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                  {isPhysicalLoading ? 'Calculating...' : 'Run New Calculation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EXECUTE CONTRACT MODAL --- */}
      {isExecuteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#D6D2C4] bg-[#F5F5F3]">
              <h3 className="font-bold text-[#51534a] flex items-center gap-2">
                  <PackageCheck size={16} className="text-[#007680]"/>
                  Execute Contract
              </h3>
              <button onClick={() => setIsExecuteModalOpen(false)} className="text-[#968C83] hover:text-[#51534a] p-1 rounded-full hover:bg-[#D6D2C4]/50">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleExecuteSubmit} className="p-5 flex flex-col gap-4">
              <p className="text-xs text-[#968C83] mb-1">
                This will mark the contract as executed and automatically generate sale records for each split container.
              </p>

              <div className="bg-[#D6D2C4]/20 p-3 rounded-lg border border-[#D6D2C4]/50">
                   <div className="grid grid-cols-3 gap-2 mb-2">
                       <div>
                           <div className="text-[10px] uppercase text-[#968C83] font-bold">Financing Rate</div>
                           <div className="text-sm font-bold text-[#51534a]">{getVariableValue('Financing Rate per Annum')}%</div>
                       </div>
                       <div>
                           <div className="text-[10px] uppercase text-[#968C83] font-bold">Financed Cost</div>
                           <div className="text-sm font-bold text-[#51534a]">{getVariableValue('Financed cost percentage')}%</div>
                       </div>
                       <div>
                           <div className="text-[10px] uppercase text-[#968C83] font-bold">Fixed Fobbing</div>
                           <div className="text-sm font-bold text-[#51534a]">{getVariableValue('Fixed Fobbing Costs')} c/lb</div>
                       </div>
                   </div>
                   <p className="text-[10px] font-bold text-red-500 flex items-center gap-1 border-t border-[#D6D2C4] pt-2 mt-1">
                      <AlertCircle size={12} /> Ensure these are up to date, lias with Finance department.
                   </p>
              </div>

              <div>
                <label className="text-xs font-bold text-[#51534a] mb-1 block">Number of Containers *</label>
                <input 
                  type="number" required min="1" step="1" placeholder="e.g. 2"
                  className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                  value={executeForm.containers}
                  onChange={(e) => setExecuteForm({...executeForm, containers: e.target.value})}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#51534a] mb-1 block">Dispatch / Blocked Date *</label>
                <input 
                  type="date" required
                  className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                  value={executeForm.dispatchDate}
                  onChange={(e) => setExecuteForm({...executeForm, dispatchDate: e.target.value})}
                />
              </div>

              <div>
                  <label className="text-xs font-bold text-[#51534a] mb-1 block">Final bulk for contract (Batch Number)</label>
                  <div className="flex gap-2">
                      <input 
                          type="text" 
                          placeholder="Search batch number..."
                          className="flex-1 border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                          value={batchSearchQuery}
                          onChange={(e) => setBatchSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchBatch())}
                      />
                      <button 
                          type="button" 
                          onClick={handleSearchBatch}
                          disabled={isSearchingBatch || !batchSearchQuery.trim()}
                          className="bg-[#D6D2C4] text-[#51534a] px-3 py-2 rounded-lg text-sm font-bold hover:bg-[#968C83] hover:text-white transition-colors disabled:opacity-50 flex items-center justify-center"
                      >
                          {isSearchingBatch ? '...' : <Search size={16} />}
                      </button>
                  </div>
                  
                  {searchedBatch && (
                      <div className="mt-2 p-3 border border-[#007680]/30 bg-[#007680]/5 rounded-lg flex items-center justify-between">
                          <div>
                              <div className="text-sm font-bold text-[#51534a]">{searchedBatch.batch_number}</div>
                              <div className="text-xs text-[#968C83]">Output: {formatNumber(searchedBatch.output_qty)} kg</div>
                          </div>
                          {executeForm.finishedBatchId === searchedBatch.id ? (
                              <span className="flex items-center gap-1 text-xs font-bold text-[#007680] bg-white px-2 py-1 rounded shadow-sm border border-[#007680]/20">
                                  <Check size={14} /> Tagged
                              </span>
                          ) : (
                              <button 
                                  type="button"
                                  onClick={() => setExecuteForm(prev => ({ ...prev, finishedBatchId: searchedBatch.id, finishedBatchNumber: searchedBatch.batch_number }))}
                                  className="text-xs font-bold text-white bg-[#007680] px-3 py-1.5 rounded hover:bg-[#007680]/90 transition-colors shadow-sm"
                              >
                                  Tag Batch
                              </button>
                          )}
                      </div>
                  )}

                  {executeForm.finishedBatchId && !searchedBatch && (
                      <div className="mt-2 text-xs font-bold text-[#007680] flex items-center gap-1">
                          <Check size={14} /> Tagged: {executeForm.finishedBatchNumber}
                          <button type="button" onClick={() => setExecuteForm(prev => ({...prev, finishedBatchId: null, finishedBatchNumber: ''}))} className="text-red-500 hover:underline ml-2 text-[10px]">Remove</button>
                      </div>
                  )}
              </div>

              <div className="pt-2 mt-2 border-t border-[#D6D2C4] flex justify-end gap-2">
                <button type="button" onClick={() => setIsExecuteModalOpen(false)} className="px-4 py-2 text-sm font-bold text-[#968C83] hover:bg-[#F5F5F3] rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="bg-[#007680] text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-[#007680]/90 transition-all shadow-sm">Execute & Split</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MANUAL ADD SALES MODAL --- */}
      {isManualSalesModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#D6D2C4] bg-[#F5F5F3]">
              <h3 className="font-bold text-[#51534a]">Manual Sale Entry</h3>
              <button onClick={() => setIsManualSalesModalOpen(false)} className="text-[#968C83] hover:text-[#51534a] p-1 rounded-full hover:bg-[#D6D2C4]/50">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleManualSaleSubmit} className="p-5 flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-[#51534a] mb-1 block">Contract Number *</label>
                <input 
                  type="text" required placeholder="e.g. SC-2024-001"
                  className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                  value={manualSaleForm.contractNumber}
                  onChange={(e) => setManualSaleForm({...manualSaleForm, contractNumber: e.target.value})}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#51534a] mb-1 block">Client</label>
                <input 
                  type="text" list="client-options" placeholder="Type or select client name"
                  className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                  value={manualSaleForm.client}
                  onChange={(e) => setManualSaleForm({...manualSaleForm, client: e.target.value})}
                />
                <datalist id="client-options">
                  {uniqueClients.map(client => (
                    <option key={client} value={client} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-[#51534a] mb-1 block">Weight (kg) *</label>
                    <input 
                      type="number" required min="0" step="0.01" placeholder="0.00"
                      className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                      value={manualSaleForm.weight}
                      onChange={(e) => setManualSaleForm({...manualSaleForm, weight: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#51534a] mb-1 block">Shipping Date *</label>
                    <input 
                      type="date" required
                      className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                      value={manualSaleForm.shippingDate}
                      onChange={(e) => setManualSaleForm({...manualSaleForm, shippingDate: e.target.value})}
                    />
                  </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#51534a] mb-1 block">Quality (Strategy) *</label>
                <select 
                  required
                  className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none bg-white text-[#51534a]"
                  value={manualSaleForm.quality}
                  onChange={(e) => setManualSaleForm({...manualSaleForm, quality: e.target.value})}
                >
                  <option value="" disabled>Select Quality Strategy</option>
                  {CONTRACT_QUALITIES.map(strat => (
                    <option key={strat} value={strat}>{strat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#51534a] mb-1 block">Grade</label>
                <input 
                  type="text" placeholder="e.g. FAQ, AA, AB"
                  className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                  value={manualSaleForm.grade}
                  onChange={(e) => setManualSaleForm({...manualSaleForm, grade: e.target.value})}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#51534a] mb-1 block">Certification(s)</label>
                <select 
                  className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none bg-white text-[#51534a]"
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'UNCERTIFIED') {
                        setManualSaleForm({ ...manualSaleForm, certifications: [] });
                    } else if (val && !manualSaleForm.certifications.includes(val)) {
                        setManualSaleForm({ ...manualSaleForm, certifications: [...manualSaleForm.certifications, val] });
                    }
                  }}
                >
                  <option value="" disabled>Select Certification(s)</option>
                  <option value="UNCERTIFIED" className="text-[#B9975B] font-bold">Uncertified (Clear All)</option>
                  {certOptions.map(cert => (
                    <option key={cert} value={cert} disabled={manualSaleForm.certifications.includes(cert)}>
                      {cert}
                    </option>
                  ))}
                </select>

                {manualSaleForm.certifications.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {manualSaleForm.certifications.map(cert => (
                      <span key={cert} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#A4DBE8]/30 text-[#007680] border border-[#007680]/20 text-[11px] font-bold rounded-full">
                        {cert}
                        <button
                          type="button"
                          onClick={() => setManualSaleForm({ ...manualSaleForm, certifications: manualSaleForm.certifications.filter(c => c !== cert) })}
                          className="hover:text-red-500 hover:bg-red-50 rounded-full p-0.5 transition-colors ml-1"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 mt-2 border-t border-[#D6D2C4] flex justify-end gap-2">
                <button type="button" onClick={() => setIsManualSalesModalOpen(false)} className="px-4 py-2 text-sm font-bold text-[#968C83] hover:bg-[#F5F5F3] rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="bg-[#007680] text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-[#007680]/90 transition-all shadow-sm">Save Sale</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- PURCHASE CONFIG MODAL --- */}
      {isPurchaseModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#D6D2C4] bg-[#F5F5F3]">
              <h3 className="font-bold text-[#51534a]">Purchase Details</h3>
              <button onClick={() => setIsPurchaseModalOpen(false)} className="text-[#968C83] hover:text-[#51534a] p-1 rounded-full hover:bg-[#D6D2C4]/50">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleUploadPurchasesSubmit} className="p-5 flex flex-col gap-5">
              <label className="flex items-center gap-3 p-3 border border-[#D6D2C4] rounded-lg cursor-pointer hover:bg-[#F5F5F3] transition-colors">
                <input 
                  type="checkbox" checked={isDirectSale} 
                  onChange={(e) => { setIsDirectSale(e.target.checked); if (e.target.checked) setPurchaseSaleNumber(''); }} 
                  className="w-4 h-4 text-[#007680] rounded border-[#D6D2C4] focus:ring-[#007680] focus:ring-2" 
                />
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-[#51534a]">Direct Sale (DS)</span>
                  <span className="text-[10px] text-[#968C83]">Check this if there is no specific sale number.</span>
                </div>
              </label>

              <div className={`transition-opacity duration-200 ${isDirectSale ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                <label className="text-xs font-bold text-[#51534a] mb-1 block">Sale Number *</label>
                <input 
                  type="text" required={!isDirectSale} placeholder="e.g. SALE-2026-001"
                  className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                  value={purchaseSaleNumber}
                  onChange={(e) => setPurchaseSaleNumber(e.target.value)}
                />
              </div>

              <div className="pt-2 mt-2 border-t border-[#D6D2C4] flex justify-end gap-2">
                <button type="button" onClick={() => setIsPurchaseModalOpen(false)} className="px-4 py-2 text-sm font-bold text-[#968C83] hover:bg-[#F5F5F3] rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="bg-[#007680] text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-[#007680]/90 transition-all shadow-sm">Confirm & Upload</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CREATE / EDIT BLEND MODAL --- */}
      {isAddBlendModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#D6D2C4] bg-white">
              <div>
                <div className="text-lg font-bold text-[#51534a]">
                    {editingBlendId ? 'Edit Blend' : 'Create New Blend'}
                </div>
                <div className="text-xs text-[#968C83]">Composition must equal exactly 100%</div>
              </div>
              <button 
                onClick={() => {
                    setIsAddBlendModalOpen(false);
                    setEditingBlendId(null);
                    setBlendForm(INITIAL_BLEND_FORM);
                }} 
                className="text-[#968C83] hover:text-[#51534a] p-1.5 rounded-full hover:bg-[#D6D2C4]/30 transition-all"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-5">
              {blendValidationMessage ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-sm">
                  {blendValidationMessage}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <input 
                  type="text" placeholder="Blend Name *"
                  className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]"
                  value={blendForm.name || ''}
                  onChange={(e) => setBlendForm({...blendForm, name: e.target.value})}
                />
                <input 
                  type="text" placeholder="Client"
                  className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]"
                  value={blendForm.client || ''}
                  onChange={(e) => setBlendForm({...blendForm, client: e.target.value})}
                />
                <input 
                  type="text" placeholder="Blend No."
                  className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]"
                  value={blendForm.blend_no || ''}
                  onChange={(e) => setBlendForm({...blendForm, blend_no: e.target.value})}
                />
                <input 
                  type="text" placeholder="Grade"
                  className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]"
                  value={blendForm.grade || ''}
                  onChange={(e) => setBlendForm({...blendForm, grade: e.target.value})}
                />
                <input 
                  type="text" placeholder="Cup Profile"
                  className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680] md:col-span-2 xl:col-span-4"
                  value={blendForm.cup_profile || ''}
                  onChange={(e) => setBlendForm({...blendForm, cup_profile: e.target.value})}
                />
              </div>

              <div className="mt-5 rounded-2xl border border-[#D6D2C4] bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[#51534a]">Composition</div>
                  <div className={Math.abs(blendCompositionTotal - 100) < 0.01 ? "font-bold text-[#007680]" : blendCompositionTotal > 100 ? "font-bold text-red-600" : "font-bold text-[#B9975B]"}>{blendCompositionTotal.toFixed(2)}%</div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#D6D2C4]">
                  <div className="h-full rounded-full bg-[#007680]" style={{ width: `${Math.min(100, blendCompositionTotal)}%` }} />
                </div>
                <div className="mt-2 text-xs text-[#968C83]">Composition must equal exactly 100% before saving.</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {BLEND_COMPONENTS.map((comp) => (
                    <div key={comp.key}>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#968C83]">{comp.label}</label>
                      <input 
                        type="number" min="0" max="100" step="0.01" placeholder="0.00"
                        className="w-full rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]"
                        value={blendForm[comp.key] || ''}
                        onChange={(e) => setBlendForm({...blendForm, [comp.key]: e.target.value})}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <div>
                    {editingBlendId && (
                        <button 
                            type="button" 
                            onClick={(e) => handleCreateBlendSubmit(e, true)} 
                            disabled={!blendForm.name.trim() || Math.abs(blendCompositionTotal - 100) > 0.01} 
                            className="text-xs font-bold text-[#007680] hover:underline flex items-center gap-1 disabled:opacity-50"
                        >
                            <Copy size={14}/> Duplicate Blend
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        type="button" 
                        onClick={() => {
                            setIsAddBlendModalOpen(false); 
                            setEditingBlendId(null); 
                            setBlendForm(INITIAL_BLEND_FORM);
                        }} 
                        className="rounded-lg border border-[#D6D2C4] bg-white px-4 py-2 text-sm font-bold text-[#51534a]"
                    >
                        Cancel
                    </button>
                    <button 
                        type="button" 
                        onClick={(e) => handleCreateBlendSubmit(e, false)} 
                        disabled={!blendForm.name.trim() || Math.abs(blendCompositionTotal - 100) > 0.01} 
                        className="rounded-lg bg-[#007680] px-5 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                    >
                        {editingBlendId ? 'Update Blend' : 'Save Blend'}
                    </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-full mx-auto space-y-6 px-4 py-6 md:px-8">
        
        {/* --- HEADER --- */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#51534a] flex items-center gap-2">
              <div className="w-8 h-8 bg-[#007680] rounded-lg flex items-center justify-center text-white"><ShieldCheck size={18} /></div>
              Coffee Positions
            </h1>
            <p className="text-[#968C83] text-sm mt-0.5">Live view of Theoretical Stock vs Blend Commitments</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white p-1 rounded-lg border border-[#968C83]/20 shadow-sm">
              {(['kg', 'bag', 'mt'] as Unit[]).map((u) => (
                <button key={u} onClick={() => setUnit(u)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${unit === u ? 'bg-[#007680] text-white' : 'text-[#968C83] hover:bg-[#D6D2C4]/30'}`}>{u.toUpperCase()}</button>
              ))}
            </div>
            
            {activeTab === 'physical' && (
               <button onClick={() => setIsChartDrawerOpen(true)} className="flex items-center justify-center w-10 h-10 bg-white border border-[#968C83]/30 text-[#51534a] rounded-lg hover:bg-[#F5F5F3] shadow-sm" title="View History Chart">
                 <LineChartIcon size={20} />
               </button>
            )}

            <button onClick={() => setIsAddModalOpen(true)} className="flex items-center justify-center w-10 h-10 bg-[#007680] text-white rounded-lg hover:bg-[#007680]/90 shadow-sm"><Plus size={20} /></button>
          </div>
        </header>

        {/* --- TABS --- */}
        <nav className="flex gap-1 border-b border-[#968C83]/30 overflow-x-auto">
          {([['physical', <Box key="b" size={16}/>, 'Physical'], ['contracts', <FileSpreadsheet key="s" size={16}/>, 'Contracts'], ['blends', <Combine key="c" size={16}/>, 'Blends']] as const).map(([tab, icon, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-4 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-[#007680] text-[#007680]' : 'border-transparent text-[#968C83] hover:text-[#51534a]'}`}>
                {icon} {label}
            </button>
          ))}
        </nav>

        {/* --- CONTENT --- */}
        <main className="space-y-6">

          {activeTab === 'physical' && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    ['THEORETICAL STOCK', physicalGridView.kpis.totalTheoretical, '#007680', <TrendingUp key="up" size={18}/>],
                    ['TOTAL BLEND SHORTS', physicalGridView.kpis.totalShorts, '#5B3427', <TrendingDown key="down" size={18} className="text-[#B9975B]"/>],
                    ['NET POSITION', physicalGridView.kpis.totalNet, physicalGridView.kpis.totalNet >= 0 ? '#007680' : '#B9975B', physicalGridView.kpis.totalNet >= 0 ? <TrendingUp key="up2" size={18} className="text-[#97D700]"/> : <TrendingDown key="down2" size={18}/>]
                ].map(([label, val, color, icon]) => (
                    <Card key={label as string} className="p-4" style={{ borderLeft: `4px solid ${color}` }}>
                        <div className="text-[#968C83] text-[10px] font-bold tracking-widest uppercase">{label}</div>
                        <div className="text-2xl font-bold text-[#51534a] mt-1 flex items-center justify-between">
                            <span>{formatNumber(convertQty(val as number, unit))} <span className="text-xs font-normal text-[#968C83]">{unitText(unit)}</span></span>
                            {icon}
                        </div>
                    </Card>
                ))}
              </div>

              {/* TABLE CONTAINER - FULL WIDTH */}
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-white px-5 py-3 rounded-xl border border-[#968C83]/20 shadow-sm">
                  <div>
                    <h3 className="font-bold text-sm text-[#51534a]">Live Position Table</h3>
                    <p className="text-[10px] text-[#968C83]">Snapshot: {hasFetchedPhysical ? 'Fresh Upload' : 'Latest Backend Sync'}</p>
                  </div>
                  <button onClick={() => setIsUpdatePositionsModalOpen(true)} className="flex items-center gap-2 bg-[#007680] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#007680]/90 transition-all shadow-sm">
                    <RefreshCw size={14} /> Recalculate Base
                  </button>
                </div>

                <Card className="overflow-hidden border-none shadow-md">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left whitespace-nowrap min-w-full">
                      <thead className="bg-[#51534a] text-white font-bold sticky top-0 z-10 uppercase tracking-tight">
                        <tr>
                          <th className="py-2.5 px-3 border-r border-white/5">Post Stack</th>
                          <th className="py-2.5 px-3 text-right bg-[#42443d]">Theoretical Vol. ({unit})</th>
                          {physicalGridView.months.map(month => (
                            <th key={month} className="py-2.5 px-3 text-right bg-[#5B3427] border-l border-white/5">{month}</th>
                          ))}
                          <th className="py-2.5 px-3 text-right bg-[#B9975B]/30 border-l border-white/5">Total Shorts</th>
                          <th className="py-2.5 px-3 text-right bg-[#007680] border-l border-white/5">Net Position</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D6D2C4]/50">
                        {physicalGridView.data.map((row) => {
                          let runningAvailable = row.theoretical_volume;
                          return (
                            <tr key={row.stack} className="bg-white hover:bg-[#F5F5F3] transition-colors">
                              <td className="py-2 px-3 font-bold text-[#007680] border-r border-[#D6D2C4]/30">{formatStackName(row.stack)}</td>
                              <td className="py-2 px-3 text-right font-medium text-[#51534a] bg-[#F5F5F3]/80">
                                {formatNumber(convertQty(row.theoretical_volume, unit))}
                              </td>
                              {physicalGridView.months.map(month => {
                                const val = row.months[month] || 0;
                                let colorClass = "text-[#968C83]";
                                if (val > 0.01) {
                                  colorClass = runningAvailable >= val ? "text-[#007680] font-bold" : "text-red-500 font-bold";
                                  runningAvailable -= val;
                                }
                                return <td key={month} className={`py-2 px-3 text-right border-l border-[#D6D2C4]/20 ${colorClass}`}>{val > 0.01 ? formatNumber(convertQty(val, unit)) : '-'}</td>;
                              })}
                              <td className="py-2 px-3 text-right font-bold text-[#5B3427] bg-[#B9975B]/5 border-l border-[#D6D2C4]/30">
                                {formatNumber(convertQty(row.total_shorts, unit))}
                              </td>
                              <td className={`py-2 px-3 text-right font-bold border-l border-[#D6D2C4]/30 ${row.net_position >= 0 ? 'text-[#007680] bg-[#007680]/5' : 'text-red-500 bg-red-50'}`}>
                                {row.net_position > 0 ? '+' : ''}{formatNumber(convertQty(row.net_position, unit))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-[#EFEFE9] sticky bottom-0 border-t-2 border-[#D6D2C4] font-bold text-[#51534a] text-xs">
                        <tr>
                          <td className="py-3 px-3">TOTAL AGGREGATE</td>
                          <td className="py-3 px-3 text-right">{formatNumber(convertQty(physicalGridView.kpis.totalTheoretical, unit))}</td>
                          {physicalGridView.months.map(month => {
                              const mSum = physicalGridView.data.reduce((s, r) => s + (r.months[month] || 0), 0);
                              return <td key={month} className="py-3 px-3 text-right text-[#5B3427]">{mSum > 0.01 ? formatNumber(convertQty(mSum, unit)) : '-'}</td>;
                          })}
                          <td className="py-3 px-3 text-right text-[#5B3427] border-l border-[#D6D2C4]/30">{formatNumber(convertQty(physicalGridView.kpis.totalShorts, unit))}</td>
                          <td className={`py-3 px-3 text-right border-l border-[#D6D2C4]/30 ${physicalGridView.kpis.totalNet >= 0 ? 'text-[#007680]' : 'text-red-500'}`}>
                              {physicalGridView.kpis.totalNet > 0 ? '+' : ''}{formatNumber(convertQty(physicalGridView.kpis.totalNet, unit))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              </div>
            </>
          )}

          {activeTab === 'contracts' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="relative w-full sm:w-96">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" />
                      <input type="text" placeholder="Search contracts, clients..." value={contractSearch} onChange={(e) => setContractSearch(e.target.value)} className="w-full border border-[#D6D2C4] rounded-lg pl-9 pr-3 py-2 text-sm outline-none bg-white shadow-sm" />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer bg-white px-4 py-2 border border-[#D6D2C4] rounded-lg hover:bg-[#F5F5F3] shadow-sm">
                      <input type="checkbox" checked={showExecutedContracts} onChange={(e) => setShowExecutedContracts(e.target.checked)} className="w-4 h-4 text-[#007680] rounded" />
                      <span className="text-sm font-bold text-[#51534a]">Show Executed</span>
                  </label>
              </div>
              <Card className="overflow-hidden border-none shadow-md">
                <div className="overflow-x-auto max-h-[70vh]">
                  <table className="w-full text-[11px] text-left whitespace-nowrap">
                    <thead className="bg-[#51534a] text-white font-bold sticky top-0 z-10 uppercase">
                      <tr>
                        <th className="py-3 px-4">Contract</th>
                        <th className="py-3 px-4">Client</th>
                        <th className="py-3 px-4 text-right">Weight</th>
                        <th className="py-3 px-4">Ship Date</th>
                        <th className="py-3 px-4">Quality</th>
                        <th className="py-3 px-4 w-1/5">Certifications</th>
                        <th className="py-3 px-4">Blend</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D6D2C4]">
                      {filteredContracts.map((sale) => {
                        const isEditing = editingContractId === sale.id;
                        const isExecuted = bool(sale.executed);
                        const displayCerts = parseCerts(sale.certifications);

                        return (
                          <tr key={sale.id} className={`${sale.pending_dispatch ? 'bg-red-50 hover:bg-red-100/80' : 'bg-white hover:bg-[#F5F5F3]'} ${isExecuted ? 'opacity-50' : ''}`}>
                            <td className="py-2.5 px-4 font-bold">
                              <div className="flex items-center gap-2">
                                {isExecuted && <CheckCircle size={14} className="text-[#007680]" />}
                                {sale.contract_number}
                                {sale.pending_dispatch && <AlertCircle size={14} className="text-red-500"/>}
                              </div>
                            </td>
                            <td className="py-2.5 px-4">{sale.client || '-'}</td>
                            <td className="py-2.5 px-4 text-right font-medium text-[#5B3427]">{formatNumber(convertQty(asNumber(sale.weight_kilos), unit))}</td>
                            <td className="py-2.5 px-4 text-[#968C83]">{formatDateToMonthYear(sale.shipping_date)}</td>
                            
                            <td className="py-2.5 px-4">
                              {isEditing ? (
                                <select 
                                  className="w-full border border-[#007680] rounded px-2 py-1 text-xs focus:outline-none bg-white text-[#51534a]"
                                  value={editForm.quality}
                                  onChange={(e) => setEditForm({...editForm, quality: e.target.value})}
                                >
                                  <option value="" disabled>Select Quality</option>
                                  {CONTRACT_QUALITIES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              ) : (
                                <span className="text-[#007680] font-bold">{sale.quality || sale.strategy || '-'}</span>
                              )}
                            </td>

                            <td className="py-2.5 px-4">
                              {isEditing ? (
                                <div className="flex flex-col gap-2 min-w-[180px]">
                                    <select 
                                      className="w-full border border-[#007680] rounded px-2 py-1 text-xs focus:outline-none bg-white text-[#51534a]"
                                      value=""
                                      onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === 'UNCERTIFIED') {
                                              setEditForm({...editForm, certifications: []});
                                          } else if (val && !editForm.certifications.includes(val)) {
                                              setEditForm({...editForm, certifications: [...editForm.certifications, val]});
                                          }
                                      }}
                                    >
                                      <option value="" disabled>Add Certification...</option>
                                      <option value="UNCERTIFIED" className="text-[#B9975B] font-bold">Uncertified (Clear All)</option>
                                      {certOptions.map(opt => <option key={opt} value={opt} disabled={editForm.certifications.includes(opt)}>{opt}</option>)}
                                    </select>
                                    <div className="flex flex-wrap gap-1">
                                        {editForm.certifications.map(cert => (
                                            <span key={cert} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#A4DBE8]/30 text-[#007680] border border-[#007680]/20 text-[10px] font-bold rounded-sm">
                                              {cert}
                                              <button 
                                                type="button"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  setEditForm({...editForm, certifications: editForm.certifications.filter(c => c !== cert)});
                                                }} 
                                                className="hover:text-red-500"
                                              >
                                                <X size={10} />
                                              </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {displayCerts.length > 0 ? displayCerts.map(c => <span key={c} className="px-1 bg-[#D6D2C4]/30 rounded-sm text-[9px] font-bold">{c}</span>) : <span className="text-[#968C83] text-xs italic">Uncertified</span>}
                                </div>
                              )}
                            </td>

                            <td className="py-2.5 px-4">
                              {isEditing ? (
                                <select 
                                  className="w-full border border-[#007680] rounded px-2 py-1 text-xs focus:outline-none bg-white text-[#51534a]"
                                  value={editForm.blend_id}
                                  onChange={(e) => setEditForm({...editForm, blend_id: e.target.value ? Number(e.target.value) : ''})}
                                >
                                  <option value="">No Blend</option>
                                  {blends.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                              ) : (
                                sale.blend_name || <span className="italic opacity-50">Unassigned</span>
                              )}
                            </td>

                            <td className="py-2.5 px-4 text-center">
                              {isEditing ? (
                                  <div className="flex items-center justify-center gap-2">
                                      <button onClick={() => handleSaveEdit(sale.id)} className="p-1.5 text-white bg-[#007680] hover:bg-[#007680]/80 rounded shadow-sm transition-colors">
                                          <Check size={14} />
                                      </button>
                                      <button onClick={() => setEditingContractId(null)} className="p-1.5 text-[#51534a] bg-[#D6D2C4] hover:bg-[#968C83] rounded shadow-sm transition-colors">
                                          <X size={14} />
                                      </button>
                                  </div>
                              ) : (
                                  <div className="flex items-center justify-center gap-2">
                                      <button 
                                          onClick={() => toggleContractExecution(sale.id, isExecuted)}
                                          title={isExecuted ? "Mark as Unexecuted" : "Execute Contract"}
                                          className={`p-1.5 rounded transition-colors ${isExecuted ? 'text-[#007680] hover:bg-[#A4DBE8]/30' : 'text-[#968C83] hover:text-[#51534a] hover:bg-[#D6D2C4]/50'}`}
                                      >
                                          {isExecuted ? <CheckCircle size={14} /> : <Circle size={14} />}
                                      </button>
                                      <button onClick={() => handleEditClick(sale)} title="Edit Contract" className="p-1.5 text-[#968C83] hover:text-[#007680] hover:bg-[#A4DBE8]/20 rounded transition-colors">
                                          <Pencil size={14} />
                                      </button>
                                  </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'blends' && (
            <div className="grid gap-5 xl:grid-cols-2">
              <SectionCard 
                title="Blend Directory" 
                right={
                    <button 
                        onClick={() => {
                            setEditingBlendId(null);
                            setBlendForm(INITIAL_BLEND_FORM);
                            setIsAddBlendModalOpen(true);
                        }} 
                        className="rounded-lg bg-[#007680] px-4 py-1.5 text-xs font-bold text-white shadow-sm"
                    >
                        <Plus size={14} className="mr-1 inline-block" />New Blend
                    </button>
                }
              >
                <div className="relative mb-4"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" /><input value={blendSearch} onChange={(e) => setBlendSearch(e.target.value)} placeholder="Search blends..." className="w-full rounded-lg border border-[#D6D2C4] bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-[#007680]" /></div>
                <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                  {visibleBlends.map(({ blend, composition, linkedContracts }) => {
                    const sel = selectedBlendId === blend.id;
                    const tot = composition.reduce((s, c) => s + c.value, 0);
                    return (
                      <button key={blend.id} onClick={() => setSelectedBlendId(blend.id)} className={`w-full rounded-xl border p-3 text-left transition ${sel ? "border-[#007680] bg-[#EAF8FA]" : "border-[#D6D2C4] bg-white hover:border-[#007680]/30"}`}>
                        <div className="flex justify-between items-start">
                          <div><div className="font-bold text-[#007680] text-sm">{blend.name}</div><div className="text-[10px] text-[#968C83]">{blend.client || "-"} · {blend.grade || "-"}</div></div>
                          <div className="text-right text-[10px] font-bold"><div className="text-[#51534a]">{linkedContracts.length} sales</div><div className={tot > 100.01 ? "text-red-600" : "text-[#007680]"}>{tot.toFixed(2)}%</div></div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard title="Composition Details">
                  {selectedBlendData ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs border-b pb-3">
                        <div className="flex justify-between"><span>Name</span><span className="font-bold">{selectedBlendData.blend.name}</span></div>
                        <div className="flex justify-between"><span>Client</span><span className="font-bold">{selectedBlendData.blend.client || "-"}</span></div>
                        <div className="flex justify-between"><span>Linked Sales</span><span className="font-bold">{selectedBlendData.linkedContracts.length}</span></div>
                        <div className="flex justify-between"><span>Total Comp.</span><span className="font-bold">{selectedBlendData.composition.reduce((s, c) => s + c.value, 0).toFixed(2)}%</span></div>
                      </div>
                      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                        {selectedBlendData.composition.map((comp) => (
                          <div key={comp.key} className="flex justify-between text-[11px] bg-[#F5F5F3] p-2 rounded-lg border border-[#D6D2C4]/40">
                            <span className="font-bold text-[#007680]">{comp.label}</span>
                            <span className="font-bold">{comp.value.toFixed(2)}%</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end gap-4 pt-3 mt-2 border-t border-[#D6D2C4]/40">
                        <button onClick={() => openEditBlendModal(selectedBlendData.blend)} className="text-xs font-bold text-[#007680] hover:underline flex items-center gap-1"><Pencil size={12} /> Edit Blend</button>
                        <button onClick={() => deleteBlend(selectedBlendData.blend.id)} className="text-xs font-bold text-red-500 hover:underline flex items-center gap-1"><X size={12} /> Delete Blend</button>
                      </div>
                    </div>
                  ) : <div className="text-sm italic text-[#968C83]">Select a blend to see its composition.</div>}
              </SectionCard>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}