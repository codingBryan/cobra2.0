"use client"
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Calculator, 
  FlaskConical, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  ArrowRight, 
  Download, 
  TrendingUp, 
  AlertCircle, 
  X,
  History,
  Archive,
  PackageCheck,
  PieChart,
  Check,
  Upload,
  CloudUpload,
  FileSpreadsheet,
  File as FileIcon,
  Trash2,
  Ban, 
  Filter,
  DollarSign,
  Pencil,
  BarChart3,
  Cog,
  CalendarClock,
  ChevronLeft,
  ArrowDown,
  ArrowUp,
  Activity,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Batch, LastUpdateDates, SaleRecord, StrategyAggregate } from '@/custom_utilities/custom_types';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Constants & Types ---
const KG_TO_LB = 2.2046;

type Unit = 'kg' | 'bag' | 'mt';
type OverrideMode = 'outright' | 'diff';

// Define the specific sort order
const SORT_ORDER_SUFFIXES = [
  "NATURAL",
  "17 UP TOP",
  "16 TOP",
  "15 TOP",
  "PB - TOP",
  "17 UP PLUS",
  "FAQ PLUS",
  "FAQ MINUS",
  "16 PLUS",
  "15 PLUS",
  "14 PLUS",
  "PB - PLUS",
  "17 UP FAQ",
  "16 FAQ",
  "15 FAQ",
  "14 FAQ",
  "PB - FAQ",
  "GRINDER BOLD",
  "GRINDER LIGHT",
  "MH",
  "ML",
  "REJECTS S",
  "REJECTS P"
];

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}


interface ExtendedBatch extends Batch {
    date_in?: string | null;
    analysis_id:string|null;
}


// --- CATALOGUE UPLOAD INTERFACES & HELPERS ---

interface BatchItem {
    mark: string | number | null;
    grade: string | number | null;
    cost: string | number | null;
    differential: string | number | null;
}

interface SheetData {
    fileName: string; 
    sheetName: string;
    hegde_level: string | number | null;
    date: string | number | null;
    batch_list: BatchItem[];
}

interface DatabaseBatchItem {
    lot: string | number | null;
    grade: string | number | null;
    price: string | number | null;      
    market_level: string | number | null; 
    differential: string | number | null; 
    cert: string | number | null;       
}

interface DatabaseSheetData {
    fileName: string;
    cost_usd_50_db: string | number | null;
    database_batch_list: DatabaseBatchItem[];
}

interface ProcessedPurchaseFile {
    ds_sheets: SheetData[];
    database_sheet: DatabaseSheetData | null;
}

interface CatalogueRecord {
    sale_type: string;
    sale_number: string | number | null;
    outturn: string | number | null;
    grower_mark: string | number | null;
    lot_number: string | number | null;
    weight: string | number | null;
    grade: string | number | null;
    season: string | number | null;
    certification: string | number | null;
    batch_number: string | number | null;
    cost_usd_50: string | number | null;
    hedge_usc_lb: string | number | null;
    diff_usc_lb: string | number | null;
    trade_month: string | number | null;
}

const getDaysInStock = (dateIn: string | null | undefined): number => {
    if (!dateIn) return 0;
    const diff = new Date().getTime() - new Date(dateIn).getTime();
    return Math.floor(diff / (1000 * 3600 * 24));
};

function convertDateToTradeMonth(dateValue: string | number | null): string | null {
    if (dateValue === null || dateValue === undefined) return null;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let date: Date;

    if (typeof dateValue === 'number') {
        // Highly Optimized: Native JS math instead of heavy XLSX.SSF processing
        const excelEpoch = new Date(1899, 11, 30);
        date = new Date(excelEpoch.getTime() + Math.round(dateValue * 86400000));
    } else if (typeof dateValue === 'string') {
        const parts = dateValue.split('.');
        if (parts.length < 3) return null;
        try {
            const year = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2]);
            const month = parseInt(parts[1]) - 1; 
            const day = parseInt(parts[0]);
            date = new Date(year, month, day);
        } catch (e) { return null; }
    } else { return null; }
    
    if (isNaN(date.getTime())) return null;
    return `${monthNames[date.getMonth()]}-${date.getFullYear()}`;
}

function readFileAsArrayBuffer(file: File): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(new Uint8Array(e.target?.result as ArrayBuffer));
        reader.onerror = (e) => reject(new Error(`Failed to read file ${file.name}`));
        reader.readAsArrayBuffer(file);
    });
}

function processPurchaseFileContent(excelFileArrayBuffer: Uint8Array, fileName: string, XLSX: any): ProcessedPurchaseFile {
    const workbook = XLSX.read(excelFileArrayBuffer, { type: 'array' });
    const processedFile: ProcessedPurchaseFile = { ds_sheets: [], database_sheet: null };

    const dsSheetNames = workbook.SheetNames.filter((name: string) => name.includes('DS'));
    const dbSheetName = workbook.SheetNames.find((name: string) => name.includes('Database'));

    // 1. Process 'DS' Sheets
    for (const sheetName of dsSheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;
        const sheetResult: SheetData = {
            fileName,
            sheetName,
            hegde_level: worksheet['G2'] ? worksheet['G2'].v : null,
            date: worksheet['A3'] ? worksheet['A3'].v : null, 
            batch_list: []
        };
        const sheetDataArray: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 6, defval: null });
        if (sheetDataArray.length < 1) continue;
        
        const headerRow = (sheetDataArray[0] as any[]).map((h: string) => (h && typeof h === 'string' ? h.trim().toUpperCase() : h));
        const dataRows = sheetDataArray.slice(1);
        const colIndices: any = {};
        ['MARK', 'GRADE', 'CPRICE', 'DIFFERENTIAL', 'LOT'].forEach(h => {
            const idx = headerRow.indexOf(h);
            if (idx !== -1) colIndices[h] = idx;
        });

        for (const row of dataRows) {
            if (!row[colIndices['LOT']]) break;
            sheetResult.batch_list.push({
                mark: row[colIndices['MARK']] ?? null,
                grade: row[colIndices['GRADE']] ?? null,
                cost: row[colIndices['CPRICE']] ?? null,
                differential: row[colIndices['DIFFERENTIAL']] ?? null,
            });
        }
        processedFile.ds_sheets.push(sheetResult);
    }

    // 2. Process 'Database' Sheet
    if (dbSheetName) {
        const worksheet = workbook.Sheets[dbSheetName];
        const sheetDataArray: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 4, defval: null });
        if (sheetDataArray.length > 1) {
            const headerRow = (sheetDataArray[0] as any[]).map((h: string) => (h && typeof h === 'string' ? h.trim().toUpperCase() : h));
            const dataRows = sheetDataArray.slice(1);
            const dbColIndices: any = {};
            ['LOT', 'GRADE', 'PRICE', 'MARKET LEVEL', 'DIFFERENTIAL', 'CERT', 'SALE'].forEach(h => {
                const idx = headerRow.indexOf(h);
                if (idx !== -1) dbColIndices[h] = idx;
            });

            const filteredBatchList: DatabaseBatchItem[] = [];
            for (const row of dataRows) {
                if (String(row[dbColIndices['SALE']] || '').trim().toUpperCase() === 'DS') {
                    filteredBatchList.push({
                        lot: row[dbColIndices['LOT']] ?? null,
                        grade: row[dbColIndices['GRADE']] ?? null,
                        price: row[dbColIndices['PRICE']] ?? null,
                        market_level: row[dbColIndices['MARKET LEVEL']] ?? null,
                        differential: row[dbColIndices['DIFFERENTIAL']] ?? null,
                        cert: row[dbColIndices['CERT']] ?? null,
                    });
                }
            }
            processedFile.database_sheet = {
                fileName,
                cost_usd_50_db: worksheet['H2'] ? worksheet['H2'].v : null,
                database_batch_list: filteredBatchList,
            };
        }
    }
    return processedFile;
}

function processCatalogueSummary(excelFileArrayBuffer: Uint8Array, fileName: string, processedPurchaseData: ProcessedPurchaseFile, XLSX: any): CatalogueRecord[] {
    const workbook = XLSX.read(excelFileArrayBuffer, { type: 'array' });
    const records: CatalogueRecord[] = [];
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) return records;

    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    if (rawData.length === 0) return records;

    const headerRow = (rawData[0] as string[]).map((h: string) => (h && typeof h === 'string' ? h.trim() : h));
    const dataRows = rawData.slice(1);
    const colIndices: any = {};
    const COL_MAP: any = {
        'Sale No.': 'sale_number', 'Outturn': 'outturn', 'Grower Marks': 'grower_mark', 
        'Lot No.': 'lot_number', 'Kilos': 'weight', 'Grade': 'grade', 'Season': 'season', 
        'Certification': 'certification', 'Batch No.': 'batch_number', 'Costs': 'cost_usd_50', 
        'Hedge(USC/LB)': 'hedge_usc_lb', 'Diff(USC/LB)': 'diff_usc_lb', 'Trade Month': 'trade_month',
    };
    Object.keys(COL_MAP).forEach(k => {
        const idx = headerRow.indexOf(k);
        if (idx !== -1) colIndices[k] = idx;
    });

    const getVal = (row: any[], key: string) => {
        const idx = colIndices[key];
        return idx !== undefined ? row[idx] : null;
    };

    for (const row of dataRows) {
        const batchNum = getVal(row, 'Batch No.');
        if (!batchNum) continue;

        const csTradeMonth = getVal(row, 'Trade Month');
        const csOutturn = String(getVal(row, 'Outturn') || '').toUpperCase();
        const csGrade = String(getVal(row, 'Grade') || '').toUpperCase();
        const csLotNumber = String(getVal(row, 'Lot No.') || '').toUpperCase();

        let record: CatalogueRecord = {
            sale_type: "Auction",
            sale_number: getVal(row, 'Sale No.'),
            outturn: getVal(row, 'Outturn'),
            grower_mark: getVal(row, 'Grower Marks'),
            lot_number: getVal(row, 'Lot No.'),
            weight: getVal(row, 'Kilos'),
            grade: getVal(row, 'Grade'),
            season: getVal(row, 'Season'),
            certification: getVal(row, 'Certification'),
            batch_number: batchNum,
            cost_usd_50: null, hedge_usc_lb: null, diff_usc_lb: null, trade_month: null,
        };

        if (csTradeMonth) {
            record.cost_usd_50 = getVal(row, 'Costs');
            record.hedge_usc_lb = getVal(row, 'Hedge(USC/LB)');
            record.diff_usc_lb = getVal(row, 'Diff(USC/LB)');
            record.trade_month = typeof csTradeMonth === 'number' ? convertDateToTradeMonth(csTradeMonth) : csTradeMonth;
        } else {
            // Tier 1 Lookup (DS Sheets)
            let matchFound = false;
            for (const psSheet of processedPurchaseData.ds_sheets) {
                for (const batchItem of psSheet.batch_list) {
                    const psMark = String(batchItem.mark || '').toUpperCase();
                    const psGrade = String(batchItem.grade || '').toUpperCase();
                    if (psMark.includes(csOutturn) && psGrade === csGrade) {
                        record.sale_type = "DS";
                        record.cost_usd_50 = batchItem.cost;
                        record.diff_usc_lb = batchItem.differential;
                        record.hedge_usc_lb = psSheet.hegde_level;
                        record.trade_month = convertDateToTradeMonth(psSheet.date);
                        matchFound = true;
                        break;
                    }
                }
                if (matchFound) break;
            }
            // Tier 2 Lookup (Database Sheet)
            if (!matchFound && processedPurchaseData.database_sheet) {
                for (const dbItem of processedPurchaseData.database_sheet.database_batch_list) {
                    if (String(dbItem.lot||'').toUpperCase() === csLotNumber && String(dbItem.grade||'').toUpperCase() === csGrade) {
                        record.cost_usd_50 = dbItem.price;
                        record.hedge_usc_lb = dbItem.market_level;
                        record.diff_usc_lb = dbItem.differential;
                        record.certification = dbItem.cert;
                        matchFound = true;
                        break;
                    }
                }
            }
        }
        records.push(record);
    }
    return records;
}

// --- HELPER FUNCTIONS ---
const toUSClb = (price50kg: number): number => {
  const pricePerKg = price50kg / 50;
  const pricePerLb = pricePerKg / KG_TO_LB;
  return pricePerLb * 100; 
};

const to50kg = (priceUSClb: number): number => {
  const pricePerLb = priceUSClb / 100;
  const pricePerKg = pricePerLb * KG_TO_LB;
  return pricePerKg * 50;
};

const convertQty = (kg: number, unit: Unit): number => {
  if (unit === 'bag') return kg / 60;
  if (unit === 'mt') return kg / 1000;
  return kg;
};

const formatNumber = (num: number, decimals = 2) => {
  if (num === undefined || num === null || isNaN(num)) return "0.00";
  return new Intl.NumberFormat('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  }).format(num);
};

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
};

// --- Components ---
const Card = ({ children, className = "", variant = "default" }: { children: React.ReactNode; className?: string, variant?: "default" | "dark" }) => {
  const bgClass = variant === "dark" ? "bg-[#51534a] text-white border-none" : "bg-white border border-[#968C83]/20";
  return (
    <div className={`rounded-xl shadow-sm ${bgClass} ${className}`}>
      {children}
    </div>
  );
};

