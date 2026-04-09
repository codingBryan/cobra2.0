"use client"
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Box, 
  TrendingDown, 
  TrendingUp,
  BarChart3,
  ListChecks,
  Plus,
  X,
  CloudUpload,
  FileSpreadsheet,
  FileText,
  Pencil,
  Check,
  Combine
} from 'lucide-react';

// --- Constants & Types ---
const KG_TO_LB = 2.2046;
type Unit = 'kg' | 'bag' | 'mt';
type MainTab = 'physical' | 'certification' | 'contracts' | 'blends';
type CertType = 'RFA' | 'CAFE' | 'NET ZERO' | 'EUDR' | 'AAA';

const CONTRACT_QUALITIES = [
  "AA - TOP", "AB - TOP", "PB - TOP", 
  "AA - PLUS", "AB - PLUS", "ABC - PLUS", "PB - PLUS", 
  "AA - FAQ", "AB - FAQ", "ABC - FAQ", "PB - FAQ", 
  "REJECTS", "MBUNIS", "TRIAGE", "GRINDER BOLD", "GRINDER LIGHT"
];

const BLEND_COMPONENTS = [
  { key: 'finished', label: 'Finished' },
  { key: 'post_natural', label: 'Post Natural' },
  { key: 'post_specialty_washed', label: 'Post Specialty Washed' },
  { key: 'post_17_up_top', label: '17 Up Top' },
  { key: 'post_16_top', label: '16 Top' },
  { key: 'post_15_top', label: '15 Top' },
  { key: 'post_pb_top', label: 'PB Top' },
  { key: 'post_17_up_plus', label: '17 Up Plus' },
  { key: 'post_16_plus', label: '16 Plus' },
  { key: 'post_15_plus', label: '15 Plus' },
  { key: 'post_14_plus', label: '14 Plus' },
  { key: 'post_pb_plus', label: 'PB Plus' },
  { key: 'post_17_up_faq', label: '17 Up FAQ' },
  { key: 'post_16_faq', label: '16 FAQ' },
  { key: 'post_15_faq', label: '15 FAQ' },
  { key: 'post_14_faq', label: '14 FAQ' },
  { key: 'post_pb_faq', label: 'PB FAQ' },
  { key: 'post_faq_minus', label: 'FAQ Minus' },
  { key: 'post_grinder_bold', label: 'Grinder Bold' },
  { key: 'post_grinder_light', label: 'Grinder Light' },
  { key: 'post_mh', label: 'MH' },
  { key: 'post_ml', label: 'ML' },
  { key: 'post_rejects_s', label: 'Rejects S' },
  { key: 'post_rejects_p', label: 'Rejects P' }
];

const INITIAL_BLEND_FORM = {
  name: '', client: '', grade: '', cup_profile: '', blend_no: '',
  ...BLEND_COMPONENTS.reduce((acc, curr) => ({ ...acc, [curr.key]: '' }), {})
};

interface CertifiedStock {
  id: number;
  lot_number: string;
  strategy: string;
  purchased_weight: number;
  rfa_certified: boolean;
  rfa_certificate_holder?: string;
  eudr_certified: boolean;
  eudr_certificate_holder?: string;
  cafe_certified: boolean;
  cafe_certificate_holder?: string;
  impact_certified: boolean;
  aaa_project: boolean;
  netzero_project: boolean;
}

