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
  Circle
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
  { key: 'post_15_top', label: 'POST 15 TOP' },
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
const Card = ({ children, className = "", variant = "default" }: { children: React.ReactNode; className?: string, variant?: "default" | "dark" }) => {
  const bgClass = variant === "dark" ? "bg-[#51534a] text-white border-none" : "bg-white border border-[#968C83]/20";
  return (
    <div className={`rounded-xl shadow-sm ${bgClass} ${className}`}>
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
  const [historyData, setHistoryData] = useState<any[]>([]); // New history state
  const [positionFilter, setPositionFilter] = useState<'all' | 'long' | 'short'>('all');
  
  // Physical Data state
  const [physicalData, setPhysicalData] = useState<{
    gridData: PhysicalPositionRecord[],
    months: string[],
    kpis: { totalTheoretical: number, totalShorts: number, totalNet: number }
  }>({ gridData: [], months: [], kpis: { totalTheoretical: 0, totalShorts: 0, totalNet: 0 } });
  
  const [isPhysicalLoading, setIsPhysicalLoading] = useState(false);
  const [hasFetchedPhysical, setHasFetchedPhysical] = useState(false);

  const [loading, setLoading] = useState(true);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManualSalesModalOpen, setIsManualSalesModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isAddBlendModalOpen, setIsAddBlendModalOpen] = useState(false);
  const [isUpdatePositionsModalOpen, setIsUpdatePositionsModalOpen] = useState(false);

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

  const [solFile, setSolFile] = useState<File | null>(null);
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
        const [salesRes, blendsRes, historyRes] = await Promise.all([
          fetch('/api/contracts', { cache: 'no-store' }),
          fetch('/api/blends', { cache: 'no-store' }),
          fetch('/api/physical_stock_position', { cache: 'no-store' }).catch(() => null) // <-- FIXED URL HERE
        ]);
        
        if (salesRes.ok) setSales(await salesRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
        if (blendsRes.ok) setBlends(await blendsRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
        if (historyRes && historyRes.ok) setHistoryData(await historyRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (!selectedBlendId && blends.length > 0) setSelectedBlendId(blends[0].id);
  }, [blends, selectedBlendId]);

  // O(N) Memoization for Chart Data pivoting
  const chartData = useMemo(() => {
    const grouped: Record<string, any> = {};
    const stackNames = new Set<string>();
    const latestPositions: Record<string, number> = {};

    historyData.forEach(row => {
      if (!row.recorded_date) return;
      // Standardize date to "Apr 16" format
      const d = new Date(row.recorded_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!grouped[d]) grouped[d] = { date: d };
      
      const pos = Number(row.position);
      grouped[d][row.stack] = pos;
      stackNames.add(row.stack);
      
      // historyData is sorted ASC by date. Therefore, the last time a stack appears, it is its latest value.
      latestPositions[row.stack] = pos;
    });

    // Filter stacks based on the selected toggle (O(S) complexity)
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

  // O(1) Fetch toggle endpoint for contract execution logic
  const toggleContractExecution = async (id: number, currentStatus: boolean) => {
    try {
      const response = await fetch('/api/contracts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, executed: !currentStatus })
      });
      if (!response.ok) throw new Error("Failed to update status");
      
      setSales(prev => prev.map(sale => sale.id === id ? { ...sale, executed: !currentStatus } : sale));
    } catch(e) {
      alert("Failed to toggle contract execution status.");
    }
  };

  // ⚡ O(N) Memoization for Contracts Tab Filtering
  const filteredContracts = useMemo(() => {
    return sales.filter(sale => {
      // Execute toggle filter
      if (!showExecutedContracts && bool(sale.executed)) return false;
      
      // Search filter
      if (contractSearch) {
        const q = contractSearch.toLowerCase();
        const match = [
          sale.contract_number,
          sale.client,
          sale.quality,
          sale.strategy,
          sale.grade,
          sale.blend_name
        ].some(val => String(val || '').toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [sales, showExecutedContracts, contractSearch]);

  const uniqueClients = useMemo(() => {
      const clients = sales.map(s => s.client).filter(Boolean) as string[];
      return Array.from(new Set(clients)).sort();
  }, [sales]);


  // ⚡ O(N) Physical Positions Grid Complete Construction:
  const physicalGridView = useMemo(() => {
    if (!hasFetchedPhysical || !physicalData.gridData) return { data: [], months: [], kpis: { totalTheoretical: 0, totalShorts: 0, totalNet: 0 } };
    
    const gridMap = new Map(physicalData.gridData.map(row => [row.stack, row]));
    const missingShorts = new Map<string, { total: number, months: Record<string, number> }>();
    const monthSet = new Set<string>(physicalData.months || []);
    const blendMap = new Map(blends.map(b => [b.id, b]));

    let extraShortsTotal = 0;

    // O(N) pass to deduct shorts for zero-volume stacks dynamically
    sales.forEach(sale => {
        if (bool(sale.executed) || !sale.blend_id) return;
        const blend = blendMap.get(Number(sale.blend_id));
        if (!blend) return;

        const monthKey = sale.shipping_date ? formatDateToMonthYear(sale.shipping_date) : 'Unscheduled';
        const weight = Math.abs(Number(String(sale.weight_kilos || sale.weight || sale.SMT || 0).replace(/,/g, '')));

        BLEND_COMPONENTS.forEach(comp => {
            if (!gridMap.has(comp.key)) {
                const compPercent = asNumber(blend[comp.key]) / 100;
                if (compPercent > 0) {
                    const shortVol = weight * compPercent;
                    if (!missingShorts.has(comp.key)) {
                        missingShorts.set(comp.key, { total: 0, months: {} });
                    }
                    const record = missingShorts.get(comp.key)!;
                    record.total += shortVol;
                    record.months[monthKey] = (record.months[monthKey] || 0) + shortVol;
                    monthSet.add(monthKey);
                    extraShortsTotal += shortVol;
                }
            }
        });
    });
    
    const result = BLEND_COMPONENTS.map(comp => {
        const existing = gridMap.get(comp.key);
        if (existing) {
            gridMap.delete(comp.key); 
            return existing;
        }
        
        const shorts = missingShorts.get(comp.key);
        return {
            stack: comp.key,
            theoretical_volume: 0,
            months: shorts ? shorts.months : {},
            total_shorts: shorts ? shorts.total : 0,
            net_position: shorts ? -shorts.total : 0
        };
    });
    
    gridMap.forEach(val => result.push(val));
    
    const sortedMonths = Array.from(monthSet).sort((a, b) => {
        if (a === 'Unscheduled') return 1;
        if (b === 'Unscheduled') return -1;
        return new Date(a).getTime() - new Date(b).getTime();
    });

    return { 
        data: result, 
        months: sortedMonths, 
        kpis: {
            totalTheoretical: physicalData.kpis.totalTheoretical,
            totalShorts: physicalData.kpis.totalShorts + extraShortsTotal,
            totalNet: physicalData.kpis.totalNet - extraShortsTotal
        }
    };
  }, [physicalData, hasFetchedPhysical, sales, blends]);


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
    return blendCompositionTotal > 100 ? `Blend composition is over 100% (${blendCompositionTotal.toFixed(2)}%). Reduce one or more components.` : `Blend composition is below 100% (${blendCompositionTotal.toFixed(2)}%). Add the remaining percentage before saving.`;
  }, [isAddBlendModalOpen, blendCompositionTotal, blendForm]);

  const handleUploadSol = async () => {
    if (!solFile) return;
    const formData = new FormData();
    formData.append('sol_file', solFile);

    try {
      const response = await fetch('http://localhost:8100/api/upload_sol_report', {
          method: 'POST',
          body: formData, 
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Failed to upload SOL report.");
      }
      
      alert("SOL Report uploaded successfully!");
      setSolFile(null);
      setIsAddModalOpen(false);
      window.location.reload(); 
      
    } catch (error: any) {
      console.error("Upload error:", error);
      alert(`Error uploading file: ${error.message}`);
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
      setPurchaseFile(null);
      setPurchaseSaleNumber('');
      setIsDirectSale(true);
    } catch (error) {
      alert("Error uploading file. Please try again.");
    }
  };

  const handleManualSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualSaleForm)
      });
      if (!response.ok) throw new Error("Failed to save sale.");
      const data = await response.json();
      
      if (data.success && data.sale) {
        setSales(prev => [...prev, data.sale]);
      }
      
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

  const handleCancelEdit = () => {
      setEditingContractId(null);
  };

  const handleSaveEdit = async (id: number) => {
      try {
          const payloadBlendId = editForm.blend_id === '' ? null : editForm.blend_id;

          const response = await fetch('/api/contracts', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, ...editForm, blend_id: payloadBlendId })
          });
          
          if (!response.ok) throw new Error("Failed to update");
          
          const selectedBlend = blends.find(b => b.id === Number(editForm.blend_id));
          
          setSales(prev => prev.map(sale => 
              sale.id === id ? { 
                  ...sale, 
                  quality: editForm.quality, 
                  grade: editForm.grade, 
                  certifications: editForm.certifications,
                  blend_id: payloadBlendId !== null ? Number(payloadBlendId) : undefined,
                  blend_name: selectedBlend ? selectedBlend.name : undefined
              } : sale
          ));
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
      body: JSON.stringify({
        id: contractId,
        quality: contract.quality || contract.strategy || "",
        grade: contract.grade || "",
        certifications: parseCerts(contract.certifications),
        blend_id: blendId
      }),
    });
    if (!response.ok) throw new Error("Failed to update contract");
    const selected = blends.find((b) => b.id === blendId);
    setSales((prev) => prev.map((sale) => (sale.id === contractId ? { ...sale, blend_id: blendId ?? undefined, blend_name: selected?.name ?? undefined } : sale)));
  }

  const handleCreateBlendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = Object.fromEntries(
        Object.entries(blendForm).filter(([_, v]) => v !== '')
    );

    try {
      const response = await fetch('/api/blends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create blend");
      
      if (data.success) {
        setBlends(prev => [{ id: data.id, ...payload } as Blend, ...prev]);
        setIsAddBlendModalOpen(false);
        setBlendForm(INITIAL_BLEND_FORM);
      }
    } catch (error: any) {
      alert(error.message);
    }
  };

  async function deleteBlend(blendId: number) {
    const linked = sales.filter((sale) => Number(sale.blend_id) === blendId);
    try {
      await Promise.allSettled(
        linked.map(async (sale) => {
          try { await updateContractBlend(sale.id, null); } catch (error) {}
        })
      );
      
      const response = await fetch(`/api/blends?id=${blendId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Backend database deletion failed");
      }

      setBlends((prev) => prev.filter((blend) => blend.id !== blendId));
      if (selectedBlendId === blendId) setSelectedBlendId(null);
      setSales((prev) => prev.map((sale) => (Number(sale.blend_id) === blendId ? { ...sale, blend_id: undefined, blend_name: undefined } : sale)));

      alert("Blend deleted successfully.");
    } catch (error) {
      console.error(error);
      alert("Failed to delete blend.");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#D6D2C4] flex flex-col items-center justify-center text-[#51534a] font-bold">
        <style>{`
          @keyframes steamUp {
            0% { opacity: 0; transform: translateY(4px); }
            50% { opacity: 1; }
            100% { opacity: 0; transform: translateY(-8px); }
          }
          .steam-1 { animation: steamUp 1.5s infinite ease-in-out; }
          .steam-2 { animation: steamUp 1.5s infinite ease-in-out 0.3s; }
          .steam-3 { animation: steamUp 1.5s infinite ease-in-out 0.6s; }
        `}</style>
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-4">
          <path d="M16 28V44C16 48.4183 19.5817 52 24 52H40C44.4183 52 48 48.4183 48 44V28H16Z" fill="#007680"/>
          <path d="M48 32H52C54.2091 32 56 33.7909 56 36C56 38.2091 54.2091 40 52 40H48" stroke="#007680" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          <path className="steam-1" d="M24 20C24 16 28 16 28 12" stroke="#968C83" strokeWidth="3" strokeLinecap="round"/>
          <path className="steam-2" d="M32 22C32 18 36 18 36 14" stroke="#968C83" strokeWidth="3" strokeLinecap="round"/>
          <path className="steam-3" d="M40 20C40 16 44 16 44 12" stroke="#968C83" strokeWidth="3" strokeLinecap="round"/>
        </svg>
        <div>Brewing Physical Data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#D6D2C4] font-sans text-[#51534a] md:p-1 relative">
      
      {/* --- MODALS --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-[#EFEFE9] w-full max-w-4xl rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#D6D2C4] bg-white">
              <h2 className="text-lg font-bold text-[#51534a] flex items-center gap-2">
                <div className="w-8 h-8 bg-[#007680] rounded flex items-center justify-center text-white">
                  <Plus size={18} />
                </div>
                Add / Upload Records
              </h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-[#968C83] hover:text-[#51534a] p-1.5 rounded-full hover:bg-[#D6D2C4]/30 transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-[#D6D2C4] bg-[#F5F5F3]">
              <div className="flex-1 p-6 flex flex-col gap-6">
                <div>
                  <h3 className="font-bold text-[#51534a] text-sm flex items-center gap-2 mb-1">
                    <CloudUpload size={16} className="text-[#B9975B]" />
                    Upload Purchases
                  </h3>
                  <p className="text-xs text-[#968C83]">Import stock batches from Excel.</p>
                </div>
                <div className="space-y-4">
                  <FileDropZone 
                    label="XBS Upload Template (XLS/XLSX)" 
                    accept=".xls,.xlsx" 
                    file={purchaseFile}
                    onFileAdded={setPurchaseFile}
                    onRemoveFile={() => setPurchaseFile(null)}
                  />
                  <div className="pt-2">
                      <button 
                        onClick={() => setIsPurchaseModalOpen(true)}
                        disabled={!purchaseFile}
                        className="w-full bg-[#51534a] text-white px-4 py-2 rounded text-sm font-medium hover:bg-[#51534a]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Upload Purchases
                      </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 p-6 flex flex-col gap-6 bg-white/50">
                <div>
                  <h3 className="font-bold text-[#51534a] text-sm flex items-center gap-2 mb-1">
                    <FileSpreadsheet size={16} className="text-[#007680]" />
                    Add Sales
                  </h3>
                  <p className="text-xs text-[#968C83]">Upload logistics report or add manually.</p>
                </div>
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <FileDropZone 
                      label="SOL Logistics Report (XLS/XLSX)" 
                      accept=".xls,.xlsx" 
                      file={solFile}
                      onFileAdded={setSolFile}
                      onRemoveFile={() => setSolFile(null)}
                    />
                    {solFile && (
                      <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                        <button 
                          onClick={handleUploadSol}
                          className="w-full bg-[#007680] text-white px-4 py-2 rounded text-sm font-medium hover:bg-[#007680]/90 transition-all flex justify-center items-center gap-2 shadow-sm"
                        >
                          <CloudUpload size={16}/> Upload SOL File
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="h-px bg-[#D6D2C4] flex-1"></div>
                      <span className="text-[10px] uppercase font-bold text-[#968C83] tracking-wider">OR</span>
                      <div className="h-px bg-[#D6D2C4] flex-1"></div>
                    </div>
                    <button 
                      onClick={() => setIsManualSalesModalOpen(true)}
                      disabled={!!solFile}
                      className="w-full bg-white border-2 border-[#007680] text-[#007680] px-4 py-2 rounded text-sm font-bold hover:bg-[#007680]/5 transition-all disabled:opacity-40 disabled:border-[#D6D2C4] disabled:text-[#968C83] disabled:cursor-not-allowed"
                    >
                      Manually add sales
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- UPDATE POSITIONS MODAL --- */}
      {isUpdatePositionsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#D6D2C4] bg-[#F5F5F3]">
              <h3 className="font-bold text-[#51534a]">Update Physical Positions</h3>
              <button onClick={() => setIsUpdatePositionsModalOpen(false)} className="text-[#968C83] hover:text-[#51534a] p-1 rounded-full hover:bg-[#D6D2C4]/50">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleFetchPhysicalPositions} className="p-5 flex flex-col gap-4">
              <p className="text-xs text-[#968C83] mb-2">Upload the required reports to calculate theoretical blend allocations. The backend processing script will automatically exclude executed contracts from computations.</p>
              <div className="space-y-4">
                  <FileDropZone 
                    label="Current Stock (CSV)" 
                    accept=".csv" 
                    file={stockFile}
                    onFileAdded={setStockFile}
                    onRemoveFile={() => setStockFile(null)}
                  />
                  <FileDropZone 
                    label="Processing Analysis (XLS/XLSX)" 
                    accept=".xls,.xlsx" 
                    file={procFile}
                    onFileAdded={setProcFile}
                    onRemoveFile={() => setProcFile(null)}
                  />
                  <FileDropZone 
                    label="Test Details Summary (XLS/XLSX)" 
                    accept=".xls,.xlsx" 
                    file={testFile}
                    onFileAdded={setTestFile}
                    onRemoveFile={() => setTestFile(null)}
                  />
              </div>
              
              <div className="pt-4 mt-2 border-t border-[#D6D2C4] flex justify-end gap-2">
                <button type="button" onClick={() => setIsUpdatePositionsModalOpen(false)} className="px-4 py-2 text-sm font-bold text-[#968C83] hover:bg-[#F5F5F3] rounded-lg transition-colors">Cancel</button>
                <button 
                  type="submit" 
                  disabled={!stockFile || !procFile || !testFile || isPhysicalLoading}
                  className="bg-[#007680] text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-[#007680]/90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px]"
                >
                  {isPhysicalLoading ? 'Calculating...' : 'Run Calculation'}
                </button>
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

      {/* --- CREATE BLEND MODAL --- */}
      {isAddBlendModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#D6D2C4] bg-white">
              <div>
                <div className="text-lg font-bold text-[#51534a]">Create New Blend</div>
                <div className="text-xs text-[#968C83]">Composition must equal exactly 100%</div>
              </div>
              <button onClick={() => setIsAddBlendModalOpen(false)} className="text-[#968C83] hover:text-[#51534a] p-1.5 rounded-full hover:bg-[#D6D2C4]/30 transition-all">
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

              <div className="mt-5 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setIsAddBlendModalOpen(false)} className="rounded-lg border border-[#D6D2C4] bg-white px-4 py-2 text-sm font-bold text-[#51534a]">Cancel</button>
                <button type="button" onClick={handleCreateBlendSubmit} disabled={!blendForm.name.trim() || Math.abs(blendCompositionTotal - 100) > 0.01} className="rounded-lg bg-[#007680] px-5 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50">Save Blend</button>
              </div>
            </div>
          </div>
        </div>
      )}


      <div className="max-w-[1400px] mx-auto space-y-6 p-4 md:p-6">
        
        {/* --- HEADER --- */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#51534a] flex items-center gap-2">
              <div className="w-8 h-8 bg-[#007680] rounded-lg flex items-center justify-center text-white">
                <ShieldCheck size={18} />
              </div>
              Physical Positions
            </h1>
            <p className="text-[#968C83] text-sm mt-1">Physical Stock, Contracts & Blends</p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white p-1 rounded-lg border border-[#968C83]/20 shadow-sm">
              {(['kg', 'bag', 'mt'] as Unit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    unit === u ? 'bg-[#007680] text-white shadow-sm' : 'text-[#968C83] hover:bg-[#D6D2C4]/30'
                  }`}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>

            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center justify-center w-10 h-10 bg-[#007680] text-white rounded-lg hover:bg-[#007680]/90 transition-colors shadow-sm"
              title="Add Records"
            >
              <Plus size={20} />
            </button>
          </div>
        </header>

        {/* --- MAIN NAVIGATION --- */}
        <div className="flex gap-2 border-b border-[#968C83]/30 overflow-x-auto">
          <button
            onClick={() => setActiveTab('physical')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
              activeTab === 'physical' ? 'border-[#007680] text-[#007680]' : 'border-transparent text-[#968C83] hover:text-[#51534a] hover:border-[#968C83]/30'
            }`}
          >
            <Box size={16} /> Physical
          </button>
          <button
            onClick={() => setActiveTab('contracts')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
              activeTab === 'contracts' ? 'border-[#007680] text-[#007680]' : 'border-transparent text-[#968C83] hover:text-[#51534a] hover:border-[#968C83]/30'
            }`}
          >
            <FileSpreadsheet size={16} /> Contracts
          </button>
          <button
            onClick={() => setActiveTab('blends')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
              activeTab === 'blends' ? 'border-[#007680] text-[#007680]' : 'border-transparent text-[#968C83] hover:text-[#51534a] hover:border-[#968C83]/30'
            }`}
          >
            <Combine size={16} /> Blends
          </button>
        </div>

        {/* --- TAB CONTENT --- */}
        <main className="space-y-6">

          {/* --- KPI CARDS (Physical) --- */}
          {(activeTab === 'physical' && hasFetchedPhysical) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 border-l-4 border-l-[#007680]">
                <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">
                  PHYSICAL THEORETICAL STOCK
                </div>
                <div className="text-2xl font-bold text-[#51534a] mt-1">
                  {formatNumber(convertQty(physicalGridView.kpis.totalTheoretical, unit))} <span className="text-sm font-normal text-[#968C83]">{unitText(unit)}</span>
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-l-[#5B3427]">
                <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">
                   PHYSICAL TOTAL BLEND SHORTS
                </div>
                <div className="text-2xl font-bold text-[#5B3427] mt-1 flex items-center gap-2">
                  {formatNumber(convertQty(physicalGridView.kpis.totalShorts, unit))} <span className="text-sm font-normal text-[#968C83]">{unitText(unit)}</span>
                  <TrendingDown size={18} className="text-[#B9975B]" />
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-l-[#007680]">
                <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">
                   PHYSICAL NET POSITION
                </div>
                <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${physicalGridView.kpis.totalNet >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                  {physicalGridView.kpis.totalNet > 0 ? '+' : ''}{formatNumber(convertQty(physicalGridView.kpis.totalNet, unit))} <span className="text-sm font-normal text-[#968C83]">{unitText(unit)}</span>
                  {physicalGridView.kpis.totalNet >= 0 ? <TrendingUp size={18} className="text-[#97D700]" /> : <TrendingDown size={18} />}
                </div>
              </Card>
            </div>
          )}

          {/* --- POSITION TABLE AND CHART (Physical Tab) --- */}
          {activeTab === 'physical' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              {/* LEFT: TABLE (Takes 2 columns) */}
              <div className="xl:col-span-2 space-y-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-[#968C83]/20">
                  <div>
                    <h3 className="font-bold text-[#51534a]">Physical Positions</h3>
                    <p className="text-xs text-[#968C83]">Calculate theoretical vs actual blend allocations</p>
                  </div>
                  <button 
                    onClick={() => setIsUpdatePositionsModalOpen(true)} 
                    disabled={isPhysicalLoading}
                    className="flex items-center gap-2 bg-[#007680] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#007680]/90 transition-all shadow-sm disabled:opacity-50"
                  >
                    {isPhysicalLoading ? 'Calculating...' : 'Update Positions'}
                  </button>
                </div>

                {hasFetchedPhysical ? (
                  <Card className="overflow-hidden border-none shadow-md">
                    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                      <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-[#51534a] text-white font-medium sticky top-0 z-10 text-xs uppercase tracking-wider">
                          <tr>
                            <th className="py-2 px-4 w-1/4">Post Stack</th>
                            <th className="py-2 px-4 text-right">Theoretical Volume ({unit})</th>
                            {physicalGridView.months.map(month => (
                              <th key={month} className="py-2 px-4 text-right bg-[#5B3427]">{month}</th>
                            ))}
                            <th className="py-2 px-4 text-right bg-[#B9975B]/20 border-l border-white/10">Total Shorts</th>
                            <th className="py-2 px-4 text-right bg-[#007680] border-l border-white/10">Net Position</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D6D2C4]">
                          {physicalGridView.data.length > 0 ? physicalGridView.data.map((row) => {
                            let runningAvailable = row.theoretical_volume; // Local state for inline deduction
                            
                            return (
                            <tr key={row.stack} className="bg-white hover:bg-[#D6D2C4]/20 transition-colors group">
                              <td className="py-1.5 px-4 font-medium text-[#007680]">{formatStackName(row.stack)}</td>
                              <td className="py-1.5 px-4 text-right font-bold text-[#51534a] bg-[#F5F5F3]">
                                  {formatNumber(convertQty(row.theoretical_volume, unit))}
                              </td>
                              {physicalGridView.months.map(month => {
                                const val = row.months[month] || 0;
                                let colorClass = "text-[#968C83]";

                                if (Math.abs(val) > 0.01) {
                                  // Inline recursive check
                                  if (runningAvailable >= val) {
                                    colorClass = "text-[#007680] font-medium"; // Green
                                  } else {
                                    colorClass = "text-red-500 font-bold"; // Red
                                  }
                                  runningAvailable -= val;
                                }

                                return (
                                  <td key={month} className={`py-1.5 px-4 text-right ${colorClass}`}>
                                    {Math.abs(val) > 0.01 ? formatNumber(convertQty(val, unit)) : '-'}
                                  </td>
                                );
                              })}
                              <td className="py-1.5 px-4 text-right font-medium text-[#5B3427] bg-[#B9975B]/5 border-l border-[#D6D2C4]/50">
                                  {formatNumber(convertQty(row.total_shorts, unit))}
                              </td>
                              {/* Net Position Colored Validation */}
                              <td className={`py-1.5 px-4 text-right font-bold border-l border-[#D6D2C4]/50 bg-[#A4DBE8]/10 ${row.net_position >= 0 ? 'text-[#007680]' : 'text-red-500'}`}>
                                {row.net_position > 0 ? '+' : ''}{formatNumber(convertQty(row.net_position, unit))}
                              </td>
                            </tr>
                            );
                          }) : (
                            <tr><td colSpan={physicalGridView.months.length + 4} className="py-8 text-center text-[#968C83] italic">No physical positions data found.</td></tr>
                          )}
                        </tbody>
                        {physicalGridView.data.length > 0 && (
                          <tfoot className="bg-[#EFEFE9] sticky bottom-0 border-t-2 border-[#D6D2C4] shadow-inner font-bold text-[#51534a]">
                              <tr>
                                <td className="py-2 px-4">TOTALS</td>
                                <td className="py-2 px-4 text-right">{formatNumber(convertQty(physicalGridView.kpis.totalTheoretical, unit))}</td>
                                {physicalGridView.months.map(month => {
                                    const monthTotal = physicalGridView.data.reduce((sum, row) => sum + (row.months[month] || 0), 0);
                                    return <td key={month} className="py-2 px-4 text-right text-[#5B3427]">{Math.abs(monthTotal) > 0.01 ? formatNumber(convertQty(monthTotal, unit)) : '-'}</td>;
                                })}
                                <td className="py-2 px-4 text-right text-[#5B3427] border-l border-[#D6D2C4]/50">{formatNumber(convertQty(physicalGridView.kpis.totalShorts, unit))}</td>
                                <td className={`py-2 px-4 text-right border-l border-[#D6D2C4]/50 ${physicalGridView.kpis.totalNet >= 0 ? 'text-[#007680]' : 'text-red-500'}`}>
                                    {physicalGridView.kpis.totalNet > 0 ? '+' : ''}{formatNumber(convertQty(physicalGridView.kpis.totalNet, unit))}
                                </td>
                              </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </Card>
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 text-[#968C83] border-2 border-dashed border-[#D6D2C4] rounded-xl bg-white/50">
                      <Box size={48} className="mb-4 opacity-30 text-[#007680]" />
                      <h3 className="text-lg font-bold text-[#51534a]">Ready to Calculate</h3>
                      <p className="text-sm mt-2 text-center max-w-md">
                          Click the "Update Positions" button above to run the calculations for physical blend allocations.
                      </p>
                  </div>
                )}
              </div>

              {/* RIGHT: CHART (Takes 1 column) */}
              <div className="xl:col-span-1 flex flex-col h-full">
                <Card className="p-5 h-full flex flex-col shadow-md border border-[#968C83]/20">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-[#51534a]">Position History</h3>
                      <p className="text-xs text-[#968C83]">7-Day trend of net positions</p>
                    </div>
                    {/* Toggle Buttons */}
                    <div className="flex bg-[#F5F5F3] rounded-lg p-1 border border-[#D6D2C4] shadow-inner">
                        <button onClick={() => setPositionFilter('all')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${positionFilter === 'all' ? 'bg-white shadow text-[#51534a]' : 'text-[#968C83] hover:text-[#51534a]'}`}>ALL</button>
                        <button onClick={() => setPositionFilter('long')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${positionFilter === 'long' ? 'bg-white shadow text-[#007680]' : 'text-[#968C83] hover:text-[#007680]'}`}>LONG</button>
                        <button onClick={() => setPositionFilter('short')} className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${positionFilter === 'short' ? 'bg-white shadow text-red-500' : 'text-[#968C83] hover:text-red-500'}`}>SHORT</button>
                    </div>
                  </div>
                  
                  <div className="flex-1 min-h-[400px]">
                    {chartData.data.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData.data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFEFE9" />
                          <XAxis dataKey="date" tick={{fontSize: 10, fill: '#968C83'}} axisLine={false} tickLine={false} />
                          <YAxis tick={{fontSize: 10, fill: '#968C83'}} axisLine={false} tickLine={false} tickFormatter={(val) => formatNumber(convertQty(val, unit))} />
                          <Tooltip 
                            content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    // Declutter Tooltip: Remove 0 values and sort by absolute magnitude
                                    const activePayload = payload
                                        .filter((p: any) => Math.abs(p.value) > 0.01)
                                        .sort((a: any, b: any) => Math.abs(b.value) - Math.abs(a.value));
                                    
                                    if (activePayload.length === 0) return null;

                                    return (
                                        <div className="bg-white/95 backdrop-blur-sm p-3 border border-[#D6D2C4] shadow-xl rounded-xl text-xs min-w-[160px] z-50">
                                            <p className="font-bold mb-2 text-[#51534a] border-b border-[#D6D2C4] pb-1.5">{label}</p>
                                            {activePayload.map((entry: any) => (
                                                <div key={entry.name} className="flex justify-between items-center gap-4 py-0.5">
                                                    <span style={{ color: entry.color }} className="font-medium truncate max-w-[140px]">{entry.name}</span>
                                                    <span className="font-bold text-[#51534a]">{formatNumber(convertQty(entry.value, unit))}</span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }
                                return null;
                            }}
                          />
                          {chartData.stacks.map((stack, i) => (
                            <Line 
                              key={stack} 
                              type="monotone" 
                              dataKey={stack} 
                              name={formatStackName(stack)} 
                              stroke={`hsl(${(i * 137.5) % 360}, 70%, 40%)`} 
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-[#968C83] italic">
                        Not enough history data.
                      </div>
                    )}
                  </div>
                </Card>
              </div>

            </div>
          )}

          {/* --- CONTRACTS TAB --- */}
          {activeTab === 'contracts' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="relative w-full sm:w-96">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" />
                      <input 
                          type="text" 
                          placeholder="Search contracts, clients, qualities..." 
                          value={contractSearch}
                          onChange={(e) => setContractSearch(e.target.value)}
                          className="w-full border border-[#D6D2C4] rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none bg-white text-[#51534a]"
                      />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer bg-white px-4 py-2 border border-[#D6D2C4] rounded-lg hover:bg-[#F5F5F3] transition-colors shadow-sm">
                      <input 
                          type="checkbox" 
                          checked={showExecutedContracts}
                          onChange={(e) => setShowExecutedContracts(e.target.checked)}
                          className="w-4 h-4 text-[#007680] rounded focus:ring-[#007680]"
                      />
                      <span className="text-sm font-bold text-[#51534a]">Show Executed Contracts</span>
                  </label>
              </div>

              <Card className="overflow-hidden border-none shadow-md">
                <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-[#51534a] text-white font-medium sticky top-0 z-10 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Contract</th>
                        <th className="py-3 px-4">Client</th>
                        <th className="py-3 px-4 text-right">Weight (kg)</th>
                        <th className="py-3 px-4">Ship Date</th>
                        <th className="py-3 px-4">Quality</th>
                        <th className="py-3 px-4">Grade</th>
                        <th className="py-3 px-4 w-1/4">Certifications</th>
                        <th className="py-3 px-4">Blend</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D6D2C4]">
                      {filteredContracts.length > 0 ? filteredContracts.map((sale) => {
                        const isEditing = editingContractId === sale.id;
                        const displayCerts = parseCerts(sale.certifications);
                        const isExecuted = bool(sale.executed);

                        return (
                          <tr key={sale.id} className={`bg-white hover:bg-[#D6D2C4]/20 transition-colors ${isEditing ? 'bg-[#F5F5F3]' : ''} ${isExecuted ? 'opacity-60' : ''}`}>
                            <td className="py-3 px-4 font-bold text-[#51534a]">
                                <div className="flex items-center gap-2">
                                  {isExecuted && <CheckCircle size={14} className="text-[#007680]" />}
                                  {sale.contract_number}
                                </div>
                            </td>
                            <td className="py-3 px-4 text-[#51534a]">{sale.client || '-'}</td>
                            <td className="py-3 px-4 text-right font-medium text-[#5B3427]">
                                {formatNumber(Number(String(sale.weight_kilos || sale.weight || sale.SMT || 0).replace(/,/g, '')))}
                            </td>
                            <td className="py-3 px-4 text-[#968C83]">{sale.shipping_date ? formatDateToMonthYear(sale.shipping_date) : '-'}</td>
                            
                            <td className="py-3 px-4">
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
                                <span className="text-[#007680] font-medium">{sale.quality || sale.strategy || '-'}</span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                               {isEditing ? (
                                <input 
                                  type="text"
                                  className="w-full border border-[#007680] rounded px-2 py-1 text-xs focus:outline-none bg-white text-[#51534a]"
                                  value={editForm.grade}
                                  onChange={(e) => setEditForm({...editForm, grade: e.target.value})}
                                  placeholder="Grade"
                                />
                              ) : (
                                <span className="text-[#51534a]">{sale.grade || '-'}</span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              {isEditing ? (
                                <div className="flex flex-col gap-2 min-w-[200px]">
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
                                    {displayCerts.length > 0 ? displayCerts.map(cert => (
                                        <span key={cert} className="inline-flex px-1.5 py-0.5 bg-[#D6D2C4]/30 text-[#51534a] text-[10px] font-bold rounded-sm">
                                          {cert}
                                        </span>
                                    )) : <span className="text-[#968C83] text-xs italic">Uncertified</span>}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4">
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
                                <span className="text-[#51534a] font-medium">
                                  {sale.blend_name || <span className="text-[#968C83] font-normal italic">Unassigned</span>}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-center">
                                {isEditing ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <button onClick={() => handleSaveEdit(sale.id)} className="p-1.5 text-white bg-[#007680] hover:bg-[#007680]/80 rounded shadow-sm transition-colors">
                                            <Check size={14} />
                                        </button>
                                        <button onClick={handleCancelEdit} className="p-1.5 text-[#51534a] bg-[#D6D2C4] hover:bg-[#968C83] rounded shadow-sm transition-colors">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2">
                                        <button 
                                            onClick={() => toggleContractExecution(sale.id, isExecuted)}
                                            title={isExecuted ? "Mark as Unexecuted" : "Mark as Executed"}
                                            className={`p-1.5 rounded transition-colors ${isExecuted ? 'text-[#007680] hover:bg-[#A4DBE8]/30' : 'text-[#968C83] hover:text-[#51534a] hover:bg-[#D6D2C4]/50'}`}
                                        >
                                            {isExecuted ? <CheckCircle size={14} /> : <Circle size={14} />}
                                        </button>
                                        <button onClick={() => handleEditClick(sale)} title="Edit Contract" className="p-1.5 text-[#968C83] hover:text-[#007680] hover:bg-[#A4DBE8]/20 rounded transition-colors">
                                            <Pencil size={14} />
                                        </button>
                                        <button onClick={() => handleEditClick(sale)} title="Allocate Blend" className="p-1.5 text-[#968C83] hover:text-[#007680] hover:bg-[#A4DBE8]/20 rounded transition-colors">
                                            <Combine size={14} />
                                        </button>
                                    </div>
                                )}
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan={9} className="py-8 text-center text-[#968C83] italic">No contracts match your search or filter.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* --- BLENDS TAB --- */}
          {activeTab === 'blends' && (
            <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <SectionCard title="Blend Directory" subtitle="Only non-zero post stacks are shown in the summary" right={<button onClick={() => setIsAddBlendModalOpen(true)} className="rounded-lg bg-[#007680] px-4 py-2 text-sm font-bold text-white shadow-sm"><Plus size={16} className="mr-2 inline-block" />Create Blend</button>}>
                <div className="relative mb-4">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" />
                  <input value={blendSearch} onChange={(e) => setBlendSearch(e.target.value)} placeholder="Search blends by name, client, grade, blend no." className="w-full rounded-lg border border-[#D6D2C4] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                </div>
                <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                  {visibleBlends.length > 0 ? visibleBlends.map(({ blend, composition, linkedContracts }) => {
                    const selected = selectedBlendData?.blend.id === blend.id;
                    const totalComp = composition.reduce((sum, c) => sum + c.value, 0);
                    return (
                      <button key={blend.id} type="button" onClick={() => setSelectedBlendId(blend.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selected ? "border-[#007680] bg-[#EAF8FA]" : "border-[#D6D2C4] bg-white hover:border-[#007680]/30"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 font-bold text-[#007680]"><ChevronRight size={14} className={selected ? "rotate-90 transition" : "transition"} />{blend.name}</div>
                            <div className="mt-1 text-xs text-[#968C83]">{blend.client || "-"} · {blend.blend_no || "-"} · {blend.grade || "-"}</div>
                            <div className="mt-1 text-xs text-[#51534a]">{blend.cup_profile || "No cup profile"}</div>
                          </div>
                          <div className="text-right text-xs">
                            <div className="font-bold text-[#51534a]">{linkedContracts.length} contracts</div>
                            <div className="text-[#968C83]">{composition.length} non-zero components</div>
                            <div className={Math.abs(totalComp - 100) < 0.01 ? "font-bold text-[#007680]" : totalComp > 100 ? "font-bold text-red-600" : "font-bold text-[#B9975B]"}>{totalComp.toFixed(2)}%</div>
                          </div>
                        </div>
                      </button>
                    );
                  }) : <div className="py-8 text-center text-sm italic text-[#968C83]">No blends found.</div>}
                </div>
              </SectionCard>

              <div className="space-y-4">
                <SectionCard title="Blend Composition" subtitle="Only non-zero post stacks are shown here">
                  {selectedBlendData ? (
                    <div className="space-y-4">
                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between"><span>Blend name</span><span className="font-bold">{selectedBlendData.blend.name}</span></div>
                        <div className="flex justify-between"><span>Client</span><span className="font-bold">{selectedBlendData.blend.client || "-"}</span></div>
                        <div className="flex justify-between"><span>Blend no.</span><span className="font-bold">{selectedBlendData.blend.blend_no || "-"}</span></div>
                        <div className="flex justify-between"><span>Linked contracts</span><span className="font-bold">{selectedBlendData.linkedContracts.length}</span></div>
                      </div>

                      <div className="rounded-2xl border border-[#D6D2C4] bg-[#F5F5F3] p-4">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-[#51534a]">Composition total</div>
                          <div className={Math.abs(selectedBlendData.composition.reduce((s, c) => s + c.value, 0) - 100) < 0.01 ? "font-bold text-[#007680]" : selectedBlendData.composition.reduce((s, c) => s + c.value, 0) > 100 ? "font-bold text-red-600" : "font-bold text-[#B9975B]"}>{selectedBlendData.composition.reduce((s, c) => s + c.value, 0).toFixed(2)}%</div>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#D6D2C4]"><div className="h-full rounded-full bg-[#007680]" style={{ width: `${Math.min(100, selectedBlendData.composition.reduce((s, c) => s + c.value, 0))}%` }} /></div>
                        <div className="mt-2 text-xs text-[#968C83]">Only non-zero post stacks are listed.</div>
                      </div>

                      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                        {selectedBlendData.composition.length > 0 ? selectedBlendData.composition.map((comp) => (
                          <div key={comp.key} className="rounded-xl border border-[#D6D2C4] bg-white px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-bold text-[#007680]">{comp.label}</div>
                                <div className="text-xs text-[#968C83]">Post stack</div>
                              </div>
                              <div className="text-right"><div className="text-sm font-bold text-[#51534a]">{comp.value.toFixed(2)}%</div></div>
                            </div>
                          </div>
                        )) : <div className="text-sm italic text-[#968C83]">No non-zero post stacks in this blend.</div>}
                      </div>

                      <div className="rounded-2xl border border-[#D6D2C4] bg-white p-4">
                        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#968C83]">Linked contracts</div>
                        <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                          {selectedBlendData.linkedContracts.length > 0 ? selectedBlendData.linkedContracts.map((sale) => (
                            <div key={sale.id} className="rounded-xl border border-[#D6D2C4] bg-[#F5F5F3] px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="text-sm font-bold text-[#007680]">{sale.contract_number}</div>
                                  <div className="text-xs text-[#968C83]">{sale.client || "-"} · {sale.strategy || sale.quality || "Unassigned"}</div>
                                </div>
                                <div className="text-xs font-bold text-[#51534a]">{formatQty(asNumber(sale.weight_kilos), unit)} {unitText(unit)}</div>
                              </div>
                            </div>
                          )) : <div className="text-sm italic text-[#968C83]">No contracts allocated to this blend.</div>}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button type="button" onClick={() => selectedBlendData && deleteBlend(selectedBlendData.blend.id)} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Delete Blend</button>
                        <div className="flex items-center gap-2">
                          <select value={blendAllocContractId} onChange={(e) => setBlendAllocContractId(e.target.value ? Number(e.target.value) : "")} className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]">
                            <option value="">Select contract</option>
                            {sales.filter((s) => !s.blend_id || Number(s.blend_id) !== selectedBlendData.blend.id).map((sale) => <option key={sale.id} value={sale.id}>{sale.contract_number}</option>)}
                          </select>
                          <button
                            onClick={async () => {
                              if (blendAllocContractId !== "") {
                                setBlendBusy(true);
                                try {
                                  await updateContractBlend(Number(blendAllocContractId), selectedBlendData.blend.id);
                                  setBlendAllocContractId("");
                                  alert("Contract successfully allocated to blend.");
                                } catch {
                                  alert("Failed to allocate contract to blend.");
                                } finally {
                                  setBlendBusy(false);
                                }
                              }
                            }}
                            className="rounded-lg bg-[#007680] px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                            disabled={blendAllocContractId === "" || blendBusy}
                          >
                            Allocate
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : <div className="text-sm italic text-[#968C83]">Select a blend to see its composition.</div>}
                </SectionCard>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}