// ... FilterTabs, MultiSelect, FileDropZone, FileUploadModal ...
const FilterTabs = ({ active, onChange }: { active: string, onChange: (val: string) => void }) => {
  const filters = ['PRE', 'IN', 'POST', 'FINISHED', 'OLD'];
  return (
    <div className="flex gap-2 pb-2">
      {filters.map(f => (
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

function MultiSelect({ 
    options, 
    selected, 
    onChange, 
    placeholder, 
    searchable = false 
}: { 
    options: string[], 
    selected: string[], 
    onChange: (val: string[]) => void, 
    placeholder: string,
    searchable?: boolean 
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (option: string) => {
        if (selected.includes(option)) {
            onChange(selected.filter(s => s !== option));
        } else {
            onChange([...selected, option]);
        }
    };

    const filteredOptions = options.filter(opt => 
        opt.toLowerCase().includes(search.toLowerCase())
    );

    const isAllSelected = selected.length === options.length;
    const toggleAll = () => {
        if (isAllSelected) onChange([]);
        else onChange(options);
    };

    return (
        <div className="relative w-full md:w-48" ref={containerRef}>
            <div 
                className="bg-white border border-[#D6D2C4] rounded px-3 py-1.5 text-sm cursor-pointer flex justify-between items-center text-[#51534a] focus:border-[#007680] h-8"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="truncate">
                    {selected.length === 0 
                        ? placeholder 
                        : selected.length === options.length 
                            ? `All ${placeholder}` 
                            : `${selected.length} selected`}
                </span>
                <ChevronDown size={14} className="text-[#968C83]" />
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 w-64 bg-white border border-[#D6D2C4] shadow-lg rounded-lg mt-1 z-50 max-h-60 overflow-hidden flex flex-col">
                    {searchable && (
                        <div className="p-2 border-b border-[#D6D2C4]">
                            <div className="relative">
                                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#968C83]" />
                                <input 
                                    type="text" 
                                    className="w-full pl-8 pr-2 py-1 text-xs border border-[#D6D2C4] rounded outline-none focus:border-[#007680]"
                                    placeholder="Search..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>
                    )}
                    <div className="overflow-y-auto flex-1 p-1">
                        <div 
                            className="px-2 py-1.5 hover:bg-[#D6D2C4]/20 cursor-pointer flex items-center gap-2 text-xs font-bold text-[#007680] border-b border-[#D6D2C4]/30 mb-1"
                            onClick={toggleAll}
                        >
                            <div className={`w-3 h-3 border rounded flex items-center justify-center ${isAllSelected ? 'bg-[#007680] border-[#007680]' : 'border-[#968C83]'}`}>
                                {isAllSelected && <Check size={10} className="text-white" />}
                            </div>
                            Select All
                        </div>
                        {filteredOptions.length > 0 ? filteredOptions.map(opt => {
                            const isSelected = selected.includes(opt);
                            return (
                                <div 
                                    key={opt} 
                                    className="px-1 py-1.5 hover:bg-[#D6D2C4]/20 cursor-pointer flex items-center space-between gap-2 text-xs text-[#51534a]"
                                    onClick={() => toggleOption(opt)}>
                                    <div className={`w-3 h-3 border rounded flex items-center justify-center ${isSelected ? 'bg-[#007680] border-[#007680]' : 'border-[#968C83]'}`}>
                                        {isSelected && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className="truncate">{opt}</span>
                                </div>
                            )
                        }) : (
                            <div className="px-2 py-2 text-xs text-[#968C83] text-center italic">No results</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const FileDropZone = ({ 
  label, 
  accept, 
  files, 
  onFilesAdded, 
  onRemoveFile, 
  multiple = false, 
  required = false 
}: { 
  label: string, 
  accept: string, 
  files: File[], 
  onFilesAdded: (f: File[]) => void, 
  onRemoveFile: (idx: number) => void,
  multiple?: boolean,
  required?: boolean
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      if (!multiple) {
        onFilesAdded([newFiles[0]]);
      } else {
        onFilesAdded(newFiles);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      onFilesAdded(newFiles);
    }
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider flex justify-between items-center h-4">
        <span className="truncate pr-2" title={label}>{label}</span>
        {required && <span className="text-[#B9975B] text-[8px] bg-[#B9975B]/10 px-1 rounded shrink-0">Req</span>}
      </label>
      
      <div 
        className={`border border-dashed rounded p-2 transition-colors text-center cursor-pointer min-h-24 flex flex-col items-center justify-center ${isDragging ? 'border-[#007680] bg-[#007680]/5' : 'border-[#D6D2C4] hover:border-[#007680]/50'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input 
          ref={inputRef}
          type="file" 
          accept={accept} 
          multiple={multiple} 
          className="hidden" 
          onChange={handleChange}
        />
        {files.length === 0 ? (
          <>
            <CloudUpload size={16} className="text-[#968C83] mb-1" />
            <span className="text-[10px] text-[#51534a] leading-tight">
              Click or Drag
            </span>
          </>
        ) : (
          <div className="w-full flex flex-col gap-1">
            {files.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between bg-white border border-[#D6D2C4] px-1.5 py-0.5 rounded text-[10px]">
                <div className="flex items-center gap-1 overflow-hidden">
                  <FileSpreadsheet size={10} className="text-[#007680] shrink-0" />
                  <span className="truncate text-[#51534a] max-w-32">{file.name}</span>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(idx);
                  }}
                  className="text-[#968C83] hover:text-[#B9975B] transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


const FileUploadModal = ({ onClose }: { onClose: () => void }) => {
  // --- Section 1 State ---
  const [purchaseFiles, setPurchaseFiles] = useState<File[]>([]);
  const [catalogueFiles, setCatalogueFiles] = useState<File[]>([]);
  // NEW: Loading State for Catalogue Logic
  const [isProcessingCatalogue, setIsProcessingCatalogue] = useState(false);
  
  // --- NEW: State for Failed Batches Modal ---
  // Using any[] to allow both strings and objects {batch, grade, qty}
  const [failedBatches, setFailedBatches] = useState<any[]>([]); 
  const [showFailedBatches, setShowFailedBatches] = useState(false);

  // --- Section 2 State ---
  const [stockReportFile, setStockReportFile] = useState<File[]>([]);
  const [analysisFile, setAnalysisFile] = useState<File[]>([]);
  const [transferFile, setTransferFile] = useState<File[]>([]);
  const [dispatchFile, setDispatchFile] = useState<File[]>([]);
  const [adjustmentFile, setAdjustmentFile] = useState<File[]>([]);
  const [testDetailsFile, setTestDetailsFile] = useState<File[]>([]);

  // --- Section 3 State ---
  const [blockedLotsFile, setBlockedLotsFile] = useState<File[]>([]);
  const [isUploadingBlocked, setIsUploadingBlocked] = useState(false);
  
  // --- MODIFIED: State for Logic Control ---
  const [isUploadingStock, setIsUploadingStock] = useState(false);
  const [overwriteModalOpen, setOverwriteModalOpen] = useState(false);
  const [existingSummaryId, setExistingSummaryId] = useState<number>(0);

  // Handlers Section 1: Catalogue Upload
  const handleUploadCatalogue = async () => {
    if (purchaseFiles.length === 0 && catalogueFiles.length === 0) {
        alert("Please select files to upload.");
        return;
    }

    setIsProcessingCatalogue(true);

    try {
        // HIGHLY OPTIMIZED: Dynamically load the heavy 1MB+ XLSX library ONLY when needed
        const XLSX = await import('xlsx');
        let processedPurchaseData: ProcessedPurchaseFile = { ds_sheets: [], database_sheet: null };

        // 1. Process Purchase Sheets
        if (purchaseFiles.length > 0) {
            for (const file of purchaseFiles) {
                if (!file.name.match(/\.xls(x)?$/)) continue;
                try {
                    const buffer = await readFileAsArrayBuffer(file);
                    const fileData = processPurchaseFileContent(buffer, file.name, XLSX);
                    processedPurchaseData.ds_sheets.push(...fileData.ds_sheets);
                    if (!processedPurchaseData.database_sheet && fileData.database_sheet) {
                        processedPurchaseData.database_sheet = fileData.database_sheet;
                    }
                } catch (err) { console.error(`Error processing ${file.name}`, err); }
            }
        }

        // 2. Process Catalogue Summaries & Lookup Data
        let recordsToInsert: CatalogueRecord[] = [];
        if (catalogueFiles.length > 0) {
            for (const file of catalogueFiles) {
                const buffer = await readFileAsArrayBuffer(file);
                const fileRecords = processCatalogueSummary(buffer, file.name, processedPurchaseData, XLSX);
                recordsToInsert.push(...fileRecords);
            }
        }

        // 3. API Insertion
        if (recordsToInsert.length > 0) {
            const apiResponse = await fetch('/api/catalogue_summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(recordsToInsert)
            });

            const result = await apiResponse.json();

            if (!apiResponse.ok) {
                throw new Error(`API Error: ${result.error || result.message || apiResponse.statusText}`);
            }

            if (result.success) {
                setPurchaseFiles([]);
                setCatalogueFiles([]);

                // Check for failed batches and trigger modal if they exist
                if (result.failedBatchNumbers && result.failedBatchNumbers.length > 0) {
                    setFailedBatches(result.failedBatchNumbers);
                    setShowFailedBatches(true);
                } else {
                    // Only show alert if there are NO failures
                    alert(result.message || `Success! ${recordsToInsert.length} records processed.`);
                }
            }
        } else {
            alert("No valid catalogue records generated.");
        }

    } catch (e: any) {
        console.error("Upload failed", e);
        alert(`Error: ${e.message}`);
    } finally {
        setIsProcessingCatalogue(false);
    }
  };

  // --- CORE LOGIC: The Actual Stock Processing Function ---
  const executeStockUpload = async () => {
    
    let last_update_dates: LastUpdateDates = await fetch('/api/last_update_dates', { method: 'GET'}).then(r => r.json());
    console.log(last_update_dates);
    
    setIsUploadingStock(true);
    // Hardcoded date as per provided logic
    const since_date: Date = new Date(2024, 0, 1);
    let summary_id: number = 0;

    try {
        console.log("Initializing summary...");
        // 1. Initialize Summary
        const initResponse = await fetch('/api/create_summary', { method: 'GET' });
        const initResult = await initResponse.json();
        
        if (!initResponse.ok || initResult === 0) {
            throw new Error(initResult.error || "Failed to Initialize daily summary.");
        }
        summary_id = initResult.summary_id;

        // 2. Prepare FormData
        const formData = new FormData();

        formData.append("summary_id", summary_id.toString());
        formData.append("targetDate", since_date.toISOString());
        
        if (last_update_dates.last_sta) {
          formData.append("last_adjustment_date", last_update_dates.last_sta.toString()); 
        } 

        if (last_update_dates.last_process) {
          formData.append("last_processing_date", last_update_dates.last_process.toString()); 
        } 

        if (last_update_dates.last_sti) {
          formData.append("last_inbound_date", last_update_dates.last_sti.toString()); 
        } 

        if (last_update_dates.last_outbound) {
          formData.append("last_outbound_date", last_update_dates.last_outbound.toString()); 
        } 
        formData.append("stiFile", transferFile[0]);      
        formData.append("gdiFile", dispatchFile[0]);  
        formData.append("staFile", adjustmentFile[0]);     
        formData.append("current_stock", stockReportFile[0]); 
        formData.append("processing_analysis_file", analysisFile[0]); 
        formData.append("test_details_summary_file", testDetailsFile[0]); 

        console.log("Processing files in parallel...");

        // 3. Processing Phase (Parallelized for efficiency)
        const [stiResult, gdiResult, staResult, stockResult, paResult] = await Promise.all([
            fetch('/api/process_sti', { method: 'POST', body: formData }).then(r => r.json()),
            fetch('/api/process_gdi', { method: 'POST', body: formData }).then(r => r.json()),
            fetch('/api/process_sta', { method: 'POST', body: formData }).then(r => r.json()),
            fetch('/api/stock_movement', { method: 'POST', body: formData }).then(r => r.json()),
            fetch('/api/process_pa', { method: 'POST', body: formData }).then(r => r.json()),
            
        ]);

        const strategy_update = await fetch('/api/update_undefined_strategies', { method: 'POST', body: formData })
        const strategy_update_reponse = strategy_update.json()
        // 4. Extract Data
        const inbound_weight = stiResult.total_delivered_qty;
        const outbound_weight = gdiResult.groupedData?.totalOutbound;
        const adjustment_weight = staResult.totalAdjustment;
        const xbs_current_stock_report = stockResult['current_stock_summary'];
        const processing_summary_object = paResult;
        // Check for integrity
        if (!processing_summary_object || outbound_weight === undefined || inbound_weight === undefined || !xbs_current_stock_report) {
            throw new Error("Missing crucial daily summary data points from file processing.");
        }

        console.log("Files processed successfully. Creating final summary...");

        // 5. Create Final Summary
        const summaryResponse = await fetch('/api/create_summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                summary_id: summary_id,
                targetDate: since_date,
                process_summary: processing_summary_object,
                inbound_weight: inbound_weight, 
                outbound_weight: outbound_weight,
                adjustment_weight: adjustment_weight,
                xbs_current_stock_report: xbs_current_stock_report,
            }),
        });

        const new_activity = await summaryResponse.json();
        if (!summaryResponse.ok) {
            throw new Error("Summary creation or Activity initialization failed");
        }

        // 6. Update Stock Activities
        const dataToSend: any = {
            summary_id: summary_id,
            stock_data: xbs_current_stock_report,
            new_activities_data: new_activity || undefined
        };

        const updateActivitiesResponse = await fetch('/api/update_stock_activities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend),
        });

        if (!updateActivitiesResponse.ok) {
            throw new Error("Failed to update stock activities.");
        }

        console.log("Updating post-process strategies...");

        // 7. Final Updates (Parallel)
        await Promise.all([
            fetch('/api/update_post_stacks', { method: 'POST', body: formData })
        ]);

        alert("Stock Movement Uploaded and Processed Successfully!");
        setOverwriteModalOpen(false); 

    } catch (error: any) {
        console.error("Error in executeStockUpload:", error);
        alert(`Error: ${error.message || "An unknown error occurred during processing."}`);
    } finally {
        setIsUploadingStock(false);
    }
  };

  // --- NEW: Entry Point Handler ---
  const handleUploadStock = async () => {
    // 1. Validation
    if (
      !stockReportFile.length ||
      !analysisFile.length ||
      !transferFile.length ||
      !dispatchFile.length ||
      !adjustmentFile.length ||
      !testDetailsFile.length
    ) {
        alert("Please select all required files (Stock, Analysis, Transfer, Dispatch, Adjustment, Test Details).");
        return;
    }

    setIsUploadingStock(true);

    try {
        // 2. Check for existing summary
        const checkResponse = await fetch('/api/movement_summary');
        const { id } = await checkResponse.json();

        if (id && id !== 0) {
            setExistingSummaryId(id);
            setIsUploadingStock(false); 
            setOverwriteModalOpen(true); 
            return;
        }

        // 3. If ID is 0, proceed normally
        await executeStockUpload();

    } catch (error) {
        console.error("Error checking daily summary:", error);
        alert("Failed to check for existing daily summaries.");
        setIsUploadingStock(false);
    }
  };

  // --- NEW: Overwrite "Yes" Handler ---
  const handleOverwriteConfirm = async () => {
    if (!existingSummaryId) return;
    setOverwriteModalOpen(false);
    setIsUploadingStock(true); 
    try {
        const deleteResponse = await fetch(`/api/movement_summary?id=${existingSummaryId}`, {
            method: 'DELETE'
        });

        if (!deleteResponse.ok) {
            throw new Error("Failed to delete the existing summary.");
        }

        await executeStockUpload();

    } catch (error: any) {
        alert(`Error during overwrite: ${error.message}`);
        setIsUploadingStock(false);
        setOverwriteModalOpen(false);
    }
  };

  // --- NEW: Overwrite "No" Handler ---
  const handleOverwriteCancel = () => {
    setOverwriteModalOpen(false);
    setExistingSummaryId(0);
    setIsUploadingStock(false);
  };

  // Handlers Section 3 (NEW)
  const handleUploadBlockedLots = async () => {
    if (blockedLotsFile.length === 0) {
      alert("Please select a file to upload.");
      return;
    }

    setIsUploadingBlocked(true);
    const formData = new FormData();
    formData.append('file', blockedLotsFile[0]);

    try {
      const response = await fetch('/api/sale_records', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        alert("Blocked Lots file processed successfully!");
        setBlockedLotsFile([]); 
      } else {
        const errorData = await response.json();
        alert(`Error uploading file: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("An error occurred while uploading the file.");
    } finally {
      setIsUploadingBlocked(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-[#EFEFE9] w-full max-w-5xl rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] relative">
        
        {/* --- NEW: Failed Batches Modal Overlay --- */}
        {showFailedBatches && (
            <div className="absolute h-[40%] inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px] overflow-scroll">
                <div className="bg-white p-6 rounded-lg shadow-xl border border-red-200 max-w-md w-full animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
                    <div className="flex flex-col items-center text-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                            <AlertCircle size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-[#51534a]">Upload Completed with Issues</h3>
                        <p className="text-sm text-[#968C83]">
                            The following batches could not be processed (duplicates or invalid data):
                        </p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto border border-[#D6D2C4] rounded bg-[#F5F5F3] p-3 mb-4 w-full">
                        <ul className="text-xs text-[#51534a] space-y-1">
                            {failedBatches.map((item, i) => (
                                <li key={i} className="flex items-center gap-2 font-mono border-b border-[#D6D2C4]/30 pb-1 last:border-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                                    {/* FIX: Handle Object vs String rendering */}
                                    {typeof item === 'object' && item !== null ? (
                                        <div className="flex flex-col">
                                            <span className="font-bold">{item.batch}</span>
                                            <span className="text-[10px] text-[#968C83]">
                                                Grade: {item.grade} {item.qty ? `| Qty: ${item.qty}` : ''}
                                            </span>
                                        </div>
                                    ) : (
                                        <span>{item}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <button 
                        onClick={() => setShowFailedBatches(false)}
                        className="w-full px-4 py-2 rounded bg-[#51534a] text-white text-sm font-bold hover:bg-[#51534a]/90 shadow-sm transition-all"
                    >
                        Close
                    </button>
                </div>
            </div>
        )}

        {/* --- NEW: Overwrite Confirmation Overlay --- */}
        {overwriteModalOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                <div className="bg-white p-6 rounded-lg shadow-xl border border-[#B9975B] max-w-sm w-full animate-in zoom-in-95 duration-200">
                    <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#B9975B]/10 flex items-center justify-center text-[#B9975B]">
                            <AlertCircle size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-[#51534a]">Summary Exists</h3>
                        <p className="text-sm text-[#968C83]">
                            A daily summary already exists for today (ID: {existingSummaryId}). 
                            Do you want to overwrite it?
                        </p>
                        <div className="flex gap-3 w-full mt-2">
                            <button 
                                onClick={handleOverwriteCancel}
                                className="flex-1 px-4 py-2 rounded border border-[#D6D2C4] text-[#51534a] text-sm hover:bg-[#F5F5F3]"
                            >
                                No, Cancel
                            </button>
                            <button 
                                onClick={handleOverwriteConfirm}
                                className="flex-1 px-4 py-2 rounded bg-[#B9975B] text-white text-sm font-bold hover:bg-[#B9975B]/90 shadow-sm"
                            >
                                Yes, Overwrite
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#D6D2C4] bg-white shrink-0">
          <h2 className="text-base font-bold text-[#51534a] flex items-center gap-2">
            <div className="w-6 h-6 bg-[#007680] rounded flex items-center justify-center text-white">
              <Upload size={14} />
            </div>
            File Upload Center
          </h2>
          <button onClick={onClose} className="text-[#968C83] hover:text-[#51534a] p-1.5 rounded-full hover:bg-[#D6D2C4]/30 transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Compact Body - Using Grid to fit all in view */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#F5F5F3]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
            
            {/* Left Column: Catalogue + Blocked (Stacked) */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              
              {/* Section 1: Update Catalogue Summary */}
              <section className="bg-white p-3 rounded-lg border border-[#D6D2C4] shadow-sm flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-[#D6D2C4]/50 pb-1.5">
                  <h3 className="font-bold text-[#51534a] text-xs flex items-center gap-2">
                    <FileIcon size={14} className="text-[#007680]"/>
                    Update Catalogue
                  </h3>
                  <button 
                    onClick={handleUploadCatalogue}
                    disabled={isProcessingCatalogue}
                    className="bg-[#51534a] text-white px-2 py-1 rounded text-[10px] font-medium hover:bg-[#51534a]/90 transition-all flex items-center gap-1 disabled:opacity-50"
                  >
                    <Upload size={10} /> {isProcessingCatalogue ? 'Processing...' : 'Upload'}
                  </button>
                </div>
                
                <div className="space-y-3">
                  <FileDropZone 
                    label="Purchase Sheets" 
                    accept=".xlsx,.xls,.csv" 
                    files={purchaseFiles}
                    multiple={true}
                    onFilesAdded={(newFiles) => setPurchaseFiles(prev => [...prev, ...newFiles])}
                    onRemoveFile={(idx) => setPurchaseFiles(prev => prev.filter((_, i) => i !== idx))}
                  />
                  <FileDropZone 
                    label="Catalogue Summary" 
                    accept=".xlsx,.xls,.csv" 
                    files={catalogueFiles}
                    multiple={true}
                    onFilesAdded={(newFiles) => setCatalogueFiles(prev => [...prev, ...newFiles])}
                    onRemoveFile={(idx) => setCatalogueFiles(prev => prev.filter((_, i) => i !== idx))}
                  />
                </div>
              </section>

              {/* Section 3: Update Blocked Lots */}
              <section className="bg-white p-3 rounded-lg border border-[#D6D2C4] shadow-sm flex-1 flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-[#D6D2C4]/50 pb-1.5">
                  <h3 className="font-bold text-[#51534a] text-xs flex items-center gap-2">
                    <Ban size={14} className="text-[#B9975B]"/>
                    Update Blocked Lots
                  </h3>
                  <button 
                    onClick={handleUploadBlockedLots}
                    disabled={isUploadingBlocked}
                    className="bg-[#B9975B] text-white px-2 py-1 rounded text-[10px] font-medium hover:bg-[#B9975B]/90 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload size={10} /> {isUploadingBlocked ? 'Uploading...' : 'Upload'}
                  </button>
                </div>

                <div className="flex-1">
                  <FileDropZone 
                    label="Blocked Lots (Excel)" 
                    accept=".xlsx,.xls" 
                    required
                    files={blockedLotsFile}
                    onFilesAdded={(f) => setBlockedLotsFile(f)}
                    onRemoveFile={() => setBlockedLotsFile([])}
                  />
                </div>
              </section>

            </div>

            {/* Right Column: Daily Stock Movement (Larger) */}
            <div className="lg:col-span-8">
              <section className="bg-white p-3 rounded-lg border border-[#D6D2C4] shadow-sm h-full flex flex-col">
                <div className="flex justify-between items-center mb-3 border-b border-[#D6D2C4]/50 pb-1.5 shrink-0">
                  <h3 className="font-bold text-[#51534a] text-xs flex items-center gap-2">
                    <TrendingUp size={14} className="text-[#007680]"/>
                    Update Daily Stock Movement
                  </h3>
                  <button 
                    onClick={handleUploadStock}
                    disabled={isUploadingStock}
                    className="bg-[#007680] text-white px-3 py-1.5 rounded text-[10px] font-medium hover:bg-[#007680]/90 transition-all flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload size={12} /> {isUploadingStock ? 'Processing...' : 'Upload All Movement Files'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-3 flex-1 overflow-y-auto content-start">
                  <FileDropZone 
                    label="Current Stock (CSV)" 
                    accept=".csv" 
                    required
                    files={stockReportFile}
                    onFilesAdded={(f) => setStockReportFile(f)}
                    onRemoveFile={() => setStockReportFile([])}
                  />
                  <FileDropZone 
                    label="Processing Analysis" 
                    accept=".xlsx,.xls" 
                    required
                    files={analysisFile}
                    onFilesAdded={(f) => setAnalysisFile(f)}
                    onRemoveFile={() => setAnalysisFile([])}
                  />
                  <FileDropZone 
                    label="Stock Transfer" 
                    accept=".xlsx,.xls" 
                    files={transferFile}
                    onFilesAdded={(f) => setTransferFile(f)}
                    onRemoveFile={() => setTransferFile([])}
                  />
                  <FileDropZone 
                    label="Goods Dispatch" 
                    accept=".xlsx,.xls" 
                    required
                    files={dispatchFile}
                    onFilesAdded={(f) => setDispatchFile(f)}
                    onRemoveFile={() => setDispatchFile([])}
                  />
                  <FileDropZone 
                    label="Stock Adjustment" 
                    accept=".xlsx,.xls" 
                    required
                    files={adjustmentFile}
                    onFilesAdded={(f) => setAdjustmentFile(f)}
                    onRemoveFile={() => setAdjustmentFile([])}
                  />
                  <FileDropZone 
                    label="Test Details" 
                    accept=".xlsx,.xls" 
                    files={testDetailsFile}
                    onFilesAdded={(f) => setTestDetailsFile(f)}
                    onRemoveFile={() => setTestDetailsFile([])}
                  />
                </div>
              </section>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default function EffectivePriceTool() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'strategic' | 'batch' | 'history' | 'client_analysis'>('inventory');
  const [unit, setUnit] = useState<Unit>('kg');
  
  // STATE for Data
  const [activeBatches, setActiveBatches] = useState<Batch[]>([]);
  // REMOVED: historyBatches state
  const [loading, setLoading] = useState(true);
  
  // STATE for Upload Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // FETCH DATA on Mount
  useEffect(() => {
    async function loadData() {
        try {
            const res = await fetch('/api/batches');
            if (res.ok) {
                const data = await res.json();
                setActiveBatches(data.activeBatches || []);
            } else {
                console.error("Failed to fetch batch data");
            }
        } catch (e) {
            console.error("Error loading batch data:", e);
        } finally {
            setLoading(false);
        }
    }
    loadData();
  }, []);
  
  // Highly Optimized O(N) Single-Pass Memory Mapping
  const processedData = useMemo(() => {
    const stratMap = new Map<string, any>();

    for (let i = 0; i < activeBatches.length; i++) {
        const b = activeBatches[i];
        if (b.status !== 'active') continue;

        const stratName = b.strategy || 'Unassigned';
        let agg = stratMap.get(stratName);
        
        if (!agg) {
            agg = { name: stratName, totalKg: 0, batches: [], _valUSC: 0, _hedgeUSC: 0, _pricedKg: 0 };
            stratMap.set(stratName, agg);
        }

        agg.batches.push(b);
        agg.totalKg += b.quantityKg;

        if (b.outrightPrice50kg && b.outrightPrice50kg > 0) {
            const valUSClb = (b.outrightPrice50kg / 50 / KG_TO_LB) * 100;
            agg._valUSC += valUSClb * b.quantityKg;
            agg._hedgeUSC += b.hedgeLevelUSClb * b.quantityKg;
            agg._pricedKg += b.quantityKg;
        }
    }

    const aggregates: StrategyAggregate[] = [];
    for (const agg of stratMap.values()) {
        const pricedKg = agg._pricedKg;
        const wAvgOutrightUSClb = pricedKg ? agg._valUSC / pricedKg : 0;
        const wAvgHedgeUSClb = pricedKg ? agg._hedgeUSC / pricedKg : 0;

        aggregates.push({
            name: agg.name,
            totalKg: agg.totalKg,
            batches: agg.batches,
            wAvgOutright50kg: wAvgOutrightUSClb ? (wAvgOutrightUSClb / 100 * KG_TO_LB) * 50 : 0,
            wAvgHedgeUSClb: wAvgHedgeUSClb,
            wAvgDiffUSClb: wAvgOutrightUSClb - wAvgHedgeUSClb
        });
    }

    return aggregates;
  }, [activeBatches]);

  if (loading) {
      return <div className="min-h-screen flex items-center justify-center bg-[#D6D2C4] text-[#51534a]">Loading Inventory Data...</div>;
  }

  return (
    <div className="min-h-screen bg-[#D6D2C4] font-sans text-[#51534a] md:p-1 relative">
      {/* Upload Modal */}
      {isUploadModalOpen && <FileUploadModal onClose={() => setIsUploadModalOpen(false)} />}

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#51534a] flex items-center gap-2">
              <div className="w-8 h-8 bg-[#007680] rounded-lg flex items-center justify-center text-white">
                <Calculator size={18} />
              </div>
              Post Processing: Effective Price
            </h1>
            <p className="text-[#968C83] text-sm mt-1">Coffee Position & Blend Calculator</p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Unit Toggles */}
            <div className="flex items-center bg-white p-1 rounded-lg border border-[#968C83]/20 shadow-sm">
              {(['kg', 'bag', 'mt'] as Unit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    unit === u 
                      ? 'bg-[#007680] text-white shadow-sm' 
                      : 'text-[#968C83] hover:bg-[#D6D2C4]/30'
                  }`}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>

            {/* File Upload Button */}
            <button 
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center justify-center w-10 h-10 bg-[#51534a] text-white rounded-lg hover:bg-[#51534a]/90 transition-colors shadow-sm"
              title="Upload Data Files"
            >
              <Upload size={20} />
            </button>
          </div>
        </header>

        {/* Navigation */}
        <div className="flex gap-2 border-b border-[#968C83]/30 overflow-x-auto">

        
          <NavButton 
            active={activeTab === 'inventory'} 
            onClick={() => setActiveTab('inventory')} 
            icon={LayoutDashboard} 
            label="Inventory" 
          />

          <NavButton 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            icon={BarChart3} 
            label="Stock Movement" 
          />
          <NavButton 
            active={activeTab === 'strategic'} 
            onClick={() => setActiveTab('strategic')} 
            icon={FlaskConical} 
            label="Strategic Blender" 
          />
          <NavButton 
            active={activeTab === 'batch'} 
            onClick={() => setActiveTab('batch')} 
            icon={Calculator} 
            label="Batch Blender" 
          />
          <NavButton 
            active={activeTab === 'client_analysis'} 
            onClick={() => setActiveTab('client_analysis')} 
            icon={History} 
            label="Client Analysis" 
          />

          <NavButton 
            active={activeTab === 'history'} 
            onClick={() => setActiveTab('history')} 
            icon={History} 
            label="Batch History" 
          />
          
        </div>


        <main>
          {activeTab === 'dashboard' && (
            <DashboardView unit={unit} />
          )}
          {activeTab === 'inventory' && (
            <InventoryView data={processedData} unit={unit} />
          )}
          {activeTab === 'strategic' && (
            <StrategicBlender data={processedData}  unit={unit}/>
          )}
          {activeTab === 'batch' && (
            <BatchBlender data={processedData} unit={unit} />
          )}
          {activeTab === 'history' && (
            <BatchHistoryView unit={unit} />
          )}
          {activeTab === 'client_analysis' && (
            <ClientAnalysisView unit={unit} />
          )}
        </main>

      </div>
    </div>
  );
}

// --- Sub-Components ---

function NavButton({ active, onClick, icon: Icon, label }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
        active 
          ? 'border-[#007680] text-[#007680]' 
          : 'border-transparent text-[#968C83] hover:text-[#51534a] hover:border-[#968C83]/30'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function InventoryView({ data, unit }: { data: StrategyAggregate[], unit: Unit }) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filter, setFilter] = useState('POST');

  const filteredData = useMemo(() => {
    const filtered = data.filter(d => d.name.toUpperCase().startsWith(filter));

    return filtered.sort((a, b) => {
        const getRank = (name: string) => {
            const cleanName = name.toUpperCase().replace(filter, '').trim().replace(/^[-_]/, '').trim(); 
            const idx = SORT_ORDER_SUFFIXES.indexOf(cleanName);
            if (idx === -1) {
                 return SORT_ORDER_SUFFIXES.findIndex(s => cleanName.includes(s));
            }
            return idx;
        };
        
        const rankA = getRank(a.name);
        const rankB = getRank(b.name);
        
        if (rankA === -1 && rankB === -1) return a.name.localeCompare(b.name); 
        if (rankA === -1) return 1; 
        if (rankB === -1) return -1; 
        
        return rankA - rankB; 
    });
  }, [data, filter]);

  // --- CALCULATIONS START ---

  // 1. Total Physical Inventory (Includes Unpriced)
  const totalKg = filteredData.reduce((sum, d) => sum + d.totalKg, 0);
  const totalQty = convertQty(totalKg, unit);

  // 2. Global Weighted Averages (EXCLUDES Unpriced Batches)
  let totalPricedKg = 0;
  let totalOutrightVal = 0;
  let totalHedgeVal = 0;

  filteredData.forEach(d => {
    // We need to calculate how much weight in this strategy ACTUALLY has a price
    // because d.totalKg includes unpriced batches.
    let strategyPricedKg = 0;
    
    d.batches.forEach(b => {
        if (b.outrightPrice50kg && b.outrightPrice50kg > 0) {
            strategyPricedKg += b.quantityKg;
        }
    });

    // Only add to global average if there is priced weight
    if (strategyPricedKg > 0) {
        // d.wAvgOutright50kg and d.wAvgHedgeUSClb are already pure (calculated from priced only)
        // so we weight them by the priced mass.
        totalOutrightVal += toUSClb(d.wAvgOutright50kg) * strategyPricedKg;
        totalHedgeVal += d.wAvgHedgeUSClb * strategyPricedKg;
        totalPricedKg += strategyPricedKg;
    }
  });

  const globalAvgOutrightUSClb = totalPricedKg ? totalOutrightVal / totalPricedKg : 0;
  const globalAvgHedge = totalPricedKg ? totalHedgeVal / totalPricedKg : 0;
  const globalAvgDiff = globalAvgOutrightUSClb - globalAvgHedge;
  
  // Calculate coverage percentage for display
  const pricingCoverage = totalKg > 0 ? (totalPricedKg / totalKg) * 100 : 0;

  // --- CALCULATIONS END ---

  return (
    <div className="space-y-6">
      
      <div className="flex justify-between items-end">
        <FilterTabs active={filter} onChange={setFilter} />
        <div className="text-xs text-[#968C83] pb-2 italic">Showing {filter} strategies</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-l-4 border-l-[#007680]">
          <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">TOTAL INVENTORY</div>
          <div className="text-2xl font-bold text-[#51534a] mt-1">
            {formatNumber(totalQty, 0)} <span className="text-sm font-normal text-[#968C83]">{unit.toUpperCase()}</span>
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-[#5B3427]">
          <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">GLOBAL W.AVG DIFF</div>
          <div className={`text-2xl font-bold mt-1 ${globalAvgDiff > 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>
            {globalAvgDiff > 0 ? '+' : ''}{formatNumber(globalAvgDiff)} <span className="text-sm font-normal text-[#968C83]">c/lb</span>
          </div>
          <div className="text-[10px] text-[#968C83] mt-1 flex items-center gap-1">
             <AlertCircle size={10} /> Based on {formatNumber(pricingCoverage, 0)}% priced stock
          </div>
        </Card>
        <Card className="p-4 border-l-4 border-l-[#007680]">
          <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">GLOBAL HEDGE LEVEL</div>
          <div className="text-2xl font-bold text-[#007680] mt-1">
            {formatNumber(globalAvgHedge)} <span className="text-sm font-normal text-[#968C83]">c/lb</span>
          </div>
          <div className="text-[10px] text-[#968C83] mt-1 flex items-center gap-1">
             <AlertCircle size={10} /> Excludes unpriced batches
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden border-none shadow-md">
        {/* SCROLLABLE TABLE (Max Height) */}
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#51534a] text-white font-medium sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 w-8"></th>
                <th className="py-3 px-4">Position Strategy</th>
                <th className="py-3 px-4 text-right">Available ({unit.toUpperCase()})</th>
                <th className="py-3 px-4 text-right">Outright ($/50kg)</th>
                <th className="py-3 px-4 text-right">Hedge (USC/lb)</th>
                <th className="py-3 px-4 text-right">Diff (USC/lb)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D6D2C4]">
              {filteredData.length > 0 ? filteredData.map((row) => {
                // Calculate missing value metrics for the row display
                const validBatchesKg = row.batches.reduce((sum, b) => (b.outrightPrice50kg ? sum + b.quantityKg : sum), 0);
                const hasMissingValues = validBatchesKg < row.totalKg;
                const coveragePct = row.totalKg > 0 ? (validBatchesKg / row.totalKg) * 100 : 100;

                return (
                <React.Fragment key={row.name}>
                  <tr 
                    className={`cursor-pointer transition-colors border-l-4 
                        ${expandedRow === row.name ? 'bg-[#D6D2C4]/30' : ''}
                        ${hasMissingValues ? 'bg-amber-50 border-l-amber-400 hover:bg-amber-100' : 'bg-white border-l-transparent hover:bg-[#D6D2C4]/20'}
                    `}
                    onClick={() => setExpandedRow(expandedRow === row.name ? null : row.name)}
                  >
                    <td className="py-3 px-4 text-[#968C83]">
                      {expandedRow === row.name ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#007680]">
                        <div className="flex items-center gap-2">
                            {row.name}
                            {/* Percentage Badge for Missing Values */}
                            {hasMissingValues && (
                                <span className="text-[9px] font-bold bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full border border-amber-300" title="Percentage of weight with valid prices">
                                    {formatNumber(coveragePct, 1)}% Priced
                                </span>
                            )}
                        </div>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-[#51534a]">{formatNumber(convertQty(row.totalKg, unit), 0)}</td>
                    <td className="py-3 px-4 text-right text-[#51534a]">{formatNumber(row.wAvgOutright50kg)}</td>
                    <td className="py-3 px-4 text-right text-[#968C83]">{formatNumber(row.wAvgHedgeUSClb)}</td>
                    <td className={`py-3 px-4 text-right font-medium ${row.wAvgDiffUSClb >= 0 ? 'text-[#6FA287]' : 'text-[#B9975B]'}`}>
                      {row.wAvgDiffUSClb > 0 ? '+' : ''}{formatNumber(row.wAvgDiffUSClb)}
                    </td>
                  </tr>
                  {expandedRow === row.name && (
                    <tr>
                      <td colSpan={6} className="bg-[#D6D2C4]/30 px-4 pb-4 pt-0">
                        <div className="bg-white rounded border border-[#D6D2C4] overflow-hidden mt-2">
                          <table className="w-full text-xs">
                            <thead className="bg-[#D6D2C4]/50 text-[#51534a]">
                              <tr>
                                <th className="py-2 px-4 text-left">Batch ID</th>
                                <th className="py-2 px-4 text-right">Qty ({unit})</th>
                                <th className="py-2 px-4 text-right">Price ($/50kg)</th>
                                <th className="py-2 px-4 text-right">Hedge (c/lb)</th>
                                <th className="py-2 px-4 text-right">Diff (c/lb)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#D6D2C4]/30">
                              {row.batches.map((batch, idx) => {
                                const isBatchMissing = !batch.outrightPrice50kg;
                                const batchDiff = toUSClb(batch.outrightPrice50kg) - batch.hedgeLevelUSClb;
                                return (
                                  <tr key={`${batch.id}-${idx}`} className={isBatchMissing ? 'bg-amber-50' : ''}> 
                                    <td className="py-2 px-4 font-mono text-[#007680] flex items-center gap-2">
                                        {batch.batch_number || batch.id}
                                        {isBatchMissing && <AlertCircle size={10} className="text-amber-500" />}
                                    </td>
                                    <td className="py-2 px-4 text-right text-[#51534a]">{formatNumber(convertQty(batch.quantityKg, unit), 0)}</td>
                                    <td className={`py-2 px-4 text-right ${isBatchMissing ? 'text-amber-600 font-bold' : 'text-[#51534a]'}`}>
                                        {isBatchMissing ? 'MISSING' : formatNumber(batch.outrightPrice50kg)}
                                    </td>
                                    <td className="py-2 px-4 text-right text-[#968C83]">{formatNumber(batch.hedgeLevelUSClb)}</td>
                                    <td className="py-2 px-4 text-right text-[#51534a]">{formatNumber(batchDiff)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )}) : (
                  <tr>
                      <td colSpan={6} className="py-8 text-center text-[#968C83] italic">
                          No {filter} strategies found.
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StrategicBlender({ data, unit }: { data: StrategyAggregate[], unit: Unit }) {
  const [strategicFilter, setStrategicFilter] = useState('POST');

  const filteredData = useMemo(() => {
    return data.filter(d => d.name.toUpperCase().startsWith(strategicFilter));
  }, [data, strategicFilter]);

  const [allocation, setAllocation] = useState<Record<string, number>>({});
  const [overrides, setOverrides] = useState<Record<string, { value: number, mode: OverrideMode }>>({});
  const [uiModes, setUiModes] = useState<Record<string, OverrideMode>>({});

  useEffect(() => {
    const init: Record<string, number> = {};
    filteredData.forEach(d => init[d.name] = 0);
    setAllocation(init);
  }, [filteredData]);

  const totalAllocation = Object.values(allocation).reduce((a, b) => a + b, 0);

  const handleSliderChange = (strategy: string, val: number) => {
    const currentVal = allocation[strategy] || 0;
    const otherAllocations = totalAllocation - currentVal;
    const maxAllowed = 100 - otherAllocations;

    let newVal = val;
    if (newVal > maxAllowed) {
        newVal = maxAllowed;
    }

    setAllocation(prev => ({ ...prev, [strategy]: newVal }));
  };

  const handleOverrideChange = (strategy: string, valStr: string, currentMode: OverrideMode) => {
    const val = parseFloat(valStr);
    setOverrides(prev => {
      const next = { ...prev };
      if (isNaN(val)) {
        delete next[strategy];
      } else {
        next[strategy] = { value: val, mode: currentMode };
      }
      return next;
    });
  };

  const getMode = (name: string) => overrides[name]?.mode || uiModes[name] || 'outright';
  
  const setMode = (name: string, mode: OverrideMode) => {
      setUiModes(prev => ({...prev, [name]: mode}));
      if (overrides[name]) {
          setOverrides(prev => {
              const next = { ...prev };
              delete next[name];
              return next;
          });
      }
  }

  const blendMetrics = useMemo(() => {
    let wAvgOutrightUSClb = 0;
    let wAvgHedgeUSClb = 0;

    filteredData.forEach(d => {
      const percent = (allocation[d.name] || 0) / 100;
      const override = overrides[d.name];
      
      let priceUSClb = 0;
      if (override) {
        if (override.mode === 'outright') {
            priceUSClb = toUSClb(override.value);
        } else {
            priceUSClb = d.wAvgHedgeUSClb + override.value;
        }
      } else {
        priceUSClb = toUSClb(d.wAvgOutright50kg);
      }
      
      wAvgOutrightUSClb += priceUSClb * percent;
      wAvgHedgeUSClb += d.wAvgHedgeUSClb * percent;
    });

    const wAvgDiff = wAvgOutrightUSClb - wAvgHedgeUSClb;
    const wAvgOutright50kg = to50kg(wAvgOutrightUSClb);

    return { wAvgOutright50kg, wAvgDiff, wAvgHedgeUSClb };
  }, [allocation, filteredData, overrides]);

  return (
    <div className="flex flex-col gap-6">
      
      <div className="flex justify-start">
        <FilterTabs active={strategicFilter} onChange={setStrategicFilter} />
      </div>

      <Card className="p-6 shadow-lg" variant="dark">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
                <h3 className="text-[#D6D2C4] text-sm font-semibold uppercase tracking-wider mb-4">Estimated Pricing</h3>
                <div className="flex items-end gap-2">
                    <div className="text-5xl font-bold text-white">${formatNumber(blendMetrics.wAvgOutright50kg)}</div>
                    <div className="text-[#A7BDB1] mb-2 font-medium">/50kg</div>
                </div>
                <div className="text-[#D6D2C4] text-sm mt-1">Blended Outright Price</div>
            </div>

            <div className="flex gap-8 p-4 bg-[#5B3427] rounded-lg border border-[#968C83]/30 w-full md:w-auto">
                <div>
                    <div className="text-[#D6D2C4] text-xs mb-1 uppercase tracking-wide">Hedge Level</div>
                    <div className="text-2xl font-mono text-white">{formatNumber(blendMetrics.wAvgHedgeUSClb)}</div>
                    <div className="text-[10px] text-[#A7BDB1]">USC/LB</div>
                </div>
                <div className="w-px bg-[#968C83]/50 h-12"></div>
                <div>
                    <div className="text-[#D6D2C4] text-xs mb-1 uppercase tracking-wide">Differential</div>
                    <div className={`text-2xl font-mono ${blendMetrics.wAvgDiff > 0 ? 'text-[#97D700]' : 'text-[#CEB888]'}`}>
                    {blendMetrics.wAvgDiff > 0 ? '+' : ''}{formatNumber(blendMetrics.wAvgDiff)}
                    </div>
                    <div className="text-[10px] text-[#A7BDB1]">USC/LB</div>
                </div>
            </div>
        </div>
        
        {totalAllocation !== 100 ? (
            <div className="mt-6 flex items-center gap-2 text-[#CEB888] bg-[#CEB888]/10 p-3 rounded border border-[#CEB888]/20">
            <AlertCircle size={16} />
            <span className="text-xs">Allocations must sum to 100% for accurate pricing. Current: {totalAllocation}%</span>
            </div>
        ) : (
            <div className="mt-6 flex items-center gap-2 text-[#97D700] bg-[#97D700]/10 p-3 rounded border border-[#97D700]/20">
            <Check size={16} />
            <span className="text-xs font-bold">Allocation Complete (100%)</span>
            </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-6 border-b border-[#D6D2C4] pb-4">
            <h3 className="font-semibold text-lg text-[#51534a]">Blend Composition</h3>
            <div className="text-sm text-[#968C83]">
                Adjust percentages or override market prices
            </div>
        </div>
        
        {/* SCROLLABLE LIST (Max Height) */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {filteredData.map((d) => { 
            const mode = getMode(d.name);
            const hasOverride = !!overrides[d.name];
            // --- NEW: Highlight Condition ---
            const isLowVolume = d.totalKg < 9600;
            
            return (
            <div 
                key={d.name} 
                className={`transition-all ${isLowVolume ? 'bg-yellow-50 border border-yellow-200 rounded-lg p-3' : 'py-2 border-b border-[#D6D2C4]/30 last:border-0'}`}
            >
                <div className="flex flex-col xl:flex-row xl:items-center gap-4">
                    
                    {/* 1. Name & Info Stats (Left) */}
                    <div className="xl:w-1/4 min-w-[200px] shrink-0">
                        <div className="font-medium text-[#51534a] flex items-center gap-2">
                            {d.name}
                            {hasOverride && <span className="text-[10px] bg-[#CEB888]/20 text-[#CEB888] px-1.5 py-0.5 rounded">Manual</span>}
                            {isLowVolume && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold border border-yellow-200">Low Vol</span>}
                        </div>
                        <div className="text-[10px] text-[#968C83] mt-0.5 flex flex-wrap gap-x-2">
                            <span><b>{formatNumber(convertQty(d.totalKg, unit))}</b> {unit}</span>
                            <span className="text-[#D6D2C4]">|</span>
                            <span>Inv: ${formatNumber(d.wAvgOutright50kg)}</span>
                        </div>
                    </div>

                    {/* 2. Slider Controls (Middle - Grows) */}
                    <div className="flex-1 flex items-center gap-4">
                        <input 
                        type="range" 
                        min="0" 
                        max={100} 
                        value={allocation[d.name] || 0} 
                        onChange={(e) => handleSliderChange(d.name, parseInt(e.target.value))}
                        className={`flex-1 h-2 rounded-lg appearance-none cursor-pointer ${isLowVolume ? 'bg-yellow-200 accent-yellow-600' : 'bg-[#D6D2C4] accent-[#007680]'}`}
                        />
                        <div className="w-16 relative shrink-0">
                        <input 
                            type="number" 
                            value={allocation[d.name] || 0}
                            onChange={(e) => handleSliderChange(d.name, parseInt(e.target.value))}
                            className="w-full pl-2 pr-5 py-1.5 border border-[#D6D2C4] rounded text-right text-sm font-medium text-[#51534a] bg-white/60 focus:ring-1 focus:ring-[#007680] outline-none"
                        />
                        <span className="absolute right-2 top-2 text-[#968C83] text-xs">%</span>
                        </div>
                    </div>

                    {/* 3. Price Override Controls (Right) */}
                    <div className="flex items-center gap-2 w-full xl:w-auto shrink-0 justify-end">
                        <div className="flex items-center gap-2 bg-[#D6D2C4]/20 p-1 rounded-lg border border-[#D6D2C4]/50">
                            <button 
                                onClick={() => setMode(d.name, mode === 'outright' ? 'diff' : 'outright')}
                                className="text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded bg-white border border-[#D6D2C4] text-[#968C83] hover:text-[#007680] w-16 text-center transition-colors shadow-sm"
                            >
                                {mode === 'outright' ? '$/50kg' : 'Diff'}
                            </button>
                            <div className="relative w-24">
                                <input 
                                    type="number" 
                                    placeholder={mode === 'outright' ? formatNumber(d.wAvgOutright50kg) : formatNumber(d.wAvgDiffUSClb)}
                                    className={`w-full text-sm border rounded px-2 py-1 text-right focus:ring-2 focus:ring-[#007680] outline-none ${hasOverride ? 'border-[#CEB888] bg-[#CEB888]/10' : 'border-[#D6D2C4] bg-white'}`}
                                    onChange={(e) => handleOverrideChange(d.name, e.target.value, mode)}
                                />
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            );
        })}
        </div>
      </Card>
    </div>
  );
}

function BatchBlender({ data, unit }: { data: StrategyAggregate[], unit: Unit }) {
    const CHART_COLORS = ['#007680', '#97D700', '#B9975B', '#51534a', '#CEB888', '#A7BDB1', '#6FA287', '#D97706', '#3B82F6', '#8B5CF6', '#EC4899', '#10B981'];
    
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('POST');
    const [hideUnpriced, setHideUnpriced] = useState(false);

    // NEW: Batch Listing Sub-Filters
    const [selectedSubStrategies, setSelectedSubStrategies] = useState<string[]>([]);
    const [sortPrice, setSortPrice] = useState<'none' | 'asc' | 'desc'>('none');

    // Reset sub-strategies when main filter tab changes
    useEffect(() => {
        setSelectedSubStrategies([]);
    }, [filter]);

    const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
    const [selectedAnalysisDetails, setSelectedAnalysisDetails] = useState<any>(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    
    // NEW: State for email confirmation modal
    const [emailModalData, setEmailModalData] = useState<any>(null);

    const analysisCache = useRef<Record<string, any>>({});

    // Target Blend & Contracts States
    const [blends, setBlends] = useState<any[]>([]);
    const [contracts, setContracts] = useState<any[]>([]);
    const [selectedBlendId, setSelectedBlendId] = useState<string>('');
    const [isRefFocused, setIsRefFocused] = useState(false);

    // --- Database Blend Management States ---
    const [editingBlendId, setEditingBlendId] = useState<number | null>(null);
    const [loadModalOpen, setLoadModalOpen] = useState(false);
    const [savedBlendsDb, setSavedBlendsDb] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchDropdownData = async () => {
            try {
                const [blendsRes, contractsRes] = await Promise.all([
                    fetch('/api/blends'),
                    fetch('/api/contracts')
                ]);

                if (blendsRes.ok) {
                    const blendsData = await blendsRes.json();
                    if (Array.isArray(blendsData)) setBlends(blendsData);
                }

                if (contractsRes.ok) {
                    const contractsData = await contractsRes.json();
                    if (Array.isArray(contractsData)) setContracts(contractsData);
                }
            } catch (error) {
                console.error("Failed to fetch dropdown data:", error);
            }
        };
        fetchDropdownData();
    }, []);

    // Derived variables for charts
    const uniqueClasses = useMemo(() => {
      return selectedAnalysisDetails?.classes 
        ? Array.from(new Set(selectedAnalysisDetails.classes.flatMap((o: any) => Object.keys(o).filter((k: string) => k !== 'screen_size'))))
        : [];
    }, [selectedAnalysisDetails]);
    
    const pieData = useMemo(() => {
      if (!selectedAnalysisDetails?.classes) return [];
      const totals: Record<string, number> = {};
      selectedAnalysisDetails.classes.forEach((row: any) => {
        Object.keys(row).forEach(key => {
          if (key !== 'screen_size') {
            totals[key] = (totals[key] || 0) + row[key];
          }
        });
      });
      return Object.entries(totals)
        .map(([name, value]) => ({ name, value }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value); 
    }, [selectedAnalysisDetails]);
    
    const [selectedBatches, setSelectedBatches] = useState<{ batch: ExtendedBatch, useKg: number }[]>([]);
    const [fobbingCost, setFobbingCost] = useState<number>(0); 
    const [salePriceDiff, setSalePriceDiff] = useState<number>(0);
    const [targetClient, setTargetClient] = useState('');
    const [saleRef, setSaleRef] = useState('');
    const [validationMsg, setValidationMsg] = useState<string | null>(null);

    // FIXED: Store the Target Volume purely in Kilograms so it auto-adjusts when units toggle
    const [targetVolumeKg, setTargetVolumeKg] = useState<number>(0);

    // --- AUTO-CALCULATE FOBBING COST ---
    useEffect(() => {
        if (selectedBatches.length === 0) {
            setFobbingCost(0);
            return;
        }
        
        let totalKg = 0;
        let totalCost50 = 0;
        let weightedDaysSum = 0;

        selectedBatches.forEach(item => {
            totalKg += item.useKg;
            totalCost50 += (item.batch.outrightPrice50kg || 0) * item.useKg;
            
            const days = getDaysInStock(item.batch.date_in);
            const effectiveDays = (!days || days <= 0) ? 90 : days;
            weightedDaysSum += effectiveDays * item.useKg;
        });

        if (totalKg > 0) {
            const wAvgCost50 = totalCost50 / totalKg;
            const wAvgAge = weightedDaysSum / totalKg;
            const dynamicFobbing = (0.8 * (wAvgCost50 / 50) * ((wAvgAge * 0.08) / 365) * 100) / 2.2046;
            
            setFobbingCost(Number((10 + dynamicFobbing).toFixed(2)));
        }
    }, [selectedBatches]);

    const filteredContracts = useMemo(() => {
        if (!saleRef) return contracts;
        return contracts.filter(c => c.contract_number.toLowerCase().includes(saleRef.toLowerCase()));
    }, [contracts, saleRef]);

    const allBatches = useMemo(() => data.flatMap(s => s.batches) as ExtendedBatch[], [data]);

    // NEW: Extract valid sub-strategies for the Multi-Select based on the active main tab (filter)
    const availableStrategies = useMemo(() => {
        const stratSet = new Set<string>();
        allBatches.forEach(b => {
            if (b.strategy.toUpperCase().startsWith(filter)) {
                stratSet.add(b.strategy);
            }
        });
        return Array.from(stratSet).sort();
    }, [allBatches, filter]);
    
    // UPDATED: Filter AND Sort Batches
    const filteredBatches = allBatches.filter(b => {
      const matchesSearch = (b.batch_number?.toLowerCase() || b.id.toLowerCase()).includes(search.toLowerCase()) || 
                            b.strategy.toLowerCase().includes(search.toLowerCase());
      const matchesStrategy = b.strategy.toUpperCase().startsWith(filter);
      const matchesSubStrategy = selectedSubStrategies.length === 0 || selectedSubStrategies.includes(b.strategy);
      const matchesPrice = !hideUnpriced || (b.outrightPrice50kg && b.outrightPrice50kg > 0);

      return matchesStrategy && matchesSearch && matchesSubStrategy && matchesPrice;
    }).sort((a, b) => {
        if (sortPrice === 'none') return 0;
        const priceA = a.outrightPrice50kg || 0;
        const priceB = b.outrightPrice50kg || 0;
        return sortPrice === 'asc' ? priceA - priceB : priceB - priceA;
    });
  
    const addToBlend = (batch: ExtendedBatch) => {
      if (selectedBatches.find(s => s.batch.id === batch.id)) return;
      setSelectedBatches([...selectedBatches, { batch, useKg: batch.quantityKg }]);
    };
  
    const removeFromBlend = (batchId: string) => {
      setSelectedBatches(selectedBatches.filter(s => s.batch.id !== batchId));
    };
  
    const updateBatchQty = (batchId: string, qty: number) => {
      setSelectedBatches(prev => prev.map(s => s.batch.id === batchId ? { ...s, useKg: qty } : s));
    };
  
    // --- CALCULATIONS ---
    const blendStats = useMemo(() => {
      let totalKg = 0; let totalValUSClb = 0; let totalHedgeVal = 0; let weightedDaysSum = 0; 
      selectedBatches.forEach(item => {
        const valUSClb = toUSClb(item.batch.outrightPrice50kg || 0);
        totalValUSClb += valUSClb * item.useKg;
        totalHedgeVal += (item.batch.hedgeLevelUSClb || 0) * item.useKg;
        totalKg += item.useKg;
        
        const days = getDaysInStock(item.batch.date_in);
        const effectiveDays = (!days || days <= 0) ? 90 : days;
        weightedDaysSum += effectiveDays * item.useKg;
      });
  
      const avgOutrightUSClb = totalKg ? totalValUSClb / totalKg : 0;
      const avgHedge = totalKg ? totalHedgeVal / totalKg : 0;
      const avgDiff = avgOutrightUSClb - avgHedge;
      const finalCostDiff = avgDiff + fobbingCost;
      const pnlPerLb = salePriceDiff - finalCostDiff;
      const avgDaysInStock = totalKg ? weightedDaysSum / totalKg : 0; 
      const totalLbs = totalKg * KG_TO_LB;
      const totalPnLUSD = (pnlPerLb / 100) * totalLbs;
      
      return { totalKg, avgOutright50kg: to50kg(avgOutrightUSClb), avgHedge, avgDiff, finalCostDiff, pnl: pnlPerLb, totalPnLUSD, avgDaysInStock };
    }, [selectedBatches, fobbingCost, salePriceDiff]);

    const strategyDistribution = useMemo(() => {
        const counts: Record<string, number> = {};
        selectedBatches.forEach(b => {
            counts[b.batch.strategy] = (counts[b.batch.strategy] || 0) + b.useKg;
        });
        return Object.entries(counts)
            .map(([key, val]) => ({
                name: key,
                value: val,
                percentage: blendStats.totalKg ? (val / blendStats.totalKg) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);
    }, [selectedBatches, blendStats.totalKg]);
  
    const targetBlendData = useMemo(() => {
        const target = blends.find(b => b.id.toString() === selectedBlendId);
        if (!target) return null;

        const dist: { name: string, percentage: number }[] = [];
        let totalPct = 0;

        for (const key in target) {
            if (key.startsWith('post_') && target[key] > 0) {
                let formattedName = key.toUpperCase().replace('POST_', 'POST ').replace(/_/g, ' ').replace('PB ', 'PB - ');
                const val = parseFloat(target[key]);
                dist.push({ name: formattedName, percentage: val });
                totalPct += val;
            }
        }
        if (totalPct > 0 && totalPct !== 100) {
             dist.forEach(d => d.percentage = (d.percentage / totalPct) * 100);
        }
        return { name: target.name, distribution: dist.sort((a, b) => b.percentage - a.percentage) };
    }, [blends, selectedBlendId]);

    const uniqueStrategyNames = useMemo(() => {
        const set = new Set<string>();
        if (targetBlendData) targetBlendData.distribution.forEach(d => set.add(d.name));
        strategyDistribution.forEach(d => set.add(d.name));
        return Array.from(set);
    }, [targetBlendData, strategyDistribution]);

    const getStrategyColor = (name: string) => {
        const index = uniqueStrategyNames.indexOf(name);
        return CHART_COLORS[index % CHART_COLORS.length];
    };

    const currentVolUnit = convertQty(blendStats.totalKg, unit);
    // FIXED: Derive targetProgress cleanly using base KG logic
    const targetProgress = targetVolumeKg > 0 ? (blendStats.totalKg / targetVolumeKg) * 100 : 0;
    const isTargetMet = targetVolumeKg > 0 && blendStats.totalKg >= targetVolumeKg;

    const handleContractSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSaleRef(val);
        const matchedContract = contracts.find(c => c.contract_number.toLowerCase() === val.toLowerCase());
        if (matchedContract) {
            setTargetClient(matchedContract.client || '');
            setSalePriceDiff(parseFloat(matchedContract.sale_differential) || 0);
            
            // FIXED: Auto-populate target volume in RAW KGs for underlying math integrity
            const parsedWeight = parseFloat(matchedContract.weight_kilos) || 0;
            setTargetVolumeKg(parsedWeight);
        } else {
            setTargetClient('');
            setSalePriceDiff(0);
            setTargetVolumeKg(0);
        }
    };
  
    // --- Database API Integration Logic ---
    const fetchSavedBlends = async () => {
        try {
            const res = await fetch('/api/client_blends');
            if(res.ok) {
                const fetchedBlends = await res.json();
                setSavedBlendsDb(fetchedBlends);
                setLoadModalOpen(true);
            } else {
                setValidationMsg("Failed to fetch existing blends.");
                setTimeout(() => setValidationMsg(null), 3000);
            }
        } catch(e) {
            console.error(e);
        }
    };

    const handleLoadBlend = (savedBlend: any) => {
        setTargetClient(savedBlend.client || '');
        setSaleRef(savedBlend.blend_no || '');
        setSelectedBlendId(savedBlend.target_blend?.toString() || '');
        setEditingBlendId(savedBlend.id);
        
        // FIXED: Load into pure raw kg state
        setTargetVolumeKg(savedBlend.target_weight ? parseFloat(savedBlend.target_weight) : 0);

        const matchedContract = contracts.find(c => c.contract_number.toLowerCase() === (savedBlend.blend_no || '').toLowerCase());
        setSalePriceDiff(matchedContract ? (parseFloat(matchedContract.sale_differential) || 0) : 0);

        const batchMap = new Map(allBatches.map(b => [b.id.toString(), b]));
        
        const loadedBatches: { batch: ExtendedBatch, useKg: number }[] = [];
        for (const sb of savedBlend.blended_batches) {
            const liveBatch = batchMap.get(sb.batch_id?.toString());
            if (liveBatch) {
                const historicallyAccurateBatch = {
                    ...liveBatch,
                    outrightPrice50kg: sb.cost_usd_50 !== null ? parseFloat(sb.cost_usd_50) : liveBatch.outrightPrice50kg,
                    hedgeLevelUSClb: sb.hedge_usc_lb !== null ? parseFloat(sb.hedge_usc_lb) : liveBatch.hedgeLevelUSClb,
                    strategy: sb.strategy || liveBatch.strategy
                };
                loadedBatches.push({ batch: historicallyAccurateBatch, useKg: parseFloat(sb.use_kg) });
            }
        }

        setSelectedBatches(loadedBatches);
        setLoadModalOpen(false);
    };

    const handleSaveAndExport = async () => {
      if (selectedBatches.length === 0) return;
  
      if (!selectedBlendId || !targetBlendData) {
          setValidationMsg("Please select a valid Target Blend.");
          setTimeout(() => setValidationMsg(null), 4000);
          return;
      }

      if (!targetClient.trim() || !saleRef.trim()) {
          setValidationMsg("Please enter Target Client and Sale Ref to save/export.");
          setTimeout(() => setValidationMsg(null), 3000);
          return;
      }
      
      setIsSaving(true);
      try {
          const generatedBlendName = `${targetClient}-${saleRef}-${new Date().toISOString().split('T')[0]}`;
          
          // 1. Prepare Comparison Data (With precise weight variance added)
          const comparisonData = uniqueStrategyNames.map(name => {
              const target = targetBlendData.distribution.find(d => d.name === name)?.percentage || 0;
              const actual = strategyDistribution.find(d => d.name === name)?.percentage || 0;
              const variancePct = actual - target;
              
              // Weight Variance calculation using raw underlying targetVolumeKg
              const weightVarianceKg = (variancePct / 100) * targetVolumeKg;
              
              return {
                  strategy: name,
                  target: `${formatNumber(target, 1)}%`,
                  actual: `${formatNumber(actual, 1)}%`,
                  variance: `${(variancePct >= 0 ? '+' : '')}${formatNumber(variancePct, 1)}%`,
                  weightVariance: `${(weightVarianceKg >= 0 ? '+' : '')}${formatNumber(weightVarianceKg, 2)}`
              };
          });

          // 2. Save to Database
          const payload = {
              id: editingBlendId,
              name: generatedBlendName,
              client: targetClient,
              blend_no: saleRef,
              target_blend: parseInt(selectedBlendId),
              target_weight: targetVolumeKg, // Raw kg saved straight to DB
              batches: selectedBatches.map(s => ({
                  batch_id: s.batch.id,
                  use_kg: s.useKg,
                  cost_usd_50: s.batch.outrightPrice50kg,
                  hedge_usc_lb: s.batch.hedgeLevelUSClb,
                  diff_usc_lb: toUSClb(s.batch.outrightPrice50kg || 0) - (s.batch.hedgeLevelUSClb || 0),
                  strategy: s.batch.strategy
              }))
          };

          const method = editingBlendId ? 'PUT' : 'POST';
          const dbRes = await fetch('/api/client_blends', {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          if (!dbRes.ok) throw new Error("Failed to save to database");
          const dbResult = await dbRes.json();
          if (!editingBlendId) setEditingBlendId(dbResult.id);

          // 3. EXACT COMPROMISED SALES LOOKUP
          let compromisedSales: any[] = [];
          try {
              const [allBlendsRes, latestContractsRes] = await Promise.all([
                  fetch('/api/client_blends'),
                  fetch('/api/contracts')
              ]);
              
              if (allBlendsRes.ok && latestContractsRes.ok) {
                  const allClientBlends = await allBlendsRes.json();
                  const latestContracts = await latestContractsRes.json();
                  
                  const matchedContracts = latestContracts.filter((c: any) => c.blend_id?.toString() === selectedBlendId.toString());
                  
                  console.log(`Extracted contracts matching target blend_id [${selectedBlendId}]:`, matchedContracts);
                  
                  matchedContracts.forEach((contract: any) => {
                      const alreadyBlended = allClientBlends.find((b: any) => b.blend_no === contract.contract_number);
                      
                      if (!alreadyBlended) {
                          compromisedSales.push(contract);
                      }
                  });
              }
          } catch (lookupError) {
              console.error("Failed to lookup compromised sales:", lookupError);
          }

          // 4. GENERATE PDF
          const doc = new jsPDF();
          doc.setFontSize(16);
          doc.text(`Blend Summary: ${generatedBlendName}`, 14, 20);

          doc.setFontSize(11);
          doc.text(`Target Blend: ${targetBlendData?.name || 'Unknown'}`, 14, 30);
          doc.text(`Client: ${targetClient}`, 14, 36);
          // Format based on actively selected unit at print time
          doc.text(`Target Volume: ${formatNumber(convertQty(targetVolumeKg, unit))} ${unit}`, 14, 42);

          autoTable(doc, {
              startY: 50,
              head: [['Strategy', 'Weight', '% Share']],
              body: strategyDistribution.map(d => [d.name, formatNumber(convertQty(d.value, unit)), `${formatNumber(d.percentage)}%`]),
          });

          let finalY = (doc as any).lastAutoTable.finalY + 15;
          doc.text("Composition Comparison (Target vs Actual):", 14, finalY);
          autoTable(doc, {
              startY: finalY + 5,
              head: [['Strategy', 'Target', 'Actual', 'Variance']],
              body: comparisonData.map(c => [c.strategy, c.target, c.actual, c.variance]),
          });

          finalY = (doc as any).lastAutoTable.finalY + 15;
          doc.text("Compromised Sales (Unfulfilled Contracts):", 14, finalY);

          if (compromisedSales.length > 0) {
              autoTable(doc, {
                  startY: finalY + 5,
                  head: [['Client', 'Contract Number', 'Tonnage']],
                  body: compromisedSales.map(c => [c.client || '-', c.contract_number || '-', formatNumber(c.weight_kilos || c.quantity || 0)]),
              });
              finalY = (doc as any).lastAutoTable.finalY + 10;
          } else {
              doc.text("None", 14, finalY + 8);
              finalY += 15;
          }

          // RE-BALANCING LOGIC
          const absoluteVarianceSum = comparisonData.reduce((sum, c) => sum + Math.abs(parseFloat(c.variance) || 0), 0);
          const totalCompromisedWeight = compromisedSales.reduce((sum, c) => sum + (parseFloat(c.weight_kilos || c.quantity) || 0), 0);
          const rebalancingNeededKg = (absoluteVarianceSum / 100) * totalCompromisedWeight;
          const rebalancingNeededBags = rebalancingNeededKg / 60;

          finalY += 5;
          doc.setFontSize(12);
          doc.setTextColor(0, 0, 0);
          doc.text(`Re-Balancing Needed: ${formatNumber(rebalancingNeededKg, 2)} Kg (${formatNumber(rebalancingNeededBags, 2)} Bags)`, 14, finalY);

          finalY += 10;
          doc.setFontSize(11);
          doc.setTextColor(200, 0, 0);
          doc.text("Note: You might want to revisit the target blends for the contracts.", 14, finalY);
          doc.save(`Blend_Summary_${generatedBlendName}.pdf`);

          // 5. PREPARE EMAIL NOTIFICATION DATA
          setEmailModalData({
              blendName: generatedBlendName,
              targetBlend: targetBlendData.name,
              targetClient,
              saleRef,
              compromisedSales,
              comparisonData,
              rebalancingNeededKg
          });

          // 6. Generate CSV Export
          const csvRows = [];
          csvRows.push('BLEND SUMMARY REPORT');
          csvRows.push(`Blend Name, ${generatedBlendName}`);
          csvRows.push(`Target Blend, ${targetBlendData?.name || 'Unknown'}`);
          csvRows.push(`Target Client, ${targetClient}`);
          csvRows.push(`Sale Ref, ${saleRef}`);
          csvRows.push(`Target Volume, ${formatNumber(convertQty(targetVolumeKg, unit))} ${unit}`);
          csvRows.push(`Actual Volume, ${formatNumber(currentVolUnit)} ${unit}`);
          csvRows.push(`W.Avg Diff (c/lb), ${formatNumber(blendStats.avgDiff)}`);
          csvRows.push(`Fobbing Cost (c/lb), ${fobbingCost}`);
          csvRows.push(`Sale Price Diff (c/lb), ${salePriceDiff}`);
          csvRows.push(`P&L (c/lb), ${formatNumber(blendStats.pnl)}`);
          csvRows.push(`P&L (USD), ${formatNumber(blendStats.totalPnLUSD)}`);
          csvRows.push(`Avg Days In Stock, ${formatNumber(blendStats.avgDaysInStock, 0)}`);
          csvRows.push('');
          
          csvRows.push('POSITION STRATEGY DISTRIBUTION');
          csvRows.push(`Strategy,Weight (${unit}),% Share`);
          strategyDistribution.forEach(d => {
            csvRows.push(`${d.name},${formatNumber(convertQty(d.value, unit))},${formatNumber(d.percentage)}%`);
          });
          csvRows.push(''); 

          csvRows.push('DETAILED BATCH LIST');
          csvRows.push('Batch ID,Strategy,Weight (kg),% of Blend,Price ($/50kg),Hedge (c/lb),Diff (c/lb),Age (Days)');
          
          selectedBatches.forEach(({ batch, useKg }) => {
              const diff = toUSClb(batch.outrightPrice50kg || 0) - (batch.hedgeLevelUSClb || 0);
              const pct = blendStats.totalKg > 0 ? (useKg / blendStats.totalKg) * 100 : 0;
              const days = getDaysInStock(batch.date_in);
              const age = (!days || days <= 0) ? 90 : days;
              csvRows.push(
                  `${batch.batch_number || batch.id},${batch.strategy},${useKg},${formatNumber(pct)}%,${batch.outrightPrice50kg},${batch.hedgeLevelUSClb},${formatNumber(diff)},${age}`
              );
          });
      
          const csvString = csvRows.join('\n');
          const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          if (link.download !== undefined) {
              const url = URL.createObjectURL(blob);
              link.setAttribute('href', url);
              link.setAttribute('download', `blend_${generatedBlendName.replace(/\s+/g, '_')}_${saleRef}.csv`);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
          }
          
          setToastMessage("Blend Saved and Exported Successfully!");
          setTimeout(() => setToastMessage(null), 3000);

      } catch (err: any) {
          console.error(err);
          setValidationMsg(err.message || "An error occurred while saving.");
          setTimeout(() => setValidationMsg(null), 4000);
      } finally {
          setIsSaving(false);
      }
    };

    const handleViewAnalysis = async (batch: Batch) => {
        if (!batch.analysis_id) {
            setToastMessage("No analysis found for this batch.");
            setTimeout(() => setToastMessage(null), 3000);
            return;
        }

        const id = batch.analysis_id.toString();
        setAnalysisModalOpen(true);

        if (analysisCache.current[id]) {
            setSelectedAnalysisDetails(analysisCache.current[id]);
            return;
        }

        setAnalysisLoading(true);
        setSelectedAnalysisDetails(null);

        try {
            const [recordRes, detailsRes] = await Promise.all([
                fetch(`/api/batches/analyses`), 
                fetch(`/api/batches/analyses/analysis_details/${id}`)
            ]);

            if (!recordRes.ok || !detailsRes.ok) throw new Error("Failed to fetch");
            
            const records = await recordRes.json();
            const mainRecord = Array.isArray(records) ? records.find((r: any) => r.id?.toString() === id) : {};
            const detailsJson = await detailsRes.json();
            
            const transformedClasses = detailsJson.classes.reduce((acc: any[], curr: any) => {
                let entry = acc.find((i: any) => i.screen_size === curr.screen_size);
                if (!entry) {
                    entry = { screen_size: curr.screen_size };
                    acc.push(entry);
                }
                entry[curr.class] = parseFloat(curr.percentage);
                return acc;
            }, []);

            const payload = { 
                ...mainRecord,
                screensize: detailsJson.screensize.map((s: any) => ({ ...s, percentage: parseFloat(s.percentage) })), 
                classes: transformedClasses 
            };

            analysisCache.current[id] = payload;
            setSelectedAnalysisDetails(payload);
        } catch (err) {
            console.error(err);
            setToastMessage("Failed to load analysis details.");
            setTimeout(() => setToastMessage(null), 3000);
            setAnalysisModalOpen(false);
        } finally {
            setAnalysisLoading(false);
        }
    };
  
    // --- IMPACT ANALYSIS ---
    const impactAnalysis = useMemo(() => {
        const impactMap: Record<string, { diff: { original: number, new: number, change: number }, hedge: { original: number, new: number, change: number }, outright: { original: number, new: number, change: number } }> = {};
    
        const selectedByStrategy: Record<string, { kg: number, valOutright: number, valHedge: number }> = {};
        selectedBatches.forEach(s => {
            if (!selectedByStrategy[s.batch.strategy]) {
                selectedByStrategy[s.batch.strategy] = { kg: 0, valOutright: 0, valHedge: 0 };
            }
            const priceUSClb = toUSClb(s.batch.outrightPrice50kg || 0);
            selectedByStrategy[s.batch.strategy].kg += s.useKg;
            selectedByStrategy[s.batch.strategy].valOutright += priceUSClb * s.useKg;
            selectedByStrategy[s.batch.strategy].valHedge += (s.batch.hedgeLevelUSClb || 0) * s.useKg;
        });
    
        data.forEach(strat => {
          if (selectedByStrategy[strat.name]) {
            const removal = selectedByStrategy[strat.name];
            const origKg = strat.totalKg;
            const origAvgOutrightUSClb = toUSClb(strat.wAvgOutright50kg);
            const origAvgHedgeUSClb = strat.wAvgHedgeUSClb;
            const origAvgDiffUSClb = strat.wAvgDiffUSClb;
            const origTotalValOutright = origAvgOutrightUSClb * origKg;
            const origTotalValHedge = origAvgHedgeUSClb * origKg;
            const newKg = origKg - removal.kg;
            
            if (newKg > 0) {
                const newTotalValOutright = origTotalValOutright - removal.valOutright;
                const newTotalValHedge = origTotalValHedge - removal.valHedge;
                const newAvgOutrightUSClb = newTotalValOutright / newKg;
                const newAvgHedgeUSClb = newTotalValHedge / newKg;
                const newAvgDiffUSClb = newAvgOutrightUSClb - newAvgHedgeUSClb;
                impactMap[strat.name] = {
                    diff: { original: origAvgDiffUSClb, new: newAvgDiffUSClb, change: newAvgDiffUSClb - origAvgDiffUSClb },
                    hedge: { original: origAvgHedgeUSClb, new: newAvgHedgeUSClb, change: newAvgHedgeUSClb - origAvgHedgeUSClb },
                    outright: { original: strat.wAvgOutright50kg, new: to50kg(newAvgOutrightUSClb), change: to50kg(newAvgOutrightUSClb) - strat.wAvgOutright50kg }
                };
            } else {
                 impactMap[strat.name] = {
                    diff: { original: origAvgDiffUSClb, new: 0, change: 0 },
                    hedge: { original: origAvgHedgeUSClb, new: 0, change: 0 },
                    outright: { original: strat.wAvgOutright50kg, new: 0, change: 0 }
                };
            }
          }
        });
        return impactMap;
    }, [selectedBatches, data]);

    return (
      <div className="flex gap-6 h-[90vh]">

        {/* Saved Blends Modal */}
        {loadModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-[#EFEFE9] w-full max-w-4xl rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
                    <div className="flex justify-between items-center p-4 bg-white border-b border-[#D1CEC3]">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-[#4A4941]">
                            <History className="w-5 h-5 text-[#007680]" /> Existing Saved Blends
                        </h3>
                        <button onClick={() => setLoadModalOpen(false)} className="text-[#8B8A81] hover:text-[#4A4941] transition-colors p-1 bg-[#F5F2EA] rounded-full">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 bg-[#F5F2EA]">
                        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            {savedBlendsDb.length > 0 ? savedBlendsDb.map(b => (
                                <div key={b.id} className="bg-white p-4 rounded-lg shadow-sm border border-[#D1CEC3] flex flex-col gap-2 hover:border-[#007680]/50 transition-colors cursor-pointer group" onClick={() => handleLoadBlend(b)}>
                                    <div className="font-bold text-[#4A4941] text-base group-hover:text-[#007680] transition-colors">{b.name || `Blend #${b.id}`}</div>
                                    <div className="text-xs text-[#8B8A81] flex justify-between"><span>Client:</span> <span className="font-medium text-[#4A4941]">{b.client || '-'}</span></div>
                                    <div className="text-xs text-[#8B8A81] flex justify-between"><span>Sale Ref:</span> <span className="font-medium text-[#4A4941]">{b.blend_no || '-'}</span></div>
                                    <div className="text-[10px] text-[#8B8A81] mt-2 pt-2 border-t border-[#EBE7DC] flex justify-between items-center">
                                        <span>Batches: <strong className="text-[#007680]">{b.blended_batches?.length || 0}</strong></span>
                                        <span>Created: {new Date(b.creation_on).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="col-span-full text-center py-12 text-[#8B8A81] italic">No saved blends found in the database.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Left Pane: Picker */}
        <div className="flex h-full overflow-hidden w-1/3">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#D6D2C4] bg-white sticky top-0 z-30 flex flex-col gap-2">
              <FilterTabs active={filter} onChange={setFilter} />
              
              {/* NEW: Strategy Multi-Select and Sorting Dropdowns */}
              <div className="flex gap-2 w-full relative z-20">
                  <div className="flex-1">
                      <MultiSelect 
                          options={availableStrategies}
                          selected={selectedSubStrategies}
                          onChange={setSelectedSubStrategies}
                          placeholder="All Strategies"
                          searchable={true}
                      />
                  </div>
                  <select 
                      className="w-32 border border-[#D6D2C4] rounded px-2 py-1.5 text-[10px] uppercase font-bold outline-none focus:border-[#007680] text-[#51534a] bg-white h-8"
                      value={sortPrice}
                      onChange={(e) => setSortPrice(e.target.value as any)}
                  >
                      <option value="none">Sort: Default</option>
                      <option value="desc">Price: High-Low</option>
                      <option value="asc">Price: Low-High</option>
                  </select>
              </div>

              <div className="relative flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" size={18} />
                    <input 
                        type="text"
                        placeholder="Search batches..."
                        className="w-full pl-10 pr-4 py-2 border border-[#D6D2C4] rounded-lg focus:ring-2 focus:ring-[#007680] outline-none h-8"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button 
                    onClick={() => setHideUnpriced(!hideUnpriced)}
                    className={`px-3 py-1 text-xs font-bold rounded border transition-all flex flex-col items-center justify-center h-8 ${hideUnpriced ? 'bg-[#007680] text-white border-[#007680]' : 'bg-white text-[#51534a] border-[#D6D2C4] hover:bg-[#F5F5F3]'}`}
                >
                    <span className="leading-none text-[8px] uppercase">{hideUnpriced ? 'Show' : 'Hide'}</span>
                    <span className="leading-none text-[8px] uppercase">Unpriced</span>
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-[#D6D2C4]/20">
              {filteredBatches.length > 0 ? filteredBatches.map(batch => {
                const hasPrice = batch.outrightPrice50kg && batch.outrightPrice50kg > 0;
                
                // Visualization formatting logic
                const days = getDaysInStock(batch.date_in);
                const daysInStock = (!days || days <= 0) ? 90 : days;
                
                return (
                <div 
                    key={batch.id} 
                    className={`p-2 rounded border hover:border-[#007680]/50 transition-all flex justify-between items-center group
                        ${hasPrice ? 'bg-white border-[#D6D2C4]' : 'bg-red-50 border-red-200'}
                    `}
                >
                  <div>
                    <div className="font-mono text-sm font-medium text-[#007680] flex items-center gap-2">
                        {batch.batch_number || batch.id}
                        {!hasPrice && <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded font-bold">NO PRICE</span>}
                    </div>
                    <div className="text-xs text-[#968C83]">{batch.strategy} • {formatNumber(convertQty(batch.quantityKg, unit), 0)} {unit}</div>
                  </div>

                  <div>
                    <div className="flex justify-between">
                      <div className="text-right mr-4">
                        <div className={`text-sm font-medium ${hasPrice ? 'text-[#51534a]' : 'text-red-400'}`}>
                            {hasPrice ? `$${formatNumber(batch.outrightPrice50kg)}` : '---'}
                        </div>
                        <div className="text-[10px] text-[#968C83]">Hedge: {formatNumber(batch.hedgeLevelUSClb)}</div>
                        <div className="text-[10px] text-[#968C83]">
                            Diff: {hasPrice ? formatNumber(toUSClb(batch.outrightPrice50kg || 0) - (batch.hedgeLevelUSClb || 0)) : '---'}
                        </div>
                        {daysInStock > 0 && (
                            <div className="text-[10px] text-[#007680] flex justify-end items-center gap-1 font-medium mt-0.5">
                                <CalendarClock size={10} /> {daysInStock} days
                            </div>
                        )}
                      </div>

                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleViewAnalysis(batch);
                            }}
                            className={`p-1.5 mr-2 rounded-full transition-colors group ${
                                batch.analysis_id 
                                ? 'text-[#00A651] hover:bg-[#00A651]/10' 
                                : 'text-[#8B8A81] hover:bg-[#EBE7DC]'
                            }`}
                            title="View Analysis"
                            >
                            <FlaskConical className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        </button>

                      <button 
                        onClick={() => addToBlend(batch)}
                        className="opacity-0 group-hover:opacity-100 bg-[#A4DBE8]/20 text-[#007680] p-2 rounded-full hover:bg-[#A4DBE8]/40 transition-all"
                      >
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                  
                </div>
              )}) : (
                <div className="text-center p-8 text-[#968C83] italic text-sm">No batches found</div>
              )}
            </div>
          </Card>
        </div>
  
        {/* Right Pane: The Blend */}
        <div className="flex h-full overflow-hidden flex-1">
          <div className="flex flex-col h-full w-full relative rounded-xl overflow-hidden shadow-sm border border-[#968C83]/20 bg-white">
          
          {/* HEADER */}
          <div className="bg-white border-b border-[#D6D2C4] p-4 space-y-4">
              <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-[#51534a] flex items-center gap-2">
                      <FlaskConical size={18} />
                      Current Blend {editingBlendId ? `(#${editingBlendId})` : ''} ({selectedBatches.length})
                  </h3>
                  <div className="flex items-center gap-2">
                      {validationMsg && <span className="text-xs text-red-500 font-medium animate-pulse">{validationMsg}</span>}
                      
                      <button 
                          onClick={fetchSavedBlends}
                          className="text-xs text-[#51534a] hover:bg-[#D6D2C4]/50 font-medium flex items-center gap-1 bg-[#F5F5F3] px-3 py-1.5 rounded border border-[#D6D2C4] transition-all shadow-sm"
                      >
                          <History size={14} /> Edit Existing
                      </button>
                      
                      <button 
                          onClick={handleSaveAndExport}
                          disabled={isSaving}
                          className="text-xs text-white hover:bg-[#007680]/80 font-medium flex items-center gap-1 bg-[#007680] px-3 py-1.5 rounded border border-[#007680]/20 transition-all shadow-sm disabled:opacity-50"
                      >
                          {isSaving ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Download size={14} />} 
                          {isSaving ? 'Saving...' : 'Save & Export CSV'}
                      </button>
                  </div>
              </div>
  
              <div className="flex flex-col gap-4">
                  {/* Top Form Controls Row */}
                  <div className="flex flex-col lg:flex-row gap-6">
                      <div className="flex-1 flex flex-col gap-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                  <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider block mb-1">Target Blend *</label>
                                  <select 
                                      className="w-full border border-[#D6D2C4] rounded px-2 py-1 text-xs h-8 outline-none focus:border-[#007680] text-[#51534a] bg-white cursor-pointer hover:border-[#007680]/50"
                                      value={selectedBlendId}
                                      onChange={(e) => setSelectedBlendId(e.target.value)}
                                  >
                                      <option value="">-- Select Target --</option>
                                      {blends.map(b => (
                                          <option key={b.id} value={b.id}>{b.name}</option>
                                      ))}
                                  </select>
                              </div>
                              <div>
                                  <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider block mb-1">Client *</label>
                                  <input type="text" className="w-full border border-[#D6D2C4] rounded px-2 py-1 text-xs h-8 outline-none focus:border-[#007680]" value={targetClient} onChange={(e) => setTargetClient(e.target.value)} placeholder="Starbucks" />
                              </div>
                              <div>
                                  <div className="relative">
                                    <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider block mb-1">Ref *</label>
                                    <input 
                                        type="text"
                                        placeholder="Search Ref..."
                                        className="w-full border border-[#D6D2C4] rounded px-2 py-1 text-xs h-8 outline-none focus:border-[#007680] text-[#51534a] bg-white hover:border-[#007680]/50"
                                        value={saleRef}
                                        onChange={handleContractSelection}
                                        onFocus={() => setIsRefFocused(true)}
                                        onBlur={() => setTimeout(() => setIsRefFocused(false), 150)} 
                                    />
                                    {isRefFocused && filteredContracts.length > 0 && (
                                        <div className="absolute top-full left-0 w-full mt-1 bg-white border border-[#D6D2C4] rounded-lg shadow-lg z-50 max-h-40 overflow-y-auto">
                                            {filteredContracts.map(c => (
                                                <div 
                                                    key={c.id} 
                                                    className="px-3 py-2 text-xs text-[#51534a] hover:bg-[#007680] hover:text-white cursor-pointer transition-colors"
                                                    onClick={() => {
                                                        setSaleRef(c.contract_number);
                                                        setTargetClient(c.client || '');
                                                        setSalePriceDiff(parseFloat(c.sale_differential) || 0);
                                                        
                                                        // FIXED: Update target volume to pure KG under the hood
                                                        const parsedWeight = parseFloat(c.weight_kilos) || 0;
                                                        setTargetVolumeKg(parsedWeight);
                                                        
                                                        setIsRefFocused(false);
                                                    }}
                                                >
                                                    {c.contract_number}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                  </div>
                              </div>
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider block mb-1">Costs & Pricing (c/lb)</label>
                              <div className="flex gap-2">
                                  <div className="flex items-center border border-[#D6D2C4] rounded px-2 h-8 md:max-w-48">
                                      <span className="text-[10px] text-[#968C83] mr-2 shrink-0">FOB Cost:</span>
                                      <input type="number" className="w-full bg-transparent border-none text-[#51534a] text-xs text-right outline-none" value={fobbingCost || ''} onChange={e => setFobbingCost(parseFloat(e.target.value) || 0)} placeholder="0.00" />
                                  </div>
                                  <div className="flex items-center border border-[#D6D2C4] rounded px-2 h-8 md:max-w-48">
                                       <span className="text-[10px] text-[#968C83] mr-2 shrink-0">Sale Diff:</span>
                                       <input type="number" className="w-full bg-transparent border-none text-[#51534a] text-xs text-right outline-none" value={salePriceDiff || ''} onChange={e => setSalePriceDiff(parseFloat(e.target.value) || 0)} placeholder="+0.00" />
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Target Volume Card */}
                      <div className="w-full lg:w-48 shrink-0 flex flex-col justify-end pb-1 bg-[#F5F5F3] p-3 rounded-lg border border-[#D6D2C4]">
                          <div className="flex justify-between mb-1 items-end">
                               <label className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider block">Target ({unit})</label>
                               <span className={`text-[10px] font-bold ${isTargetMet ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>{formatNumber(targetProgress, 0)}%</span>
                          </div>
                          <div className="relative mb-3">
                              {/* FIXED: Form field uses converted active unit value, writes back to base KGs via onChange */}
                              <input 
                                  type="number" 
                                  className="w-full border border-[#D6D2C4] bg-white rounded px-2 py-1 text-xs h-8 outline-none focus:border-[#007680]" 
                                  value={targetVolumeKg ? convertQty(targetVolumeKg, unit) : ''} 
                                  onChange={(e) => {
                                      let val = parseFloat(e.target.value) || 0;
                                      let inKg = val;
                                      if (unit === 'bag') inKg = val * 60;
                                      if (unit === 'mt') inKg = val * 1000;
                                      setTargetVolumeKg(inKg);
                                  }} 
                                  placeholder="0" 
                              />
                              <div className="absolute bottom-0 left-0 h-1 bg-[#D6D2C4] w-full rounded-b overflow-hidden">
                                  <div className={`h-full transition-all duration-300 ${isTargetMet ? 'bg-[#97D700]' : 'bg-[#007680]'}`} style={{ width: `${Math.min(targetProgress, 100)}%` }} />
                              </div>
                          </div>
                          <div className="text-center bg-white px-3 py-1.5 rounded-full border border-[#D6D2C4]/50 shadow-sm">
                              <div className="text-[9px] text-[#968C83] uppercase font-bold tracking-wide">Avg Age</div>
                              <div className="text-xs font-bold text-[#51534a] flex items-center justify-center gap-1">
                                  <CalendarClock size={12} className="text-[#007680]" />
                                  {formatNumber(blendStats.avgDaysInStock, 0)} days
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Horizontal Stacked Bar Charts & Legend */}
                  <div className="border-t border-[#D6D2C4]/50 pt-3">
                      <div className="flex flex-col gap-3 w-full">
                          {/* Target Bar */}
                          <div className="flex flex-col gap-1 w-full">
                              <div className="flex justify-between items-center text-[10px] font-bold text-[#968C83] uppercase tracking-wider">
                                  <span>Target Expectation ({targetBlendData?.name || 'Not Selected'})</span>
                              </div>
                              <div className="h-6 w-full bg-[#D6D2C4]/30 rounded flex shadow-inner">
                                  {targetBlendData && targetBlendData.distribution.length > 0 ? targetBlendData.distribution.map((d, idx, arr) => (
                                      <div 
                                          key={d.name} 
                                          title={`${d.name}: ${formatNumber(d.percentage, 1)}%`}
                                          style={{ width: `${d.percentage}%`, backgroundColor: getStrategyColor(d.name) }} 
                                          className={`h-full flex items-center justify-center text-white font-bold text-[9px] cursor-help border-r border-black/10 hover:opacity-90 transition-opacity ${idx === 0 ? 'rounded-l' : ''} ${idx === arr.length - 1 ? 'rounded-r border-0' : ''}`}
                                      >
                                          {d.percentage >= 5 && `${formatNumber(d.percentage, 0)}%`}
                                      </div>
                                  )) : (
                                      <div className="w-full h-full flex items-center justify-center text-[10px] text-[#968C83] italic">Please select a Target Blend above</div>
                                  )}
                              </div>
                          </div>

                          {/* Actual Bar */}
                          <div className="flex flex-col gap-1 w-full">
                              <div className="flex justify-between items-center text-[10px] font-bold text-[#007680] uppercase tracking-wider">
                                  <span>Actual Composition</span>
                              </div>
                              <div className="h-6 w-full bg-[#D6D2C4]/30 rounded flex shadow-inner">
                                  {strategyDistribution.length > 0 ? strategyDistribution.map((d, idx, arr) => (
                                      <div 
                                          key={d.name} 
                                          title={`${d.name}: ${formatNumber(d.percentage, 1)}%`}
                                          style={{ width: `${d.percentage}%`, backgroundColor: getStrategyColor(d.name) }} 
                                          className={`h-full flex items-center justify-center text-white font-bold text-[9px] cursor-help border-r border-black/10 hover:opacity-90 transition-opacity ${idx === 0 ? 'rounded-l' : ''} ${idx === arr.length - 1 ? 'rounded-r border-0' : ''}`}
                                      >
                                          {d.percentage >= 5 && `${formatNumber(d.percentage, 0)}%`}
                                      </div>
                                  )) : (
                                      <div className="w-full h-full flex items-center justify-center text-[10px] text-[#968C83] italic">No batches added to blend</div>
                                  )}
                              </div>
                          </div>

                          {/* Shared Dynamic Legend */}
                          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-[#D6D2C4]/30">
                              {uniqueStrategyNames.map(name => (
                                  <div key={name} className="flex items-center gap-1.5 bg-[#F5F5F3] px-1.5 py-0.5 rounded border border-[#D6D2C4]/50 hover:bg-[#D6D2C4]/50 transition-colors">
                                      <div className="w-2.5 h-2.5 rounded-sm shadow-sm" style={{ backgroundColor: getStrategyColor(name) }}></div>
                                      <span className="text-[9px] text-[#51534a] font-medium leading-none">{name}</span>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>

              </div>
          </div>
          
          {/* BODY: Scrollable List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#D6D2C4]/10">
              <div className="space-y-2">
                  {selectedBatches.map((item) => {
                      const percentOfBlend = blendStats.totalKg > 0 ? (item.useKg / blendStats.totalKg) * 100 : 0;
                      const hasPrice = item.batch.outrightPrice50kg && item.batch.outrightPrice50kg > 0;
                      return (
                      <div key={item.batch.id} className={`p-3 rounded border shadow-sm relative flex justify-between items-center ${hasPrice ? 'bg-white border-[#D6D2C4]' : 'bg-red-50 border-red-200'}`}>
                          <div className="pr-4">
                              <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-[#51534a]">{item.batch.batch_number || item.batch.id}</span>
                                  <span className="text-[10px] text-[#968C83] bg-[#D6D2C4]/30 px-1 rounded">{item.batch.strategy}</span>
                              </div>
                              <div className="text-[10px] text-[#968C83] mt-1 flex gap-3">
                                  <span>Outright: {formatNumber(item.batch.outrightPrice50kg || 0)}$/50</span>
                                  <span className={toUSClb(item.batch.outrightPrice50kg || 0) - (item.batch.hedgeLevelUSClb || 0) >= 0 ? 'text-[#6FA287]' : 'text-[#B9975B]'}>Diff: {formatNumber(toUSClb(item.batch.outrightPrice50kg || 0) - (item.batch.hedgeLevelUSClb || 0))}</span>
                              </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                              <div className="text-[10px] font-bold text-[#007680] bg-[#A4DBE8]/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <PieChart className="w-3 h-3" />{formatNumber(percentOfBlend, 1)}%
                              </div>
                              <div className="flex items-center border border-[#D6D2C4] rounded px-2 py-1 bg-[#D6D2C4]/10">
                                  <input type="number" className="w-16 text-xs bg-transparent text-right outline-none font-medium text-[#51534a]" value={convertQty(item.useKg, unit)} onChange={(e) => {
                                          let val = parseFloat(e.target.value);
                                          if (isNaN(val)) val = 0;
                                          const maxInUnit = convertQty(item.batch.quantityKg, unit);
                                          if (val < 0) val = 0;
                                          if (val > maxInUnit) val = maxInUnit;
                                          let newKg = val;
                                          if(unit === 'bag') newKg = val * 60;
                                          if(unit === 'mt') newKg = val * 1000;
                                          updateBatchQty(item.batch.id, newKg);
                                      }}
                                  />
                                  <span className="text-[10px] text-[#968C83] ml-1">{unit}</span>
                              </div>
                              <button onClick={() => removeFromBlend(item.batch.id)} className="text-[#D6D2C4] hover:text-[#B9975B] p-1"><X size={14} /></button>
                          </div>
                      </div>
                      );
                  })}
              </div>

              {/* Inventory Impact (Price Change) Section */}
              {selectedBatches.length > 0 && (
              <div className="border-t border-[#D6D2C4] pt-4">
                  <h4 className="text-[10px] font-bold text-[#007680] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <TrendingUp size={12} /> Inventory Impact (Price Change)
                  </h4>
                  <div className="space-y-2">
                  {Object.entries(impactAnalysis).map(([stratName, impact]) => (
                      <div key={stratName} className="bg-white p-2 rounded border border-[#D6D2C4] shadow-sm text-xs">
                          <div className="font-bold text-[#51534a] mb-1">{stratName}</div>
                          <div className="grid grid-cols-3 gap-2">
                               <div className="text-center border-r border-[#D6D2C4]/50 pr-2">
                                   <div className="text-[9px] text-[#968C83] uppercase">Diff</div>
                                   <div className={`font-bold ${impact.diff.change > 0 ? 'text-[#6FA287]' : 'text-[#B9975B]'}`}>
                                      {impact.diff.change > 0 ? '+' : ''}{formatNumber(impact.diff.change)}
                                   </div>
                                   <div className="text-[9px] text-[#968C83] mt-0.5 whitespace-nowrap">
                                      {formatNumber(impact.diff.original)} <span className="text-[#D6D2C4]">→</span> {formatNumber(impact.diff.new)}
                                   </div>
                               </div>
                               <div className="text-center border-r border-[#D6D2C4]/50 pr-2">
                                   <div className="text-[9px] text-[#968C83] uppercase">Hedge</div>
                                   <div className={`font-bold ${impact.hedge.change > 0 ? 'text-[#6FA287]' : 'text-[#B9975B]'}`}>
                                      {impact.hedge.change > 0 ? '+' : ''}{formatNumber(impact.hedge.change)}
                                   </div>
                                   <div className="text-[9px] text-[#968C83] mt-0.5 whitespace-nowrap">
                                      {formatNumber(impact.hedge.original)} <span className="text-[#D6D2C4]">→</span> {formatNumber(impact.hedge.new)}
                                   </div>
                               </div>
                               <div className="text-center">
                                   <div className="text-[9px] text-[#968C83] uppercase">Outright</div>
                                   <div className={`font-bold ${impact.outright.change > 0 ? 'text-[#6FA287]' : 'text-[#B9975B]'}`}>
                                      {impact.outright.change > 0 ? '+' : ''}{formatNumber(impact.outright.change)}
                                   </div>
                                   <div className="text-[9px] text-[#968C83] mt-0.5 whitespace-nowrap">
                                      {formatNumber(impact.outright.original)} <span className="text-[#D6D2C4]">→</span> {formatNumber(impact.outright.new)}
                                   </div>
                               </div>
                          </div>
                      </div>
                  ))}
                  </div>
              </div>
              )}
          </div>
  
          {/* FOOTER */}
          <div className="bg-[#51534a] text-white p-4 border-t border-[#51534a] z-20">
               <div className="flex justify-between items-center mb-2">
                   <div className="text-[10px] text-[#D6D2C4] uppercase tracking-wider">W.Avg Diff</div>
                   <div className="font-mono font-bold text-lg">{formatNumber(blendStats.avgDiff)}</div>
               </div>
               <div className="flex justify-between items-center mb-2">
                   <div className="text-[10px] text-[#D6D2C4] uppercase tracking-wider">Total Cost (Diff+Fob)</div>
                   <div className="font-mono text-[#CEB888]">{formatNumber(blendStats.finalCostDiff)}</div>
               </div>
               <div className="h-px bg-white/10 my-2"></div>
               <div className="grid grid-cols-2 gap-4">
                   <div>
                      <div className="text-[10px] text-[#A7BDB1] uppercase tracking-wider">P&L (c/lb)</div>
                      <div className={`text-xl font-bold ${blendStats.pnl >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>{blendStats.pnl > 0 ? '+' : ''}{formatNumber(blendStats.pnl)}</div>
                   </div>
                   <div className="text-right">
                      <div className="text-[10px] text-[#A7BDB1] uppercase tracking-wider">Est. P&L ($)</div>
                      <div className={`text-xl font-bold ${blendStats.totalPnLUSD >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>${formatNumber(blendStats.totalPnLUSD, 0)}</div>
                   </div>
               </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-[#4A4941] text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 animate-in slide-in-from-bottom-5">
          <AlertCircle className="w-4 h-4 text-[#D97706]" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* NEW: Email Confirmation Modal */}
      {emailModalData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-[#D6D2C4] bg-[#F5F5F3]">
                    <h3 className="font-bold text-[#51534a] text-lg flex items-center gap-2">
                        <AlertCircle size={18} className="text-[#007680]"/> Send Email Notification?
                    </h3>
                </div>
                <div className="p-5 flex flex-col gap-4 text-sm text-[#51534a]">
                    <p>
                        Blend <strong className="text-[#007680]">{emailModalData.blendName}</strong> has been saved and exported successfully.
                    </p>
                    <p>
                        Would you like to notify the team via email with the comparison, variance data, and compromised sales report?
                    </p>
                </div>
                <div className="p-4 bg-[#F5F5F3] flex justify-end gap-3 border-t border-[#D6D2C4]">
                    <button 
                        onClick={() => setEmailModalData(null)} 
                        className="px-4 py-2 text-sm font-bold text-[#968C83] hover:text-[#51534a] hover:bg-[#D6D2C4]/50 rounded-lg transition-colors"
                    >
                        No, Skip
                    </button>
                    <button 
                        onClick={async () => {
                            const payload = emailModalData;
                            setEmailModalData(null);
                            setToastMessage("Sending email...");
                            try {
                                await fetch('/api/send_mail', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(payload)
                                });
                                setToastMessage("Email sent successfully!");
                            } catch (e) {
                                setToastMessage("Failed to send email.");
                            }
                            setTimeout(() => setToastMessage(null), 3000);
                        }} 
                        className="px-6 py-2 bg-[#007680] text-white text-sm font-bold rounded-lg hover:bg-[#007680]/90 transition-all shadow-sm"
                    >
                        Yes, Send Email
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Analysis Details Modal */}
      {analysisModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#F5F2EA] rounded-2xl w-full max-w-6xl max-h-[95vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 font-Poppins">
            
            {/* Header Controls */}
            <div className="flex justify-between items-center p-4 bg-white border-b border-[#D1CEC3]">
              <h3 className="text-xl font-bold flex items-center gap-2 text-[#4A4941]">
                <FlaskConical className="w-5 h-5 text-[#00A651]" /> 
                Analysis Breakdown
              </h3>
              <button onClick={() => setAnalysisModalOpen(false)} className="text-[#8B8A81] hover:text-[#4A4941] transition-colors p-1 bg-[#F5F2EA] rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4 bg-[#F5F2EA]">
              {analysisLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-[#8B8A81]">
                  <div className="w-8 h-8 border-4 border-[#00A651] border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="font-bold uppercase tracking-widest text-sm">Loading Data...</p>
                </div>
              ) : selectedAnalysisDetails ? (
                <>
                  {/* Top Header Card */}
                  <div className="bg-white rounded-2xl p-5 border border-[#D1CEC3] shrink-0 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-2xl font-bold mb-1 leading-tight text-[#4A4941]">{selectedAnalysisDetails.analysis_number || `ID: ${selectedAnalysisDetails.id}`}</h2>
                        <p className="text-[#8B8A81] flex items-center gap-2 font-medium uppercase text-[10px] tracking-wider">
                          {selectedAnalysisDetails.analysis_type || 'STANDARD'} • {selectedAnalysisDetails.qc_quality || 'UNKNOWN'}
                        </p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-full font-bold text-[10px] flex items-center gap-1.5 ${selectedAnalysisDetails.mapped ? 'bg-[#00A651]/10 text-[#00A651]' : 'bg-[#8B8A81]/10 text-[#8B8A81]'}`}>
                        {selectedAnalysisDetails.mapped ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {selectedAnalysisDetails.mapped ? 'MAPPED' : 'UNMAPPED'}
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row justify-between mt-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                        {[
                          { label: 'SCA Defect', val: selectedAnalysisDetails.sca_defect_count },
                          { label: 'Moisture', val: `${selectedAnalysisDetails.moisture || '0.00'}%` },
                          { label: 'Prim. Defects', val: `${selectedAnalysisDetails.primary_defects_percentage || '0'}%`, color: '#D97706' },
                          { label: 'Foreign Mat.', val: `${selectedAnalysisDetails.forein_matter_percentage || '0'}%` }
                        ].map((stat, i) => (
                          <div key={i}>
                            <p className="text-[9px] font-bold uppercase text-[#8B8A81] mb-0.5">{stat.label}</p>
                            <p className="text-base font-bold leading-none" style={{ color: stat.color || '#4A4941' }}>{stat.val || '0.00'}</p>
                          </div>
                        ))}
                      </div>

                      <div className="w-[1px] bg-[#D1CEC3] mx-6 hidden md:block"></div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-[#D1CEC3]">
                        {[
                          { label: 'Grade AA', val: selectedAnalysisDetails.grade_aa_percentage },
                          { label: 'Grade AB', val: selectedAnalysisDetails.grade_ab_percentage },
                          { label: 'Grade ABC', val: selectedAnalysisDetails.grade_abc_percentage },
                          { label: 'Grinder', val: selectedAnalysisDetails.grade_grinder_percentage }
                        ].map((stat, i) => (
                          <div key={i}>
                            <p className="text-[9px] font-bold uppercase text-[#8B8A81] mb-0.5">{stat.label}</p>
                            <p className="text-sm font-semibold leading-none text-[#4A4941]">{stat.val || '0.00'}%</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Lower Section: Charts and Composition Side-by-Side */}
                  <div className="flex flex-col lg:flex-row gap-4 h-[500px]">
                    
                    {/* Mid-Left Column: Stacks Screen Size & Class Lines */}
                    <div className="flex-1 flex flex-col gap-4 min-w-0">
                      {/* Screen Size Bar Chart */}
                      <div className="flex-1 bg-white border border-[#D1CEC3] rounded-2xl p-4 shadow-sm flex flex-col min-h-0">
                        <div className="flex items-center gap-2 mb-2 shrink-0">
                          <BarChart3 className="w-4 h-4 text-[#605F55]" />
                          <h3 className="font-bold text-sm text-[#4A4941]">Screen Size</h3>
                        </div>
                        <div className="flex-1 w-full min-h-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={selectedAnalysisDetails.screensize || []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                              <XAxis dataKey="screen_size" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600, fill: '#4A4941'}} />
                              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#8B8A81'}} />
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
                          <h3 className="font-bold text-sm text-[#4A4941]">Class Tracking</h3>
                        </div>
                        <div className="flex-1 w-full min-h-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={selectedAnalysisDetails.classes || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE7DC" />
                              <XAxis dataKey="screen_size" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600, fill: '#4A4941'}} />
                              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#8B8A81'}} />
                              <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px'}} />
                              <Legend iconType="circle" wrapperStyle={{paddingTop: '5px', fontSize: '10px', fontWeight: 'bold'}} />
                              {uniqueClasses.map((cls, idx) => (
                                <Line 
                                  key={cls as string} 
                                  type="monotone" 
                                  dataKey={cls as string} 
                                  stroke={CHART_COLORS[idx % CHART_COLORS.length]} 
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

                    {/* Right Column: Composition Summary */}
                    <div className="w-full lg:w-[35%] bg-white border border-[#D1CEC3] rounded-2xl p-5 shadow-sm flex flex-col min-h-0 shrink-0">
                      <div className="flex items-center gap-2 mb-4 shrink-0">
                        <PieChart className="w-4 h-4 text-[#00A651]" />
                        <h3 className="font-bold text-sm text-[#4A4941]">Composition Summary</h3>
                      </div>
                      
                      <div className="h-48 w-full shrink-0 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                              stroke="none"
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold'}}
                              formatter={(value: number) => `${value.toFixed(2)}%`}
                            />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                           <span className="text-[10px] font-bold text-[#8B8A81] tracking-widest uppercase">Total</span>
                        </div>
                      </div>

                      {/* Scrollable Custom Legend */}
                      <div className="flex-1 overflow-y-auto mt-4 pr-1 min-h-0 border-t border-[#EBE7DC] pt-3">
                        <div className="space-y-1.5">
                          {pieData.map((item, idx) => (
                            <div key={item.name} className="flex justify-between items-center text-xs p-2 rounded-lg hover:bg-[#F5F2EA] transition-colors group">
                              <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                                <span className="truncate font-medium text-[#4A4941] group-hover:text-black transition-colors">{item.name}</span>
                              </div>
                              <span className="font-bold text-[#605F55] shrink-0">{item.value.toFixed(2)}%</span>
                            </div>
                          ))}
                          {pieData.length === 0 && <p className="text-center text-[#8B8A81] text-xs py-4">No composition data</p>}
                        </div>
                      </div>
                    </div>

                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-[#8B8A81]">
                  <p>No details found.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      </div>
    );
}

function BatchHistoryView({ unit }: { unit: Unit }) {
    const [search, setSearch] = useState('');
    const [lineage, setLineage] = useState<any>(null);
    const [notFound, setNotFound] = useState(false);
    const [loading, setLoading] = useState(false);
    
    // Lineage Navigation (History View Stack)
    const [viewHistory, setViewHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Pan, Zoom & Auto-center State
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<HTMLDivElement>(null);

    // Modal State
    const [selectedProcess, setSelectedProcess] = useState<any | null>(null);
    const [hoveredPieSegment, setHoveredPieSegment] = useState<any | null>(null);

    const handleSearch = async () => {
        if (!search.trim()) return;
        
        setLoading(true);
        setNotFound(false);
        setLineage(null);
        setViewHistory([]);
        setHistoryIndex(-1);
        setTransform({ x: 0, y: 0, scale: 1 });

        try {
            const res = await fetch(`/api/traceability?batchNumber=${encodeURIComponent(search.trim())}`);
            if (res.ok) {
                const data = await res.json();
                if (data.batches && data.batches.length > 0) {
                    setLineage(data);
                    // Initialize the view stack with the main target batch
                    setViewHistory([data.targetBatch]);
                    setHistoryIndex(0);
                } else {
                    setNotFound(true);
                }
            } else {
                setNotFound(true);
            }
        } catch (e) {
            console.error("Search failed:", e);
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    };

    const handleExtract = async () => {
        if (!lineage) return;
        
        try {
            // OPTIMIZED: Dynamically import xlsx to generate a multi-sheet Excel file natively
            const XLSX = await import('xlsx');

            // 1. Prepare Process Data O(N)
            const processData = lineage.processes?.map((p: any) => ({
                'Process ID': p.id,
                'Process Number': p.process_number || '-',
                'Process Type': p.process_type || '-',
                'Date': p.processing_date ? new Date(p.processing_date).toLocaleDateString() : '-',
                'Input Qty': p.input_qty || 0,
                'Output Qty': p.output_qty || 0,
                'Milling Loss': p.milling_loss || 0,
                'PNL': p.pnl || 0
            })) || [];

            // 2. Prepare Batch Data O(N)
            const batchData = lineage.batches?.map((b: any) => ({
                'Batch ID': b.batch_number || '-',
                'Process ID': b.process_id || '-',
                'Strategy': b.strategy || '-',
                'Date In': b.date_in ? new Date(b.date_in).toLocaleDateString() : '-',
                'Input Qty': b.input_qty || 0,
                'Output Qty': b.output_qty || 0,
                'Input Cost ($/50kg)': b.input_cost_usd_50 || b.outrightPrice50kg || '-',
                'Input Hedge (c/lb)': b.input_hedge_level_usc_lb || b.hedgeLevelUSClb || '-',
                'Input Diff (c/lb)': b.input_differential || '-',
                'Output Cost ($/50kg)': b.output_cost_usd_50 || '-',
                'Output Hedge (c/lb)': b.output_hedge_level_usc_lb || '-',
                'Output Diff (c/lb)': b.output_differential || '-',
                'Status': b.batch_status || '-'
            })) || [];

            // 3. Build Workbook & Append Sheets
            const wb = XLSX.utils.book_new();
            
            const wsProcesses = XLSX.utils.json_to_sheet(processData);
            XLSX.utils.book_append_sheet(wb, wsProcesses, "Processes");
            
            const wsBatches = XLSX.utils.json_to_sheet(batchData);
            XLSX.utils.book_append_sheet(wb, wsBatches, "Batches");

            // 4. Trigger Download
            XLSX.writeFile(wb, `Traceability_${lineage.targetBatch}.xlsx`);
        } catch (e) {
            console.error("Extraction failed:", e);
            alert("Failed to extract data. Please try again.");
        }
    };

    // --- Pan & Zoom Handlers ---
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setTransform(prev => ({
            ...prev,
            x: e.clientX - dragStart.current.x,
            y: e.clientY - dragStart.current.y
        }));
    };

    const handleMouseUpOrLeave = () => {
        setIsDragging(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        const zoomSensitivity = 0.0015;
        const delta = -e.deltaY * zoomSensitivity;
        setTransform(prev => ({
            ...prev,
            scale: Math.min(Math.max(0.3, prev.scale + delta), 2.5)
        }));
    };

    // --- O(N) Linear Graph Builder & Capper ---
    const lineageData = useMemo(() => {
        if (!lineage || historyIndex === -1) return null;

        const activeTargetBatch = viewHistory[historyIndex] || lineage.targetBatch;

        // 1. Build O(1) Lookup Maps
        const processMap = new Map();
        lineage.processes.forEach((p: any) => processMap.set(p.id, p));
        
        const processInputs = new Map<number, any[]>();
        const processOutputs = new Map<number, any[]>();
        const batchCreator = new Map<string, any>();

        lineage.batches.forEach((b: any) => {
            const pId = b.process_id;
            if (!pId) return;

            // Isolate the row representing the batch being consumed
            if (b.input_qty > 0) {
                if (!processInputs.has(pId)) processInputs.set(pId, []);
                processInputs.get(pId)!.push(b);
            }

            // Isolate the row representing the batch being created
            if (b.output_qty > 0) {
                if (!processOutputs.has(pId)) processOutputs.set(pId, []);
                processOutputs.get(pId)!.push(b);
                batchCreator.set(b.batch_number, processMap.get(pId));
            }
        });

        // 2. Traverse Backwards from Target to Cap the Graph
        let currentBatchId = activeTargetBatch;
        const stages: any[] = [];
        
        const targetBatchData = lineage.batches.find((b: any) => b.batch_number === currentBatchId && b.output_qty > 0)
                             || lineage.batches.find((b: any) => b.batch_number === currentBatchId)
                             || { batch_number: currentBatchId };

        while (currentBatchId) {
            const creatorProcess = batchCreator.get(currentBatchId);
            if (!creatorProcess) break;

            const inputs = processInputs.get(creatorProcess.id) || [];
            const allOutputs = processOutputs.get(creatorProcess.id) || [];
            
            stages.unshift({ process: creatorProcess, inputs, allOutputs });

            if (inputs.length > 1 || inputs.length === 0) break; 
            currentBatchId = inputs[0].batch_number;
        }

        if (targetBatchData) {
            stages.push({ process: null, inputs: [], allOutputs: [], isTarget: true, targetBatchData });
        }

        return { stages, batchCreator };
    }, [lineage, viewHistory, historyIndex]);

    // Graph Auto-Centering Hook
    useEffect(() => {
        if (lineageData && containerRef.current && graphRef.current) {
            const containerWidth = containerRef.current.clientWidth;
            const graphWidth = graphRef.current.scrollWidth;
            const targetScale = Math.min(1, (containerWidth - 64) / (graphWidth || 1));
            setTransform({ x: 0, y: 0, scale: targetScale });
        }
    }, [lineageData, historyIndex]);

    const handleTraceFurther = (batchNumber: string) => {
        const newHist = viewHistory.slice(0, historyIndex + 1);
        newHist.push(batchNumber);
        setViewHistory(newHist);
        setHistoryIndex(newHist.length - 1);
    };

    // Calculate Modal Dynamics on Demand
    const modalStats = useMemo(() => {
        if (!selectedProcess) return null;
        const totalIn = selectedProcess.inputs.reduce((sum: number, b: any) => sum + Number(b.input_qty || b.quantityKg || 0), 0);
        const totalOut = Number(selectedProcess.process.output_qty || 0);
        const calcLoss = totalOut - totalIn;

        const mainOut = selectedProcess.allOutputs[0] || {};
        const outCost = mainOut.output_cost_usd_50 || mainOut.outrightPrice50kg;
        const outHedge = mainOut.output_hedge_level_usc_lb || mainOut.hedgeLevelUSClb;
        const outDiff = (outCost && outHedge) ? (toUSClb(outCost) - outHedge) : mainOut.output_differential;

        return { totalIn, totalOut, calcLoss, outDiff };
    }, [selectedProcess]);

    // O(N) Hash Aggregation for Input Strategy Composition
    const inputStrategyDistribution = useMemo(() => {
        if (!selectedProcess || !selectedProcess.inputs) return [];
        const counts: Record<string, number> = {};
        let totalInputQty = 0;

        for (let i = 0; i < selectedProcess.inputs.length; i++) {
            const b = selectedProcess.inputs[i];
            const qty = Number(b.input_qty || b.quantityKg || 0);
            const strat = b.strategy || 'UNDEFINED';
            counts[strat] = (counts[strat] || 0) + qty;
            totalInputQty += qty;
        }

        return Object.entries(counts)
            .map(([name, value]) => ({
                name,
                value,
                percentage: totalInputQty ? (value / totalInputQty) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value);
    }, [selectedProcess]);

    // Dynamic Donut Path Generation
    const inputDonutSegments = useMemo(() => {
        let cumulativePercent = 0;
        const colors = ['#007680', '#B9975B', '#51534a', '#CEB888', '#97D700', '#A7BDB1', '#45B7D1', '#E9C46A'];
        
        return inputStrategyDistribution.map((d, i) => {
            const startPercent = cumulativePercent;
            cumulativePercent += d.percentage;
            
            // Handle edge case where a single strategy takes up 100%
            if (d.percentage === 100) {
                return { isFullCircle: true, pathData: "", color: colors[i % colors.length], ...d };
            }

            const getCoordinatesForPercent = (percent: number) => {
                const x = Math.cos(2 * Math.PI * percent);
                const y = Math.sin(2 * Math.PI * percent);
                return [x, y];
            };

            const [startX, startY] = getCoordinatesForPercent(startPercent / 100);
            const [endX, endY] = getCoordinatesForPercent(cumulativePercent / 100);
            const largeArcFlag = d.percentage > 50 ? 1 : 0;
            
            const pathData = [
                `M ${startX} ${startY}`, `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`, `L 0 0`,
            ].join(' ');
            
            return { isFullCircle: false, pathData, color: colors[i % colors.length], ...d };
        });
    }, [inputStrategyDistribution]);

    return (
        <div className="max-w-6xl mx-auto space-y-6 relative">
            
            {/* --- Process Details Modal --- */}
            {selectedProcess && modalStats && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        
                        {/* Modal Header */}
                        <div className="px-6 py-4 flex justify-between items-center text-white bg-[#007680]">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <Cog size={20} /> Process Details: {selectedProcess.process.process_number || selectedProcess.process.id}
                                </h2>
                                <p className="text-sm opacity-80">{selectedProcess.process.process_type}</p>
                            </div>
                            <button onClick={() => setSelectedProcess(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-[#F5F5F3]">
                            
                            {/* Dynamically Re-calculated Process KPIs */}
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-white p-3 rounded shadow-sm border border-[#D6D2C4] text-center">
                                    <div className="text-[10px] uppercase text-[#968C83] font-bold">Total In</div>
                                    <div className="text-lg font-bold text-[#51534a]">{formatNumber(modalStats.totalIn)} <span className="text-xs font-normal">kg</span></div>
                                </div>
                                <div className="bg-white p-3 rounded shadow-sm border border-[#D6D2C4] text-center">
                                    <div className="text-[10px] uppercase text-[#968C83] font-bold">Total Out</div>
                                    <div className="text-lg font-bold text-[#51534a]">{formatNumber(modalStats.totalOut)} <span className="text-xs font-normal">kg</span></div>
                                </div>
                                <div className="bg-white p-3 rounded shadow-sm border border-[#D6D2C4] text-center">
                                    <div className="text-[10px] uppercase text-[#968C83] font-bold">Milling Loss/Gain</div>
                                    <div className="text-lg font-bold text-[#B9975B]">{formatNumber(modalStats.calcLoss)} <span className="text-xs font-normal">kg</span></div>
                                </div>
                                <div className="p-3 rounded shadow-sm border text-center bg-[#A4DBE8]/20 border-[#007680]/30">
                                    <div className="text-[10px] uppercase text-[#007680] font-bold">Main Output Diff</div>
                                    <div className="text-lg font-bold text-[#007680]">
                                        {modalStats.outDiff ? formatNumber(modalStats.outDiff) : '-'} <span className="text-xs font-normal">c/lb</span>
                                    </div>
                                </div>
                            </div>

                            {/* Inputs Section (Chart + Table) */}
                            <div>
                                <h3 className="font-bold text-[#51534a] mb-2 flex items-center gap-2">
                                    <ArrowRight size={16} className="text-[#968C83]" /> Input Batches
                                </h3>
                                
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    {/* Strategy Composition Donut Chart */}
                                    <div className="lg:col-span-1 bg-white rounded border border-[#D6D2C4] shadow-sm p-4 flex flex-col justify-center items-center">
                                        <h4 className="text-[10px] uppercase text-[#968C83] font-bold tracking-wider mb-4">Strategy Composition</h4>
                                        <div className="relative flex justify-center items-center w-full">
                                            {inputDonutSegments.length > 0 ? (
                                                <>
                                                    <svg viewBox="-1.2 -1.2 2.4 2.4" className="w-32 h-32 -rotate-90">
                                                        {inputDonutSegments.map((segment, i) => (
                                                            segment.isFullCircle ? (
                                                                <circle key={i} cx="0" cy="0" r="1" fill={segment.color} 
                                                                    onMouseEnter={() => setHoveredPieSegment(segment)} 
                                                                    onMouseLeave={() => setHoveredPieSegment(null)} 
                                                                    className="transition-all duration-200 hover:opacity-80 cursor-pointer" 
                                                                />
                                                            ) : (
                                                                <path key={i} d={segment.pathData} fill={segment.color} stroke="white" strokeWidth="0.05" 
                                                                    onMouseEnter={() => setHoveredPieSegment(segment)} 
                                                                    onMouseLeave={() => setHoveredPieSegment(null)} 
                                                                    className="transition-all duration-200 hover:opacity-80 cursor-pointer" 
                                                                />
                                                            )
                                                        ))}
                                                        <circle cx="0" cy="0" r="0.6" fill="white" />
                                                    </svg>
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                        {hoveredPieSegment ? (
                                                            <div className="flex flex-col items-center bg-white/90 p-1 rounded">
                                                                <span className="text-[10px] font-bold text-[#51534a] truncate max-w-[80px] text-center leading-tight">{hoveredPieSegment.name}</span>
                                                                <span className="text-xs font-bold text-[#007680]">{formatNumber(hoveredPieSegment.percentage, 1)}%</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col items-center opacity-50"><span className="text-[9px] text-[#968C83] italic">Distrib.</span></div>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="w-32 h-32 rounded-full border-4 border-[#D6D2C4]/30 flex items-center justify-center text-[10px] text-[#968C83] italic">No Data</div>
                                            )}
                                        </div>

                                        {/* Chart Legend */}
                                        <div className="mt-4 w-full flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                                            {inputDonutSegments.map((segment, i) => (
                                                <div key={i} className="flex justify-between items-center text-[10px]">
                                                    <div className="flex items-center gap-1.5 truncate pr-2">
                                                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: segment.color }}></span>
                                                        <span className="truncate text-[#51534a]" title={segment.name}>{segment.name}</span>
                                                    </div>
                                                    <span className="font-bold text-[#968C83] shrink-0">{formatNumber(segment.percentage, 1)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Input Batches Table (Qty Removed) */}
                                    <div className="lg:col-span-2 bg-white rounded border border-[#D6D2C4] overflow-hidden shadow-sm h-full max-h-64 overflow-y-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-[#D6D2C4]/30 text-[#968C83] text-[10px] uppercase sticky top-0 z-10 backdrop-blur-sm">
                                                <tr>
                                                    <th className="py-2 px-4">Batch ID</th>
                                                    <th className="py-2 px-4">Strategy</th>
                                                    <th className="py-2 px-4 text-right">Cost ($/50kg)</th>
                                                    <th className="py-2 px-4 text-right">Hedge (c/lb)</th>
                                                    <th className="py-2 px-4 text-right">Diff (c/lb)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#D6D2C4]/50 text-xs">
                                                {selectedProcess.inputs.map((b: any, i: number) => {
                                                    const inCost = b.input_cost_usd_50 || b.outrightPrice50kg;
                                                    const inHedge = b.input_hedge_level_usc_lb || b.hedgeLevelUSClb;
                                                    const inDiff = (inCost && inHedge) ? (toUSClb(inCost) - inHedge) : b.input_differential;
                                                    return (
                                                        <tr key={i} className="hover:bg-[#F5F5F3]">
                                                            <td className="py-2 px-4 font-mono text-[#007680] font-medium">{b.batch_number}</td>
                                                            <td className="py-2 px-4 text-[#51534a]">{b.strategy || '-'}</td>
                                                            <td className="py-2 px-4 text-right">{inCost ? formatNumber(inCost) : '-'}</td>
                                                            <td className="py-2 px-4 text-right text-[#968C83]">{inHedge ? formatNumber(inHedge) : '-'}</td>
                                                            <td className="py-2 px-4 text-right font-medium text-[#51534a]">{inDiff ? formatNumber(inDiff) : '-'}</td>
                                                        </tr>
                                                    );
                                                })}
                                                {selectedProcess.inputs.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-[#968C83] italic">No input batches recorded</td></tr>}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Outputs Table */}
                            <div>
                                <h3 className="font-bold text-[#51534a] mb-2 flex items-center gap-2"><ArrowRight size={16} className="text-[#007680] rotate-180" /> Generated Output Batches</h3>
                                <div className="bg-white rounded border border-[#D6D2C4] overflow-hidden shadow-sm">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-[#007680]/10 text-[#007680] text-xs uppercase">
                                            <tr>
                                                <th className="py-2 px-4">Batch ID</th>
                                                <th className="py-2 px-4">Strategy</th>
                                                <th className="py-2 px-4 text-right">Qty Gen (kg)</th>
                                                <th className="py-2 px-4 text-right">Cost ($/50kg)</th>
                                                <th className="py-2 px-4 text-right">Hedge (c/lb)</th>
                                                <th className="py-2 px-4 text-right">Diff (c/lb)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#D6D2C4]/50">
                                            {selectedProcess.allOutputs.map((b: any, i: number) => {
                                                const outQty = b.quantityKg || b.output_qty || 0;
                                                const outCost = b.outrightPrice50kg || b.output_cost_usd_50;
                                                const outHedge = b.hedgeLevelUSClb || b.output_hedge_level_usc_lb;
                                                const outDiff = (outCost && outHedge) ? (toUSClb(outCost) - outHedge) : b.output_differential;
                                                return(
                                                    <tr key={i} className="hover:bg-[#F5F5F3]">
                                                        <td className="py-2 px-4 font-mono text-[#007680] font-medium">{b.batch_number}</td>
                                                        <td className="py-2 px-4 text-[#51534a]">{b.strategy || '-'}</td>
                                                        <td className="py-2 px-4 text-right font-medium">{formatNumber(outQty)}</td>
                                                        <td className="py-2 px-4 text-right">{outCost ? formatNumber(outCost) : '-'}</td>
                                                        <td className="py-2 px-4 text-right text-[#968C83]">{outHedge ? formatNumber(outHedge) : '-'}</td>
                                                        <td className="py-2 px-4 text-right font-medium text-[#51534a]">{outDiff ? formatNumber(outDiff) : '-'}</td>
                                                    </tr>
                                                );
                                            })}
                                            {selectedProcess.allOutputs.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-[#968C83] italic">No output batches recorded</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Search Area --- */}
            <Card className="p-6 relative z-10">
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center mb-2">


                        <div className='flex-col'>
                            <h3 className="text-lg font-bold text-[#51534a]">Batch history tracker</h3>
                            <h5 className="text-sm  text-[#51534a]">Type in batch numbers and trace them back to the roots</h5>
                        </div>
                        
                        {lineage && (
                            <button 
                                onClick={handleExtract}
                                className="text-xs text-[#007680] hover:text-[#007680]/80 font-medium flex items-center gap-1 bg-[#A4DBE8]/20 px-3 py-1.5 rounded border border-[#007680]/20 transition-all"
                            >
                                <Download size={14} /> Extract
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" size={20} />
                             <input 
                                type="text"
                                placeholder="Enter Batch ID (e.g. BLEND-2023-NOV)"
                                className="w-full pl-10 pr-4 py-3 border border-[#D6D2C4] rounded-lg focus:ring-2 focus:ring-[#007680] outline-none text-lg font-mono"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setNotFound(false);
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                             />
                        </div>
                        <button 
                            onClick={handleSearch}
                            disabled={loading}
                            className="bg-[#007680] text-white px-6 rounded-lg font-medium hover:bg-[#007680]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Tracing...' : 'Trace'}
                        </button>
                    </div>
                    {notFound && (
                        <p className="text-sm text-[#B9975B] mt-2 flex items-center gap-2 font-medium">
                            <AlertCircle size={16} />
                            Batch "{search}" history could not be traced.
                        </p>
                    )}
                </div>
            </Card>

            {/* --- Interactive Pannable/Zoomable Graph Canvas --- */}
            {lineageData && lineageData.stages.length > 0 && (
                <Card className="shadow-lg bg-[#EFEFE9] relative border border-[#D6D2C4] overflow-hidden h-[60vh]">
                    
                    {/* Toolbar Overlay */}
                    <div className="absolute top-4 left-4 z-20 flex gap-4 pointer-events-none w-full pr-8 justify-between">
                        <div className="text-xs font-bold text-[#51534a] bg-white/80 backdrop-blur px-3 py-1.5 rounded shadow-sm border border-[#D6D2C4]">
                            <span className="uppercase tracking-wider">Lineage Flow</span>
                            <span className="ml-2 font-normal text-[#968C83]">Capped at multi-input processes. Drag to pan.</span>
                        </div>
                        <div className="flex gap-2 pointer-events-auto">
                            <button onClick={() => setTransform({ x: 0, y: 0, scale: 1 })} className="bg-white text-xs px-3 py-1 border border-[#D6D2C4] rounded shadow-sm hover:bg-[#F5F5F3]">Reset View</button>
                        </div>
                    </div>

                    {/* Edge Navigation Arrows for View History */}
                    {viewHistory.length > 1 && (
                        <>
                            <button 
                                onClick={() => {
                                    setHistoryIndex(i => i + 1);
                                    setTransform({ x: 0, y: 0, scale: 1 });
                                }}
                                disabled={historyIndex >= viewHistory.length - 1}
                                className={`absolute left-6 top-1/2 -translate-y-1/2 z-30 p-3 bg-white/90 backdrop-blur rounded-full shadow-lg border border-[#D6D2C4] text-[#007680] hover:bg-[#007680] hover:text-white transition-all ${historyIndex >= viewHistory.length - 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                            >
                                <ChevronLeft size={28} />
                            </button>

                            <button 
                                onClick={() => {
                                    setHistoryIndex(i => i - 1);
                                    setTransform({ x: 0, y: 0, scale: 1 });
                                }}
                                disabled={historyIndex <= 0}
                                className={`absolute right-6 top-1/2 -translate-y-1/2 z-30 p-3 bg-white/90 backdrop-blur rounded-full shadow-lg border border-[#D6D2C4] text-[#007680] hover:bg-[#007680] hover:text-white transition-all ${historyIndex <= 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                            >
                                <ChevronRight size={28} />
                            </button>
                        </>
                    )}

                    {/* Auto-Centering Bounds & Canvas Area */}
                    <div 
                        ref={containerRef}
                        className={`w-full h-full relative overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUpOrLeave}
                        onMouseLeave={handleMouseUpOrLeave}
                        onWheel={handleWheel}
                    >
                        {/* Perfect Centering Offset Container */}
                        <div 
                            className="absolute top-1/2 left-1/2 flex items-center origin-center transition-transform duration-75"
                            style={{ transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${transform.scale})` }}
                        >
                            <div ref={graphRef} className="flex items-center">
                                {lineageData.stages.map((stage, index) => {
                                    
                                    // Precompute pricing attributes for Process Nodes
                                    const mainOutput = stage.allOutputs?.[0] || {};
                                    const outCost = mainOutput.output_cost_usd_50 || mainOutput.outrightPrice50kg;
                                    const outHedge = mainOutput.output_hedge_level_usc_lb || mainOutput.hedgeLevelUSClb;
                                    const outDiff = (outCost && outHedge) ? (toUSClb(outCost) - outHedge) : mainOutput.output_differential;

                                    let totalInWeight = 0;
                                    let totalInDiffVal = 0;
                                    for (let i = 0; i < stage.inputs.length; i++) {
                                        const inp = stage.inputs[i];
                                        const inQty = inp.input_qty || inp.quantityKg || 0;
                                        const inCost = inp.input_cost_usd_50 || inp.outrightPrice50kg;
                                        const inHedge = inp.input_hedge_level_usc_lb || inp.hedgeLevelUSClb;
                                        const inDiff = (inCost && inHedge) ? (toUSClb(inCost) - inHedge) : inp.input_differential;
                                        
                                        if (inDiff != null) {
                                            totalInWeight += inQty;
                                            totalInDiffVal += inQty * inDiff;
                                        }
                                    }
                                    const avgInDiff = totalInWeight > 0 ? (totalInDiffVal / totalInWeight) : null;

                                    return (
                                        <React.Fragment key={index}>
                                            
                                            {/* 1. Render Leftmost Inputs */}
                                            {index === 0 && stage.process && stage.inputs.length > 0 && (
                                                <>
                                                    <div className="flex flex-col justify-center relative">
                                                        {stage.inputs.map((inputBatch: any, idx: number) => {
                                                            const inCost = inputBatch.input_cost_usd_50 || inputBatch.outrightPrice50kg;
                                                            const inHedge = inputBatch.input_hedge_level_usc_lb || inputBatch.hedgeLevelUSClb;
                                                            const inDiff = (inCost && inHedge) ? (toUSClb(inCost) - inHedge) : inputBatch.input_differential;

                                                            return (
                                                                <div key={`${inputBatch.batch_number}-${idx}`} className="flex items-stretch relative">
                                                                    <div className="flex items-center py-4">
                                                                        <div className="bg-[#F5F5F3] border-2 border-[#D6D2C4] p-3 rounded-xl shadow-sm w-48 shrink-0 text-center relative z-10 flex flex-col items-center">
                                                                            <div className="text-[9px] uppercase font-bold text-[#968C83] mb-1">Input Batch</div>
                                                                            <div className="font-mono text-xs font-bold text-[#51534a] truncate w-full" title={inputBatch.batch_number}>{inputBatch.batch_number}</div>
                                                                            <div className="text-[10px] text-[#007680] mt-1 font-bold mb-2 border-b border-[#D6D2C4]/50 w-full pb-1">
                                                                                {inputBatch.input_qty || inputBatch.quantityKg} kg
                                                                            </div>
                                                                            
                                                                            <div className="text-[9px] text-[#51534a] w-full mb-3 px-1 flex justify-between gap-1">
                                                                                <div className="flex flex-col items-center">
                                                                                    <span className="opacity-70">Cost</span>
                                                                                    <span className="font-mono font-medium">${inCost ? formatNumber(inCost) : '-'}</span>
                                                                                </div>
                                                                                <div className="flex flex-col items-center">
                                                                                    <span className="opacity-70">Hedge</span>
                                                                                    <span className="font-mono font-medium">{inHedge ? formatNumber(inHedge) : '-'}</span>
                                                                                </div>
                                                                                <div className="flex flex-col items-center font-bold">
                                                                                    <span className="opacity-70">Diff</span>
                                                                                    <span className="font-mono">{inDiff ? formatNumber(inDiff) : '-'}</span>
                                                                                </div>
                                                                            </div>
                                                                            
                                                                            {lineageData.batchCreator.has(inputBatch.batch_number) ? (
                                                                                <button 
                                                                                    onClick={() => handleTraceFurther(inputBatch.batch_number)}
                                                                                    className="bg-[#007680] text-white text-[10px] px-3 py-1.5 rounded-full hover:bg-[#007680]/90 font-bold flex items-center gap-1 shadow-sm transition-all pointer-events-auto"
                                                                                >
                                                                                    <ChevronLeft size={12}/> Trace Back
                                                                                </button>
                                                                            ) : (
                                                                                <div className="text-[9px] text-[#968C83] italic font-medium px-2 py-1 bg-[#D6D2C4]/20 rounded-full">Origin Batch</div>
                                                                            )}
                                                                        </div>
                                                                        <div className="w-8 h-1 bg-[#968C83] rounded-full" />
                                                                    </div>
                                                                    {stage.inputs.length > 1 && (
                                                                        <div className={`absolute right-0 w-1 bg-[#968C83] -z-10
                                                                            ${idx === 0 ? 'top-[50%] bottom-0 rounded-tl-sm' : 
                                                                            idx === stage.inputs.length - 1 ? 'top-0 bottom-[50%] rounded-bl-sm' : 
                                                                            'top-0 bottom-0'}`}
                                                                        />
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                    {stage.inputs.length > 0 && (
                                                        <div className="w-8 h-1 bg-[#968C83] shrink-0 relative rounded-full">
                                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 border-t-4 border-r-4 border-[#968C83] rotate-45 rounded-sm"></div>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Arrow connecting intermediate processes */}
                                            {index > 0 && (
                                                <div className="w-12 h-1 bg-[#968C83] shrink-0 relative rounded-full ml-2">
                                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 border-t-4 border-r-4 border-[#968C83] rotate-45 rounded-sm"></div>
                                                </div>
                                            )}

                                            {/* 2. Render Process Node */}
                                            {stage.process && (
                                                <div 
                                                    onClick={(e) => { e.stopPropagation(); setSelectedProcess(stage); }}
                                                    className="bg-[#007680] border-2 border-[#007680]/50 text-white p-4 rounded-2xl shadow-xl w-56 flex flex-col shrink-0 transition-transform hover:-translate-y-1 cursor-pointer pointer-events-auto relative"
                                                >
                                                    {avgInDiff !== null && outDiff !== null && Math.abs(outDiff - avgInDiff) > 0.01 && (
                                                        <div className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-lg border-2 border-[#D6D2C4] z-10 flex items-center justify-center">
                                                            {outDiff > avgInDiff ? (
                                                                <ArrowUp size={20} strokeWidth={4} className="text-red-500"/>
                                                            ) : (
                                                                <ArrowDown size={20} strokeWidth={4} className="text-[#97D700]"/>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center justify-between mb-3 border-b border-white/20 pb-2">
                                                        <div className="flex items-center gap-2">
                                                            <Cog size={16} className="text-[#A4DBE8]" />
                                                            <div className="text-[10px] uppercase font-bold tracking-wider">{stage.process.process_type}</div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex justify-between gap-2 text-xs bg-white/10 p-1.5 rounded mb-2">
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] opacity-70 uppercase tracking-wider">In</span>
                                                            <span className="font-mono font-bold">{stage.process.input_qty} kg</span>
                                                        </div>
                                                        <div className="w-px bg-white/20"></div>
                                                        <div className="flex flex-col text-right">
                                                            <span className="text-[9px] opacity-70 uppercase tracking-wider">Out</span>
                                                            <span className="font-mono font-bold">{stage.process.output_qty} kg</span>
                                                        </div>
                                                    </div>

                                                    <div className="mt-2 pt-2 border-t border-white/20 text-xs">
                                                        <div className="text-[8px] uppercase font-bold tracking-wider opacity-80 mb-1 text-center">Main Output Est.</div>
                                                        <div className="flex justify-between gap-1 text-[10px]">
                                                            <div className="flex flex-col items-center">
                                                                <span className="opacity-70">Cost</span>
                                                                <span className="font-mono font-bold">${outCost ? formatNumber(outCost) : '-'}</span>
                                                            </div>
                                                            <div className="flex flex-col items-center">
                                                                <span className="opacity-70">Hedge</span>
                                                                <span className="font-mono font-bold">{outHedge ? formatNumber(outHedge) : '-'}</span>
                                                            </div>
                                                            <div className="flex flex-col items-center text-[#CEB888]">
                                                                <span className="opacity-70">Diff</span>
                                                                <span className="font-mono font-bold">{outDiff ? formatNumber(outDiff) : '-'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* 3. Render Target Batch */}
                                            {stage.isTarget && stage.targetBatchData && (() => {
                                                const targetCost = stage.targetBatchData.output_cost_usd_50 || stage.targetBatchData.outrightPrice50kg;
                                                const targetHedge = stage.targetBatchData.output_hedge_level_usc_lb || stage.targetBatchData.hedgeLevelUSClb;
                                                const targetDiff = (targetCost && targetHedge) ? (toUSClb(targetCost) - targetHedge) : (stage.targetBatchData.output_differential || stage.targetBatchData.differential);

                                                return (
                                                    <div className="bg-white border-2 border-[#007680] p-4 rounded-2xl shadow-xl w-60 shrink-0 pointer-events-auto relative z-10 ml-2">
                                                        <div className="flex items-center gap-2 mb-2 border-b border-[#D6D2C4]/50 pb-2">
                                                            <PackageCheck size={18} className="text-[#007680]" />
                                                            <div className="text-[10px] uppercase tracking-wider font-bold text-[#007680]">
                                                                {historyIndex === 0 ? "Target Batch" : "Traced Batch"}
                                                            </div>
                                                        </div>
                                                        <div className="font-mono font-bold text-sm truncate text-[#51534a] mb-1" title={stage.targetBatchData.batch_number}>
                                                            {stage.targetBatchData.batch_number}
                                                        </div>
                                                        <div className="text-[10px] text-[#968C83] uppercase tracking-wider mb-2">{stage.targetBatchData.strategy}</div>
                                                        
                                                        <div className="bg-[#F5F5F3] p-1.5 rounded text-xs text-center font-bold text-[#51534a] shadow-inner">
                                                            {stage.targetBatchData.output_qty || stage.targetBatchData.quantityKg || stage.targetBatchData.input_qty} kg
                                                        </div>

                                                        <div className="mt-3 text-[10px] text-[#51534a] bg-[#D6D2C4]/10 p-2 rounded border border-[#D6D2C4]/50 flex justify-between">
                                                            <div className="flex flex-col items-center">
                                                                <span className="uppercase text-[8px] opacity-70 font-bold">Cost</span> 
                                                                <span className="font-mono font-medium">${targetCost ? formatNumber(targetCost) : '-'}</span>
                                                            </div>
                                                            <div className="flex flex-col items-center">
                                                                <span className="uppercase text-[8px] opacity-70 font-bold">Hedge</span> 
                                                                <span className="font-mono font-medium">{targetHedge ? formatNumber(targetHedge) : '-'}</span>
                                                            </div>
                                                            <div className="flex flex-col items-center text-[#007680]">
                                                                <span className="uppercase text-[8px] opacity-70 font-bold">Diff</span> 
                                                                <span className="font-mono font-bold">{targetDiff ? formatNumber(targetDiff) : '-'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </React.Fragment>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}


function ClientAnalysisView({ unit }: { unit: Unit }) {
    // Data State
    const [salesData, setSalesData] = useState<SaleRecord[]>([]);
    const [loading, setLoading] = useState(true);
    // State for editing
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editedDiff, setEditedDiff] = useState<number | string>('');

    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    const [selectedSalesRefs, setSelectedSalesRefs] = useState<string[]>([]);
    const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]); 
    
    // Date Range State
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [showUnhedgeable, setShowUnhedgeable] = useState(false);
    
    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: keyof SaleRecord | 'pnlTotal' | null, direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    // Financial Config States
    const [globalVars, setGlobalVars] = useState({ financingRate: 0, financedCostPct: 0, fixedFobbing: 0 });
    const [editVars, setEditVars] = useState({ financingRate: 0, financedCostPct: 0, fixedFobbing: 0 });
    const [isEditingVars, setIsEditingVars] = useState(false);

    // Fetch Data
    const fetchSales = async () => {
        try {
            const res = await fetch('/api/sale_records');
            if (res.ok) {
                const data = await res.json();
                setSalesData(data);
            } else {
                console.error("Failed to fetch sales data");
            }
        } catch (e) {
            console.error("Error loading sales data:", e);
        } finally {
            setLoading(false);
        }
    };

    const fetchVariables = async () => {
        try {
            const res = await fetch('/api/variables');
            if (res.ok) {
                const data = await res.json();
                let fRate = 0, fCost = 0, fFob = 0;
                data.forEach((v: any) => {
                    if (v.name === 'Financing Rate per Annum') fRate = Number(v.value);
                    if (v.name === 'Financed cost percentage') fCost = Number(v.value);
                    if (v.name === 'Fixed Fobbing Costs') fFob = Number(v.value);
                });
                const vars = { financingRate: fRate, financedCostPct: fCost, fixedFobbing: fFob };
                setGlobalVars(vars);
                setEditVars(vars);
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchSales();
        fetchVariables();
    }, []);

    const handleSaveVariables = async () => {
        try {
            const res = await fetch('/api/variables', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editVars)
            });
            if (res.ok) {
                setGlobalVars(editVars);
                setIsEditingVars(false);
            } else {
                alert("Failed to update variables");
            }
        } catch (e) {
            alert("Error saving variables");
        }
    };

    // Extract unique options from loaded data
    const clients = useMemo(() => Array.from(new Set(salesData.map(s => s.client))), [salesData]);
    const salesRefs = useMemo(() => Array.from(new Set(salesData.map(s => s.contract_number))), [salesData]);
    const strategies = useMemo(() => Array.from(new Set(salesData.map(s => s.strategy))), [salesData]);

    const filteredData = useMemo(() => {
        const startTimestamp = startDate ? new Date(startDate).getTime() : null;
        const endTimestamp = endDate ? new Date(endDate).getTime() : null;

        return salesData.filter(item => {
            const h = (item as any).hedgeable;
            
            // OPTIMIZED: Hyper-resilient O(1) check. Safely handles standard primitive types, 
            // Node.js MySQL Buffers {type: 'Buffer', data: [1]}, and raw bit strings.
            const isHedgeable = 
                h === 1 || 
                h === '1' || 
                h === true || 
                h === 'true' || 
                (h && typeof h === 'object' && h.data && h.data[0] === 1) ||
                (typeof h === 'string' && h.charCodeAt(0) === 1);
            
            // Hide record IF the toggle is OFF AND the record is NOT hedgeable
            if (!showUnhedgeable && !isHedgeable) {
                return false;
            }

            // OPTIMIZED: Sequential early returns prevents unnecessary array scanning and date parsing
            if (selectedClients.length > 0 && !selectedClients.includes(item.client)) return false;
            if (selectedSalesRefs.length > 0 && !selectedSalesRefs.includes(item.contract_number)) return false;
            if (selectedStrategies.length > 0 && !selectedStrategies.includes(item.strategy)) return false;

            // OPTIMIZED: Date validation using pre-computed timestamps outside the O(n) filter loop
            if (startTimestamp || endTimestamp) {
                const itemTime = new Date(item.date).getTime();
                if (startTimestamp && itemTime < startTimestamp) return false;
                if (endTimestamp && itemTime > endTimestamp) return false;
            }

            return true;
        });
    }, [salesData, selectedClients, selectedSalesRefs, selectedStrategies, startDate, endDate, showUnhedgeable]);

    // Sorting Logic
    const sortedData = useMemo(() => {
        let sortableItems = [...filteredData];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                let aValue: any = a[sortConfig.key as keyof SaleRecord];
                let bValue: any = b[sortConfig.key as keyof SaleRecord];

                if (sortConfig.key === 'pnl_total') {
                    const marginA = (a.is_sale_diff_null ? 0 : a.sale_fob_diff) - a.cost_diff - (a.fixed_fobbing + a.dynamic_fobbing);
                    const marginB = (b.is_sale_diff_null ? 0 : b.sale_fob_diff) - b.cost_diff - (b.fixed_fobbing + b.dynamic_fobbing);
                    aValue = (marginA / 100) * (a.quantity * KG_TO_LB);
                    bValue = (marginB / 100) * (b.quantity * KG_TO_LB);
                } 
                else if (sortConfig.key === 'pnl_per_lb') {
                     const valA = a.is_sale_diff_null ? 0 : a.sale_fob_diff;
                     const valB = b.is_sale_diff_null ? 0 : b.sale_fob_diff;
                     aValue = valA - a.cost_diff - (a.fixed_fobbing + a.dynamic_fobbing);
                     bValue = valB - b.cost_diff - (b.fixed_fobbing + b.dynamic_fobbing);
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [filteredData, sortConfig]);

    const requestSort = (key: keyof SaleRecord | 'pnlTotal') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (name: string) => {
        if (sortConfig.key === name) {
            return sortConfig.direction === 'asc' ? <ChevronDown size={14} className="inline ml-1" /> : <ChevronRight size={14} className="inline ml-1 rotate-180" />; 
        }
        return null;
    };
    
    const handleEditClick = (record: SaleRecord) => {
        if (editingId === record.id) {
            setEditingId(null);
            setEditedDiff('');
        } else {
            setEditingId(record.id);
            setEditedDiff(record.is_sale_diff_null ? '' : record.sale_fob_diff);
        }
    };

    const handleSaveSaleDiff = async (id: string) => {
        if (editedDiff === '' || isNaN(Number(editedDiff))) {
            alert("Please enter a valid number for Sale Differential");
            return;
        }

        try {
            const response = await fetch('/api/sale_records', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, sale_differential: Number(editedDiff) }),
            });

            if (response.ok) {
                setEditingId(null);
                fetchSales(); 
            } else {
                alert("Failed to update sale differential");
            }
        } catch (error) {
            console.error("Update failed:", error);
            alert("An error occurred while updating.");
        }
    };

    const summary = useMemo(() => {
        let totalKg = 0;
        let totalPnLUSD = 0;
        let totalMarginVal = 0;

        filteredData.forEach(item => {
            totalKg += item.quantity;
            
            if (!item.is_sale_diff_null) {
                 const saleDiff = item.sale_fob_diff;
                 const margin = saleDiff - item.cost_diff - (item.fixed_fobbing + item.dynamic_fobbing);
                 const pnlUSD = (margin / 100) * (item.quantity * KG_TO_LB);
                 
                 totalPnLUSD += pnlUSD;
                 totalMarginVal += margin * item.quantity;
            }
        });
        
        const wAvgMargin = totalKg ? totalMarginVal / totalKg : 0;

        return { totalKg, totalPnLUSD, wAvgMargin, count: filteredData.length };
    }, [filteredData]);

    if (loading) {
        return <div className="p-8 text-center text-[#968C83]">Loading Sales Data...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Filter Bar */}
            <Card className="p-4 flex flex-col xl:flex-row gap-4 items-center justify-between">
                <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-[#51534a] font-medium whitespace-nowrap">
                        <Filter size={16} className="text-[#007680]" />
                        Filters
                    </div>
                    <MultiSelect options={clients} selected={selectedClients} onChange={setSelectedClients} placeholder="Clients" searchable />
                    <MultiSelect options={salesRefs} selected={selectedSalesRefs} onChange={setSelectedSalesRefs} placeholder="Sales Refs" searchable />
                    <MultiSelect options={strategies} selected={selectedStrategies} onChange={setSelectedStrategies} placeholder="Strategies" searchable />
                    <div className="flex items-center gap-2 border-l border-[#D6D2C4] pl-4 w-full md:w-auto">
                        <span className="text-xs text-[#968C83] uppercase font-bold whitespace-nowrap">Exit Warehouse:</span>
                        <input type="date" className="bg-white border border-[#D6D2C4] rounded px-2 py-1 text-xs outline-none focus:border-[#007680] text-[#51534a] h-8" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        <span className="text-[#968C83]">-</span>
                        <input type="date" className="bg-white border border-[#D6D2C4] rounded px-2 py-1 text-xs outline-none focus:border-[#007680] text-[#51534a] h-8" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                </div>
                <div className="text-xs text-[#968C83] whitespace-nowrap self-end xl:self-center">
                    Showing {summary.count} records
                </div>
            </Card>

            {/* Financial Config Card */}
            <Card className="p-4 flex items-center justify-between border border-[#007680]/20 bg-white">
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8 w-full">
                    <div className="text-xs text-[#968C83] uppercase font-bold tracking-wider flex items-center gap-2 shrink-0">
                        <DollarSign size={14} className="text-[#007680]"/> Financial Configuration
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-6 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase text-[#968C83] font-bold">Financing Rate:</span>
                            {isEditingVars ? (
                                <input type="number" className="w-16 border border-[#007680] rounded px-1.5 py-0.5 text-sm font-bold text-[#007680] outline-none bg-[#007680]/5" value={editVars.financingRate} onChange={e => setEditVars({...editVars, financingRate: parseFloat(e.target.value) || 0})} />
                            ) : (
                                <span className="font-bold text-[#007680] text-sm">{globalVars.financingRate}%</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase text-[#968C83] font-bold">Financed Cost:</span>
                            {isEditingVars ? (
                                <input type="number" className="w-16 border border-[#007680] rounded px-1.5 py-0.5 text-sm font-bold text-[#007680] outline-none bg-[#007680]/5" value={editVars.financedCostPct} onChange={e => setEditVars({...editVars, financedCostPct: parseFloat(e.target.value) || 0})} />
                            ) : (
                                <span className="font-bold text-[#007680] text-sm">{globalVars.financedCostPct}%</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase text-[#968C83] font-bold">Fixed Fobbing:</span>
                            {isEditingVars ? (
                                <input type="number" className="w-16 border border-[#007680] rounded px-1.5 py-0.5 text-sm font-bold text-[#007680] outline-none bg-[#007680]/5" value={editVars.fixedFobbing} onChange={e => setEditVars({...editVars, fixedFobbing: parseFloat(e.target.value) || 0})} />
                            ) : (
                                <span className="font-bold text-[#007680] text-sm">{globalVars.fixedFobbing} c/lb</span>
                            )}
                        </div>
                    </div>

                    <div className="shrink-0 flex items-center justify-end gap-3">
                        {isEditingVars ? (
                            <div className="flex items-center gap-2">
                                <button onClick={() => { setIsEditingVars(false); setEditVars(globalVars); }} className="text-xs px-3 py-1.5 rounded bg-[#F5F5F3] text-[#51534a] font-bold hover:bg-[#D6D2C4] transition-colors">Cancel</button>
                                <button onClick={handleSaveVariables} className="text-xs px-3 py-1.5 rounded bg-[#007680] text-white font-bold hover:bg-[#007680]/90 shadow-sm transition-colors flex items-center gap-1"><Check size={12}/> Save</button>
                            </div>
                        ) : (
                            <button onClick={() => setIsEditingVars(true)} className="text-xs px-3 py-1.5 rounded bg-[#F5F5F3] text-[#51534a] font-bold hover:bg-[#D6D2C4] transition-colors flex items-center gap-1 border border-[#D6D2C4]"><Pencil size={12}/> Edit Config</button>
                        )}
                        
                        {/* Unhedgeable Records Toggle */}
                        <div className="flex items-center gap-2 border-l border-[#D6D2C4] pl-3">
                            <span className="text-[10px] uppercase text-[#968C83] font-bold">Include Unhedgeable</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={showUnhedgeable} onChange={(e) => setShowUnhedgeable(e.target.checked)} />
                                <div className="w-7 h-4 bg-[#D6D2C4] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#D6D2C4] after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#007680]"></div>
                            </label>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 border-l-4 border-l-[#007680]">
                    <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">TOTAL VOLUME SOLD</div>
                    <div className="text-2xl font-bold text-[#51534a] mt-1">
                        {formatNumber(convertQty(summary.totalKg, unit), 0)} <span className="text-sm font-normal text-[#968C83]">{unit.toUpperCase()}</span>
                    </div>
                </Card>
                <Card className="p-4 border-l-4 border-l-[#5B3427]">
                    <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">AVG MARGIN (P&L)</div>
                    <div className={`text-2xl font-bold mt-1 ${summary.wAvgMargin >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>
                        {summary.wAvgMargin > 0 ? '+' : ''}{formatNumber(summary.wAvgMargin)} <span className="text-sm font-normal text-[#968C83]">c/lb</span>
                    </div>
                </Card>
                <Card className="p-4 border-l-4 border-l-[#007680]">
                    <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">TOTAL THEORETICAL P&L</div>
                    <div className={`text-2xl font-bold mt-1 ${summary.totalPnLUSD >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                        ${formatNumber(summary.totalPnLUSD, 0)}
                    </div>
                </Card>
            </div>

            {/* Detailed Table */}
            <Card className="overflow-hidden border-none shadow-md">
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#51534a] text-white font-medium text-xs uppercase tracking-wider sticky top-0 z-10">
                            <tr>
                                <th className="py-3 px-4 cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('date')}>Exit Date {getSortIcon('date')}</th>
                                <th className="py-3 px-4 cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('contract_number')}>Sales Ref {getSortIcon('contract_number')}</th>
                                <th className="py-3 px-4 cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('batch_number' as keyof SaleRecord)}>Batch {getSortIcon('batch_number')}</th>
                                <th className="py-3 px-4 cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('client')}>Client {getSortIcon('client')}</th>
                                <th className="py-3 px-4">Strategy</th>
                                <th className="py-3 px-4 text-right cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('quantity')}>Vol ({unit}) {getSortIcon('quantity')}</th>
                                <th className="py-3 px-4 text-right bg-[#5B3427]">Cost Outright ($/50kg)</th>
                                <th className="py-3 px-4 text-right bg-[#5B3427]">Cost Diff (c/lb)</th>
                                <th className="py-3 px-2 text-right bg-[#5B3427] w-16">Fix. Fob</th>
                                <th className="py-3 px-2 text-right bg-[#5B3427] w-16">Dyn. Fob</th>
                                <th className="py-3 px-4 text-right bg-[#007680]">Sale Diff (c/lb)</th>
                                <th className="py-3 px-4 text-right font-bold text-[#97D700] bg-[#51534a] cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('pnl_per_lb')}>Margin (c/lb) {getSortIcon('pnl_per_lb')}</th>
                                <th className="py-3 px-4 text-right font-bold text-white bg-[#51534a] cursor-pointer hover:bg-[#5B3427]/80 transition-colors" onClick={() => requestSort('pnlTotal')}>Total P&L ($) {getSortIcon('pnlTotal')}</th>
                                <th className="py-3 px-4 w-10 bg-[#51534a]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D6D2C4]">
                            {sortedData.map((row) => {
                                const isNull = row.is_sale_diff_null;
                                const saleDiff = isNull ? 0 : row.sale_fob_diff;
                                const margin = saleDiff - row.cost_diff - (row.fixed_fobbing + row.dynamic_fobbing);
                                const pnlUSD = (margin / 100) * (row.quantity * KG_TO_LB);
                                const isEditing = editingId === row.id;

                                return (
                                    <tr key={row.id} className="hover:bg-[#D6D2C4]/20 transition-colors">
                                        <td className="py-3 px-4 text-[#968C83] whitespace-nowrap text-xs">{formatDate(row.date)}</td>
                                        <td className="py-3 px-4 font-mono text-[#007680] font-medium text-xs">{row.contract_number}</td>
                                        <td className="py-3 px-4 font-mono text-[#51534a] text-xs">{row.batch_number || '-'}</td>
                                        <td className="py-3 px-4 text-[#51534a] font-medium text-xs max-w-60 truncate" title={row.client}>{row.client}</td>
                                        <td className="py-3 px-4 text-[#51534a] text-xs">{row.strategy}</td>
                                        <td className="py-3 px-4 text-right text-[#51534a] font-mono text-xs">{formatNumber(convertQty(row.quantity, unit), 0)}</td>
                                        <td className="py-3 px-4 text-right text-[#51534a] font-mono text-xs bg-[#D6D2C4]/10">${formatNumber(row.cost_usd_50)}</td>
                                        <td className="py-3 px-4 text-right text-[#51534a] font-mono text-xs bg-[#D6D2C4]/10">{formatNumber(row.cost_diff)}</td>
                                        <td className="py-3 px-2 text-right text-[#968C83] font-mono text-xs bg-[#D6D2C4]/10 border-l border-white/50">{formatNumber(row.fixed_fobbing)}</td>
                                        <td className="py-3 px-2 text-right text-[#968C83] font-mono text-xs bg-[#D6D2C4]/10">{formatNumber(row.dynamic_fobbing)}</td>
                                        <td className="py-3 px-4 text-right text-[#007680] font-mono text-xs font-bold bg-[#A4DBE8]/10 border-l border-[#D6D2C4]">
                                            {isEditing ? (
                                                <input 
                                                    type="number" 
                                                    className="w-16 text-right border border-[#007680] rounded px-1 py-0.5 text-xs outline-none"
                                                    value={editedDiff}
                                                    onChange={(e) => setEditedDiff(e.target.value)}
                                                    autoFocus
                                                />
                                            ) : (
                                                isNull ? '-' : formatNumber(row.sale_fob_diff)
                                            )}
                                        </td>
                                        <td className={`py-3 px-4 text-right font-bold text-xs border-l border-[#D6D2C4] ${margin >= 0 ? 'text-[#6FA287] bg-[#97D700]/10' : 'text-[#B9975B] bg-[#B9975B]/10'}`}>
                                            {isNull ? '-' : (margin > 0 ? '+' : '') + formatNumber(margin)}
                                        </td>
                                        <td className={`py-3 px-4 text-right font-bold text-xs ${pnlUSD >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                                            {isNull ? '-' : '$' + formatNumber(pnlUSD, 0)}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {isEditing ? (
                                                <button onClick={() => handleSaveSaleDiff(row.id)} className="p-1 rounded hover:bg-[#97D700]/20 transition-colors text-[#97D700]" title="Save"><Check size={14} /></button>
                                            ) : (
                                                <button onClick={() => handleEditClick(row)} className="p-1 rounded hover:bg-[#D6D2C4]/40 transition-colors text-[#968C83]" title="Edit"><Pencil size={14} /></button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {sortedData.length === 0 && (
                                <tr>
                                    <td colSpan={13} className="py-8 text-center text-[#968C83] italic">No sales records found matching filters.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

// --- Helper Component: Flow Bar Chart ---
const FlowBarChart = ({ data, height = "h-16" }: { data: { label: string, value: number }[], height?: string }) => {
    // Calculate max absolute value for scaling
    const maxVal = Math.max(...data.map(d => Math.abs(d.value))) || 1;
    
    return (
        <div className={`w-full flex items-end ${height} gap-0`}>
            {data.map((d, i) => {
                const val = d.value;
                const absVal = Math.abs(val);
                // Scaling: Max bar height is 40% of container height (leaving 10% buffer from center to top/bottom for text)
                const pct = (absVal / maxVal) * 40; 
                const isNeg = val < 0;
                
                // Color Logic: Positive = Teal (#007680), Negative = Coffee Brown (#5B3427)
                const colorClass = isNeg ? 'bg-[#5B3427]' : 'bg-[#007680]';

                return (
                    <div key={i} className="flex-1 h-full relative group min-w-0">
                        {/* Label at Bottom */}
                        <div className="absolute bottom-0 w-full text-[8px] text-[#968C83] text-center font-medium leading-tight truncate px-0.5" title={d.label}>
                            {d.label}
                        </div>
                        
                        {/* Chart Area (Above label) */}
                        {/* FIX: Removed 'relative' class which conflicted with 'absolute' */}
                        <div className="absolute top-0 bottom-4 w-full">
                            {/* Zero Line */}
                            <div className="absolute top-1/2 w-full border-t border-[#D6D2C4]/50 z-0"></div>
                            
                            {/* Bar */}
                            <div 
                                className={`absolute left-0.5 right-0.5 transition-all duration-500 z-10 ${colorClass} rounded-sm opacity-90 hover:opacity-100`}
                                style={{ 
                                    height: `${Math.max(pct, 1)}%`, // Ensure at least a sliver is visible
                                    [isNeg ? 'top' : 'bottom']: '50%',
                                }}
                            ></div>

                            {/* Value Text - Always Visible */}
                            {absVal > 0 && (
                                <div 
                                    className={`absolute w-full text-center text-[9px] font-bold leading-none z-20 overflow-hidden text-ellipsis px-0.5 ${isNeg ? 'text-[#5B3427]' : 'text-[#007680]'}`}
                                    style={{
                                        [isNeg ? 'top' : 'bottom']: `calc(50% + ${Math.max(pct, 1)}% + 3px)`
                                    }}
                                    title={formatNumber(absVal, 0)}
                                >
                                    {formatNumber(absVal, 0)}
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    );
};

function DashboardView({ unit }: { unit: Unit }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Activity Inspector State
  const [selectedStrategy, setSelectedStrategy] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [activeMetricData, setActiveMetricData] = useState<any>(null);

  // Fetch Data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const query = new URLSearchParams();
        if (fromDate) query.append('fromDate', fromDate);
        if (toDate) query.append('toDate', toDate);

        const res = await fetch(`/api/overall_summary?${query.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error("Failed to load dashboard", e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [fromDate, toDate]);

  // Handle Dropdown Logic
  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedStrategy(val);
    setSelectedGrade('');
    if (val && data?.recentStrategyActivities) {
      const found = data.recentStrategyActivities.find((s: any) => s.strategy === val);
      setActiveMetricData(found);
    } else {
      setActiveMetricData(null);
    }
  };

  const handleGradeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedGrade(val);
    setSelectedStrategy('');
    if (val && data?.recentGradeActivities) {
      const found = data.recentGradeActivities.find((g: any) => g.grade === val);
      setActiveMetricData(found);
    } else {
      setActiveMetricData(null);
    }
  };

  const locationChartData = useMemo(() => {
    if (!data?.pendingBatches) return [];
    const groups: Record<string, number> = {};
    data.pendingBatches.forEach((b: any) => {
      const loc = b.from_location || 'Unknown';
      groups[loc] = (groups[loc] || 0) + Number(b.balance_to_transfer);
    });
    return Object.entries(groups)
      .map(([name, qty]) => ({ name, value: qty }))
      .sort((a, b) => b.value - a.value); 
  }, [data]);

  const getVal = (kg: number) => convertQty(Number(kg || 0), unit);

  if (loading && !data) return <div className="p-8 text-center text-[#968C83]">Loading Dashboard...</div>;
  if (!data) return <div className="p-8 text-center text-[#B9975B]">Failed to load data.</div>;

  const stockSummary = data.recentStockSummary || {};
  const isDateRangeSelected = fromDate && toDate;

  // Updated Flow visualization to include processing inputs/outputs
  const stockFlowData = [
    { label: 'Inbound', value: getVal(stockSummary.total_inbound_qty) },
    { label: 'From Proc', value: getVal(stockSummary.total_from_processing_qty) },
    { label: 'To Proc', value: -getVal(stockSummary.total_to_processing_qty) },
    { label: 'Outbound', value: -getVal(stockSummary.total_outbound_qty) },
    { label: 'Adjust', value: getVal(stockSummary.total_stock_adjustment_qty) }
  ];

  let activityFlowData: { label: string, value: number }[] = [];
  if (activeMetricData) {
      activityFlowData = [
          { label: 'Inbound', value: getVal(activeMetricData.inbound_qty) },
          { label: 'From Proc', value: getVal(activeMetricData.from_processing_qty) },
          { label: 'Loss/Gain', value: getVal(activeMetricData.loss_gain_qty) },
          { label: 'Adjust', value: getVal(activeMetricData.stock_adjustment_qty) },
          { label: 'To Proc', value: -getVal(activeMetricData.to_processing_qty) },
          { label: 'Outbound', value: -getVal(activeMetricData.outbound_qty) },
      ];
  }

  return (
    <div className={`space-y-4 animate-in fade-in duration-300 pb-10 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
      
      {/* 1. STOCK POSITION SECTION (UPDATED) */}
      <Card className="p-4 bg-[#51534a] text-white border-none shadow-md">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-white/10 pb-4 gap-4">
              <div className="flex flex-col">
                 <h3 className="font-bold text-[#007680] flex items-center gap-2"><TrendingUp size={16}/> Stock Position</h3>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-md transition-colors ${!isDateRangeSelected ? 'text-[#97D700] font-bold' : 'text-[#A7BDB1]'}`}>
                    {stockSummary.date ? formatDate(stockSummary.date) : "Most Recent"}
                </span>
                <div className={`flex items-center gap-2 bg-[#F5F5F3] border rounded px-2 py-1 shadow-inner transition-all ${isDateRangeSelected ? 'border-[#97D700] ring-2 ring-[#97D700]/50' : 'border-[#D6D2C4]'}`}>
                    <Filter size={14} className="text-[#007680]" />
                    <input type="date" className="text-xs text-[#51534a] bg-transparent outline-none font-medium w-24" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                    <span className="text-[#51534a]">-</span>
                    <input type="date" className="text-xs text-[#51534a] bg-transparent outline-none font-medium w-24" value={toDate} onChange={e => setToDate(e.target.value)} />
                    {isDateRangeSelected && (
                        <button onClick={() => { setFromDate(''); setToDate(''); }} className="ml-1 text-[#B9975B] hover:text-[#968C83]"><X size={12} /></button>
                    )}
                </div>
              </div>
          </div>

          <div className="flex flex-col xl:flex-row gap-6">
            {/* Expanded Grid for Processing and Special States */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-center flex-1">
                <div>
                    <div className="text-[9px] text-[#A7BDB1] uppercase tracking-wider mb-0.5">Opening</div>
                    <div className="text-lg font-bold text-[#A7BDB1]">{formatNumber(getVal(stockSummary.total_opening_qty), 0)}</div>
                </div>
                <div>
                    <div className="text-[9px] text-[#97D700] uppercase tracking-wider mb-0.5">Inbound</div>
                    <div className="text-lg font-bold text-[#97D700]">{formatNumber(getVal(stockSummary.total_inbound_qty), 0)}</div>
                </div>
                {/* NEW: Processing Flow */}
                <div>
                    <div className="text-[9px] text-[#B9975B] uppercase tracking-wider mb-0.5">To Proc.</div>
                    <div className="text-lg font-bold text-[#B9975B]">{formatNumber(getVal(stockSummary.total_to_processing_qty), 0)}</div>
                </div>
                <div>
                    <div className="text-[9px] text-[#007680] uppercase tracking-wider mb-0.5">From Proc.</div>
                    <div className="text-lg font-bold text-[#007680]">{formatNumber(getVal(stockSummary.total_from_processing_qty), 0)}</div>
                </div>
                {/* NEW: Stock States */}
                <div>
                    <div className="text-[9px] text-[#E9C46A] uppercase tracking-wider mb-0.5">Blocked (B4P)</div>
                    <div className="text-lg font-bold text-[#E9C46A]">{formatNumber(getVal(stockSummary.total_b4p_qty), 0)}</div>
                </div>
                <div>
                    <div className="text-[9px] text-[#45B7D1] uppercase tracking-wider mb-0.5">WIP</div>
                    <div className="text-lg font-bold text-[#45B7D1]">{formatNumber(getVal(stockSummary.total_wip_qty), 0)}</div>
                </div>
                {/* Closing Stock */}
                <div className="bg-white/10 rounded px-2 py-1 border border-white/20">
                    <div className="text-[9px] text-[#97D700] uppercase tracking-wider mb-0.5">Closing Stock</div>
                    <div className="text-xl font-bold text-[#007680]">{formatNumber(getVal(stockSummary.total_xbs_closing_stock), 0)} <span className="text-[9px] text-white/50 font-normal">{unit}</span></div>
                </div>
            </div>

            <div className="xl:w-64 shrink-0 flex flex-col justify-end border-t xl:border-t-0 xl:border-l border-white/10 pt-4 xl:pt-0 xl:pl-6">
                <div className="text-[9px] text-[#A7BDB1] mb-2 uppercase tracking-wider text-center">Net Movement Flow</div>
                <FlowBarChart data={stockFlowData} height="h-12" />
            </div>
          </div>
      </Card>

      {/* 2. ACTIVITY INSPECTOR & PNL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4 border-t-4 border-t-[#007680]">
            <div className="flex flex-col lg:flex-row gap-4 mb-4 justify-between items-start lg:items-center border-b border-[#D6D2C4]/50 pb-4">
                <h3 className="font-bold text-[#51534a] text-sm flex items-center gap-2">
                    <BarChart3 size={16} className="text-[#007680]" />
                    Strategy & Grade Flow
                </h3>
                <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto lg:flex-1 lg:justify-end">
                    <select className="border border-[#D6D2C4] rounded p-1.5 text-xs text-[#51534a] outline-none focus:border-[#007680] bg-white min-w-[150px]" value={selectedStrategy} onChange={handleStrategyChange}>
                        <option value="">-- Inspect Strategy --</option>
                        {data.recentStrategyActivities?.map((s: any) => <option key={s.id} value={s.strategy}>{s.strategy}</option>)}
                    </select>
                    <select className="border border-[#D6D2C4] rounded p-1.5 text-xs text-[#51534a] outline-none focus:border-[#007680] bg-white min-w-[150px]" value={selectedGrade} onChange={handleGradeChange}>
                        <option value="">-- Inspect Grade --</option>
                        {data.recentGradeActivities?.map((g: any) => <option key={g.id} value={g.grade}>{g.grade}</option>)}
                    </select>
                </div>
            </div>
            
            <div className="bg-[#F5F5F3] rounded-lg p-3 border border-[#D6D2C4] min-h-[120px] flex items-center justify-center relative overflow-hidden">
                {!activeMetricData ? (
                    <div className="text-[#968C83] italic text-xs flex items-center gap-2"><Search size={14} /> Select a Strategy or Grade above to view specific flow.</div>
                ) : (
                    <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                        <div className="md:col-span-4 flex flex-col gap-3 border-r border-[#D6D2C4] pr-4">
                            <div className="text-center mb-1"><span className="bg-[#007680] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">{selectedStrategy || selectedGrade}</span></div>
                            <div className="flex justify-between items-center bg-white p-2 rounded shadow-sm border border-[#D6D2C4]">
                                <div className="text-[9px] text-[#968C83] uppercase">Opening</div>
                                <div className="font-bold text-[#51534a] text-sm">{formatNumber(getVal(activeMetricData.opening_qty), 0)}</div>
                            </div>
                            <div className="flex justify-between items-center bg-[#51534a] p-2 rounded shadow-sm border border-[#51534a]">
                                <div className="text-[9px] text-[#A7BDB1] uppercase">Closing</div>
                                <div className="font-bold text-white text-base">{formatNumber(getVal(activeMetricData.xbs_closing_stock), 0)}</div>
                            </div>
                        </div>
                        <div className="md:col-span-8">
                            <div className="text-[9px] text-[#968C83] mb-2 uppercase tracking-wider text-center">Volume Movement Analysis</div>
                            <FlowBarChart data={activityFlowData} height="h-24" />
                        </div>
                    </div>
                )}
            </div>
        </Card>

        <Card className="p-4 flex flex-col justify-center gap-2 bg-[#51534a] text-white">
            <div className='w-full flex justify-between'>
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-white/10 rounded-lg"><FlaskConical size={20} className="text-[#97D700]" /></div>
                    <h3 className="font-bold text-white">Processing P&L</h3>
                </div>
                <button onClick={() => router.push('/processing')} className="bg-white p-2 rounded-lg border border-[#D6D2C4] shadow-sm text-[#51534a] hover:bg-[#F5F5F3] hover:text-[#007680] transition-all" title="Go to processes">
                    <Cog size={18} />
                </button>
            </div>
            <div className="text-center py-4 border-y border-white/10 my-1">
                <div className={`text-3xl font-bold ${data.recentPnl >= 0 ? 'text-[#97D700]' : 'text-[#B9975B]'}`}>${formatNumber(data.recentPnl, 2)}</div>
                <div className="text-xs text-[#A7BDB1] mt-1">Net Profit/Loss</div>
            </div>
            <div className="text-center text-[10px] text-white/40">Calculated from daily processing records.</div>
        </Card>
      </div>

      {/* 3. LOGISTICS SUMMARY */}
      <Card className="p-4 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3 border-b border-[#D6D2C4] pb-1"><h3 className="font-bold text-[#51534a] text-sm flex items-center gap-2"><CloudUpload size={16} className="text-[#007680]" /> Transfer Logistics</h3></div>
            <div className="grid grid-cols-3 gap-2 divide-x divide-[#D6D2C4]">
                <div className="px-1 text-center"><div className="text-[9px] text-[#968C83] uppercase font-bold tracking-wider mb-1">Instructed</div><div className="text-lg font-bold text-[#007680]">{formatNumber(getVal(data.instructed.overall), 0)}</div><div className="text-[9px] text-[#968C83]">{unit.toUpperCase()}</div>{!fromDate && (<div className="mt-1 text-[8px] bg-[#007680]/10 text-[#007680] px-1.5 py-0.5 rounded-full inline-block">Last Week: {formatNumber(getVal(data.instructed.lastWeek), 0)}</div>)}</div>
                <div className="px-1 text-center"><div className="text-[9px] text-[#968C83] uppercase font-bold tracking-wider mb-1">Delivered</div><div className="text-lg font-bold text-[#008080]">{formatNumber(getVal(data.delivered.overall), 0)}</div><div className="text-[9px] text-[#008080]">{unit.toUpperCase()}</div>{!fromDate && (<div className="mt-1 text-[8px] bg-[#97D700]/10 text-[#008080] px-1.5 py-0.5 rounded-full inline-block">Last Week: {formatNumber(getVal(data.delivered.lastWeek), 0)}</div>)}</div>
                <div className="px-1 text-center"><div className="text-[9px] text-[#968C83] uppercase font-bold tracking-wider mb-1">Pending Rent</div><div className="text-lg font-bold text-[#B9975B]">${formatNumber(data.totalRentCosts, 0)}</div><div className="text-[9px] text-[#968C83]">USD (Est.)</div></div>
            </div>
      </Card>
      
      {/* 4. PENDING BATCHES & VARIANCES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4 flex flex-col h-64">
          <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-[#51534a] text-sm">Pending Batches by Location</h3><div className="text-[10px] text-[#968C83]">Total: {formatNumber(getVal(data.partiallyPendingVolume + data.fullyPendingVolume), 0)} {unit.toUpperCase()}</div></div>
          <div className="flex-1 flex gap-2 pb-2 overflow-x-auto custom-scrollbar">
            {locationChartData.length > 0 ? (
                locationChartData.map((item, idx) => {
                  const maxVal = Math.max(...locationChartData.map(d => getVal(d.value)));
                  const val = getVal(item.value);
                  const percent = maxVal > 0 ? (val / maxVal) * 100 : 0;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1 group flex-1 min-w-[50px] h-full">
                        <div className="relative w-full flex justify-center items-end flex-1 bg-[#F5F5F3] rounded-t overflow-hidden">
                           <div className="w-full bg-[#007680] hover:bg-[#007680]/80 transition-all duration-500 rounded-t-sm relative group-hover:shadow-lg flex items-center justify-center overflow-hidden" style={{ height: `${percent}%` }}>
                               <span className="text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap px-1">{formatNumber(val, 0)}</span>
                           </div>
                        </div>
                        <div className="text-[9px] text-[#51534a] font-medium text-center leading-tight h-6 flex items-center justify-center w-full break-words">{item.name || "Unknown"}</div>
                    </div>
                  );
                })
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#968C83] italic text-xs">No pending stock data</div>
            )}
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-3 border-b border-[#D6D2C4] pb-1"><h3 className="font-bold text-[#51534a] text-sm flex items-center gap-2"><AlertCircle size={16} className="text-[#B9975B]" /> Pending & Variances</h3></div>
              <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#F5F5F3] rounded p-2 text-center border border-[#D6D2C4]"><div className="text-[9px] text-[#968C83] uppercase font-bold tracking-wider mb-0.5">Fully</div><div className="text-base font-bold text-[#51534a]">{formatNumber(getVal(data.fullyPendingVolume), 0)}</div><div className="text-[8px] text-[#968C83]">{unit}</div></div>
                  <div className="bg-[#F5F5F3] rounded p-2 text-center border border-[#D6D2C4]"><div className="text-[9px] text-[#968C83] uppercase font-bold tracking-wider mb-0.5">Partially</div><div className="text-base font-bold text-[#007680]">{formatNumber(getVal(data.partiallyPendingVolume), 0)}</div><div className="text-[8px] text-[#968C83]">{unit}</div></div>
                  <div className={`rounded p-2 text-center border ${data.lossGain.overall >= 0 ? 'bg-[#97D700]/10 border-[#97D700]/30' : 'bg-[#B9975B]/10 border-[#B9975B]/30'}`}><div className="text-[9px] text-[#51534a] uppercase font-bold tracking-wider mb-0.5">Loss/Gain</div><div className={`text-base font-bold ${data.lossGain.overall >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>{data.lossGain.overall > 0 ? '+' : ''}{formatNumber(getVal(data.lossGain.overall), 0)}</div><div className="text-[8px] text-[#51534a]">{unit}</div></div>
              </div>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ title, value, subValue, unit, color }: any) {
    const colors: any = {
        blue: "border-l-[#007680] text-[#007680]",
        green: "border-l-[#97D700] text-[#97D700]",
        orange: "border-l-[#B9975B] text-[#B9975B]",
        red: "border-l-red-500 text-red-500",
    };

    return (
        <Card className={`p-4 border-l-4 ${colors[color] || colors.blue}`}>
            <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider uppercase">{title}</div>
            <div className="text-2xl font-bold text-[#51534a] mt-1">
                {value} <span className="text-sm font-normal text-[#968C83]">{unit.toUpperCase()}</span>
            </div>
            {subValue && <div className="text-[10px] text-[#968C83] mt-1">{subValue}</div>}
        </Card>
    );
}