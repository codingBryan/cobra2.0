"use client"
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, 
  Box, 
  TrendingDown, 
  TrendingUp,
  X,
  FileSpreadsheet,
  Pencil,
  Check,
  Search,
  CheckCircle,
  Circle,
  AlertCircle,
  RefreshCw,
  ArrowRightLeft,
  UserCheck,
  SlidersHorizontal,
  ListPlus,
  RotateCcw,
  ListChecks,
  Trash2,
  ChevronRight,
  Download,
  ChevronDown
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';

// --- Constants & Types ---
type Unit = 'kg' | 'bag' | 'mt';
type MainTab = 'position' | 'contracts' | 'stocks' | 'allocations';

const CONTRACT_QUALITIES = [
  "SPECIALTY",
  "AA - TOP", "AB - TOP", "PB - TOP", 
  "AA - PLUS", "AB - PLUS", "ABC - PLUS", "PB - PLUS", 
  "AA - FAQ", "AB - FAQ", "ABC - FAQ", "PB - FAQ", 
  "REJECTS", "MBUNIS", "TRIAGE", "GRINDER BOLD", "GRINDER LIGHT"
];

const CHART_COLORS = ['#007680', '#5B3427', '#B9975B', '#968C83', '#51534a', '#A4DBE8'];

interface SpecialtyLot {
  id: number;
  season: string;
  purchase_date: string;
  lot_number: string;
  sale_number?: string;
  broker?: string;
  hedge_level?: string;
  price_usd_50?: number | string;
  fobbing_cost?: number | string;
  outturn?: number;
  grower_marks?: string;
  grade?: string;
  purchased_weight?: number;
  allocated_weight?: number;
  fully_allocated?: boolean;
  to_commercial?: boolean;
  qc_strategy?: string;
  _valo?: number;
  _diff?: number;
  _pnl?: number;
}

interface SaleContract {
  id: number;
  contract_number: string;
  weight_kilos: number;
  shipping_date: string;
  strategy?: string; 
  quality?: string; 
  grade?: string; 
  client?: string; 
  executed?: boolean;
  pending_dispatch?: boolean;
}