interface Blend {
  id: number;
  name: string;
  client?: string;
  grade?: string;
  cup_profile?: string;
  blend_no?: string;
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

// --- Reusable Components ---
const Card = ({ children, className = "", variant = "default" }: { children: React.ReactNode; className?: string, variant?: "default" | "dark" }) => {
  const bgClass = variant === "dark" ? "bg-[#51534a] text-white border-none" : "bg-white border border-[#968C83]/20";
  return (
    <div className={`rounded-xl shadow-sm ${bgClass} ${className}`}>
      {children}
    </div>
  );
};

const FilterTabs = ({ tabs, active, onChange }: { tabs: string[], active: string, onChange: (val: any) => void }) => {
  return (
    <div className="flex gap-2 pb-2">
      {tabs.map(f => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`px-3 py-1 text-xs font-bold rounded-full border transition-all ${
            active === f 
              ? 'bg-[#007680] text-white border-[#007680]' 
              : 'bg-white text-[#968C83] border-[#D6D2C4] hover:border-[#007680] hover:text-[#007680]'
          }`}
        >
          {f}
        </button>
      ))}
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

export default function CertificationViewer() {
  const [activeTab, setActiveTab] = useState<MainTab>('physical');
  const [activeCert, setActiveCert] = useState<CertType>('RFA');
  const [unit, setUnit] = useState<Unit>('kg');

  const [stocks, setStocks] = useState<CertifiedStock[]>([]);
  const [sales, setSales] = useState<SaleContract[]>([]);
  const [blends, setBlends] = useState<Blend[]>([]);
  
  // Physical Data state
  const [physicalData, setPhysicalData] = useState<{
    gridData: PhysicalPositionRecord[],
    months: string[],
    kpis: { totalTheoretical: number, totalShorts: number, totalNet: number }
  }>({ gridData: [], months: [], kpis: { totalTheoretical: 0, totalShorts: 0, totalNet: 0 } });
  const [isPhysicalLoading, setIsPhysicalLoading] = useState(false);
  const [hasFetchedPhysical, setHasFetchedPhysical] = useState(false);

  const [loading, setLoading] = useState(true);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManualSalesModalOpen, setIsManualSalesModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isAddBlendModalOpen, setIsAddBlendModalOpen] = useState(false);
  const [isDirectSale, setIsDirectSale] = useState(true);
  const [purchaseSaleNumber, setPurchaseSaleNumber] = useState('');

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
    certifications: [] as CertType[] 
  });

  const certOptions: CertType[] = ['RFA', 'CAFE', 'NET ZERO', 'EUDR', 'AAA'];

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [stocksRes, salesRes, blendsRes] = await Promise.all([
          fetch('/api/certified_stocks', { cache: 'no-store' }),
          fetch('/api/contracts', { cache: 'no-store' }),
          fetch('/api/blends', { cache: 'no-store' })
        ]);
        
        if (stocksRes.ok) setStocks(await stocksRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
        if (salesRes.ok) setSales(await salesRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
        if (blendsRes.ok) setBlends(await blendsRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleFetchPhysicalPositions = async () => {
    try {
      setIsPhysicalLoading(true);
      const physicalRes = await fetch('/api/physical_stock_position', { cache: 'no-store' });
      if (physicalRes.ok) {
        const data = await physicalRes.json();
        setPhysicalData(data);
        setHasFetchedPhysical(true);
      }
    } catch (error) {
      console.error("Error fetching physical positions:", error);
    } finally {
      setIsPhysicalLoading(false);
    }
  };

  const uniqueClients = useMemo(() => {
      const clients = sales.map(s => s.client).filter(Boolean) as string[];
      return Array.from(new Set(clients)).sort();
  }, [sales]);

  const { tableData, uniqueMonths, kpis } = useMemo(() => {
    const certFlagMap: Record<CertType, keyof CertifiedStock> = {
      'RFA': 'rfa_certified',
      'CAFE': 'cafe_certified',
      'NET ZERO': 'netzero_project',
      'EUDR': 'eudr_certified',
      'AAA': 'aaa_project'
    };
    const flag = certFlagMap[activeCert];

    const certHolderMap: Partial<Record<CertType, keyof CertifiedStock>> = {
      'RFA': 'rfa_certificate_holder',
      'CAFE': 'cafe_certificate_holder',
      'EUDR': 'eudr_certificate_holder',
    };
    const holderFlag = certHolderMap[activeCert];

    const strategyMap = new Map<string, {
      strategy: string;
      available: number;
      shipmentsByMonth: Record<string, number>;
      totalShipment: number;
    }>();

    let totalStockKg = 0;
    let totalShortsKg = 0;
    let totalSupplyChainKg = 0; 
    const monthsSet = new Set<string>();

    const sanitizedTargetCert = String(activeCert).toUpperCase().replace(/[^A-Z0-9]/g, '');

    stocks.forEach(stock => {
      const isCertified = stock[flag] === 1 || stock[flag] === true || stock[flag] === '1';
      if (isCertified) {
        const strat = stock.strategy || 'Unassigned';
        if (!strategyMap.has(strat)) strategyMap.set(strat, { strategy: strat, available: 0, shipmentsByMonth: {}, totalShipment: 0 });
        
        const record = strategyMap.get(strat)!;
        const rawWeight = String(stock.purchased_weight || 0).replace(/,/g, '');
        const weight = Math.abs(Number(rawWeight) || 0); 
        
        record.available += weight;
        totalStockKg += weight;

        if (holderFlag && stock[holderFlag]) {
          const holderName = String(stock[holderFlag]).toLowerCase();
          if (holderName.includes('kenyacof')) {
            totalSupplyChainKg += weight;
          }
        }
      }
    });

    sales.forEach(sale => {
      const certList = parseCerts(sale.certifications).map(c => c.toUpperCase().replace(/[^A-Z0-9]/g, ''));
      // FIX: Removed `|| certList.length === 0`. An "Uncertified" contract should NEVER falsely appear as matching a Certified position tab.
      const isMatch = certList.includes(sanitizedTargetCert);

      if (isMatch) {
        const strat = sale.quality || sale.strategy || 'Unassigned'; 
        const monthKey = sale.shipping_date ? formatDateToMonthYear(sale.shipping_date) : 'Unscheduled';
        
        if (!strategyMap.has(strat)) strategyMap.set(strat, { strategy: strat, available: 0, shipmentsByMonth: {}, totalShipment: 0 });
        
        const record = strategyMap.get(strat)!;
        const rawWeight = String(sale.weight_kilos || sale.weight || sale.SMT || 0).replace(/,/g, '');
        const weight = Math.abs(Number(rawWeight) || 0); 
        
        record.shipmentsByMonth[monthKey] = (record.shipmentsByMonth[monthKey] || 0) + weight;
        record.totalShipment += weight;
        
        totalShortsKg += weight;
        monthsSet.add(monthKey); 
      }
    });

    const sortedMonths = Array.from(monthsSet).sort((a, b) => {
      if (a === 'Unscheduled') return 1;
      if (b === 'Unscheduled') return -1;
      return new Date(a).getTime() - new Date(b).getTime();
    });

    const rows = Array.from(strategyMap.values()).map(row => ({
      ...row,
      netPosition: row.available - row.totalShipment
    })).sort((a, b) => a.strategy.localeCompare(b.strategy)); 

    return {
      tableData: rows,
      uniqueMonths: sortedMonths,
      kpis: {
        stock: totalStockKg,
        supplyChainStock: totalSupplyChainKg, 
        shorts: totalShortsKg,
        net: totalStockKg - totalShortsKg
      }
    };
  }, [activeCert, stocks, sales]); 

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


  if (loading) {
    return <div className="min-h-screen bg-[#D6D2C4] flex items-center justify-center text-[#51534a] font-bold">Loading Position Data...</div>;
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
                    <ListChecks size={16} className="text-[#007680]" />
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
                    } else if (val && !manualSaleForm.certifications.includes(val as CertType)) {
                        setManualSaleForm({ ...manualSaleForm, certifications: [...manualSaleForm.certifications, val as CertType] });
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
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-8 max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#D6D2C4] bg-[#F5F5F3]">
              <h3 className="font-bold text-[#51534a]">Create New Blend</h3>
              <button onClick={() => setIsAddBlendModalOpen(false)} className="text-[#968C83] hover:text-[#51534a] p-1 rounded-full hover:bg-[#D6D2C4]/50">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleCreateBlendSubmit} className="p-5 flex flex-col gap-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-[#51534a] mb-1 block">Blend Name *</label>
                  <input 
                    type="text" required placeholder="e.g. Premium Espresso Blend"
                    className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                    value={blendForm.name || ''}
                    onChange={(e) => setBlendForm({...blendForm, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#51534a] mb-1 block">Client</label>
                  <input 
                    type="text" placeholder="e.g. Client X"
                    className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                    value={blendForm.client || ''}
                    onChange={(e) => setBlendForm({...blendForm, client: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#51534a] mb-1 block">Blend No.</label>
                  <input 
                    type="text" placeholder="e.g. BL-1234"
                    className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                    value={blendForm.blend_no || ''}
                    onChange={(e) => setBlendForm({...blendForm, blend_no: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#51534a] mb-1 block">Grade</label>
                  <input 
                    type="text" placeholder="e.g. AA"
                    className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                    value={blendForm.grade || ''}
                    onChange={(e) => setBlendForm({...blendForm, grade: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#51534a] mb-1 block">Cup Profile</label>
                  <input 
                    type="text" placeholder="e.g. Fruity, Floral"
                    className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                    value={blendForm.cup_profile || ''}
                    onChange={(e) => setBlendForm({...blendForm, cup_profile: e.target.value})}
                  />
                </div>
              </div>

              {/* Component Percentages Grid */}
              <div className="mt-2 pt-4 border-t border-[#D6D2C4]">
                <h4 className="text-xs font-bold text-[#007680] uppercase tracking-wider mb-3">Blend Components (%)</h4>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {BLEND_COMPONENTS.map((comp) => (
                    <div key={comp.key}>
                      <label className="text-[10px] font-bold text-[#968C83] mb-1 block truncate" title={comp.label}>{comp.label}</label>
                      <input 
                        type="number" min="0" step="0.01" placeholder="0.00"
                        className="w-full border border-[#D6D2C4] rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-[#007680] outline-none text-[#51534a]"
                        value={blendForm[comp.key] || ''}
                        onChange={(e) => setBlendForm({...blendForm, [comp.key]: e.target.value})}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 mt-2 border-t border-[#D6D2C4] flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddBlendModalOpen(false)} className="px-4 py-2 text-sm font-bold text-[#968C83] hover:bg-[#F5F5F3] rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="bg-[#007680] text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-[#007680]/90 transition-all shadow-sm">Save Blend</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* --- HEADER --- */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#51534a] flex items-center gap-2">
              <div className="w-8 h-8 bg-[#007680] rounded-lg flex items-center justify-center text-white">
                <ShieldCheck size={18} />
              </div>
              Positions
            </h1>
            <p className="text-[#968C83] text-sm mt-1">Certification Stock & Sales Alignment</p>
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
            onClick={() => setActiveTab('certification')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
              activeTab === 'certification' ? 'border-[#007680] text-[#007680]' : 'border-transparent text-[#968C83] hover:text-[#51534a] hover:border-[#968C83]/30'
            }`}
          >
            <ListChecks size={16} /> Certification
          </button>
          <button
            onClick={() => setActiveTab('contracts')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
              activeTab === 'contracts' ? 'border-[#007680] text-[#007680]' : 'border-transparent text-[#968C83] hover:text-[#51534a] hover:border-[#968C83]/30'
            }`}
          >
            <FileText size={16} /> Contracts
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
          
          {/* Sub Navigation (Only for Certification Tab) */}
          {activeTab === 'certification' && (
            <div className="flex justify-between items-end">
              <FilterTabs tabs={certOptions} active={activeCert} onChange={setActiveCert} />
              <div className="text-xs text-[#968C83] pb-2 italic">Showing {activeCert} strategies</div>
            </div>
          )}

          {/* --- KPI CARDS (Physical & Certifications) --- */}
          {(activeTab === 'certification' || (activeTab === 'physical' && hasFetchedPhysical)) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 border-l-4 border-l-[#007680]">
                <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">
                  {activeTab === 'certification' ? `${activeCert} TOTAL STOCK` : 'PHYSICAL THEORETICAL STOCK'}
                </div>
                <div className="text-2xl font-bold text-[#51534a] mt-1">
                  {formatNumber(convertQty(activeTab === 'certification' ? kpis.stock : physicalData.kpis.totalTheoretical, unit))} <span className="text-sm font-normal text-[#968C83]">{unit.toUpperCase()}</span>
                </div>
                {activeTab === 'certification' && (['RFA', 'CAFE', 'EUDR'].includes(activeCert)) && (
                  <div className="text-[10px] text-[#007680] mt-1.5 font-bold bg-[#A4DBE8]/30 border border-[#007680]/10 inline-block px-1.5 py-0.5 rounded">
                     Supply Chain (Kenyacof): {formatNumber(convertQty(kpis.supplyChainStock, unit))} {unit}
                  </div>
                )}
              </Card>
              <Card className="p-4 border-l-4 border-l-[#5B3427]">
                <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">
                   {activeTab === 'certification' ? `${activeCert} TOTAL SHORTS` : 'PHYSICAL TOTAL BLEND SHORTS'}
                </div>
                <div className="text-2xl font-bold text-[#5B3427] mt-1 flex items-center gap-2">
                  {formatNumber(convertQty(activeTab === 'certification' ? kpis.shorts : physicalData.kpis.totalShorts, unit))} <span className="text-sm font-normal text-[#968C83]">{unit.toUpperCase()}</span>
                  <TrendingDown size={18} className="text-[#B9975B]" />
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-l-[#007680]">
                <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">
                   {activeTab === 'certification' ? `${activeCert} NET POSITION` : 'PHYSICAL NET POSITION'}
                </div>
                <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${(activeTab === 'certification' ? kpis.net : physicalData.kpis.totalNet) >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                  {(activeTab === 'certification' ? kpis.net : physicalData.kpis.totalNet) > 0 ? '+' : ''}{formatNumber(convertQty(activeTab === 'certification' ? kpis.net : physicalData.kpis.totalNet, unit))} <span className="text-sm font-normal text-[#968C83]">{unit.toUpperCase()}</span>
                  {(activeTab === 'certification' ? kpis.net : physicalData.kpis.totalNet) >= 0 ? <TrendingUp size={18} className="text-[#97D700]" /> : <TrendingDown size={18} />}
                </div>
              </Card>
            </div>
          )}

          {/* --- POSITION TABLE (Physical Tab) --- */}
          {activeTab === 'physical' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-[#968C83]/20">
                <div>
                  <h3 className="font-bold text-[#51534a]">Physical Positions</h3>
                  <p className="text-xs text-[#968C83]">Calculate theoretical vs actual blend allocations</p>
                </div>
                <button 
                  onClick={handleFetchPhysicalPositions} 
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
                          <th className="py-3 px-4 w-1/4">Post Stack</th>
                          <th className="py-3 px-4 text-right">Theoretical Volume ({unit})</th>
                          {physicalData.months.map(month => (
                            <th key={month} className="py-3 px-4 text-right bg-[#5B3427]">{month}</th>
                          ))}
                          <th className="py-3 px-4 text-right bg-[#B9975B]/20 border-l border-white/10">Total Shorts</th>
                          <th className="py-3 px-4 text-right bg-[#007680] border-l border-white/10">Net Position</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D6D2C4]">
                        {physicalData.gridData.length > 0 ? physicalData.gridData.map((row) => (
                          <tr key={row.stack} className="bg-white hover:bg-[#D6D2C4]/20 transition-colors group">
                            <td className="py-3 px-4 font-medium text-[#007680]">{formatStackName(row.stack)}</td>
                            <td className="py-3 px-4 text-right font-bold text-[#51534a] bg-[#F5F5F3]">
                                {formatNumber(convertQty(row.theoretical_volume, unit))}
                            </td>
                            {physicalData.months.map(month => {
                              const val = row.months[month] || 0;
                              return (
                                <td key={month} className="py-3 px-4 text-right text-[#968C83]">
                                  {Math.abs(val) > 0.01 ? formatNumber(convertQty(val, unit)) : '-'}
                                </td>
                              );
                            })}
                            <td className="py-3 px-4 text-right font-medium text-[#5B3427] bg-[#B9975B]/5 border-l border-[#D6D2C4]/50">
                                {formatNumber(convertQty(row.total_shorts, unit))}
                            </td>
                            <td className={`py-3 px-4 text-right font-bold border-l border-[#D6D2C4]/50 bg-[#A4DBE8]/10 ${row.net_position >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                              {row.net_position > 0 ? '+' : ''}{formatNumber(convertQty(row.net_position, unit))}
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan={physicalData.months.length + 4} className="py-8 text-center text-[#968C83] italic">No physical positions data found.</td></tr>
                        )}
                      </tbody>
                      {physicalData.gridData.length > 0 && (
                         <tfoot className="bg-[#EFEFE9] sticky bottom-0 border-t-2 border-[#D6D2C4] shadow-inner font-bold text-[#51534a]">
                            <tr>
                               <td className="py-3 px-4">TOTALS</td>
                               <td className="py-3 px-4 text-right">{formatNumber(convertQty(physicalData.kpis.totalTheoretical, unit))}</td>
                               {physicalData.months.map(month => {
                                  const monthTotal = physicalData.gridData.reduce((sum, row) => sum + (row.months[month] || 0), 0);
                                  return <td key={month} className="py-3 px-4 text-right text-[#5B3427]">{Math.abs(monthTotal) > 0.01 ? formatNumber(convertQty(monthTotal, unit)) : '-'}</td>;
                               })}
                               <td className="py-3 px-4 text-right text-[#5B3427] border-l border-[#D6D2C4]/50">{formatNumber(convertQty(physicalData.kpis.totalShorts, unit))}</td>
                               <td className={`py-3 px-4 text-right border-l border-[#D6D2C4]/50 ${physicalData.kpis.totalNet >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                                  {physicalData.kpis.totalNet > 0 ? '+' : ''}{formatNumber(convertQty(physicalData.kpis.totalNet, unit))}
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
                        Click the "Update Positions" button above to run the calculations for physical blend allocations based on unexecuted contracts.
                    </p>
                </div>
              )}
            </div>
          )}

          {/* --- POSITION TABLE (Certification Tab) --- */}
          {activeTab === 'certification' && (
            <Card className="overflow-hidden border-none shadow-md">
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-[#51534a] text-white font-medium sticky top-0 z-10 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4 w-1/4">Strategy</th>
                      <th className="py-3 px-4 text-right">Available ({unit})</th>
                      {uniqueMonths.map(month => (
                        <th key={month} className="py-3 px-4 text-right bg-[#5B3427]">{month}</th>
                      ))}
                      <th className="py-3 px-4 text-right bg-[#B9975B]/20 border-l border-white/10">Total Shipment</th>
                      <th className="py-3 px-4 text-right bg-[#007680] border-l border-white/10">Net Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D6D2C4]">
                    {tableData.length > 0 ? tableData.map((row) => (
                      <tr key={row.strategy} className="bg-white hover:bg-[#D6D2C4]/20 transition-colors group">
                        <td className="py-3 px-4 font-medium text-[#007680]">{row.strategy}</td>
                        <td className="py-3 px-4 text-right font-bold text-[#51534a] bg-[#F5F5F3]">{formatNumber(convertQty(row.available, unit))}</td>
                        {uniqueMonths.map(month => {
                          const val = row.shipmentsByMonth[month] || 0;
                          return <td key={month} className="py-3 px-4 text-right text-[#968C83]">{Math.abs(val) > 0.01 ? formatNumber(convertQty(val, unit)) : '-'}</td>;
                        })}
                        <td className="py-3 px-4 text-right font-medium text-[#5B3427] bg-[#B9975B]/5 border-l border-[#D6D2C4]/50">{formatNumber(convertQty(row.totalShipment, unit))}</td>
                        <td className={`py-3 px-4 text-right font-bold border-l border-[#D6D2C4]/50 bg-[#A4DBE8]/10 ${row.netPosition >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                          {row.netPosition > 0 ? '+' : ''}{formatNumber(convertQty(row.netPosition, unit))}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={uniqueMonths.length + 4} className="py-8 text-center text-[#968C83] italic">No {activeCert} positions found.</td></tr>
                    )}
                  </tbody>
                  {tableData.length > 0 && (
                     <tfoot className="bg-[#EFEFE9] sticky bottom-0 border-t-2 border-[#D6D2C4] shadow-inner font-bold text-[#51534a]">
                        <tr>
                           <td className="py-3 px-4">TOTALS</td>
                           <td className="py-3 px-4 text-right">{formatNumber(convertQty(kpis.stock, unit))}</td>
                           {uniqueMonths.map(month => {
                              const monthTotal = tableData.reduce((sum, row) => sum + (row.shipmentsByMonth[month] || 0), 0);
                              return <td key={month} className="py-3 px-4 text-right text-[#5B3427]">{Math.abs(monthTotal) > 0.01 ? formatNumber(convertQty(monthTotal, unit)) : '-'}</td>;
                           })}
                           <td className="py-3 px-4 text-right text-[#5B3427] border-l border-[#D6D2C4]/50">{formatNumber(convertQty(kpis.shorts, unit))}</td>
                           <td className={`py-3 px-4 text-right border-l border-[#D6D2C4]/50 ${kpis.net >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                              {kpis.net > 0 ? '+' : ''}{formatNumber(convertQty(kpis.net, unit))}
                           </td>
                        </tr>
                     </tfoot>
                  )}
                </table>
              </div>
            </Card>
          )}

          {/* --- CONTRACTS TAB (O(1) State-Driven Editing) --- */}
          {activeTab === 'contracts' && (
            <Card className="overflow-hidden border-none shadow-md">
              <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
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
                    {sales.map((sale) => {
                      const isEditing = editingContractId === sale.id;
                      const displayCerts = parseCerts(sale.certifications);

                      return (
                        <tr key={sale.id} className={`bg-white hover:bg-[#D6D2C4]/20 transition-colors ${isEditing ? 'bg-[#F5F5F3]' : ''}`}>
                          <td className="py-3 px-4 font-bold text-[#51534a]">{sale.contract_number}</td>
                          <td className="py-3 px-4 text-[#51534a]">{sale.client || '-'}</td>
                          <td className="py-3 px-4 text-right font-medium text-[#5B3427]">
                              {formatNumber(Number(String(sale.weight_kilos || sale.weight || sale.SMT || 0).replace(/,/g, '')))}
                          </td>
                          <td className="py-3 px-4 text-[#968C83]">{sale.shipping_date ? formatDateToMonthYear(sale.shipping_date) : '-'}</td>
                          
                          {/* Quality Cell */}
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

                          {/* Grade Cell */}
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

                          {/* Certifications Cell */}
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

                          {/* Blend Cell */}
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

                          {/* Actions Cell */}
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
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* --- BLENDS TAB --- */}
          {activeTab === 'blends' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button 
                  onClick={() => setIsAddBlendModalOpen(true)}
                  className="flex items-center gap-2 bg-[#007680] text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#007680]/90 transition-all shadow-sm"
                >
                  <Plus size={16} /> Create Blend
                </button>
              </div>
              <Card className="overflow-hidden border-none shadow-md">
                <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-[#51534a] text-white font-medium sticky top-0 z-10 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Blend Name</th>
                        <th className="py-3 px-4">Client</th>
                        <th className="py-3 px-4">Blend No.</th>
                        <th className="py-3 px-4">Grade</th>
                        <th className="py-3 px-4">Cup Profile</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D6D2C4]">
                      {blends.length > 0 ? blends.map((blend) => (
                        <tr key={blend.id} className="bg-white hover:bg-[#D6D2C4]/20 transition-colors">
                          <td className="py-3 px-4 font-bold text-[#007680]">{blend.name}</td>
                          <td className="py-3 px-4 text-[#51534a]">{blend.client || '-'}</td>
                          <td className="py-3 px-4 text-[#51534a]">{blend.blend_no || '-'}</td>
                          <td className="py-3 px-4 text-[#51534a]">{blend.grade || '-'}</td>
                          <td className="py-3 px-4 text-[#51534a]">{blend.cup_profile || '-'}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-[#968C83] italic">No blends found. Create one to get started.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}