interface AllocationDetail {
  allocation_id: number;
  lot_id: number;
  contract_id: number;
  allocated_weight: number | string;
  allocation_date: string;
  lot_number: string;
  grade: string;
  contract_number: string;
  client: string;
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

// Returns 1 decimal place for metric tons (mt), 0 for kg/bags
const getDecimals = (u: Unit) => u === 'mt' ? 1 : 0;

const unitText = (unit: Unit) => {
  return unit === "bag" ? "BAGS" : unit.toUpperCase();
};

const formatDateToMonthYear = (dateStr: string) => {
  if (!dateStr) return 'Unscheduled';
  const d = new Date(dateStr);
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return 'Unscheduled'; 
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const formatDateToStandard = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

function asNumber(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

// --- Reusable Components ---
const Card = ({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; }) => {
  return <div className={`rounded-xl shadow-sm bg-white border border-[#968C83]/20 ${className}`} style={style}>{children}</div>;
};

const MultiSelectDropdown = ({ 
    options, 
    selected, 
    onChange, 
    placeholder 
}: { 
    options: string[]; 
    selected: string[]; 
    onChange: (val: string[]) => void; 
    placeholder: string; 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="flex items-center justify-between w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-xs outline-none bg-[#F5F5F3] hover:border-[#007680] min-w-[140px]"
            >
                <span className="truncate font-medium text-[#51534a]">
                    {selected.length > 0 ? `${selected.length} ${placeholder}s Selected` : `All ${placeholder}s`}
                </span>
                <ChevronDown size={14} className="ml-2 text-[#968C83]" />
            </button>
            
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute z-20 mt-1 w-full min-w-[180px] bg-white border border-[#D6D2C4] rounded-lg shadow-xl max-h-60 overflow-y-auto">
                        {options.length === 0 ? (
                            <div className="px-3 py-3 text-xs text-[#968C83] text-center italic">No options</div>
                        ) : null}
                        {options.map(opt => {
                            const isChecked = selected.includes(opt);
                            return (
                                <label key={opt} className={`flex items-center gap-2 px-3 py-2 hover:bg-[#EAF8FA] cursor-pointer transition-colors ${isChecked ? 'bg-[#007680]/5' : ''}`}>
                                    <input 
                                        type="checkbox" 
                                        checked={isChecked}
                                        onChange={(e) => {
                                            if (e.target.checked) onChange([...selected, opt]);
                                            else onChange(selected.filter(s => s !== opt));
                                        }}
                                        className="rounded text-[#007680] focus:ring-[#007680] accent-[#007680] w-3.5 h-3.5"
                                    />
                                    <span className="text-xs text-[#51534a] truncate font-medium">{opt}</span>
                                </label>
                            )
                        })}
                        {selected.length > 0 && (
                            <div className="sticky bottom-0 bg-white border-t border-[#D6D2C4] p-2">
                                <button 
                                    onClick={() => { onChange([]); setIsOpen(false); }}
                                    className="w-full py-1 text-[10px] uppercase font-bold text-[#968C83] hover:text-[#5B3427] bg-[#F5F5F3] rounded"
                                >
                                    Clear Selection
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default function SpecialtyPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('stocks');
  const [unit, setUnit] = useState<Unit>('kg');

  // Data states
  const [sales, setSales] = useState<SaleContract[]>([]);
  const [lots, setLots] = useState<SpecialtyLot[]>([]);
  const [allocationsData, setAllocationsData] = useState<AllocationDetail[]>([]);
  const [strategyMappings, setStrategyMappings] = useState<Record<string, string>>({});
  const [strategyValos, setStrategyValos] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [showExecutedContracts, setShowExecutedContracts] = useState(false);
  const [contractSearch, setContractSearch] = useState('');
  
  // Multi-Selection State for Lots
  const [selectedLotIds, setSelectedLotIds] = useState<Set<number>>(new Set());

  // Action Modals State (Lots)
  const [isCommercialModalOpen, setIsCommercialModalOpen] = useState(false);
  const [isSpecialtyModalOpen, setIsSpecialtyModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);

  // Trade Variable Updates State
  const [tradeHedgeLevel, setTradeHedgeLevel] = useState('');
  const [tradeFobbingCost, setTradeFobbingCost] = useState('');
  const [isUpdatingTrade, setIsUpdatingTrade] = useState(false);

  // Allocate Lots Modal State
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [allocateContract, setAllocateContract] = useState<SaleContract | null>(null);
  const [allocateSearch, setAllocateSearch] = useState('');
  const [allocateGradeFilter, setAllocateGradeFilter] = useState('');
  const [allocateSeasonFilter, setAllocateSeasonFilter] = useState('');
  const [allocateSaleFilter, setAllocateSaleFilter] = useState('');
  const [allocateSelectedLots, setAllocateSelectedLots] = useState<Set<number>>(new Set());
  const [allocateVolumes, setAllocateVolumes] = useState<Record<number, string>>({}); 
  const [isAllocating, setIsAllocating] = useState(false);

  // Allocations Tab State
  const [selectedAllocationContractId, setSelectedAllocationContractId] = useState<number | null>(null);
  const [allocationSearch, setAllocationSearch] = useState('');
  const [allocationClientFilter, setAllocationClientFilter] = useState<string[]>([]);

  // Stocks Tab State
  const [stocksGradeFilter, setStocksGradeFilter] = useState<string[]>([]);
  const [stocksBrokerFilter, setStocksBrokerFilter] = useState<string[]>([]);
  const [stocksSeasonFilter, setStocksSeasonFilter] = useState<string[]>([]);
  const [stocksDateFrom, setStocksDateFrom] = useState('');
  const [stocksDateTo, setStocksDateTo] = useState('');
  const [stocksSearch, setStocksSearch] = useState('');
  const [pnlPivotBy, setPnlPivotBy] = useState<'qc_strategy' | 'season' | 'grade'>('qc_strategy');
  const [selectedPnlKeys, setSelectedPnlKeys] = useState<Set<string>>(new Set());
  
  const [hideFullyAllocated, setHideFullyAllocated] = useState(true);
  const [hideMovedToCommercial, setHideMovedToCommercial] = useState(true);

  const COBRA_SERVICE = process.env.NEXT_PUBLIC_COBRA_MICROSERVICE_URL;
  const fetchData = useCallback(async (showLoadingIndicator = false, signal?: AbortSignal) => {
    try {
      if (showLoadingIndicator) setLoading(true);
      const fetchOptions: RequestInit = { cache: 'no-store' };
      if (signal) fetchOptions.signal = signal;

      const [salesData, lotsData, allocsData, mapData, valoData] = await Promise.all([
          fetch('/api/contracts', fetchOptions).then(res => res.ok ? res.json() : []).catch(() => []),
          fetch('/api/specialty_lots', fetchOptions).then(res => res.ok ? res.json() : []).catch(() => []),
          fetch('/api/specialty_allocations', fetchOptions).then(res => res.ok ? res.json() : []).catch(() => []),
          fetch(COBRA_SERVICE+'/get_strategy_mappings', fetchOptions).then(res => res.ok ? res.json() : {}).catch(() => ({})),
          fetch(COBRA_SERVICE+'/get_strategy_valos', fetchOptions).then(res => res.ok ? res.json() : {}).catch(() => ({}))
      ]);
      
      // O(1) Lookup Inversion for Mapping
      const invertedMap: Record<string, string> = {};
      Object.entries(mapData || {}).forEach(([stdStrat, rawStrats]) => {
          if (Array.isArray(rawStrats)) {
              rawStrats.forEach(raw => invertedMap[typeof raw === 'string' ? raw.trim().toLowerCase() : String(raw)] = stdStrat);
          }
      });
      setStrategyMappings(invertedMap);
      
      // O(1) Lookup Normalization for Valos to prevent case sensitivity misses
      const normalizedValos: Record<string, number> = {};
      Object.entries(valoData || {}).forEach(([k, v]) => {
          normalizedValos[k.trim().toUpperCase()] = Number(v);
      });
      setStrategyValos(normalizedValos);

      setSales(Array.isArray(salesData) ? salesData : (salesData?.data || salesData?.rows || []));
      setLots(Array.isArray(lotsData) ? lotsData : (lotsData?.data || lotsData?.rows || []));
      setAllocationsData(Array.isArray(allocsData) ? allocsData : (allocsData?.data || allocsData?.rows || []));
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      if (showLoadingIndicator) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); 

    fetchData(true, controller.signal);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [fetchData]);

  const handleUnitChange = (newUnit: Unit) => {
      if (newUnit === unit) return;
      const newVols = { ...allocateVolumes };
      for (const id of Object.keys(newVols)) {
          const lotId = Number(id);
          const valInOldUnit = Number(newVols[lotId]);
          if (!isNaN(valInOldUnit)) {
              let kgVal = valInOldUnit;
              if (unit === 'bag') kgVal = valInOldUnit * 60;
              if (unit === 'mt') kgVal = valInOldUnit * 1000;
              newVols[lotId] = convertQty(kgVal, newUnit).toString();
          }
      }
      setAllocateVolumes(newVols);
      setUnit(newUnit);
  };

  // --- Data Processing Hook (Valo & PNL Math) ---
  const processedLots = useMemo(() => {
      return lots.map(lot => {
          let _valo = 0, _diff = 0, _pnl = 0;
          
          if (lot.qc_strategy) {
              const rawStrat = lot.qc_strategy.trim();
              const stdStrat = strategyMappings[rawStrat.toLowerCase()] || rawStrat;
              _valo = strategyValos[stdStrat.toUpperCase()] || 0;
              
              const price = Number(lot.price_usd_50) || 0;
              const fobbing = Number(lot.fobbing_cost) || 0;
              const hedge = Number(lot.hedge_level) || 0;
              
              // Precalculated multiplier: 0.5 * 0.453592
              _diff = (price + fobbing) * 0.226796 - hedge;
              
              const avail = Math.max(0, asNumber(lot.purchased_weight) - asNumber(lot.allocated_weight));
              // Precalculated multiplier: 2.2046 / 100
              _pnl = (_valo - _diff) * (avail * 0.022046);
          }
          return { ...lot, _valo, _diff, _pnl };
      });
  }, [lots, strategyMappings, strategyValos]);


  // --- Derived Calculations ---
  const specialtyContracts = useMemo(() => {
    return sales.filter(s => (s.quality || s.strategy) === 'SPECIALTY');
  }, [sales]);

  const contractAllocationTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    for (let i = 0; i < allocationsData.length; i++) {
        const a = allocationsData[i];
        totals[a.contract_id] = (totals[a.contract_id] || 0) + asNumber(a.allocated_weight);
    }
    return totals;
  }, [allocationsData]);

  const { totalTheoretical, totalShorts, netPosition, monthShipments, sortedMonths } = useMemo(() => {
    let validPurchasedSum = 0;
    let validAllocatedSum = 0;
    let shortsSum = 0;
    const monthGroupings: Record<string, number> = {};

    for (let i = 0; i < lots.length; i++) {
        const lot = lots[i];
        if (!bool(lot.fully_allocated) && !bool(lot.to_commercial)) {
            validPurchasedSum += asNumber(lot.purchased_weight);
            validAllocatedSum += asNumber(lot.allocated_weight);
        }
    }
    const theoretical = validPurchasedSum - validAllocatedSum;

    for (let i = 0; i < specialtyContracts.length; i++) {
        const contract = specialtyContracts[i];
        if (!bool(contract.executed)) {
            const totalWeight = asNumber(contract.weight_kilos);
            const allocatedWeight = contractAllocationTotals[contract.id] || 0;
            const unallocatedWeight = Math.max(0, totalWeight - allocatedWeight);

            if (unallocatedWeight > 0) {
                shortsSum += unallocatedWeight;
                const mKey = formatDateToMonthYear(contract.shipping_date);
                monthGroupings[mKey] = (monthGroupings[mKey] || 0) + unallocatedWeight;
            }
        }
    }

    const sorted = Object.keys(monthGroupings).sort((a, b) => {
        if (a === 'Unscheduled') return 1;
        if (b === 'Unscheduled') return -1;
        return new Date(a).getTime() - new Date(b).getTime();
    });

    return { totalTheoretical: theoretical, totalShorts: shortsSum, netPosition: theoretical - shortsSum, monthShipments: monthGroupings, sortedMonths: sorted };
  }, [lots, specialtyContracts, contractAllocationTotals]);

  // --- Stocks Tab Computations ---
  const stocksFilterOptions = useMemo(() => {
      const grades = new Set<string>();
      const brokers = new Set<string>();
      const seasons = new Set<string>();
      processedLots.forEach(l => {
          if (l.grade) grades.add(l.grade);
          if (l.broker) brokers.add(l.broker);
          if (l.season) seasons.add(l.season);
      });
      return {
          grades: Array.from(grades).sort(),
          brokers: Array.from(brokers).sort(),
          seasons: Array.from(seasons).sort()
      };
  }, [processedLots]);

  const filteredStocks = useMemo(() => {
      const gradesSet = new Set(stocksGradeFilter);
      const brokersSet = new Set(stocksBrokerFilter);
      const seasonsSet = new Set(stocksSeasonFilter);
      const searchQuery = stocksSearch.toLowerCase();

      return processedLots.filter(lot => {
          if (hideFullyAllocated && bool(lot.fully_allocated)) return false;
          if (hideMovedToCommercial && bool(lot.to_commercial)) return false;
          
          if (gradesSet.size > 0 && (!lot.grade || !gradesSet.has(lot.grade))) return false;
          if (brokersSet.size > 0 && (!lot.broker || !brokersSet.has(lot.broker))) return false;
          if (seasonsSet.size > 0 && (!lot.season || !seasonsSet.has(lot.season))) return false;
          
          if (stocksDateFrom && new Date(lot.purchase_date) < new Date(stocksDateFrom)) return false;
          if (stocksDateTo && new Date(lot.purchase_date) > new Date(stocksDateTo)) return false;
          
          if (searchQuery) {
              const match = (
                  (lot.lot_number && lot.lot_number.toLowerCase().includes(searchQuery)) ||
                  (lot.grower_marks && lot.grower_marks.toLowerCase().includes(searchQuery)) ||
                  (lot.sale_number && lot.sale_number.toLowerCase().includes(searchQuery)) ||
                  (lot.broker && lot.broker.toLowerCase().includes(searchQuery))
              );
              if (!match) return false;
          }
          
          return true;
      });
  }, [processedLots, hideFullyAllocated, hideMovedToCommercial, stocksGradeFilter, stocksBrokerFilter, stocksSeasonFilter, stocksDateFrom, stocksDateTo, stocksSearch]);

  const allSelectedAreCommercial = useMemo(() => {
      if (selectedLotIds.size === 0) return false;
      for (const lot of filteredStocks) {
          if (selectedLotIds.has(lot.id) && !bool(lot.to_commercial)) {
              return false;
          }
      }
      return true;
  }, [selectedLotIds, filteredStocks]);

  const stocksSummary = useMemo(() => {
      let totalPurchased = 0;
      let totalAllocated = 0;
      let totalValue = 0;
      let weightWithPrice = 0;
      let totalPNL = 0;
      
      const gradeDist: Record<string, number> = {};
      const brokerDist: Record<string, number> = {};
      const pivotAgg: Record<string, number> = {};

      filteredStocks.forEach(lot => {
          const pWeight = asNumber(lot.purchased_weight);
          const aWeight = asNumber(lot.allocated_weight);
          const available = Math.max(0, pWeight - aWeight);
          
          totalPurchased += pWeight;
          totalAllocated += aWeight;
          totalPNL += lot._pnl || 0;

          if (available > 0) {
              const grade = lot.grade || 'Unknown';
              gradeDist[grade] = (gradeDist[grade] || 0) + available;
              
              const broker = lot.broker || 'Unknown';
              brokerDist[broker] = (brokerDist[broker] || 0) + available;
          }

          if (lot.price_usd_50 && pWeight > 0) {
              totalValue += (Number(lot.price_usd_50) * pWeight);
              weightWithPrice += pWeight;
          }
          
          const pivotKey = String(lot[pnlPivotBy as keyof typeof lot] || 'Unknown');
          pivotAgg[pivotKey] = (pivotAgg[pivotKey] || 0) + (lot._pnl || 0);
      });

      const weightedAvgPrice = weightWithPrice > 0 ? (totalValue / weightWithPrice) : 0;
      
      return {
          totalPurchased,
          totalAllocated,
          totalAvailable: Math.max(0, totalPurchased - totalAllocated),
          weightedAvgPrice,
          totalPNL,
          gradeChart: Object.entries(gradeDist).map(([name, value]) => ({ name, value: convertQty(value, unit) })).sort((a, b) => b.value - a.value),
          brokerChart: Object.entries(brokerDist).map(([name, value]) => ({ name, value: convertQty(value, unit) })).sort((a, b) => b.value - a.value),
          pnlPivot: Object.entries(pivotAgg).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
      };
  }, [filteredStocks, unit, pnlPivotBy]);

  const displayedTotalPnl = useMemo(() => {
      if (selectedPnlKeys.size === 0) return stocksSummary.totalPNL;
      let sum = 0;
      for (let i = 0; i < stocksSummary.pnlPivot.length; i++) {
          if (selectedPnlKeys.has(stocksSummary.pnlPivot[i].name)) {
              sum += stocksSummary.pnlPivot[i].value;
          }
      }
      return sum;
  }, [stocksSummary, selectedPnlKeys]);

  // --- Allocations Tab Derived Data ---
  const groupedAllocations = useMemo(() => {
    const groups: Record<number, { 
        contract_id: number, 
        contract_number: string, 
        client: string, 
        total_weight: number, 
        total_value: number, 
        total_hedge: number,
        total_fobbing: number,
        details: AllocationDetail[],
        weighted_avg_price?: number,
        weighted_avg_hedge?: number,
        weighted_avg_fobbing?: number
    }> = {};

    const lotPriceMap = new Map();
    const lotHedgeMap = new Map();
    const lotFobbingMap = new Map();

    for (let i = 0; i < lots.length; i++) {
        lotPriceMap.set(lots[i].id, Number(lots[i].price_usd_50) || 0);
        lotHedgeMap.set(lots[i].id, Number(lots[i].hedge_level) || 0);
        lotFobbingMap.set(lots[i].id, Number(lots[i].fobbing_cost) || 0);
    }

    for(let i=0; i<allocationsData.length; i++){
        const a = allocationsData[i];
        if (!groups[a.contract_id]) {
            groups[a.contract_id] = { 
                contract_id: a.contract_id, 
                contract_number: a.contract_number, 
                client: a.client, 
                total_weight: 0, 
                total_value: 0, 
                total_hedge: 0,
                total_fobbing: 0,
                details: [] 
            };
        }
        
        const w = asNumber(a.allocated_weight);
        const p = lotPriceMap.get(a.lot_id) || 0;
        const h = lotHedgeMap.get(a.lot_id) || 0;
        const f = lotFobbingMap.get(a.lot_id) || 0;
        
        groups[a.contract_id].total_weight += w;
        groups[a.contract_id].total_value += (w * p);
        groups[a.contract_id].total_hedge += (w * h);
        groups[a.contract_id].total_fobbing += (w * f);
        groups[a.contract_id].details.push(a);
    }

    return Object.values(groups).map(g => ({
        ...g,
        weighted_avg_price: g.total_weight > 0 ? (g.total_value / g.total_weight) : 0,
        weighted_avg_hedge: g.total_weight > 0 ? (g.total_hedge / g.total_weight) : 0,
        weighted_avg_fobbing: g.total_weight > 0 ? (g.total_fobbing / g.total_weight) : 0
    })).sort((a, b) => b.total_weight - a.total_weight);
  }, [allocationsData, lots]);

  const allocationFilterOptions = useMemo(() => {
      const clients = new Set<string>();
      groupedAllocations.forEach(g => {
          if (g.client) clients.add(g.client);
      });
      return { clients: Array.from(clients).sort() };
  }, [groupedAllocations]);

  const filteredGroupedAllocations = useMemo(() => {
      const clientSet = new Set(allocationClientFilter);
      const query = allocationSearch.toLowerCase();
      
      return groupedAllocations.filter(group => {
          if (clientSet.size > 0 && (!group.client || !clientSet.has(group.client))) return false;
          if (query) {
              const match = (
                  (group.contract_number && group.contract_number.toLowerCase().includes(query)) ||
                  (group.client && group.client.toLowerCase().includes(query))
              );
              if (!match) return false;
          }
          return true;
      });
  }, [groupedAllocations, allocationSearch, allocationClientFilter]);

  const activeAllocationGroup = useMemo(() => {
      if (!selectedAllocationContractId && filteredGroupedAllocations.length > 0) {
          return filteredGroupedAllocations[0];
      }
      return filteredGroupedAllocations.find(g => g.contract_id === selectedAllocationContractId) || (filteredGroupedAllocations[0] || null);
  }, [filteredGroupedAllocations, selectedAllocationContractId]);

  const allocationChartData = useMemo(() => {
      if (!activeAllocationGroup) return [];
      const grades: Record<string, number> = {};
      activeAllocationGroup.details.forEach(d => {
          const gName = d.grade || 'Unknown';
          grades[gName] = (grades[gName] || 0) + convertQty(asNumber(d.allocated_weight), unit);
      });
      return Object.entries(grades).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [activeAllocationGroup, unit]);

  // --- Core Action Handlers ---
  const handleDeleteAllocation = async (contractId: number, isSingleLot = false, allocationId?: number) => {
      const confirmMsg = isSingleLot 
          ? "Are you sure you want to remove this lot from the allocation? The weight will be returned to unallocated stock."
          : "Are you sure you want to delete this ENTIRE allocation? All associated weights will be returned to unallocated stock.";
          
      if (!window.confirm(confirmMsg)) return;

      try {
          const url = `/api/specialty_allocations?${isSingleLot ? `allocation_id=${allocationId}` : `contract_id=${contractId}`}`;
          const res = await fetch(url, { method: 'DELETE' });
          if (!res.ok) throw new Error("Failed to delete allocation");
          
          await fetchData();
      } catch (error: any) {
          alert(`Error: ${error.message}`);
      }
  };

  const handleConfirmAllocation = async () => {
      if (!allocateContract || allocateSelectedLots.size === 0) return;
      setIsAllocating(true);
      const allocationsInKg = Array.from(allocateSelectedLots).map(lotId => {
          const volInCurrentUnit = Number(allocateVolumes[lotId]);
          let volInKg = volInCurrentUnit;
          if (unit === 'bag') volInKg = volInCurrentUnit * 60;
          if (unit === 'mt') volInKg = volInCurrentUnit * 1000;
          return { lot_id: lotId, allocated_weight: volInKg };
      });
      try {
          const res = await fetch('/api/specialty_allocations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contract_id: allocateContract.id, allocations: allocationsInKg })
          });
          if (!res.ok) throw new Error((await res.json()).error || 'Allocation failed');
          
          setIsAllocateModalOpen(false);
          await fetchData();
      } catch (error: any) {
          alert(`Error allocating lots: ${error.message}`);
      } finally {
          setIsAllocating(false);
      }
  };

  const handleConfirmMoveToCommercial = async () => {
      const lotIds = Array.from(selectedLotIds);
      if (lotIds.length === 0) return;

      try {
          const res = await fetch('/api/specialty_allocations', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'move_to_commercial', lotIds })
          });
          
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to move lots');
          
          if (data.movedLots && data.movedLots.length > 0) {
              const headers = Object.keys(data.movedLots[0]).join(',');
              const rows = data.movedLots.map((lot: any) => 
                  Object.values(lot).map(val => `"${val || ''}"`).join(',')
              ).join('\n');
              
              const csvContent = `${headers}\n${rows}`;
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              
              const link = document.createElement("a");
              link.setAttribute("href", url);
              link.setAttribute("download", `Commercial_Moved_Lots_${new Date().toISOString().split('T')[0]}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
          }

          if (data.affectedRows === 0) {
              alert("No lots were moved. Ensure selected lots are not already fully allocated.");
          } else if (data.affectedRows < lotIds.length) {
              alert(`Moved ${data.affectedRows} lot(s). Some lots were skipped because they are fully allocated.`);
          }

          setIsCommercialModalOpen(false);
          await fetchData();
      } catch (error: any) {
          alert(`Error: ${error.message}`);
      }
  };

  const handleConfirmMoveToSpecialty = async () => {
      const lotIds = Array.from(selectedLotIds);
      if (lotIds.length === 0) return;

      try {
          const res = await fetch('/api/specialty_allocations', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'move_to_specialty', lotIds })
          });
          
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to move lots back to specialty');

          if (data.affectedRows === 0) {
              alert("No lots were moved back.");
          }

          setIsSpecialtyModalOpen(false);
          setSelectedLotIds(new Set());
          await fetchData();
      } catch (error: any) {
          alert(`Error: ${error.message}`);
      }
  };

  const handleConfirmTradeUpdate = async () => {
      const lotIds = Array.from(selectedLotIds);
      if (lotIds.length === 0) return;

      const updates: Record<string, any> = {};
      if (tradeHedgeLevel.trim() !== '') updates.hedge_level = tradeHedgeLevel;
      if (tradeFobbingCost.trim() !== '') updates.fobbing_cost = Number(tradeFobbingCost);

      if (Object.keys(updates).length === 0) {
          alert("Please enter a value to update.");
          return;
      }

      setIsUpdatingTrade(true);
      try {
          const res = await fetch('/api/specialty_lots', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: lotIds, updates })
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to update lots');

          setIsTradeModalOpen(false);
          setTradeHedgeLevel('');
          setTradeFobbingCost('');
          setSelectedLotIds(new Set());
          await fetchData();
      } catch (error: any) {
          alert(`Error updating trade variables: ${error.message}`);
      } finally {
          setIsUpdatingTrade(false);
      }
  };

  const handleExportStocks = () => {
      if (filteredStocks.length === 0) return;
      const headers = ["Lot Number", "Season", "Purchase Date", "Sale No", "QC Strategy", "Grade", "Outturn", "Purchased Weight", "Allocated Weight", "Fully Allocated", "Price ($/50)", "Fobbing Cost", "Hedge Level", "Differential", "Valo", "Est PNL", "To Commercial"].join(',');
      const rows = filteredStocks.map(lot => 
          [
              `"${lot.lot_number || ''}"`,
              `"${lot.season || ''}"`,
              `"${formatDateToStandard(lot.purchase_date)}"`,
              `"${lot.sale_number || ''}"`,
              `"${lot.grower_marks || ''}"`,
              `"${lot.grade || ''}"`,
              `"${lot.outturn || ''}"`,
              asNumber(lot.purchased_weight),
              asNumber(lot.allocated_weight),
              bool(lot.fully_allocated) ? 'Yes' : 'No',
              lot.price_usd_50 ?? '',
              lot.fobbing_cost ?? '',
              `"${lot.hedge_level || ''}"`,
              lot._diff != null ? lot._diff.toFixed(2) : '',
              lot._valo != null ? lot._valo.toFixed(2) : '',
              lot._pnl != null ? lot._pnl.toFixed(2) : '',
              bool(lot.to_commercial) ? 'Yes' : 'No'
          ].join(',')
      ).join('\n');
      
      const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Stocks_Export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // --- Interactions ---
  const handleSelectAllLots = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          setSelectedLotIds(new Set(filteredStocks.map(l => l.id)));
      } else {
          setSelectedLotIds(new Set());
      }
  };

  const handleSelectLot = (id: number, checked: boolean) => {
      const newSet = new Set(selectedLotIds);
      if (checked) newSet.add(id);
      else newSet.delete(id);
      setSelectedLotIds(newSet);
  };

  const openAllocateModal = (contract: SaleContract) => {
      setAllocateContract(contract);
      setAllocateSelectedLots(new Set());
      setAllocateVolumes({});
      setIsAllocateModalOpen(true);
  };

  const handleAllocateLotSelect = (lotId: number, checked: boolean, availableKg: number) => {
      setAllocateSelectedLots(prev => {
          const next = new Set(prev);
          if (checked) next.add(lotId);
          else next.delete(lotId);
          return next;
      });
      
      setAllocateVolumes(prev => {
          const next = { ...prev };
          if (checked) {
              const targetWt = asNumber(allocateContract?.weight_kilos);
              const allocatedWt = contractAllocationTotals[allocateContract?.id || 0] || 0;
              const remainingContractKg = Math.max(0, targetWt - allocatedWt);
              
              let currentSelectedKg = 0;
              Object.values(prev).forEach(vol => {
                  let vNum = Number(vol);
                  if (unit === 'bag') vNum *= 60;
                  if (unit === 'mt') vNum *= 1000;
                  currentSelectedKg += vNum;
              });

              const maxAllowedKg = Math.max(0, remainingContractKg - currentSelectedKg);
              const fillKg = Math.min(availableKg, maxAllowedKg);

              if (!next[lotId]) {
                  next[lotId] = convertQty(fillKg > 0 ? fillKg : availableKg, unit).toString();
              }
          } else {
              delete next[lotId];
          }
          return next;
      });
  };

  const handleAllocateVolumeChange = (lotId: number, val: string, availableKg: number) => {
      const maxVolInUnit = convertQty(availableKg, unit);
      let num = Number(val);
      
      setAllocateVolumes(prev => {
          const next = { ...prev };
          if (num > maxVolInUnit) {
              next[lotId] = maxVolInUnit.toString();
          } else {
              next[lotId] = val;
          }
          return next;
      });
  };

  const handleAllocateSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      const checked = e.target.checked;
      
      setAllocateSelectedLots(prev => {
          const next = new Set(prev);
          filteredAllocatableLots.forEach(lot => {
              if (checked) next.add(lot.id);
              else next.delete(lot.id);
          });
          return next;
      });
      
      setAllocateVolumes(prev => {
          const next = { ...prev };
          if (checked) {
              const targetWt = asNumber(allocateContract?.weight_kilos);
              const allocatedWt = contractAllocationTotals[allocateContract?.id || 0] || 0;
              let remainingContractKg = Math.max(0, targetWt - allocatedWt);

              filteredAllocatableLots.forEach(lot => {
                  const availKg = asNumber(lot.purchased_weight) - asNumber(lot.allocated_weight);
                  const fillKg = Math.min(availKg, remainingContractKg);
                  
                  if (fillKg > 0) {
                      next[lot.id] = convertQty(fillKg, unit).toString();
                      remainingContractKg -= fillKg;
                  } else {
                      next[lot.id] = "0";
                  }
              });
          } else {
              filteredAllocatableLots.forEach(lot => delete next[lot.id]);
          }
          return next;
      });
  };

  const handleAllocateReset = () => {
      setAllocateSelectedLots(new Set());
      setAllocateVolumes({});
  };

  // --- Filter Derivations ---
  const gradeDistributionData = useMemo(() => {
    const grades: Record<string, number> = {};
    processedLots.forEach(lot => {
        if (!bool(lot.fully_allocated) && !bool(lot.to_commercial)) {
            const availableVolume = Math.max(0, asNumber(lot.purchased_weight) - asNumber(lot.allocated_weight));
            if (availableVolume > 0) {
                const g = lot.grade || 'Unknown';
                grades[g] = (grades[g] || 0) + convertQty(availableVolume, unit);
            }
        }
    });
    return Object.entries(grades).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [processedLots, unit]);

  const clientUnexecutedData = useMemo(() => {
    const clients: Record<string, number> = {};
    specialtyContracts.forEach(contract => {
        if (!bool(contract.executed)) {
            const targetWt = asNumber(contract.weight_kilos);
            const allocatedWt = contractAllocationTotals[contract.id] || 0;
            const unallocatedWt = Math.max(0, targetWt - allocatedWt);

            if (unallocatedWt > 0) {
                const cName = contract.client || 'Unknown';
                clients[cName] = (clients[cName] || 0) + convertQty(unallocatedWt, unit);
            }
        }
    });
    return Object.entries(clients).map(([name, weight]) => ({ name, weight })).sort((a, b) => b.weight - a.weight);
  }, [specialtyContracts, contractAllocationTotals, unit]);

  const filteredContracts = useMemo(() => {
    return specialtyContracts.filter(sale => {
      if (!showExecutedContracts && bool(sale.executed)) return false;
      if (contractSearch) {
        const q = contractSearch.toLowerCase();
        return [sale.contract_number, sale.client, sale.quality, sale.grade].some(val => String(val || '').toLowerCase().includes(q));
      }
      return true;
    });
  }, [specialtyContracts, showExecutedContracts, contractSearch]);

  const allocatableLots = useMemo(() => {
    return processedLots.filter(lot => {
        const available = asNumber(lot.purchased_weight) - asNumber(lot.allocated_weight);
        return !bool(lot.fully_allocated) && !bool(lot.to_commercial) && available > 0;
    });
  }, [processedLots]);

  const allocateFilterOptions = useMemo(() => {
      const grades = new Set<string>();
      const seasons = new Set<string>();
      const salesNo = new Set<string>();
      allocatableLots.forEach(l => {
          if (l.grade) grades.add(l.grade);
          if (l.season) seasons.add(l.season);
          if (l.sale_number) salesNo.add(l.sale_number);
      });
      return {
          grades: Array.from(grades).sort(),
          seasons: Array.from(seasons).sort(),
          sales: Array.from(salesNo).sort()
      };
  }, [allocatableLots]);

  const filteredAllocatableLots = useMemo(() => {
    return allocatableLots.filter(lot => {
        if (allocateGradeFilter && lot.grade !== allocateGradeFilter) return false;
        if (allocateSeasonFilter && lot.season !== allocateSeasonFilter) return false;
        if (allocateSaleFilter && lot.sale_number !== allocateSaleFilter) return false;
        if (allocateSearch) {
            const q = allocateSearch.toLowerCase();
            return [lot.lot_number, lot.grower_marks, lot.broker].some(v => String(v || '').toLowerCase().includes(q));
        }
        return true;
    });
  }, [allocatableLots, allocateGradeFilter, allocateSeasonFilter, allocateSaleFilter, allocateSearch]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#D6D2C4] flex flex-col items-center justify-center text-[#51534a] font-bold gap-4">
        <RefreshCw className="animate-spin text-[#007680]" size={40} />
        <div>Loading Specialty Data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#D6D2C4] font-sans text-[#51534a] relative overflow-x-hidden">
        
      {/* --- MOCK MODALS FOR STOCKS ACTIONS --- */}
      {isCommercialModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full text-center">
                  <ArrowRightLeft size={32} className="mx-auto text-[#007680] mb-3" />
                  <h3 className="font-bold text-[#51534a] mb-2">Move to Commercial</h3>
                  <p className="text-sm text-[#968C83] mb-6">Are you sure you want to move {selectedLotIds.size} lot(s) to the commercial tracker?</p>
                  <div className="flex gap-2 justify-center">
                      <button onClick={() => setIsCommercialModalOpen(false)} className="px-4 py-2 text-sm font-bold text-[#968C83] bg-[#F5F5F3] rounded-lg">Cancel</button>
                      <button onClick={handleConfirmMoveToCommercial} className="px-4 py-2 text-sm font-bold text-white bg-[#007680] rounded-lg">Confirm Move</button>
                  </div>
              </div>
          </div>
      )}

      {isSpecialtyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full text-center">
                  <ArrowRightLeft size={32} className="mx-auto text-[#007680] mb-3" />
                  <h3 className="font-bold text-[#51534a] mb-2">Move to Specialty</h3>
                  <p className="text-sm text-[#968C83] mb-6">Are you sure you want to move {selectedLotIds.size} lot(s) back to the specialty tracker?</p>
                  <div className="flex gap-2 justify-center">
                      <button onClick={() => setIsSpecialtyModalOpen(false)} className="px-4 py-2 text-sm font-bold text-[#968C83] bg-[#F5F5F3] rounded-lg">Cancel</button>
                      <button onClick={handleConfirmMoveToSpecialty} className="px-4 py-2 text-sm font-bold text-white bg-[#007680] rounded-lg">Confirm Move</button>
                  </div>
              </div>
          </div>
      )}

      {isClientModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full">
                  <h3 className="font-bold text-[#51534a] mb-4 flex items-center gap-2"><UserCheck size={18} className="text-[#007680]"/> Allocate to Client</h3>
                  <input type="text" placeholder="Enter Client Name" className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:ring-2 focus:ring-[#007680]" />
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setIsClientModalOpen(false)} className="px-4 py-2 text-sm font-bold text-[#968C83] bg-[#F5F5F3] rounded-lg">Cancel</button>
                      <button onClick={() => setIsClientModalOpen(false)} className="px-4 py-2 text-sm font-bold text-white bg-[#007680] rounded-lg">Allocate</button>
                  </div>
              </div>
          </div>
      )}

      {isTradeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full">
                  <h3 className="font-bold text-[#51534a] mb-2 flex items-center gap-2">
                      <SlidersHorizontal size={18} className="text-[#007680]"/> Update Trade Variables
                  </h3>
                  <p className="text-xs text-[#968C83] mb-4">
                      Updating {selectedLotIds.size} selected lot(s). Leave a field blank to keep current values.
                  </p>
                  
                  <div className="space-y-3 mb-5">
                      <div>
                          <label className="text-xs font-bold text-[#51534a] mb-1 block">Hedge Level</label>
                          <input 
                              type="text" 
                              placeholder="e.g. M24 or -5" 
                              value={tradeHedgeLevel}
                              onChange={(e) => setTradeHedgeLevel(e.target.value)}
                              className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" 
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-[#51534a] mb-1 block">Fobbing Cost</label>
                          <input 
                              type="number" 
                              step="0.01"
                              placeholder="0.00" 
                              value={tradeFobbingCost}
                              onChange={(e) => setTradeFobbingCost(e.target.value)}
                              className="w-full border border-[#D6D2C4] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" 
                          />
                      </div>
                  </div>

                  <div className="flex justify-end gap-2">
                      <button 
                          onClick={() => { 
                              setIsTradeModalOpen(false); 
                              setTradeHedgeLevel(''); 
                              setTradeFobbingCost(''); 
                          }} 
                          disabled={isUpdatingTrade}
                          className="px-4 py-2 text-sm font-bold text-[#968C83] bg-[#F5F5F3] hover:bg-[#D6D2C4] rounded-lg transition-colors disabled:opacity-50"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={handleConfirmTradeUpdate} 
                          disabled={isUpdatingTrade || selectedLotIds.size === 0}
                          className="px-4 py-2 text-sm font-bold text-white bg-[#007680] hover:bg-[#007680]/90 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                      >
                          {isUpdatingTrade ? <RefreshCw size={14} className="animate-spin" /> : null}
                          Update Lots
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- ALLOCATE TO CONTRACT MODAL --- */}
      {isAllocateModalOpen && allocateContract && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="bg-white w-full max-w-5xl rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh]">
                  
                  <div className="flex items-center justify-between px-6 py-4 border-b border-[#D6D2C4] bg-[#F5F5F3]">
                      <div>
                          <h3 className="font-bold text-[#51534a] flex items-center gap-2 text-lg">
                              <ListPlus size={20} className="text-[#007680]" /> 
                              Contract: {allocateContract.contract_number}
                          </h3>
                          <p className="text-sm font-bold text-[#007680] mt-1 bg-[#007680]/10 inline-block px-2 py-0.5 rounded">
                              Client: {allocateContract.client || 'Unspecified Client'}
                          </p>
                      </div>
                      <div className="flex items-center gap-4">
                          <div className="flex items-center bg-[#EAF8FA] p-1 rounded-lg border border-[#007680]/20">
                            {(['kg', 'bag', 'mt'] as Unit[]).map((u) => (
                              <button 
                                key={u} 
                                onClick={() => handleUnitChange(u)} 
                                className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${unit === u ? 'bg-[#007680] text-white shadow-sm' : 'text-[#007680] hover:bg-[#007680]/10'}`}
                              >
                                {u.toUpperCase()}
                              </button>
                            ))}
                          </div>
                          <button onClick={() => setIsAllocateModalOpen(false)} className="text-[#968C83] hover:text-[#51534a] p-1.5 rounded-full hover:bg-[#D6D2C4]/50 transition-colors">
                              <X size={20} />
                          </button>
                      </div>
                  </div>
                  
                  <div className="p-5 border-b border-[#D6D2C4] flex flex-wrap gap-3 bg-white items-center justify-between">
                      <div className="flex flex-wrap gap-3 flex-1">
                          <div className="relative min-w-[200px]">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" />
                              <input 
                                  type="text" 
                                  placeholder="Search lot number or marks..." 
                                  value={allocateSearch} 
                                  onChange={(e) => setAllocateSearch(e.target.value)} 
                                  className="w-full border border-[#D6D2C4] rounded-lg pl-8 pr-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#007680] bg-[#F5F5F3]" 
                              />
                          </div>
                          <select value={allocateGradeFilter} onChange={(e) => setAllocateGradeFilter(e.target.value)} className="border border-[#D6D2C4] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#007680] bg-[#F5F5F3]">
                              <option value="">All Grades</option>
                              {allocateFilterOptions.grades.map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                          <select value={allocateSeasonFilter} onChange={(e) => setAllocateSeasonFilter(e.target.value)} className="border border-[#D6D2C4] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#007680] bg-[#F5F5F3]">
                              <option value="">All Seasons</option>
                              {allocateFilterOptions.seasons.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <select value={allocateSaleFilter} onChange={(e) => setAllocateSaleFilter(e.target.value)} className="border border-[#D6D2C4] rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-[#007680] bg-[#F5F5F3]">
                              <option value="">All Sale Nos.</option>
                              {allocateFilterOptions.sales.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                      </div>
                      
                      {(allocateSearch || allocateGradeFilter || allocateSeasonFilter || allocateSaleFilter) && (
                          <button onClick={() => {
                              setAllocateSearch('');
                              setAllocateGradeFilter('');
                              setAllocateSeasonFilter('');
                              setAllocateSaleFilter('');
                          }} className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm whitespace-nowrap">
                              <X size={14} /> Clear Filters
                          </button>
                      )}
                  </div>

                  <div className="overflow-auto flex-1 bg-white max-h-[50vh]">
                      <table className="w-full text-[11px] text-left whitespace-nowrap">
                          <thead className="bg-[#51534a] text-white font-bold sticky top-0 z-10 uppercase tracking-tight">
                              <tr>
                                  <th className="py-2.5 px-3 w-10 text-center border-r border-white/5">
                                      <input 
                                          type="checkbox" 
                                          checked={filteredAllocatableLots.length > 0 && allocateSelectedLots.size === filteredAllocatableLots.length}
                                          onChange={handleAllocateSelectAll}
                                          className="rounded text-[#007680] focus:ring-[#007680] cursor-pointer w-3.5 h-3.5"
                                      />
                                  </th>
                                  <th className="py-2.5 px-3 border-r border-white/5">Lot Number</th>
                                  <th className="py-2.5 px-3">Season</th>
                                  <th className="py-2.5 px-3">Sale No.</th>
                                  <th className="py-2.5 px-3">Grade</th>
                                  <th className="py-2.5 px-3 text-right">Available Wt.</th>
                                  <th className="py-2.5 px-3 text-right bg-[#007680]">Vol to Allocate ({unitText(unit)})</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-[#D6D2C4]/50">
                              {filteredAllocatableLots.map(lot => {
                                  const availableKg = asNumber(lot.purchased_weight) - asNumber(lot.allocated_weight);
                                  const isSelected = allocateSelectedLots.has(lot.id);
                                  
                                  return (
                                      <tr key={lot.id} className={`transition-colors ${isSelected ? 'bg-[#EAF8FA]' : 'hover:bg-[#F5F5F3]'}`}>
                                          <td className="py-2 px-3 text-center border-r border-[#D6D2C4]/30">
                                              <input 
                                                  type="checkbox" 
                                                  checked={isSelected}
                                                  onChange={(e) => handleAllocateLotSelect(lot.id, e.target.checked, availableKg)}
                                                  className="rounded text-[#007680] focus:ring-[#007680] cursor-pointer w-3.5 h-3.5"
                                              />
                                          </td>
                                          <td className="py-2 px-3 font-bold text-[#51534a]">{lot.lot_number}</td>
                                          <td className="py-2 px-3">{lot.season || '-'}</td>
                                          <td className="py-2 px-3">{lot.sale_number || '-'}</td>
                                          <td className="py-2 px-3 font-bold">{lot.grade || '-'}</td>
                                          <td className="py-2 px-3 text-right font-medium text-[#5B3427] bg-[#B9975B]/5">
                                              {formatNumber(convertQty(availableKg, unit), getDecimals(unit))}
                                          </td>
                                          <td className="py-2 px-3 text-right bg-[#007680]/5 w-40">
                                              <input 
                                                  type="number"
                                                  disabled={!isSelected}
                                                  value={allocateVolumes[lot.id] ?? ''}
                                                  onChange={(e) => handleAllocateVolumeChange(lot.id, e.target.value, availableKg)}
                                                  className={`w-full text-right border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-[#007680] disabled:bg-transparent disabled:border-transparent ${isSelected ? 'border-[#007680]/50 bg-white text-[#007680] font-bold shadow-inner' : 'text-transparent'}`}
                                                  placeholder={isSelected ? "0" : ""}
                                              />
                                          </td>
                                      </tr>
                                  );
                              })}
                              {filteredAllocatableLots.length === 0 ? (
                                  <tr>
                                      <td colSpan={7} className="py-12 text-center text-sm text-[#968C83] italic">No allocatable lots found matching these filters.</td>
                                  </tr>
                              ) : null}
                          </tbody>
                      </table>
                  </div>
                  
                  <div className="p-4 border-t border-[#D6D2C4] bg-[#F5F5F3] flex justify-between items-center">
                      <div className="text-xs font-bold text-[#007680]">
                          {allocateSelectedLots.size > 0 ? `${allocateSelectedLots.size} Lot(s) selected for allocation.` : 'No lots selected.'}
                      </div>
                      <div className="flex gap-2">
                          <button 
                              onClick={handleAllocateReset}
                              disabled={allocateSelectedLots.size === 0 || isAllocating}
                              className="px-4 py-2 flex items-center gap-2 text-xs font-bold text-[#51534a] bg-white border border-[#D6D2C4] hover:bg-[#EFEFE9] rounded-lg transition-colors disabled:opacity-50"
                          >
                              <RotateCcw size={14} /> Reset
                          </button>
                          <button 
                              onClick={handleConfirmAllocation}
                              disabled={allocateSelectedLots.size === 0 || isAllocating}
                              className="px-6 py-2 flex items-center gap-2 text-xs font-bold text-white bg-[#007680] hover:bg-[#007680]/90 rounded-lg shadow-sm transition-colors disabled:opacity-50"
                          >
                              {isAllocating ? <RefreshCw size={14} className="animate-spin" /> : null}
                              Confirm Allocation
                          </button>
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
              <div className="w-8 h-8 bg-[#5B3427] rounded-lg flex items-center justify-center text-white"><ShieldCheck size={18} /></div>
              Specialty Position
            </h1>
            <p className="text-[#968C83] text-sm mt-0.5">View Specialty Stock vs Commitments</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white p-1 rounded-lg border border-[#968C83]/20 shadow-sm">
              {(['kg', 'bag', 'mt'] as Unit[]).map((u) => (
                <button key={u} onClick={() => handleUnitChange(u)} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${unit === u ? 'bg-[#5B3427] text-white' : 'text-[#968C83] hover:bg-[#D6D2C4]/30'}`}>{u.toUpperCase()}</button>
              ))}
            </div>
          </div>
        </header>

        {/* --- TABS --- */}
        <nav className="flex gap-1 border-b border-[#968C83]/30 overflow-x-auto">
          {([['position', <Box key="b" size={16}/>, 'Position'], ['contracts', <FileSpreadsheet key="s" size={16}/>, 'Contracts'], ['stocks', <Box key="st" size={16}/>, 'Stocks'], ['allocations', <ListChecks key="lc" size={16}/>, 'Allocations']] as const).map(([tab, icon, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab as MainTab)} className={`flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-4 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-[#5B3427] text-[#5B3427]' : 'border-transparent text-[#968C83] hover:text-[#51534a]'}`}>
                {icon} {label}
            </button>
          ))}
        </nav>

        {/* --- CONTENT --- */}
        <main className="space-y-6">

          {/* === TAB: POSITION === */}
          {activeTab === 'position' && (
              <div className="space-y-6">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        ['STOCK', totalTheoretical, '#007680', <TrendingUp key="up" size={18}/>],
                        ['UNALLOCATED SHORTS', totalShorts, '#5B3427', <TrendingDown key="down" size={18} className="text-[#B9975B]"/>],
                        ['NET POSITION', netPosition, netPosition >= 0 ? '#007680' : '#B9975B', netPosition >= 0 ? <TrendingUp key="up2" size={18} className="text-[#97D700]"/> : <TrendingDown key="down2" size={18}/>]
                    ].map(([label, val, color, icon]) => (
                        <Card key={label as string} className="p-5 relative overflow-hidden group" style={{ borderLeft: `4px solid ${color}` }}>
                            <div className="absolute top-0 right-0 -mr-4 -mt-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                {icon}
                            </div>
                            <div className="text-[#968C83] text-[10px] font-bold tracking-widest uppercase mb-2">{label}</div>
                            <div className="text-3xl font-bold text-[#51534a] flex items-center gap-2">
                                <span>{formatNumber(convertQty(val as number, unit), getDecimals(unit))}</span>
                                <span className="text-sm font-normal text-[#968C83] mt-2">{unitText(unit)}</span>
                            </div>
                        </Card>
                    ))}
                  </div>

                  {/* Position Timeline Grid */}
                  <div className="rounded-xl shadow-sm border border-[#968C83]/20 bg-white overflow-hidden">
                      <div className="overflow-auto max-h-[60vh]">
                          <table className="w-full text-sm text-center whitespace-nowrap min-w-max">
                              <thead className="sticky top-0 z-10 shadow-sm">
                                  <tr>
                                      <th className="bg-[#51534a] text-white py-3 px-4 font-bold uppercase tracking-wide">
                                          Available ({unitText(unit)})
                                      </th>
                                      {sortedMonths.map(m => (
                                          <th key={m} className="bg-[#5B3427] text-white py-3 px-4 font-bold uppercase tracking-wide border-l border-white/10">
                                              {m}
                                          </th>
                                      ))}
                                      <th className="bg-[#51534a] text-white py-3 px-4 font-bold uppercase tracking-wide border-l border-white/20">
                                          Total Shipment
                                      </th>
                                      <th className="bg-[#007680] text-white py-3 px-4 font-bold uppercase tracking-wide border-l border-white/20">
                                          Net Position
                                      </th>
                                  </tr>
                              </thead>
                              <tbody>
                                  <tr>
                                      <td className="py-4 px-4 font-bold text-[#51534a] text-lg border-r border-[#D6D2C4] bg-[#F5F5F3]">
                                          {formatNumber(convertQty(totalTheoretical, unit), getDecimals(unit))}
                                      </td>
                                      {(() => {
                                          let runningBalance = totalTheoretical;
                                          return sortedMonths.map((m, index) => {
                                              const shipment = monthShipments[m];
                                              runningBalance -= shipment;
                                              
                                              const showShortLabel = runningBalance < 0 && (runningBalance + shipment >= 0 || index === 0);

                                              return (
                                                  <td key={m} className="py-4 px-4 border-r border-[#D6D2C4]/40 align-middle">
                                                      {showShortLabel ? (
                                                          <div className="text-[11px] font-bold text-red-500 mb-0.5 leading-none">
                                                              Short: {formatNumber(convertQty(Math.abs(runningBalance), unit), getDecimals(unit))}
                                                          </div>
                                                      ) : null}
                                                      <div className="font-bold text-red-500 text-base">
                                                          -{formatNumber(convertQty(shipment, unit), getDecimals(unit))}
                                                      </div>
                                                  </td>
                                              );
                                          });
                                      })()}
                                      <td className="py-4 px-4 font-bold text-[#5B3427] text-lg bg-[#B9975B]/10 border-l border-[#D6D2C4]">
                                          {formatNumber(convertQty(totalShorts, unit), getDecimals(unit))}
                                      </td>
                                      <td className={`py-4 px-4 font-bold text-lg border-l border-[#D6D2C4] ${netPosition >= 0 ? 'text-[#007680] bg-[#007680]/5' : 'text-red-500 bg-red-50'}`}>
                                          {netPosition > 0 ? '+' : ''}{formatNumber(convertQty(netPosition, unit), getDecimals(unit))}
                                      </td>
                                  </tr>
                              </tbody>
                          </table>
                      </div>
                  </div>

                  {/* Infographics Side by Side */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* Chart 1: Grade Distribution */}
                      <Card className="p-5 flex flex-col h-[400px]">
                          <h3 className="text-sm font-bold text-[#51534a] mb-1">Available Volumes by Grade</h3>
                          <p className="text-[10px] text-[#968C83] uppercase tracking-wider mb-4">Unallocated Stock Breakdown ({unitText(unit)})</p>
                          <div className="flex-1 w-full relative">
                              {gradeDistributionData.length > 0 ? (
                                  <ResponsiveContainer width="100%" height="100%">
                                      <PieChart>
                                          <Pie
                                              data={gradeDistributionData}
                                              cx="50%"
                                              cy="50%"
                                              innerRadius={80}
                                              outerRadius={120}
                                              paddingAngle={2}
                                              dataKey="value"
                                              stroke="none"
                                          >
                                              {gradeDistributionData.map((entry, index) => (
                                                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                              ))}
                                          </Pie>
                                          <Tooltip 
                                              formatter={(value: number) => [`${formatNumber(value, getDecimals(unit))} ${unitText(unit)}`, 'Available']}
                                              contentStyle={{ borderRadius: '8px', border: '1px solid #D6D2C4', fontSize: '12px', fontWeight: 'bold' }}
                                          />
                                          <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }}/>
                                      </PieChart>
                                  </ResponsiveContainer>
                              ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-sm text-[#968C83] italic">
                                      No available volume data to display.
                                  </div>
                              )}
                          </div>
                      </Card>

                      {/* Chart 2: Client Unexecuted Contracts */}
                      <Card className="p-5 flex flex-col h-[400px]">
                          <h3 className="text-sm font-bold text-[#51534a] mb-1">Unexecuted Commitments by Client</h3>
                          <p className="text-[10px] text-[#968C83] uppercase tracking-wider mb-4">Remaining Unallocated Shorts ({unitText(unit)})</p>
                          <div className="flex-1 w-full relative">
                              {clientUnexecutedData.length > 0 ? (
                                  <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={clientUnexecutedData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFEFE9" />
                                          <XAxis dataKey="name" tick={{fontSize: 11, fill: '#968C83'}} axisLine={false} tickLine={false} />
                                          <YAxis tick={{fontSize: 11, fill: '#968C83'}} axisLine={false} tickLine={false} tickFormatter={(val) => formatNumber(val, getDecimals(unit))} />
                                          <Tooltip 
                                              cursor={{ fill: '#F5F5F3' }}
                                              formatter={(value: number) => [`${formatNumber(value, getDecimals(unit))} ${unitText(unit)}`, 'Short Weight']}
                                              contentStyle={{ borderRadius: '8px', border: '1px solid #D6D2C4', fontSize: '12px', fontWeight: 'bold' }}
                                          />
                                          <Bar dataKey="weight" fill="#007680" radius={[4, 4, 0, 0]} maxBarSize={60} />
                                      </BarChart>
                                  </ResponsiveContainer>
                              ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-sm text-[#968C83] italic">
                                      No unexecuted contracts found.
                                  </div>
                              )}
                          </div>
                      </Card>

                  </div>
              </div>
          )}

          {/* === TAB: CONTRACTS === */}
          {activeTab === 'contracts' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="relative w-full sm:w-96">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" />
                      <input type="text" placeholder="Search contracts, clients..." value={contractSearch} onChange={(e) => setContractSearch(e.target.value)} className="w-full border border-[#D6D2C4] rounded-lg pl-9 pr-3 py-2 text-sm outline-none bg-white shadow-sm" />
                  </div>
                  
                  <div className="flex items-center gap-3">
                      {(contractSearch || showExecutedContracts) && (
                          <button onClick={() => {
                              setContractSearch('');
                              setShowExecutedContracts(false);
                          }} className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm whitespace-nowrap">
                              <X size={14} /> Clear
                          </button>
                      )}
                      <label className="flex items-center gap-3 cursor-pointer bg-white px-4 py-2 border border-[#D6D2C4] rounded-lg hover:bg-[#F5F5F3] shadow-sm">
                          <input type="checkbox" checked={showExecutedContracts} onChange={(e) => setShowExecutedContracts(e.target.checked)} className="w-4 h-4 text-[#5B3427] rounded focus:ring-[#5B3427]" />
                          <span className="text-sm font-bold text-[#51534a]">Show Executed</span>
                      </label>
                  </div>
              </div>
              <Card className="overflow-hidden border-none shadow-md">
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full text-[11px] text-left whitespace-nowrap">
                    <thead className="bg-[#51534a] text-white font-bold sticky top-0 z-10 uppercase tracking-wide">
                      <tr>
                        <th className="py-3 px-4">Contract</th>
                        <th className="py-3 px-4">Client</th>
                        <th className="py-3 px-4 text-right">Weight</th>
                        <th className="py-3 px-4">Ship Date</th>
                        <th className="py-3 px-4">Quality</th>
                        <th className="py-3 px-4">Progress</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#D6D2C4]">
                      {filteredContracts.map((sale) => {
                        const isExecuted = bool(sale.executed);
                        const targetWt = asNumber(sale.weight_kilos);
                        const allocatedWt = contractAllocationTotals[sale.id] || 0;
                        const progressPct = targetWt > 0 ? Math.min(100, Math.round((allocatedWt / targetWt) * 100)) : 0;
                        const isFullyAllocated = allocatedWt >= targetWt;

                        return (
                          <tr key={sale.id} className={`${sale.pending_dispatch ? 'bg-red-50 hover:bg-red-100/80' : 'bg-white hover:bg-[#F5F5F3]'} ${isExecuted ? 'opacity-50' : ''}`}>
                            <td className="py-3 px-4 font-bold text-[#007680]">
                              <div className="flex items-center gap-2">
                                {isExecuted ? <CheckCircle size={14} className="text-[#007680]" /> : null}
                                {sale.contract_number}
                                {sale.pending_dispatch ? <AlertCircle size={14} className="text-red-500"/> : null}
                              </div>
                            </td>
                            <td className="py-3 px-4">{sale.client || '-'}</td>
                            <td className="py-3 px-4 text-right font-bold text-[#5B3427]">{formatNumber(convertQty(targetWt, unit), getDecimals(unit))}</td>
                            <td className="py-3 px-4 text-[#968C83]">{formatDateToMonthYear(sale.shipping_date)}</td>
                            <td className="py-3 px-4">
                                <span className="font-bold">{sale.quality || sale.strategy || '-'}</span>
                            </td>
                            <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-[#D6D2C4] rounded-full overflow-hidden w-16">
                                        <div className="h-full bg-[#007680]" style={{ width: `${progressPct}%` }}></div>
                                    </div>
                                    <span className="text-[10px] font-bold text-[#51534a] w-8 text-right">{progressPct}%</span>
                                </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                                {!isFullyAllocated && !isExecuted ? (
                                    <button 
                                        onClick={() => openAllocateModal(sale)}
                                        className="px-3 py-1.5 flex items-center gap-1.5 mx-auto bg-[#EAF8FA] hover:bg-[#007680] text-[#007680] hover:text-white border border-[#007680]/30 rounded font-bold transition-colors shadow-sm"
                                    >
                                        <ListPlus size={14} /> Allocate
                                    </button>
                                ) : (
                                    <span className="text-[10px] font-bold text-[#968C83] bg-[#F5F5F3] px-2 py-1 rounded inline-block">
                                        {isExecuted ? 'Executed' : 'Fully Allocated'}
                                    </span>
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

          {/* === TAB: STOCKS (SPECIALTY LOTS TRACKER) === */}
          {activeTab === 'stocks' && (
            <div className="flex flex-col lg:flex-row gap-6 mb-6">
              
              {/* Left Content: Filters and Table */}
              <div className="w-full lg:w-3/4 flex flex-col gap-4">
                
                {/* Filters Row */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-[#968C83]/20 flex flex-wrap gap-4 items-center justify-between">
                   <div className="flex flex-wrap gap-3 flex-1">
                      <div className="relative min-w-[200px]">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" />
                          <input 
                              type="text" 
                              placeholder="Search lot number, marks..." 
                              value={stocksSearch} 
                              onChange={(e) => setStocksSearch(e.target.value)} 
                              className="w-full border border-[#D6D2C4] rounded-lg pl-8 pr-3 py-2 text-xs outline-none focus:border-[#007680] bg-[#F5F5F3]" 
                          />
                      </div>
                      
                      <MultiSelectDropdown 
                          options={stocksFilterOptions.grades} 
                          selected={stocksGradeFilter} 
                          onChange={setStocksGradeFilter} 
                          placeholder="Grade" 
                      />
                      <MultiSelectDropdown 
                          options={stocksFilterOptions.brokers} 
                          selected={stocksBrokerFilter} 
                          onChange={setStocksBrokerFilter} 
                          placeholder="Broker" 
                      />
                      <MultiSelectDropdown 
                          options={stocksFilterOptions.seasons} 
                          selected={stocksSeasonFilter} 
                          onChange={setStocksSeasonFilter} 
                          placeholder="Season" 
                      />

                      <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#968C83]">From:</span>
                          <input type="date" value={stocksDateFrom} onChange={(e) => setStocksDateFrom(e.target.value)} className="border border-[#D6D2C4] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#007680] bg-[#F5F5F3]"/>
                      </div>
                      <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#968C83]">To:</span>
                          <input type="date" value={stocksDateTo} onChange={(e) => setStocksDateTo(e.target.value)} className="border border-[#D6D2C4] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#007680] bg-[#F5F5F3]"/>
                      </div>
                   </div>
                   <div className="flex items-center gap-4 border-l pl-4 border-[#D6D2C4]">
                      <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 cursor-pointer hover:opacity-80">
                              <input type="checkbox" checked={hideFullyAllocated} onChange={(e) => setHideFullyAllocated(e.target.checked)} className="rounded text-[#007680] focus:ring-[#007680] accent-[#007680] w-3.5 h-3.5" />
                              <span className="text-xs font-bold text-[#51534a] whitespace-nowrap">Hide Fully Allocated</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer hover:opacity-80">
                              <input type="checkbox" checked={hideMovedToCommercial} onChange={(e) => setHideMovedToCommercial(e.target.checked)} className="rounded text-[#007680] focus:ring-[#007680] accent-[#007680] w-3.5 h-3.5" />
                              <span className="text-xs font-bold text-[#51534a] whitespace-nowrap">Hide Commercial</span>
                          </label>
                      </div>
                      
                      {/* CLEAR FILTERS & EXPORT */}
                      <div className="flex flex-col gap-2">
                          {(stocksSearch || stocksGradeFilter.length > 0 || stocksBrokerFilter.length > 0 || stocksSeasonFilter.length > 0 || stocksDateFrom || stocksDateTo || !hideFullyAllocated || !hideMovedToCommercial) && (
                              <button onClick={() => {
                                  setStocksSearch('');
                                  setStocksGradeFilter([]);
                                  setStocksBrokerFilter([]);
                                  setStocksSeasonFilter([]);
                                  setStocksDateFrom('');
                                  setStocksDateTo('');
                                  setHideFullyAllocated(true);
                                  setHideMovedToCommercial(true);
                              }} className="flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-sm whitespace-nowrap">
                                  <X size={12} /> Clear Filters
                              </button>
                          )}
                          <button onClick={handleExportStocks} className="flex items-center justify-center gap-2 bg-[#F5F5F3] hover:bg-[#D6D2C4] text-[#51534a] border border-[#D6D2C4] px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm">
                              <Download size={14} /> Export
                          </button>
                      </div>
                   </div>
                </div>

                {/* Toolbar */}
                <div className="flex justify-between items-end min-h-[40px]">
                    <div>
                        {selectedLotIds.size > 0 ? (
                            <span className="text-sm font-bold text-[#007680] bg-white border border-[#007680]/20 px-3 py-1.5 rounded-lg shadow-sm">
                                {selectedLotIds.size} lot(s) selected
                            </span>
                        ) : null}
                    </div>
                    
                    {/* Action Buttons Container */}
                    <div className={`flex gap-2 transition-all duration-300 ${selectedLotIds.size > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                        {allSelectedAreCommercial ? (
                            <button onClick={() => setIsSpecialtyModalOpen(true)} className="flex items-center gap-2 bg-[#007680] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm hover:bg-[#007680]/90">
                                <ArrowRightLeft size={14} /> Move to Specialty
                            </button>
                        ) : (
                            <button onClick={() => setIsCommercialModalOpen(true)} className="flex items-center gap-2 bg-white border border-[#D6D2C4] hover:border-[#5B3427] hover:text-[#5B3427] px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm text-[#51534a]">
                                <ArrowRightLeft size={14} /> Move to Commercial
                            </button>
                        )}
                        <button onClick={() => setIsTradeModalOpen(true)} className="flex items-center gap-2 bg-[#5B3427] hover:bg-[#5B3427]/90 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">
                            <SlidersHorizontal size={14} /> Update Trade Vars
                        </button>
                    </div>
                </div>

                <Card className="overflow-hidden border-none shadow-md">
                  <div className="overflow-auto max-h-[60vh] custom-scrollbar">
                    <table className="w-full text-[11px] text-left whitespace-nowrap">
                      <thead className="bg-[#51534a] text-white font-bold sticky top-0 z-10 uppercase tracking-tight">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">
                              <input 
                                  type="checkbox" 
                                  className="rounded text-[#007680] focus:ring-[#007680] accent-[#007680]"
                                  onChange={handleSelectAllLots}
                                  checked={filteredStocks.length > 0 && selectedLotIds.size === filteredStocks.length}
                              />
                          </th>
                          <th className="py-2.5 px-3 border-r border-white/5">Lot Number</th>
                          <th className="py-2.5 px-3">Season</th>
                          <th className="py-2.5 px-3">Purchase Date</th>
                          <th className="py-2.5 px-3">Sale No.</th>
                          <th className="py-2.5 px-3">QC Strategy</th>
                          <th className="py-2.5 px-3">Grade</th>
                          <th className="py-2.5 px-3">Outturn</th>
                          <th className="py-2.5 px-3 text-right">Purchased Wt.</th>
                          <th className="py-2.5 px-3 text-right">Allocated Wt.</th>
                          <th className="py-2.5 px-3 text-center">Fully Allocated</th>
                          <th className="py-2.5 px-3 text-right">Price ($/50)</th>
                          <th className="py-2.5 px-3 text-right">Fobbing</th>
                          <th className="py-2.5 px-3">Hedge Lvl</th>
                          <th className="py-2.5 px-3 text-right">Diff.</th>
                          <th className="py-2.5 px-3 text-right">Valo</th>
                          <th className="py-2.5 px-3 text-right">Est. PNL</th>
                          <th className="py-2.5 px-3 text-center">To Commercial</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#D6D2C4]/50">
                        {filteredStocks.map((lot) => {
                          const isAllocated = bool(lot.fully_allocated);
                          const isCommercial = bool(lot.to_commercial);
                          const isSelected = selectedLotIds.has(lot.id);
                          
                          const rowClass = isSelected 
                              ? 'bg-[#007680]/5' 
                              : isCommercial 
                                  ? 'bg-red-100 hover:bg-red-200/60' 
                                  : isAllocated 
                                      ? 'bg-red-50 hover:bg-red-100/60' 
                                      : 'bg-white hover:bg-[#F5F5F3]';

                          return (
                            <tr key={lot.id} className={`transition-colors ${rowClass}`}>
                              <td className="py-2 px-3 text-center border-r border-[#D6D2C4]/30">
                                  <input 
                                      type="checkbox" 
                                      className="rounded text-[#007680] focus:ring-[#007680] accent-[#007680]"
                                      checked={isSelected}
                                      onChange={(e) => handleSelectLot(lot.id, e.target.checked)}
                                  />
                              </td>
                              <td className="py-2 px-3 font-bold text-[#007680]">{lot.lot_number}</td>
                              <td className="py-2 px-3">{lot.season || '-'}</td>
                              <td className="py-2 px-3 text-[#968C83]">{formatDateToStandard(lot.purchase_date)}</td>
                              <td className="py-2 px-3 font-medium">{lot.sale_number || '-'}</td>
                              <td className="py-2 px-3 truncate max-w-[150px]">{lot.qc_strategy || '-'}</td>
                              <td className="py-2 px-3 font-bold">{lot.grade || '-'}</td>
                              <td className="py-2 px-3 text-center">{lot.outturn ? `${lot.outturn}` : '-'}</td>
                              <td className="py-2 px-3 text-right font-medium text-[#5B3427] bg-[#B9975B]/5">{formatNumber(convertQty(asNumber(lot.purchased_weight), unit), getDecimals(unit))}</td>
                              <td className="py-2 px-3 text-right text-[#968C83]">{formatNumber(convertQty(asNumber(lot.allocated_weight), unit), getDecimals(unit))}</td>
                              <td className="py-2 px-3 text-center">
                                  {isAllocated ? <span className="inline-flex items-center text-red-600 bg-red-100 px-1.5 py-0.5 rounded font-bold text-[9px]"><Check size={10} className="mr-0.5"/> Yes</span> : <span className="text-[#968C83]">-</span>}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-[#007680]">{lot.price_usd_50 != null && lot.price_usd_50 !== '' ? `${Number(lot.price_usd_50).toFixed(2)}` : '-'}</td>
                              <td className="py-2 px-3 text-right font-bold text-[#5B3427]">{lot.fobbing_cost != null && lot.fobbing_cost !== '' ? `${Number(lot.fobbing_cost).toFixed(2)}` : '-'}</td>
                              <td className="py-2 px-3">{lot.hedge_level || '-'}</td>
                              <td className="py-2 px-3 text-right font-bold text-[#5B3427]">{lot._diff != null ? lot._diff.toFixed(2) : '-'}</td>
                              <td className="py-2 px-3 text-right font-bold text-[#51534a]">{lot._valo != null ? `${lot._valo.toFixed(2)}` : '-'}</td>
                              <td className={`py-2 px-3 text-right font-bold ${(lot._pnl || 0) >= 0 ? 'text-[#007680]' : 'text-red-500'}`}>
                                  {lot._pnl != null ? `$${lot._pnl.toFixed(2)}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-center">
                                  {isCommercial ? <CheckCircle size={14} className="mx-auto text-red-600" /> : '-'}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredStocks.length === 0 ? (
                            <tr>
                                <td colSpan={18} className="py-8 text-center text-sm text-[#968C83] italic">No specialty lots found matching criteria.</td>
                            </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              {/* Right Content: Analysis Summary Dashboard */}
              <div className="w-full lg:w-1/4 flex flex-col gap-4">
                  {/* Row 1: KPI & Gauge Grid */}
                  <div className="grid grid-cols-2 gap-4">
                      {/* KPI: Weighted Average Price */}
                      <Card className="p-4 flex flex-col items-center justify-center bg-[#51534a] text-white shadow-md relative overflow-hidden min-h-[140px]">
                          <div className="absolute top-0 right-0 -mr-4 -mt-4 opacity-10">
                              <ShieldCheck size={80} />
                          </div>
                          <h3 className="text-[10px] font-bold text-[#D6D2C4] uppercase tracking-wider mb-2 text-center">Avg Price</h3>
                          <div className="text-2xl text-[#A4DBE8] font-bold flex items-end gap-1 mt-1">
                              <span className="text-lg text-[#A4DBE8] mb-0.5 font-normal">$</span>
                              {stocksSummary.weightedAvgPrice > 0 ? stocksSummary.weightedAvgPrice.toFixed(2) : '0.00'}
                              <span className="text-sm text-[#A4DBE8] mb-0.5 font-normal">/50kg</span>
                          </div>
                      </Card>

                      {/* Stock Utilization Gauge */}
                      <Card className="p-3 flex flex-col items-center shadow-sm min-h-[140px] relative">
                          <h3 className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider mb-2 text-center z-10">Utilization</h3>
                          <div className="w-full h-16 relative mt-1">
                              <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                      <Pie
                                          data={[
                                              { name: 'Allocated', value: stocksSummary.totalAllocated },
                                              { name: 'Available', value: stocksSummary.totalAvailable }
                                          ]}
                                          cx="50%"
                                          cy="100%"
                                          startAngle={180}
                                          endAngle={0}
                                          innerRadius={35}
                                          outerRadius={50}
                                          paddingAngle={2}
                                          dataKey="value"
                                          stroke="none"
                                      >
                                          <Cell fill="#5B3427" />
                                          <Cell fill="#007680" />
                                      </Pie>
                                  </PieChart>
                              </ResponsiveContainer>
                          </div>
                          <div className="w-full flex justify-between px-1 mt-2 text-[9px] font-bold">
                              <div className="text-[#5B3427] flex flex-col items-center"><span>Allocated</span><span>{formatNumber(convertQty(stocksSummary.totalAllocated, unit), getDecimals(unit))}</span></div>
                              <div className="text-[#007680] flex flex-col items-center"><span>Available</span><span>{formatNumber(convertQty(stocksSummary.totalAvailable, unit), getDecimals(unit))}</span></div>
                          </div>
                      </Card>
                  </div>

                  {/* Row 2: Availability Overview Grid */}
                  <Card className="p-4 flex flex-col shadow-sm">
                      <h3 className="text-[11px] font-bold text-[#51534a] border-b border-[#D6D2C4] pb-2 mb-3 uppercase tracking-wider">Availability Overview</h3>
                      <div className="grid grid-cols-2 gap-2 h-[200px]">
                          {/* Donut: Available by Grade */}
                          <div className="flex flex-col relative w-full h-full">
                              <h4 className="text-[9px] font-bold text-[#968C83] text-center mb-1 uppercase tracking-widest">By Grade</h4>
                              <div className="flex-1 w-full relative">
                                  {stocksSummary.gradeChart.length > 0 ? (
                                      <ResponsiveContainer width="100%" height="100%">
                                          <PieChart>
                                              <Pie data={stocksSummary.gradeChart} cx="50%" cy="40%" innerRadius={25} outerRadius={45} paddingAngle={2} dataKey="value" stroke="none">
                                                  {stocksSummary.gradeChart.map((entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                                              </Pie>
                                              <Tooltip formatter={(value: number) => [formatNumber(value, getDecimals(unit)), 'Weight']} contentStyle={{ borderRadius: '8px', border: '1px solid #D6D2C4', fontSize: '10px', fontWeight: 'bold' }} />
                                              <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
                                          </PieChart>
                                      </ResponsiveContainer>
                                  ) : (
                                      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[#968C83] italic">No stock</div>
                                  )}
                              </div>
                          </div>

                          {/* Donut: Available by Broker */}
                          <div className="flex flex-col relative w-full h-full">
                              <h4 className="text-[9px] font-bold text-[#968C83] text-center mb-1 uppercase tracking-widest">By Broker</h4>
                              <div className="flex-1 w-full relative">
                                  {stocksSummary.brokerChart.length > 0 ? (
                                      <ResponsiveContainer width="100%" height="100%">
                                          <PieChart>
                                              <Pie data={stocksSummary.brokerChart} cx="50%" cy="40%" innerRadius={25} outerRadius={45} paddingAngle={2} dataKey="value" stroke="none">
                                                  {stocksSummary.brokerChart.map((entry, index) => <Cell key={`cell-${index}`} fill={[...CHART_COLORS].reverse()[index % CHART_COLORS.length]} />)}
                                              </Pie>
                                              <Tooltip formatter={(value: number, name: string) => [`${formatNumber(value, getDecimals(unit))} ${unitText(unit)}`, name]} contentStyle={{ borderRadius: '8px', border: '1px solid #D6D2C4', fontSize: '10px', fontWeight: 'bold' }} />
                                          </PieChart>
                                      </ResponsiveContainer>
                                  ) : (
                                      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[#968C83] italic">No stock</div>
                                  )}
                              </div>
                          </div>
                      </div>
                  </Card>

                  {/* Row 3: PNL Dashboard */}
                  <div className="grid grid-cols-1 gap-4 mt-4">
                      <Card className="flex flex-col shadow-sm max-h-[350px] overflow-hidden flex-1 border border-[#D6D2C4]">
                          <div className="flex justify-between items-center p-3 border-b border-[#D6D2C4] bg-[#F5F5F3]">
                              <h3 className="text-[11px] font-bold text-[#51534a] uppercase tracking-wider flex items-center gap-2">
                                  <TrendingUp size={14} className={displayedTotalPnl >= 0 ? "text-[#007680]" : "text-red-500"} /> 
                                  PNL Breakdown
                              </h3>
                              <select 
                                  value={pnlPivotBy} 
                                  onChange={(e) => {
                                      setPnlPivotBy(e.target.value as any);
                                      setSelectedPnlKeys(new Set());
                                  }}
                                  className="text-[10px] border border-[#D6D2C4] rounded px-2 py-1 outline-none bg-white font-bold"
                              >
                                  <option value="qc_strategy">Strategy</option>
                                  <option value="season">Season</option>
                                  <option value="grade">Grade</option>
                              </select>
                          </div>
                          
                          <div className="overflow-y-auto custom-scrollbar flex-1 p-1">
                              {stocksSummary.pnlPivot.map((item, idx) => {
                                  const isSelected = selectedPnlKeys.has(item.name);
                                  return (
                                  <div 
                                      key={idx} 
                                      onClick={() => {
                                          const next = new Set(selectedPnlKeys);
                                          if (next.has(item.name)) next.delete(item.name);
                                          else next.add(item.name);
                                          setSelectedPnlKeys(next);
                                      }}
                                      className={`flex justify-between items-center py-2 px-3 border-b border-[#D6D2C4]/30 last:border-0 cursor-pointer transition-colors rounded hover:bg-[#F5F5F3] ${isSelected ? 'bg-[#EAF8FA]' : ''}`}
                                  >
                                      <div className="flex items-center gap-2 overflow-hidden">
                                          <input 
                                              type="checkbox" 
                                              checked={isSelected}
                                              readOnly
                                              className="rounded text-[#007680] focus:ring-[#007680] accent-[#007680] w-3 h-3 flex-shrink-0"
                                          />
                                          <span className="text-[10px] font-bold text-[#51534a] truncate" title={item.name}>{item.name}</span>
                                      </div>
                                      <span className={`text-[10px] font-bold ${item.value >= 0 ? 'text-[#007680]' : 'text-red-500'}`}>
                                          ${formatNumber(item.value, 2)}
                                      </span>
                                  </div>
                              )})}
                              {stocksSummary.pnlPivot.length === 0 && (
                                  <div className="text-center py-4 text-[#968C83] text-[10px] italic">No data to display</div>
                              )}
                          </div>
                          
                          {/* Sticky Total Footer */}
                          <div className="p-3 border-t border-[#D6D2C4] bg-[#F5F5F3] flex justify-between items-center">
                              <span className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider">
                                  {selectedPnlKeys.size > 0 ? 'Selected Total' : 'Grand Total'}
                              </span>
                              <span className={`text-lg font-bold ${displayedTotalPnl >= 0 ? 'text-[#007680]' : 'text-red-500'}`}>
                                  ${formatNumber(displayedTotalPnl, 2)}
                              </span>
                          </div>
                      </Card>
                  </div>
              </div>

            </div>
          )}

          {/* === TAB: ALLOCATIONS === */}
          {activeTab === 'allocations' && (
              <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-220px)]">
                  {/* Left Sidebar: List of Allocations by Contract */}
                  <div className="w-full lg:w-1/3 flex flex-col gap-3">
                      <div className="font-bold text-[#51534a] text-lg px-1">Allocated Contracts</div>
                      <div className="flex flex-col gap-2 mb-1">
                          <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#968C83]" />
                                  <input 
                                      type="text" 
                                      placeholder="Search contract, client..." 
                                      value={allocationSearch} 
                                      onChange={(e) => setAllocationSearch(e.target.value)} 
                                      className="w-full border border-[#D6D2C4] rounded-lg pl-8 pr-3 py-2 text-xs outline-none focus:border-[#007680] bg-white shadow-sm" 
                                  />
                              </div>
                              {(allocationSearch || allocationClientFilter.length > 0) && (
                                  <button onClick={() => {
                                      setAllocationSearch('');
                                      setAllocationClientFilter([]);
                                  }} className="flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm">
                                      <X size={14} /> Clear
                                  </button>
                              )}
                          </div>
                          <MultiSelectDropdown 
                              options={allocationFilterOptions.clients} 
                              selected={allocationClientFilter} 
                              onChange={setAllocationClientFilter} 
                              placeholder="Client" 
                          />
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                          {filteredGroupedAllocations.map(group => (
                              <div 
                                  key={group.contract_id} 
                                  onClick={() => setSelectedAllocationContractId(group.contract_id)}
                                  className={`p-4 rounded-xl cursor-pointer border transition-all ${selectedAllocationContractId === group.contract_id ? 'bg-[#007680] text-white shadow-md border-[#007680]' : 'bg-white border-[#D6D2C4] hover:border-[#007680]/50'}`}
                              >
                                  <div className="flex justify-between items-start mb-2">
                                      <div className="font-bold text-base flex items-center gap-1.5">
                                          {group.contract_number}
                                      </div>
                                      <div className={`text-xs font-bold px-2 py-0.5 rounded ${selectedAllocationContractId === group.contract_id ? 'bg-white/20' : 'bg-[#EAF8FA] text-[#007680]'}`}>
                                          {group.details.length} Lot(s)
                                      </div>
                                  </div>
                                  <div className={`text-sm mb-3 ${selectedAllocationContractId === group.contract_id ? 'text-white/80' : 'text-[#968C83]'}`}>
                                      {group.client || 'Unspecified Client'}
                                  </div>
                                  <div className="flex justify-between items-end mt-2">
                                      <div className="flex gap-4">
                                          <div className="flex flex-col">
                                              <span className={`text-[10px] uppercase font-bold tracking-wider ${selectedAllocationContractId === group.contract_id ? 'text-white/60' : 'text-[#968C83]'}`}>W. Avg Price</span>
                                              <span className={`font-bold ${selectedAllocationContractId === group.contract_id ? 'text-white' : 'text-[#007680]'}`}>
                                                  ${(group.weighted_avg_price || 0).toFixed(2)}
                                              </span>
                                          </div>
                                          <div className="flex flex-col">
                                              <span className={`text-[10px] uppercase font-bold tracking-wider ${selectedAllocationContractId === group.contract_id ? 'text-white/60' : 'text-[#968C83]'}`}>W. Avg Hedge</span>
                                              <span className={`font-bold ${selectedAllocationContractId === group.contract_id ? 'text-white' : 'text-[#5B3427]'}`}>
                                                  {(group.weighted_avg_hedge || 0).toFixed(2)}
                                              </span>
                                          </div>
                                      </div>
                                      <div className="flex flex-col items-end">
                                          <span className={`text-[10px] uppercase font-bold tracking-wider ${selectedAllocationContractId === group.contract_id ? 'text-white/60' : 'text-[#968C83]'}`}>Total Allocated</span>
                                          <span className="font-bold text-lg">
                                              {formatNumber(convertQty(group.total_weight, unit), getDecimals(unit))} <span className="text-xs font-normal">{unitText(unit)}</span>
                                          </span>
                                      </div>
                                  </div>
                              </div>
                          ))}
                          {filteredGroupedAllocations.length === 0 ? (
                              <div className="text-center text-[#968C83] text-sm p-8 bg-white/50 rounded-xl border border-dashed border-[#968C83]/30">
                                  No allocations found.
                              </div>
                          ) : null}
                      </div>
                  </div>

                  {/* Right Content: Allocation Details */}
                  <div className="w-full lg:w-2/3 flex flex-col bg-white rounded-xl shadow-sm border border-[#968C83]/20 overflow-hidden relative">
                      {!activeAllocationGroup ? (
                          <div className="flex-1 flex flex-col items-center justify-center text-[#968C83] p-8">
                              <ListChecks size={48} className="mb-4 opacity-20" />
                              <p className="font-bold">Select an allocation to view details</p>
                          </div>
                      ) : (
                          <>
                              {/* Header */}
                              <div className="p-6 border-b border-[#D6D2C4] bg-[#F5F5F3] flex flex-wrap justify-between items-center gap-4">
                                  <div>
                                      <h2 className="text-xl font-bold text-[#51534a]">{activeAllocationGroup.contract_number}</h2>
                                      <p className="text-sm font-medium text-[#007680] mt-1">{activeAllocationGroup.client || 'Unspecified Client'}</p>
                                  </div>
                                  <button 
                                      onClick={() => handleDeleteAllocation(activeAllocationGroup.contract_id)}
                                      className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors border border-red-200 hover:border-red-500 shadow-sm"
                                  >
                                      <Trash2 size={16} /> Delete Full
                                  </button>
                              </div>

                              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                                  {/* Top Row: Chart & Summary */}
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[200px]">
                                      <div className="border border-[#D6D2C4] rounded-xl p-4 bg-white flex flex-col relative h-64 lg:h-auto">
                                          <h3 className="text-xs font-bold text-[#968C83] uppercase tracking-wider mb-2">Grade Distribution</h3>
                                          <div className="flex-1 relative">
                                              <ResponsiveContainer width="100%" height="100%">
                                                  <BarChart data={allocationChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFEFE9" />
                                                      <XAxis dataKey="name" tick={{fontSize: 10, fill: '#968C83'}} axisLine={false} tickLine={false} />
                                                      <YAxis tick={{fontSize: 10, fill: '#968C83'}} axisLine={false} tickLine={false} tickFormatter={(val) => formatNumber(val, getDecimals(unit))} />
                                                      <Tooltip 
                                                          cursor={{ fill: '#F5F5F3' }}
                                                          formatter={(value: number) => [`${formatNumber(value, getDecimals(unit))} ${unitText(unit)}`, 'Allocated']}
                                                          contentStyle={{ borderRadius: '8px', border: '1px solid #D6D2C4', fontSize: '12px', fontWeight: 'bold' }}
                                                      />
                                                      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                                          {allocationChartData.map((entry, index) => (
                                                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                                          ))}
                                                      </Bar>
                                                  </BarChart>
                                              </ResponsiveContainer>
                                          </div>
                                      </div>
                                      <div className="flex flex-col gap-4">
                                          <div className="flex gap-4 flex-1">
                                              <div className="bg-[#EAF8FA] border border-[#007680]/20 rounded-xl p-5 flex-1 flex flex-col justify-center">
                                                  <span className="text-[10px] font-bold text-[#007680] uppercase tracking-wider mb-1">Total Weight</span>
                                                  <span className="text-2xl font-bold text-[#51534a]">{formatNumber(convertQty(activeAllocationGroup.total_weight, unit), getDecimals(unit))} <span className="text-sm text-[#968C83] font-normal">{unitText(unit)}</span></span>
                                              </div>
                                              <div className="bg-[#F5F5F3] border border-[#D6D2C4] rounded-xl p-5 flex-1 flex flex-col justify-center">
                                                  <span className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider mb-1">Lots Utilized</span>
                                                  <span className="text-2xl font-bold text-[#51534a]">{activeAllocationGroup.details.length}</span>
                                              </div>
                                          </div>
                                          <div className="flex gap-4 flex-1">
                                              <div className="bg-[#51534a] text-white shadow-md rounded-xl p-4 flex-1 flex flex-col justify-center relative overflow-hidden">
                                                  <div className="absolute top-0 right-0 -mr-2 -mt-2 opacity-10"><ShieldCheck size={48} /></div>
                                                  <span className="text-[10px] font-bold text-[#D6D2C4] uppercase tracking-wider mb-1">W. Avg Price</span>
                                                  <span className="text-2xl font-bold">${(activeAllocationGroup.weighted_avg_price || 0).toFixed(2)}</span>
                                              </div>
                                              <div className="bg-[#5B3427] text-white shadow-md rounded-xl p-4 flex-1 flex flex-col justify-center relative overflow-hidden">
                                                  <div className="absolute top-0 right-0 -mr-2 -mt-2 opacity-10"><TrendingDown size={48} /></div>
                                                  <div className="flex justify-between items-end w-full relative z-10">
                                                      <div>
                                                          <span className="text-[10px] font-bold text-[#D6D2C4] uppercase tracking-wider mb-1 block">W. Avg Hedge</span>
                                                          <span className="text-2xl font-bold">{(activeAllocationGroup.weighted_avg_hedge || 0).toFixed(2)}</span>
                                                      </div>
                                                      <div className="text-right">
                                                          <span className="text-[10px] font-bold text-[#D6D2C4] uppercase tracking-wider mb-1 block">W. Avg Fobbing</span>
                                                          <span className="text-2xl font-bold">${(activeAllocationGroup.weighted_avg_fobbing || 0).toFixed(2)}</span>
                                                      </div>
                                                  </div>
                                              </div>
                                          </div>
                                      </div>
                                  </div>

                                  {/* Lots Table */}
                                  <div className="border border-[#D6D2C4] rounded-xl overflow-hidden bg-white">
                                      <div className="overflow-auto max-h-[50vh]">
                                          <table className="w-full text-xs text-left whitespace-nowrap">
                                              <thead className="bg-[#51534a] text-white font-bold sticky top-0 z-10 uppercase tracking-tight">
                                                  <tr>
                                                      <th className="py-3 px-4">Lot Number</th>
                                                      <th className="py-3 px-4">Grade</th>
                                                      <th className="py-3 px-4">Allocated Date</th>
                                                      <th className="py-3 px-4 text-right">Allocated Vol.</th>
                                                      <th className="py-3 px-4 text-center">Action</th>
                                                  </tr>
                                              </thead>
                                              <tbody className="divide-y divide-[#D6D2C4]/50">
                                                  {activeAllocationGroup.details.map(lot => (
                                                      <tr key={lot.allocation_id} className="hover:bg-[#F5F5F3] transition-colors">
                                                          <td className="py-2.5 px-4 font-bold text-[#007680]">{lot.lot_number}</td>
                                                          <td className="py-2.5 px-4 font-bold text-[#51534a]">{lot.grade || '-'}</td>
                                                          <td className="py-2.5 px-4 text-[#968C83]">{formatDateToStandard(lot.allocation_date)}</td>
                                                          <td className="py-2.5 px-4 text-right font-bold text-[#5B3427] bg-[#B9975B]/5">
                                                              {formatNumber(convertQty(asNumber(lot.allocated_weight), unit), getDecimals(unit))}
                                                          </td>
                                                          <td className="py-2.5 px-4 text-center">
                                                              <button 
                                                                  onClick={() => handleDeleteAllocation(activeAllocationGroup.contract_id, true, lot.allocation_id)}
                                                                  className="text-[#968C83] hover:text-red-500 p-1.5 rounded bg-white border border-transparent hover:border-red-200 hover:bg-red-50 transition-all"
                                                                  title="Remove lot from allocation"
                                                              >
                                                                  <Trash2 size={14} />
                                                              </button>
                                                          </td>
                                                      </tr>
                                                  ))}
                                              </tbody>
                                          </table>
                                      </div>
                                  </div>
                              </div>
                          </>
                      )}
                  </div>
              </div>
          )}

        </main>
      </div>
    </div>
  );
}