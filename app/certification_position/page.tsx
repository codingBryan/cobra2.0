"use client"
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  ShieldCheck, 
  TrendingDown, 
  TrendingUp,
  ListChecks,
  Plus,
  X,
  CloudUpload,
  FileSpreadsheet,
  Pencil,
  Check,
  Users,
  Search,
  Download,
  FileCheck,
  Eye,
  CheckCircle
} from 'lucide-react';

// --- Constants & Types ---
type Unit = 'kg' | 'bag' | 'mt';
type MainTab = 'certification' | 'tracker' | 'contracts' | 'declarations';

const CERTIFICATES_LIST = ["RFA", "CAFE", "EUDR"] as const;
const PROJECTS_LIST = ["AAA", "NET ZERO"] as const;
const CERT_FILTERS = [...CERTIFICATES_LIST, ...PROJECTS_LIST] as const;
const TRACKER_FILTERS = ["ALL", ...CERT_FILTERS] as const;

type CertType = (typeof CERT_FILTERS)[number];
type TrackerCertType = CertType | "ALL";

const CONTRACT_QUALITIES = [
  "AA - TOP", "AB - TOP", "PB - TOP", 
  "AA - PLUS", "AB - PLUS", "ABC - PLUS", "PB - PLUS", 
  "AA - FAQ", "AB - FAQ", "ABC - FAQ", "PB - FAQ", 
  "REJECTS", "MBUNIS", "TRIAGE", "GRINDER BOLD", "GRINDER LIGHT"
];

interface CertifiedStock {
  id: number;
  lot_number: string;
  strategy: string;
  purchased_weight: number;
  rfa_certified: boolean;
  rfa_certificate_holder?: string;
  rfa_expiry_date?: string;
  rfa_declared_weight?: number;
  eudr_certified: boolean;
  eudr_certificate_holder?: string;
  eudr_expiry_date?: string;
  eudr_declared_weight?: number;
  cafe_certified: boolean;
  cafe_certificate_holder?: string;
  cafe_expiry_date?: string;
  cafe_declared_weight?: number;
  impact_certified?: boolean;
  impact_expiry_date?: string;
  impact_declared_weight?: number;
  aaa_project: boolean;
  aaa_volume?: number;
  geodata_available?: boolean;
  aaa_declared_weight?: number;
  netzero_project: boolean;
  netzero_declared_weight?: number;
  season?: string;
  sale_type?: string;
  outturn?: string;
  cooperative?: string;
  wet_mill?: string;
  county?: string;
  grade?: string;
  grower_code?: string;
  fully_declared?: boolean;
  recorded_date?: string;
}

interface Blend {
  id: number;
  name: string;
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
  certs_declared?: boolean | number | string | { type: string, data: number[] };
}

interface DeclarationRow {
  contract_id: number;
  contract_number: string;
  client: string;
  contract_weight: number;
  shipping_date: string;
  stock_id: number;
  lot_number: string;
  grade: string;
  strategy: string;
  cooperative: string;
  wet_mill: string;
  lot_purchased_weight: number;
  rfa_declared_weight: number;
  eudr_declared_weight: number;
  cafe_declared_weight: number;
  impact_declared_weight: number;
  aaa_declared_weight: number;
  netzero_declared_weight: number;
}

type TrackerColumn = {
  key: string;
  label: string;
  align: "left" | "center" | "right";
  render: (row: Record<string, any>) => React.ReactNode;
  exportValue: (row: Record<string, any>) => string | number | boolean;
};

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

function formatDateDisplay(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const base = raw.slice(0, 10);
  const match = base.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

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

function asNumber(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ⚡ HIGHLY OPTIMIZED O(1) BOOLEAN/BUFFER PARSER
function bool(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  
  if (typeof value === 'number' && value > 0) return true;
  
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === 'yes' || lower === '1') return true;
    if (value.charCodeAt(0) === 1) return true; // Catch BIT(1) string serialization
  }
  
  // Catch generic MySQL Buffer JSON serializations from tinyint(1)/bit(1)
  if (typeof value === 'object') {
    const v = value as any;
    if (v.type === 'Buffer' && Array.isArray(v.data)) return v.data[0] > 0;
    if (Array.isArray(v)) return v[0] > 0;
  }
  
  return false;
}

function displayText(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

const certToField = (cert: string) => {
    switch(cert) {
        case 'RFA': return 'rfa_declared_weight';
        case 'EUDR': return 'eudr_declared_weight';
        case 'CAFE': return 'cafe_declared_weight';
        case 'Impact': return 'impact_declared_weight';
        case 'AAA': return 'aaa_declared_weight';
        case 'NET ZERO': return 'netzero_declared_weight';
        default: return '';
    }
}

function getEffectiveWeight(stock: CertifiedStock, cert: string) {
  if (cert === 'AAA') {
      return asNumber(stock.aaa_volume != null ? stock.aaa_volume : 0);
  }
  return asNumber(stock.purchased_weight);
}

function getAaaReservationLabelFromStock(stock: CertifiedStock) {
  return bool(stock.cafe_certified) || asNumber(stock.cafe_declared_weight) > 0 ? "AAA/CP" : "AAA";
}

function getTrackerCertFlags(stock: CertifiedStock) {
  return {
    RFA: bool(stock.rfa_certified),
    CAFE: bool(stock.cafe_certified),
    EUDR: bool(stock.eudr_certified),
    "NET ZERO": bool(stock.netzero_project),
    AAA: bool(stock.aaa_project),
  } as const;
}

function matchesTrackerCert(stock: CertifiedStock, cert: TrackerCertType) {
  if (cert === "ALL") return true;
  switch (cert) {
    case "RFA": return bool(stock.rfa_certified);
    case "CAFE": return bool(stock.cafe_certified);
    case "EUDR": return bool(stock.eudr_certified);
    case "NET ZERO": return bool(stock.netzero_project);
    case "AAA": return bool(stock.aaa_project);
  }
  return false;
}

function getTrackerHolderLabel(stock: CertifiedStock, cert: TrackerCertType) {
  if (cert === "ALL") return displayText(stock.cooperative || stock.wet_mill || stock.strategy || stock.grade || "Unspecified", "Unspecified");
  if (cert === "RFA") return displayText(stock.rfa_certificate_holder || stock.cooperative || stock.wet_mill || "Unspecified", "Unspecified");
  if (cert === "CAFE") return displayText(stock.cafe_certificate_holder || stock.cooperative || stock.wet_mill || "Unspecified", "Unspecified");
  if (cert === "EUDR") return displayText(stock.eudr_certificate_holder || stock.cooperative || stock.wet_mill || "Unspecified", "Unspecified");
  if (cert === "AAA") {
    return displayText(getAaaReservationLabelFromStock(stock) === "AAA/CP" ? (stock.cafe_certificate_holder || stock.cooperative || stock.wet_mill) : (stock.cooperative || stock.wet_mill), "Unspecified");
  }
  return displayText(stock.cooperative || stock.wet_mill || "Unspecified", "Unspecified");
}

function getTrackerRelevantExpiryDates(stock: CertifiedStock, cert: TrackerCertType) {
  const dates = cert === "ALL"
    ? [stock.rfa_expiry_date, stock.eudr_expiry_date, stock.cafe_expiry_date, stock.impact_expiry_date]
    : cert === "RFA" ? [stock.rfa_expiry_date]
    : cert === "CAFE" ? [stock.cafe_expiry_date]
    : cert === "EUDR" ? [stock.eudr_expiry_date]
    : [];
  return dates.filter((date): date is string => Boolean(date));
}

function getTrackerDisplayedExpiry(stock: CertifiedStock, cert: TrackerCertType) {
  const dates = getTrackerRelevantExpiryDates(stock, cert);
  if (!dates.length) return { label: "—", days: null as number | null };
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const next = dates
    .map((date) => {
      const expiry = new Date(date);
      if (Number.isNaN(expiry.getTime())) return null;
      const days = Math.ceil((expiry.getTime() - startOfToday) / (1000 * 60 * 60 * 24));
      return { label: formatDateDisplay(date), days };
    })
    .filter((item): item is { label: string; days: number } => Boolean(item))
    .sort((a, b) => a.days - b.days)[0];
  return next ?? { label: "—", days: null };
}

function buildTrackerRow(stock: CertifiedStock, cert: TrackerCertType) {
  const certFlags = getTrackerCertFlags(stock);
  const expiry = getTrackerDisplayedExpiry(stock, cert);
  return {
    id: stock.id,
    season: displayText(stock.season),
    sale_type: displayText(stock.sale_type),
    outturn: displayText(stock.outturn),
    lot_number: displayText(stock.lot_number),
    strategy: displayText(stock.strategy || stock.grade || stock.cooperative || stock.wet_mill || stock.county),
    cooperative: displayText(stock.cooperative),
    wet_mill: displayText(stock.wet_mill),
    county: displayText(stock.county),
    grade: displayText(stock.grade),
    grower_code: displayText(stock.grower_code),
    effective_weight: getEffectiveWeight(stock, cert), 
    rfa_certified: certFlags.RFA,
    rfa_expiry_date: formatDateDisplay(stock.rfa_expiry_date),
    rfa_certificate_holder: displayText(stock.rfa_certificate_holder),
    rfa_declared_weight: stock.rfa_declared_weight == null ? null : asNumber(stock.rfa_declared_weight),
    eudr_certified: certFlags.EUDR,
    eudr_expiry_date: formatDateDisplay(stock.eudr_expiry_date),
    eudr_certificate_holder: displayText(stock.eudr_certificate_holder),
    eudr_declared_weight: stock.eudr_declared_weight == null ? null : asNumber(stock.eudr_declared_weight),
    cafe_certified: certFlags.CAFE,
    cafe_expiry_date: formatDateDisplay(stock.cafe_expiry_date),
    cafe_certificate_holder: displayText(stock.cafe_certificate_holder),
    cafe_declared_weight: stock.cafe_declared_weight == null ? null : asNumber(stock.cafe_declared_weight),
    impact_certified: bool(stock.impact_certified),
    impact_expiry_date: formatDateDisplay(stock.impact_expiry_date),
    impact_declared_weight: stock.impact_declared_weight == null ? null : asNumber(stock.impact_declared_weight),
    aaa_project: certFlags.AAA,
    aaa_reservation: getAaaReservationLabelFromStock(stock),
    aaa_volume: stock.aaa_volume == null ? null : asNumber(stock.aaa_volume),
    geodata_available: bool(stock.geodata_available),
    aaa_declared_weight: stock.aaa_declared_weight == null ? null : asNumber(stock.aaa_declared_weight),
    netzero_project: certFlags["NET ZERO"],
    netzero_declared_weight: stock.netzero_declared_weight == null ? null : asNumber(stock.netzero_declared_weight),
    fully_declared: bool(stock.fully_declared),
    recorded_date: formatDateDisplay(stock.recorded_date),
    tracker_expiry_label: expiry.label,
    tracker_expiry_days: expiry.days,
  };
}

function isWithinDateRange(dateValue: unknown, start: string, end: string) {
  const raw = String(dateValue ?? "").trim().slice(0, 10);
  if (!raw) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  if (start && raw < start) return false;
  if (end && raw > end) return false;
  return true;
}

function formatRangeLabel(start: string, end: string) {
  if (start && end) return `${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
  if (start) return `${formatDateDisplay(start)} onwards`;
  if (end) return `up to ${formatDateDisplay(end)}`;
  return "All dates";
}

function getTrackerColumns(cert: TrackerCertType, unit: Unit): TrackerColumn[] {
  const common: TrackerColumn[] = [
    { key: "season", label: "Season", align: "left", render: (row) => row.season, exportValue: (row) => row.season },
    { key: "sale_type", label: "Sale Type", align: "left", render: (row) => row.sale_type, exportValue: (row) => row.sale_type },
    { key: "outturn", label: "Outturn", align: "left", render: (row) => row.outturn, exportValue: (row) => row.outturn },
    { key: "lot_number", label: "Lot", align: "left", render: (row) => row.lot_number, exportValue: (row) => row.lot_number },
    { key: "strategy", label: "Strategy", align: "left", render: (row) => row.strategy, exportValue: (row) => row.strategy },
    { key: "cooperative", label: "Cooperative", align: "left", render: (row) => row.cooperative, exportValue: (row) => row.cooperative },
    { key: "wet_mill", label: "Wet Mill", align: "left", render: (row) => row.wet_mill, exportValue: (row) => row.wet_mill },
    { key: "county", label: "County", align: "left", render: (row) => row.county, exportValue: (row) => row.county },
    { key: "grade", label: "Grade", align: "left", render: (row) => row.grade, exportValue: (row) => row.grade },
    { key: "grower_code", label: "Grower", align: "left", render: (row) => row.grower_code, exportValue: (row) => row.grower_code },
    { key: "effective_weight", label: cert === 'AAA' ? "Volume (AAA)" : "Purchased", align: "right", render: (row) => `${formatQty(row.effective_weight, unit)} ${unitText(unit)}`, exportValue: (row) => formatQty(row.effective_weight, unit) },
  ];

  const certColumns: Record<TrackerCertType, TrackerColumn[]> = {
    ALL: [
      { key: "rfa_certified", label: "RFA", align: "center", render: (row) => (row.rfa_certified ? "Yes" : "No"), exportValue: (row) => (row.rfa_certified ? "Yes" : "No") },
      { key: "rfa_expiry_date", label: "RFA Expiry", align: "center", render: (row) => row.rfa_expiry_date, exportValue: (row) => row.rfa_expiry_date },
      { key: "rfa_certificate_holder", label: "RFA Holder", align: "center", render: (row) => row.rfa_certificate_holder, exportValue: (row) => row.rfa_certificate_holder },
      { key: "rfa_declared_weight", label: "RFA Decl.", align: "right", render: (row) => (row.rfa_declared_weight != null ? `${formatQty(row.rfa_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.rfa_declared_weight != null ? formatQty(row.rfa_declared_weight, unit) : "") },
      { key: "eudr_certified", label: "EUDR", align: "center", render: (row) => (row.eudr_certified ? "Yes" : "No"), exportValue: (row) => (row.eudr_certified ? "Yes" : "No") },
      { key: "eudr_expiry_date", label: "EUDR Expiry", align: "center", render: (row) => row.eudr_expiry_date, exportValue: (row) => row.eudr_expiry_date },
      { key: "eudr_certificate_holder", label: "EUDR Holder", align: "center", render: (row) => row.eudr_certificate_holder, exportValue: (row) => row.eudr_certificate_holder },
      { key: "eudr_declared_weight", label: "EUDR Decl.", align: "right", render: (row) => (row.eudr_declared_weight != null ? `${formatQty(row.eudr_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.eudr_declared_weight != null ? formatQty(row.eudr_declared_weight, unit) : "") },
      { key: "cafe_certified", label: "CAFE", align: "center", render: (row) => (row.cafe_certified ? "Yes" : "No"), exportValue: (row) => (row.cafe_certified ? "Yes" : "No") },
      { key: "cafe_expiry_date", label: "CAFE Expiry", align: "center", render: (row) => row.cafe_expiry_date, exportValue: (row) => row.cafe_expiry_date },
      { key: "cafe_certificate_holder", label: "CAFE Holder", align: "center", render: (row) => row.cafe_certificate_holder, exportValue: (row) => row.cafe_certificate_holder },
      { key: "cafe_declared_weight", label: "CAFE Decl.", align: "right", render: (row) => (row.cafe_declared_weight != null ? `${formatQty(row.cafe_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.cafe_declared_weight != null ? formatQty(row.cafe_declared_weight, unit) : "") },
      { key: "impact_certified", label: "Impact", align: "center", render: (row) => (row.impact_certified ? "Yes" : "No"), exportValue: (row) => (row.impact_certified ? "Yes" : "No") },
      { key: "impact_expiry_date", label: "Impact Expiry", align: "center", render: (row) => row.impact_expiry_date, exportValue: (row) => row.impact_expiry_date },
      { key: "impact_declared_weight", label: "Impact Decl.", align: "right", render: (row) => (row.impact_declared_weight != null ? `${formatQty(row.impact_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.impact_declared_weight != null ? formatQty(row.impact_declared_weight, unit) : "") },
      { key: "aaa_project", label: "AAA", align: "center", render: (row) => row.aaa_project ? "Yes" : "No", exportValue: (row) => (row.aaa_project ? "Yes" : "No") },
      { key: "aaa_volume", label: "AAA Vol.", align: "right", render: (row) => (row.aaa_volume != null ? `${formatQty(row.aaa_volume, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.aaa_volume != null ? formatQty(row.aaa_volume, unit) : "") },
      { key: "geodata_available", label: "Geo", align: "center", render: (row) => (row.geodata_available ? "Yes" : "No"), exportValue: (row) => (row.geodata_available ? "Yes" : "No") },
      { key: "aaa_declared_weight", label: "AAA Decl.", align: "right", render: (row) => (row.aaa_declared_weight != null ? `${formatQty(row.aaa_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.aaa_declared_weight != null ? formatQty(row.aaa_declared_weight, unit) : "") },
      { key: "netzero_project", label: "Net Zero", align: "center", render: (row) => (row.netzero_project ? "Yes" : "No"), exportValue: (row) => (row.netzero_project ? "Yes" : "No") },
      { key: "netzero_declared_weight", label: "Net Zero Decl.", align: "right", render: (row) => (row.netzero_declared_weight != null ? `${formatQty(row.netzero_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.netzero_declared_weight != null ? formatQty(row.netzero_declared_weight, unit) : "") },
      { key: "fully_declared", label: "Fully Declared", align: "center", render: (row) => (row.fully_declared ? "Yes" : "No"), exportValue: (row) => (row.fully_declared ? "Yes" : "No") },
    ],
    RFA: [
      { key: "rfa_certified", label: "RFA", align: "center", render: (row) => (row.rfa_certified ? "Yes" : "No"), exportValue: (row) => (row.rfa_certified ? "Yes" : "No") },
      { key: "rfa_expiry_date", label: "RFA Expiry", align: "center", render: (row) => row.rfa_expiry_date, exportValue: (row) => row.rfa_expiry_date },
      { key: "rfa_certificate_holder", label: "RFA Holder", align: "center", render: (row) => row.rfa_certificate_holder, exportValue: (row) => row.rfa_certificate_holder },
      { key: "rfa_declared_weight", label: "RFA Decl.", align: "right", render: (row) => (row.rfa_declared_weight != null ? `${formatQty(row.rfa_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.rfa_declared_weight != null ? formatQty(row.rfa_declared_weight, unit) : "") },
    ],
    CAFE: [
      { key: "cafe_certified", label: "CAFE", align: "center", render: (row) => (row.cafe_certified ? "Yes" : "No"), exportValue: (row) => (row.cafe_certified ? "Yes" : "No") },
      { key: "cafe_expiry_date", label: "CAFE Expiry", align: "center", render: (row) => row.cafe_expiry_date, exportValue: (row) => row.cafe_expiry_date },
      { key: "cafe_certificate_holder", label: "CAFE Holder", align: "center", render: (row) => row.cafe_certificate_holder, exportValue: (row) => row.cafe_certificate_holder },
      { key: "cafe_declared_weight", label: "CAFE Decl.", align: "right", render: (row) => (row.cafe_declared_weight != null ? `${formatQty(row.cafe_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.cafe_declared_weight != null ? formatQty(row.cafe_declared_weight, unit) : "") },
    ],
    EUDR: [
      { key: "eudr_certified", label: "EUDR", align: "center", render: (row) => (row.eudr_certified ? "Yes" : "No"), exportValue: (row) => (row.eudr_certified ? "Yes" : "No") },
      { key: "eudr_expiry_date", label: "EUDR Expiry", align: "center", render: (row) => row.eudr_expiry_date, exportValue: (row) => row.eudr_expiry_date },
      { key: "eudr_certificate_holder", label: "EUDR Holder", align: "center", render: (row) => row.eudr_certificate_holder, exportValue: (row) => row.eudr_certificate_holder },
      { key: "eudr_declared_weight", label: "EUDR Decl.", align: "right", render: (row) => (row.eudr_declared_weight != null ? `${formatQty(row.eudr_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.eudr_declared_weight != null ? formatQty(row.eudr_declared_weight, unit) : "") },
    ],
    AAA: [
      { key: "aaa_reservation", label: "AAA Reservation", align: "center", render: (row) => row.aaa_reservation, exportValue: (row) => row.aaa_reservation },
      { key: "aaa_volume", label: "AAA Vol.", align: "right", render: (row) => (row.aaa_volume != null ? `${formatQty(row.aaa_volume, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.aaa_volume != null ? formatQty(row.aaa_volume, unit) : "") },
      { key: "geodata_available", label: "Geo", align: "center", render: (row) => (row.geodata_available ? "Yes" : "No"), exportValue: (row) => (row.geodata_available ? "Yes" : "No") },
      { key: "aaa_declared_weight", label: "AAA Decl.", align: "right", render: (row) => (row.aaa_declared_weight != null ? `${formatQty(row.aaa_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.aaa_declared_weight != null ? formatQty(row.aaa_declared_weight, unit) : "") },
    ],
    "NET ZERO": [
      { key: "netzero_project", label: "Net Zero", align: "center", render: (row) => (row.netzero_project ? "Yes" : "No"), exportValue: (row) => (row.netzero_project ? "Yes" : "No") },
      { key: "netzero_declared_weight", label: "Net Zero Decl.", align: "right", render: (row) => (row.netzero_declared_weight != null ? `${formatQty(row.netzero_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.netzero_declared_weight != null ? formatQty(row.netzero_declared_weight, unit) : "") },
    ],
  };

  return [...common, ...certColumns[cert]];
}

function getTrackerExportRows(rows: Record<string, any>[], columns: TrackerColumn[]) {
  return rows.map((row) =>
    columns.reduce<Record<string, string | number | boolean>>((acc, column) => {
      acc[column.label] = column.exportValue(row);
      return acc;
    }, {})
  );
}

function toCsv(rows: Record<string, any>[]) {
  if (rows.length === 0) return "";
  const safeHeaders = Object.keys(rows[0] ?? {});
  const escape = (value: any) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const body = rows.map((row) => safeHeaders.map((header) => escape(row[header])).join(",")).join("\n");
  return [safeHeaders.join(","), body].filter(Boolean).join("\n");
}

function toExcelHtml(title: string, rows: Record<string, any>[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const headHtml = headers.map((h) => `<th style="border:1px solid #ccc;padding:6px;background:#51534a;color:#fff;text-align:left;">${h}</th>`).join("");
  const bodyHtml = rows.map((row) => `<tr>${headers.map((h) => `<td style="border:1px solid #ccc;padding:6px;">${String(row[h] ?? "")}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><table>${headers.length ? `<thead><tr>${headHtml}</tr></thead>` : ""}<tbody>${bodyHtml}</tbody></table></body></html>`;
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

const Chip = ({ active, children, onClick }: { active?: boolean; children?: React.ReactNode; onClick?: () => void; }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm font-bold transition ${
        active ? "border-[#007680] bg-[#007680] text-white" : "border-[#D6D2C4] bg-white text-[#968C83] hover:border-[#007680] hover:text-[#007680]"
      }`}
    >
      {children}
    </button>
  );
};

const FilterTabs = ({ tabs, active, onChange }: { tabs: readonly string[], active: string, onChange: (val: any) => void }) => {
  return (
    <div className="flex flex-wrap gap-2">
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

// --- Native Donut Chart Component ---
function TrackerDonutChart({ data, unit }: { data: { name: string, value: number, color: string }[], unit: Unit }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <div className="text-sm italic text-[#968C83]">No holder data available.</div>;

  let currentOffset = 0; 
  
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative shrink-0 flex items-center justify-center h-[120px] w-[120px]">
            <svg width="120" height="120" viewBox="0 0 42 42" className="overflow-visible -rotate-90">
                <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#D6D2C4" strokeWidth="4" />
                {data.map((slice, i) => {
                    const percent = (slice.value / total) * 100;
                    const offset = currentOffset;
                    currentOffset -= percent; 
                    return (
                        <circle 
                            key={i}
                            cx="21" cy="21" r="15.91549430918954" 
                            fill="transparent" stroke={slice.color} strokeWidth="4" 
                            strokeDasharray={`${percent} ${100 - percent}`} 
                            strokeDashoffset={offset}
                            className="transition-all duration-500 ease-in-out"
                        />
                    );
                })}
            </svg>
        </div>
        <div className="flex-1 space-y-2 max-h-[140px] overflow-y-auto pr-1">
            {data.map((slice, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: slice.color }}></div>
                        <div className="flex flex-col min-w-0">
                           <span className="truncate text-[#51534a] font-bold" title={slice.name}>{slice.name}</span>
                           <span className="text-[10px] text-[#968C83]">{formatQty(slice.value, unit)} {unitText(unit)}</span>
                        </div>
                    </div>
                    <span className="text-[#007680] font-bold pl-2">{((slice.value / total) * 100).toFixed(1)}%</span>
                </div>
            ))}
        </div>
    </div>
  );
}

export default function CertificationsPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('certification');
  const [activeCert, setActiveCert] = useState<CertType>('RFA');
  const [positionView, setPositionView] = useState<'true_position' | 'crop_year'>('true_position');
  const [unit, setUnit] = useState<Unit>('kg');

  const [stocks, setStocks] = useState<CertifiedStock[]>([]);
  const [sales, setSales] = useState<SaleContract[]>([]);
  const [blends, setBlends] = useState<Blend[]>([]);
  const [declarations, setDeclarations] = useState<DeclarationRow[]>([]);
  
  const [loading, setLoading] = useState(true);

  // Toast State
  const [toast, setToast] = useState<{show: boolean, type: 'success' | 'warning' | 'error', title: string, message: string | React.ReactNode}>({ show: false, type: 'success', title: '', message: '' });

  const showToast = (type: 'success' | 'warning' | 'error', title: string, message: string | React.ReactNode) => {
      setToast({ show: true, type, title, message });
      // Increased toast duration to 15 seconds to allow comfortable reading
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 15000);
  };

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManualSalesModalOpen, setIsManualSalesModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  const [isDirectSale, setIsDirectSale] = useState(true);
  const [purchaseSaleNumber, setPurchaseSaleNumber] = useState('');

  // Declare Certificates Configuration Modal State
  const [isDeclaringConfigOpen, setIsDeclaringConfigOpen] = useState(false);
  const [declaringContractId, setDeclaringContractId] = useState<number | null>(null);
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set());

  // API Loader State
  const [isDeclaringCertId, setIsDeclaringCertId] = useState<number | null>(null);

  const [editingContractId, setEditingContractId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ quality: string, grade: string, certifications: string[], blend_id: number | '' }>({
      quality: '', grade: '', certifications: [], blend_id: ''
  });

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

  // Tracker states
  const [trackerCert, setTrackerCert] = useState<TrackerCertType>("RFA");
  const [trackerDateStartDraft, setTrackerDateStartDraft] = useState("");
  const [trackerDateEndDraft, setTrackerDateEndDraft] = useState("");
  const [trackerDateStartFilter, setTrackerDateStartFilter] = useState("");
  const [trackerDateEndFilter, setTrackerDateEndFilter] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadWrapRef = useRef<HTMLDivElement | null>(null);
  
  // Declarations UI state
  const [viewingDeclarationContract, setViewingDeclarationContract] = useState<number | null>(null);
  const [declarationModalCert, setDeclarationModalCert] = useState<string>("");
  const [contractToDelete, setContractToDelete] = useState<number | null>(null);
  const [isDeletingDecl, setIsDeletingDecl] = useState(false);

  // Contracts UI View Filters
  const [contractSearch, setContractSearch] = useState('');
  const [showDeclaredContracts, setShowDeclaredContracts] = useState(false);

  const certOptions: CertType[] = ['RFA', 'CAFE', 'NET ZERO', 'EUDR', 'AAA'];

  // ⚡ CENTRALIZED FETCH FUNCTION FOR AUTO-UPDATING
  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [stocksRes, salesRes, blendsRes, declarationsRes] = await Promise.all([
        fetch('/api/certified_stocks', { cache: 'no-store' }),
        fetch('/api/contracts', { cache: 'no-store' }),
        fetch('/api/blends', { cache: 'no-store' }),
        fetch('/api/declare_certificates', { cache: 'no-store' })
      ]);
      
      if (stocksRes.ok) setStocks(await stocksRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
      if (salesRes.ok) setSales(await salesRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
      if (blendsRes.ok) setBlends(await blendsRes.json().then(d => Array.isArray(d) ? d : (d.data || d.rows || [])));
      if (declarationsRes.ok) setDeclarations(await declarationsRes.json().then(d => d.data || []));
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    function onDownloadOutside(event: MouseEvent) {
      if (downloadWrapRef.current && !downloadWrapRef.current.contains(event.target as Node)) setDownloadOpen(false);
    }
    if (downloadOpen) document.addEventListener("mousedown", onDownloadOutside);
    return () => document.removeEventListener("mousedown", onDownloadOutside);
  }, [downloadOpen]);

  // ⚡ Extract Unique Regions and Grades in O(N) using useMemo and Set
  const { uniqueRegions, uniqueGrades } = useMemo(() => {
      const regions = new Set<string>();
      const grades = new Set<string>();
      stocks.forEach(s => {
          if (s.county) regions.add(s.county);
          if (s.grade) grades.add(s.grade);
      });
      return {
          uniqueRegions: Array.from(regions).sort(),
          uniqueGrades: Array.from(grades).sort()
      };
  }, [stocks]);

  const openDeclarationConfig = (contractId: number) => {
      setDeclaringContractId(contractId);
      setSelectedRegions(new Set(uniqueRegions));
      setSelectedGrades(new Set(uniqueGrades));
      setIsDeclaringConfigOpen(true);
  };

  const submitDeclareCertificates = async () => {
    if (!declaringContractId) return;
    const contractId = declaringContractId;

    setIsDeclaringConfigOpen(false);
    setIsDeclaringCertId(contractId);

    try {
      const payload = { 
          sale_contract_id: contractId,
          regions: Array.from(selectedRegions),
          grades: Array.from(selectedGrades)
      };

      const response = await fetch('/api/declare_certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to declare certificates");
      }
      
      const failedCerts = response.headers.get('X-Failed-Certificates');
      const contentType = response.headers.get('Content-Type');
      
      if (contentType && contentType.includes('application/json')) {
         const data = await response.json();
         console.log("Declaration successful, JSON response received:", data);
         showToast('success', 'Declaration logged', 'Declaration parameters successfully sent to backend!');
      } else {
         if (failedCerts) {
             const details = failedCerts.split(',').map(f => {
                 const [cert, shortfall] = f.split(':');
                 return <li key={cert} className="ml-4 list-disc"><strong>{cert.toUpperCase()}</strong>: Short by {formatNumber(Number(shortfall))} {unitText(unit)}</li>;
             });
             showToast('warning', 'Partial Declaration', <div><p className="mb-1">Not enough volume for these certificates (they were skipped):</p><ul>{details}</ul></div>);
         } else {
             showToast('success', 'Fully Declared', 'All certificates successfully declared and report downloaded!');
             // Instantly update local UI state to hide the fully declared contract
             setSales(prev => prev.map(s => s.id === contractId ? { ...s, certs_declared: true } : s));
         }
         
         const blob = await response.blob();
         const disposition = response.headers.get('Content-Disposition');
         let filename = `Declaration_Contract_${contractId}.xlsx`;
         
         if (disposition && disposition.includes('filename=')) {
             const matches = /filename="([^"]+)"/.exec(disposition);
             if (matches && matches[1]) filename = matches[1];
         }
         
         const url = window.URL.createObjectURL(blob);
         const a = document.createElement("a");
         a.href = url;
         a.download = filename;
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
         window.URL.revokeObjectURL(url);
      }
      
      // Auto update data in the background
      await fetchData(true);
      
    } catch (error: any) {
      showToast('error', 'Declaration Failed', error.message);
    } finally {
      setIsDeclaringCertId(null);
      setDeclaringContractId(null);
    }
  };

  const openDeclarationView = (contractId: number, firstCert: string) => {
     setViewingDeclarationContract(contractId);
     setDeclarationModalCert(firstCert);
  };

  const handleDeleteDeclaration = async () => {
    if (!contractToDelete) return;
    setIsDeletingDecl(true);
    try {
      const response = await fetch(`/api/declare_certificates?id=${contractToDelete}`, { method: 'DELETE' });
      if (!response.ok) throw new Error("Failed to delete declarations");
      
      // Optimistic updates
      setDeclarations(prev => prev.filter(d => d.contract_id !== contractToDelete));
      setSales(prev => prev.map(s => s.id === contractToDelete ? { ...s, certs_declared: false } : s));
      setViewingDeclarationContract(null);
      setContractToDelete(null);
      showToast('success', 'Reverted', 'Declarations reverted successfully.');
      
      // Auto update data in the background
      await fetchData(true);
    } catch (error: any) {
      showToast('error', 'Error deleting declarations', error.message);
    } finally {
      setIsDeletingDecl(false);
    }
  };

  // ⚡ O(N) Memoization for Contracts Tab Filtering
  const filteredContracts = useMemo(() => {
    return sales.filter(sale => {
      // ⚡ Robust fallback check for missing attributes safely utilizing the optimized bool parser
      const isDeclared = bool(sale.certs_declared ?? (sale as any).certsDeclared);
      
      // Certs declared filter: Hide fully declared contracts unless the "Show All Contracts" toggle is ON
      if (!showDeclaredContracts && isDeclared) return false;

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
  }, [sales, contractSearch, showDeclaredContracts]);

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

    // ⚡ PRE-CALCULATED CROP YEAR BOUNDS (O(1) execution outside loop)
    // Coffee Season: September 1st to August 31st
    const today = new Date();
    const currentMonth = today.getMonth(); // 0 is Jan, 8 is Sept
    const startYear = currentMonth < 8 ? today.getFullYear() - 1 : today.getFullYear();
    const seasonStartDate = new Date(startYear, 8, 1).getTime();
    const seasonEndDate = new Date(startYear + 1, 7, 31, 23, 59, 59, 999).getTime();

    stocks.forEach(stock => {
      const isCertified = stock[flag] === 1 || stock[flag] === true || stock[flag] === '1';
      
      if (isCertified) {
        // Crop Year Date Filtering
        if (positionView === 'crop_year') {
           if (!stock.recorded_date) return;
           const recTime = new Date(stock.recorded_date).getTime();
           if (Number.isNaN(recTime) || recTime < seasonStartDate || recTime > seasonEndDate) return;
        }

        const isDual = bool(stock.aaa_project) && bool(stock.cafe_certified);
        if (isDual && activeCert === 'AAA') return; 

        // Calculate Balance Instead of Total Purchased Weight
        const rawWeight = getEffectiveWeight(stock, activeCert); 
        const declaredField = certToField(activeCert) as keyof CertifiedStock;
        const declaredWeight = asNumber(stock[declaredField]);
        const weight = Math.max(0, rawWeight - declaredWeight); 
        
        // ⚡ OPTIMIZATION: Instantly skip allocation evaluation if volume is depleted
        if (weight <= 0) return; 

        const strat = stock.strategy || 'Unassigned';
        if (!strategyMap.has(strat)) strategyMap.set(strat, { strategy: strat, available: 0, shipmentsByMonth: {}, totalShipment: 0 });
        
        const record = strategyMap.get(strat)!;
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
      // Only deduct volumes for contracts that have NOT been fully declared
      const isDeclared = bool(sale.certs_declared ?? (sale as any).certsDeclared);
      if (isDeclared) return;

      const certList = parseCerts(sale.certifications).map(c => c.toUpperCase().replace(/[^A-Z0-9]/g, ''));
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
  }, [activeCert, stocks, sales, positionView]); 

  // --- TRACKER TAB MEMOS ---
  const trackerVisibleStocks = useMemo(() => {
    return stocks
      .filter((stock) => matchesTrackerCert(stock, trackerCert))
      .filter((stock) => {
         const isDual = bool(stock.aaa_project) && bool(stock.cafe_certified);
         if (isDual && trackerCert === 'AAA') return false;
         return true;
      })
      .filter((stock) => (trackerDateStartFilter || trackerDateEndFilter ? isWithinDateRange(stock.recorded_date, trackerDateStartFilter, trackerDateEndFilter) : true));
  }, [stocks, trackerCert, trackerDateStartFilter, trackerDateEndFilter]);

  const trackerTableColumns = useMemo(() => getTrackerColumns(trackerCert, unit), [trackerCert, unit]);

  const trackerHolderRows = useMemo(() => {
    const holders = trackerVisibleStocks.reduce<Record<string, number>>((acc, stock) => {
      const holder = getTrackerHolderLabel(stock, trackerCert);
      acc[holder] = (acc[holder] || 0) + getEffectiveWeight(stock, trackerCert);
      return acc;
    }, {});

    return (Object.entries(holders) as [string, number][])
      .map(([name, value]) => ({ name, value: asNumber(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [trackerVisibleStocks, trackerCert]);

  const trackerExpirySummary = useMemo(() => {
    const result = {
      totalWithExpiry: 0, expired: 0, within7: 0, within30: 0, within60: 0, within90: 0,
      within120: 0, noExpiry: 0, nextExpiryLabel: "—", nextExpiryDays: null as number | null,
      nextExpiryLot: "—", averageDays: null as number | null,
    };

    let totalDays = 0;

    trackerVisibleStocks.forEach((stock) => {
      const expiryInfo = getTrackerDisplayedExpiry(stock, trackerCert);
      if (expiryInfo.days === null) {
        result.noExpiry += 1;
        return;
      }
      result.totalWithExpiry += 1;
      totalDays += expiryInfo.days;
      if (expiryInfo.days < 0) result.expired += 1;
      else if (expiryInfo.days <= 7) result.within7 += 1;
      else if (expiryInfo.days <= 30) result.within30 += 1;
      else if (expiryInfo.days <= 60) result.within60 += 1;
      else if (expiryInfo.days <= 90) result.within90 += 1;
      else if (expiryInfo.days <= 120) result.within120 += 1;

      if (result.nextExpiryDays === null || expiryInfo.days < result.nextExpiryDays) {
        result.nextExpiryDays = expiryInfo.days;
        result.nextExpiryLabel = expiryInfo.label;
        result.nextExpiryLot = displayText(stock.lot_number);
      }
    });

    if (result.totalWithExpiry > 0) {
      result.averageDays = Number((totalDays / result.totalWithExpiry).toFixed(1));
    }

    return result;
  }, [trackerVisibleStocks, trackerCert]);


  const trackerVisibleRecordCount = trackerVisibleStocks.length;
  const trackerVisibleDateLabel = formatRangeLabel(trackerDateStartFilter, trackerDateEndFilter);
  const trackerSelectedLabel = trackerCert === "ALL" ? "All certifications" : trackerCert;
  const trackerVisibleRows = useMemo(() => trackerVisibleStocks.map((stock) => buildTrackerRow(stock, trackerCert)), [trackerVisibleStocks, trackerCert]);

  const allocationSummary = useMemo(() => {
    const summary: Record<string, { label: string, lotKg: number, lotCount: number, contractCount: number, declaredKg: number, balanceKg: number }> = {
      RFA: { label: "RFA", lotKg: 0, lotCount: 0, contractCount: 0, declaredKg: 0, balanceKg: 0 },
      CAFE: { label: "CAFE", lotKg: 0, lotCount: 0, contractCount: 0, declaredKg: 0, balanceKg: 0 },
      "NET ZERO": { label: "NET ZERO", lotKg: 0, lotCount: 0, contractCount: 0, declaredKg: 0, balanceKg: 0 },
      EUDR: { label: "EUDR", lotKg: 0, lotCount: 0, contractCount: 0, declaredKg: 0, balanceKg: 0 },
      AAA: { label: "AAA", lotKg: 0, lotCount: 0, contractCount: 0, declaredKg: 0, balanceKg: 0 },
      "AAA/CP": { label: "AAA/CP", lotKg: 0, lotCount: 0, contractCount: 0, declaredKg: 0, balanceKg: 0 },
    };

    stocks.forEach(stock => {
      const aaa = bool(stock.aaa_project);
      const cafe = bool(stock.cafe_certified);
      if (bool(stock.rfa_certified)) { summary.RFA.lotCount++; summary.RFA.lotKg += getEffectiveWeight(stock, 'RFA'); }
      if (cafe) { summary.CAFE.lotCount++; summary.CAFE.lotKg += getEffectiveWeight(stock, 'CAFE'); }
      if (bool(stock.netzero_project)) { summary["NET ZERO"].lotCount++; summary["NET ZERO"].lotKg += getEffectiveWeight(stock, 'NET ZERO'); }
      if (bool(stock.eudr_certified)) { summary.EUDR.lotCount++; summary.EUDR.lotKg += getEffectiveWeight(stock, 'EUDR'); }
      if (aaa) {
         if (cafe) { summary["AAA/CP"].lotCount++; summary["AAA/CP"].lotKg += getEffectiveWeight(stock, 'AAA'); }
         else { summary.AAA.lotCount++; summary.AAA.lotKg += getEffectiveWeight(stock, 'AAA'); }
      }
    });

    sales.forEach(sale => {
      const certs = parseCerts(sale.certifications).map(c => c.toUpperCase());
      if (certs.includes('RFA')) summary.RFA.contractCount++;
      if (certs.includes('CAFE')) summary.CAFE.contractCount++;
      if (certs.includes('NET ZERO')) summary["NET ZERO"].contractCount++;
      if (certs.includes('EUDR')) summary.EUDR.contractCount++;
      if (certs.includes('AAA') || certs.includes('AAA/CP') || certs.includes('CP')) {
          if (certs.includes('AAA/CP') || certs.includes('CAFE') || certs.includes('CP')) summary["AAA/CP"].contractCount++;
          else summary.AAA.contractCount++;
      }
    });

    declarations.forEach(decl => {
       summary.RFA.declaredKg += asNumber(decl.rfa_declared_weight);
       summary.CAFE.declaredKg += asNumber(decl.cafe_declared_weight);
       summary["NET ZERO"].declaredKg += asNumber(decl.netzero_declared_weight);
       summary.EUDR.declaredKg += asNumber(decl.eudr_declared_weight);
       
       if (asNumber(decl.aaa_declared_weight) > 0) {
           if (asNumber(decl.cafe_declared_weight) > 0) summary["AAA/CP"].declaredKg += asNumber(decl.aaa_declared_weight);
           else summary.AAA.declaredKg += asNumber(decl.aaa_declared_weight);
       }
    });

    (Object.keys(summary) as Array<keyof typeof summary>).forEach(k => {
       summary[k].balanceKg = summary[k].lotKg - summary[k].declaredKg;
    });

    return summary;
  }, [stocks, sales, declarations]);

  const renderAllocationCard = (label: string, bucket: { lotKg: number, lotCount: number, contractCount: number, declaredKg: number, balanceKg: number }) => (
    <div key={label} className="rounded-2xl border border-[#D6D2C4] bg-[#F5F5F3] p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#968C83]">{label}</div>
      <div className="mt-2 text-2xl font-bold text-[#51534a]">{formatQty(bucket.lotKg, unit)} <span className="text-sm font-normal text-[#968C83]">{unitText(unit)}</span></div>
      <div className="mt-4 space-y-1 text-xs text-[#51534a]">
        <div className="flex items-center justify-between gap-2"><span>Stock lots</span><span className="font-bold">{bucket.lotCount}</span></div>
        <div className="flex items-center justify-between gap-2"><span>Linked contracts</span><span className="font-bold">{bucket.contractCount}</span></div>
        <div className="flex items-center justify-between gap-2"><span>Declared</span><span className="font-bold">{formatQty(bucket.declaredKg, unit)} {unitText(unit)}</span></div>
        <div className="flex items-center justify-between gap-2 pt-1"><span>Balance</span><span className={`font-bold ${bucket.balanceKg >= 0 ? "text-[#007680]" : "text-[#B9975B]"}`}>{bucket.balanceKg > 0 ? "+" : ""}{formatQty(bucket.balanceKg, unit)} {unitText(unit)}</span></div>
      </div>
    </div>
  );

  const declaredContractsSummary = useMemo(() => {
    const map = new Map<number, {
       contract_id: number; contract_number: string; client: string; contract_weight: number;
       shipping_date: string; certs: Set<string>; lots: DeclarationRow[];
    }>();

    declarations.forEach((row) => {
       if (!map.has(row.contract_id)) {
           map.set(row.contract_id, {
               contract_id: row.contract_id, contract_number: row.contract_number, client: row.client,
               contract_weight: asNumber(row.contract_weight), shipping_date: row.shipping_date,
               certs: new Set<string>(), lots: []
           });
       }
       const c = map.get(row.contract_id)!;
       c.lots.push(row);
       
       if (asNumber(row.rfa_declared_weight) > 0) c.certs.add('RFA');
       if (asNumber(row.eudr_declared_weight) > 0) c.certs.add('EUDR');
       if (asNumber(row.cafe_declared_weight) > 0) c.certs.add('CAFE');
       if (asNumber(row.impact_declared_weight) > 0) c.certs.add('Impact');
       if (asNumber(row.aaa_declared_weight) > 0) c.certs.add('AAA');
       if (asNumber(row.netzero_declared_weight) > 0) c.certs.add('NET ZERO');
    });
    
    return Array.from(map.values()).sort((a, b) => b.contract_id - a.contract_id);
  }, [declarations]);


  const handleUploadSol = async () => {
    if (!solFile) return;
    const formData = new FormData();
    formData.append('sol_file', solFile);

    try {
      const response = await fetch(process.env.COBRA_MICROSERVICE_URL+'/api/upload_sol_report', {
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
      // Auto update data in the background
      await fetchData(true);
      
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
      const response = await fetch(process.env.COBRA_MICROSERVICE_URL+'/api/xbs_purchase_upload', { method: 'POST', body: formData });
      if (!response.ok) throw new Error("Failed to upload purchases.");
      
      alert("Purchases uploaded successfully!");
      setIsPurchaseModalOpen(false);
      setIsAddModalOpen(false);
      setPurchaseFile(null);
      setPurchaseSaleNumber('');
      setIsDirectSale(true);
      
      // Auto update data in the background
      await fetchData(true);
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
      
      // Optimistic update
      if (data.success && data.sale) {
        setSales(prev => [...prev, data.sale]);
      }
      
      setIsManualSalesModalOpen(false);
      setManualSaleForm({ contractNumber: '', client: '', weight: '', quality: '', grade: '', shippingDate: '', certifications: [] });
      
      // Auto update data in the background
      await fetchData(true);
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
          
          // Optimistic update
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
          showToast('success', 'Updated', 'Contract updated successfully');
          
          // Auto update data in the background
          await fetchData(true);
      } catch (e) {
          showToast('error', 'Error', 'Failed to update contract');
      }
  };

  function downloadTrackerView(format: "csv" | "excel") {
    const columns = getTrackerColumns(trackerCert, unit);
    const rows = getTrackerExportRows(trackerVisibleRows, columns);
    const rangeSlug = [trackerDateStartFilter || "start", trackerDateEndFilter || "end"].filter(Boolean).join("-");
    const title = `certified-stock-tracker-${trackerSelectedLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${trackerDateStartFilter || trackerDateEndFilter ? `-${rangeSlug}` : ""}`;
    const downloadTitle = title.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    const filename = format === "csv" ? `${downloadTitle}.csv` : `${downloadTitle}.xls`;
    const blob = format === "csv"
      ? new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" })
      : new Blob([toExcelHtml(`Certified Stock Tracker - ${trackerSelectedLabel}`, rows)], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `certified-stock-tracker.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadOpen(false);
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
        <div>Brewing Certification Data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#D6D2C4] font-sans text-[#51534a] md:p-1 relative">
      
      {/* --- TOAST NOTIFICATION --- */}
      <div className={`fixed bottom-6 right-6 z-[100] transition-all duration-300 transform ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
        <div className={`bg-white border-l-4 shadow-xl rounded-lg p-4 max-w-sm w-full flex gap-3 items-start ${toast.type === 'success' ? 'border-[#007680]' : toast.type === 'warning' ? 'border-[#B9975B]' : 'border-red-500'}`}>
          <div className={`mt-0.5 ${toast.type === 'success' ? 'text-[#007680]' : toast.type === 'warning' ? 'text-[#B9975B]' : 'text-red-500'}`}>
            {toast.type === 'success' ? <CheckCircle size={18} /> : toast.type === 'warning' ? <ShieldCheck size={18} /> : <X size={18} />}
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-[#51534a]">{toast.title}</h4>
            <div className="text-xs text-[#968C83] mt-1">{toast.message}</div>
          </div>
          <button onClick={() => setToast(prev => ({ ...prev, show: false }))} className="text-[#968C83] hover:text-[#51534a]">
            <X size={16} />
          </button>
        </div>
      </div>

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

      {/* --- DECLARATION CONFIGURATION MODAL --- */}
      {isDeclaringConfigOpen && (() => {
        const declaringContract = sales.find(s => s.id === declaringContractId);
        return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#F5F5F3] w-full max-w-3xl rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#D6D2C4] bg-white">
              <div>
                 <h3 className="font-bold text-[#51534a] text-lg">Declaration: {declaringContract?.contract_number}</h3>
                 <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-medium text-[#007680] bg-[#007680]/10 px-2 py-0.5 rounded">
                        {declaringContract?.quality || declaringContract?.strategy || 'Unassigned Quality'}
                    </span>
                    {parseCerts(declaringContract?.certifications).map(cert => (
                        <span key={cert} className="text-[10px] font-bold text-[#51534a] bg-[#D6D2C4]/30 border border-[#D6D2C4] px-1.5 py-0.5 rounded-sm">
                            {cert}
                        </span>
                    ))}
                    {parseCerts(declaringContract?.certifications).length === 0 && (
                        <span className="text-[10px] italic text-[#968C83]">Uncertified</span>
                    )}
                 </div>
              </div>
              <button onClick={() => setIsDeclaringConfigOpen(false)} className="text-[#968C83] hover:text-[#51534a] p-1.5 rounded-full hover:bg-[#D6D2C4]/50">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 flex flex-col sm:flex-row gap-5">
              {/* Region Section */}
              <div className="flex-1 bg-white border border-[#D6D2C4] rounded-xl flex flex-col overflow-hidden shadow-sm">
                 <div className="px-4 py-3 border-b border-[#D6D2C4] bg-[#EFEFE9] flex justify-between items-center">
                    <h4 className="font-bold text-[#51534a] text-sm">Region (County)</h4>
                    <span className="text-[10px] font-bold bg-white border border-[#D6D2C4] px-2 py-0.5 rounded text-[#007680]">{selectedRegions.size} Selected</span>
                 </div>
                 <div className="p-3 max-h-[35vh] overflow-y-auto">
                    {uniqueRegions.length > 0 ? (
                       <div className="grid grid-cols-2 gap-2">
                          {uniqueRegions.map(region => (
                             <label key={region} className="flex items-start gap-2 p-2 hover:bg-[#F5F5F3] rounded-lg cursor-pointer transition-colors border border-transparent hover:border-[#D6D2C4]/50">
                                <input 
                                   type="checkbox" 
                                   className="w-4 h-4 mt-0.5 text-[#007680] rounded border-[#D6D2C4] focus:ring-[#007680]"
                                   checked={selectedRegions.has(region)}
                                   onChange={(e) => {
                                      const newSet = new Set(selectedRegions);
                                      if (e.target.checked) newSet.add(region);
                                      else newSet.delete(region);
                                      setSelectedRegions(newSet);
                                   }}
                                />
                                <span className="text-sm font-medium text-[#51534a] leading-tight">{region}</span>
                             </label>
                          ))}
                       </div>
                    ) : <div className="p-4 text-xs text-[#968C83] italic text-center">No region data available</div>}
                 </div>
                 <div className="border-t border-[#D6D2C4] p-3 bg-[#F5F5F3] flex justify-end">
                    <button 
                       type="button" 
                       className="text-[10px] font-bold uppercase tracking-wider text-[#007680] hover:text-[#005a61] transition-colors flex items-center gap-1 bg-white px-3 py-1.5 rounded border border-[#D6D2C4] shadow-sm"
                       onClick={() => setSelectedRegions(selectedRegions.size === uniqueRegions.length ? new Set() : new Set(uniqueRegions))}
                    >
                       {selectedRegions.size === uniqueRegions.length ? 'Deselect All' : 'Select All'}
                    </button>
                 </div>
              </div>

              {/* Grade Section */}
              <div className="flex-1 bg-white border border-[#D6D2C4] rounded-xl flex flex-col overflow-hidden shadow-sm">
                 <div className="px-4 py-3 border-b border-[#D6D2C4] bg-[#EFEFE9] flex justify-between items-center">
                    <h4 className="font-bold text-[#51534a] text-sm">Grade</h4>
                    <span className="text-[10px] font-bold bg-white border border-[#D6D2C4] px-2 py-0.5 rounded text-[#007680]">{selectedGrades.size} Selected</span>
                 </div>
                 <div className="p-3 max-h-[35vh] overflow-y-auto">
                    {uniqueGrades.length > 0 ? (
                       <div className="grid grid-cols-2 gap-2">
                          {uniqueGrades.map(grade => (
                             <label key={grade} className="flex items-start gap-2 p-2 hover:bg-[#F5F5F3] rounded-lg cursor-pointer transition-colors border border-transparent hover:border-[#D6D2C4]/50">
                                <input 
                                   type="checkbox" 
                                   className="w-4 h-4 mt-0.5 text-[#007680] rounded border-[#D6D2C4] focus:ring-[#007680]"
                                   checked={selectedGrades.has(grade)}
                                   onChange={(e) => {
                                      const newSet = new Set(selectedGrades);
                                      if (e.target.checked) newSet.add(grade);
                                      else newSet.delete(grade);
                                      setSelectedGrades(newSet);
                                   }}
                                />
                                <span className="text-sm font-medium text-[#51534a] leading-tight">{grade}</span>
                             </label>
                          ))}
                       </div>
                    ) : <div className="p-4 text-xs text-[#968C83] italic text-center">No grade data available</div>}
                 </div>
                 <div className="border-t border-[#D6D2C4] p-3 bg-[#F5F5F3] flex justify-end">
                    <button 
                       type="button" 
                       className="text-[10px] font-bold uppercase tracking-wider text-[#007680] hover:text-[#005a61] transition-colors flex items-center gap-1 bg-white px-3 py-1.5 rounded border border-[#D6D2C4] shadow-sm"
                       onClick={() => setSelectedGrades(selectedGrades.size === uniqueGrades.length ? new Set() : new Set(uniqueGrades))}
                    >
                       {selectedGrades.size === uniqueGrades.length ? 'Deselect All' : 'Select All'}
                    </button>
                 </div>
              </div>
            </div>

            <div className="p-5 border-t border-[#D6D2C4] bg-white flex justify-end gap-3">
              <button type="button" onClick={() => setIsDeclaringConfigOpen(false)} className="px-5 py-2.5 text-sm font-bold text-[#968C83] hover:bg-[#F5F5F3] rounded-lg transition-colors">Cancel</button>
              <button 
                 type="button" 
                 onClick={submitDeclareCertificates}
                 disabled={selectedRegions.size === 0 && selectedGrades.size === 0}
                 className="bg-[#007680] text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-[#007680]/90 transition-all shadow-sm disabled:opacity-50"
              >
                 Confirm Declaration
              </button>
            </div>
          </div>
        </div>
        );
      })()}

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
                    <option key={cert} value={cert} disabled={manualSaleForm.certifications.includes(cert as CertType)}>
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

      {/* --- DECLARATION VIEW MODAL --- */}
      {viewingDeclarationContract && (() => {
          const contract = declaredContractsSummary.find(c => c.contract_id === viewingDeclarationContract);
          if (!contract) return null;
          
          const activeLots = contract.lots.filter(l => {
              const field = certToField(declarationModalCert);
              return field && asNumber(l[field as keyof DeclarationRow]) > 0;
          });
          
          const totalDeclared = activeLots.reduce((sum, l) => sum + asNumber(l[certToField(declarationModalCert) as keyof DeclarationRow]), 0);
          
          return (
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
                  <div className="bg-white w-full max-w-5xl rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-8 max-h-[90vh]">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-[#D6D2C4] bg-[#F5F5F3]">
                          <div>
                              <h3 className="font-bold text-[#51534a] text-lg">Declaration Details: {contract.contract_number}</h3>
                              <p className="text-xs text-[#968C83]">Client: {contract.client || '-'} · Contract Weight: {formatQty(contract.contract_weight, unit)} {unitText(unit)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                              <button 
                                onClick={() => setContractToDelete(contract.contract_id)} 
                                className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
                              >
                                  Delete Allocation
                              </button>
                              <button onClick={() => setViewingDeclarationContract(null)} className="text-[#968C83] hover:text-[#51534a] p-1.5 rounded-full hover:bg-[#D6D2C4]/50">
                                  <X size={20} />
                              </button>
                          </div>
                      </div>
                      
                      <div className="flex border-b border-[#D6D2C4] px-6 bg-white overflow-x-auto">
                          {Array.from(contract.certs).map(cert => (
                              <button 
                                  key={cert}
                                  onClick={() => setDeclarationModalCert(cert)}
                                  className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${declarationModalCert === cert ? 'border-[#007680] text-[#007680]' : 'border-transparent text-[#968C83] hover:text-[#51534a]'}`}
                              >
                                  {cert}
                              </button>
                          ))}
                          {contract.certs.size === 0 && (
                             <span className="py-3 text-sm font-medium text-[#968C83] italic">No active certifications recorded.</span>
                          )}
                      </div>
                      
                      <div className="p-6 overflow-y-auto bg-[#F5F5F3] flex-1">
                          <div className="bg-white border border-[#D6D2C4] rounded-xl overflow-hidden shadow-sm">
                              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                                  <table className="w-full text-sm text-left whitespace-nowrap">
                                      <thead className="bg-[#51534a] text-white font-medium sticky top-0 z-10 text-xs uppercase tracking-wider">
                                          <tr>
                                              <th className="py-3 px-4">Lot Number</th>
                                              <th className="py-3 px-4">Grade</th>
                                              <th className="py-3 px-4">Strategy</th>
                                              <th className="py-3 px-4">Cooperative / Wet Mill</th>
                                              <th className="py-3 px-4 text-right">Lot Purch. Weight</th>
                                              <th className="py-3 px-4 text-right bg-[#007680] border-l border-white/10">Declared ({unitText(unit)})</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-[#D6D2C4]">
                                          {activeLots.length > 0 ? activeLots.map((lot, idx) => (
                                              <tr key={lot.stock_id} className={idx % 2 === 0 ? "bg-white" : "bg-[#FCF7EA] hover:bg-[#D6D2C4]/20 transition-colors"}>
                                                  <td className="py-3 px-4 font-bold text-[#007680]">{lot.lot_number}</td>
                                                  <td className="py-3 px-4 text-[#51534a]">{lot.grade || '-'}</td>
                                                  <td className="py-3 px-4 text-[#51534a]">{lot.strategy || '-'}</td>
                                                  <td className="py-3 px-4 text-[#51534a]">
                                                      <div className="flex flex-col">
                                                          <span>{lot.cooperative || '-'}</span>
                                                          <span className="text-[10px] text-[#968C83]">{lot.wet_mill || '-'}</span>
                                                      </div>
                                                  </td>
                                                  <td className="py-3 px-4 text-right text-[#968C83]">{formatQty(asNumber(lot.lot_purchased_weight), unit)}</td>
                                                  <td className="py-3 px-4 text-right font-bold text-[#007680] bg-[#A4DBE8]/10 border-l border-[#D6D2C4]/50">
                                                      {formatQty(asNumber(lot[certToField(declarationModalCert) as keyof DeclarationRow]), unit)}
                                                  </td>
                                              </tr>
                                          )) : (
                                              <tr><td colSpan={6} className="py-8 text-center text-[#968C83] italic">No lots found for the {declarationModalCert} certification.</td></tr>
                                          )}
                                      </tbody>
                                      <tfoot className="bg-[#EFEFE9] sticky bottom-0 border-t-2 border-[#D6D2C4] shadow-inner font-bold text-[#51534a]">
                                          <tr>
                                              <td colSpan={5} className="py-3 px-4 text-right">TOTAL {declarationModalCert} DECLARED:</td>
                                              <td className="py-3 px-4 text-right text-[#007680] border-l border-[#D6D2C4]/50">{formatQty(totalDeclared, unit)}</td>
                                          </tr>
                                      </tfoot>
                                  </table>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          );
      })()}

      {/* --- DELETE CONFIRMATION MODAL --- */}
      {contractToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="font-bold text-lg text-[#51534a] mb-2">Delete Declaration?</h3>
              <p className="text-sm text-[#968C83]">This will instantly revert all allocated volumes back to the physical stock pool. Are you sure you want to proceed?</p>
            </div>
            <div className="flex border-t border-[#D6D2C4] bg-[#F5F5F3]">
              <button 
                onClick={() => setContractToDelete(null)} 
                disabled={isDeletingDecl} 
                className="flex-1 py-3 text-sm font-bold text-[#51534a] hover:bg-[#D6D2C4]/30 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <div className="w-px bg-[#D6D2C4]"></div>
              <button 
                onClick={handleDeleteDeclaration} 
                disabled={isDeletingDecl} 
                className="flex-1 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {isDeletingDecl ? 'Deleting...' : 'Yes, Delete'}
              </button>
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
              Certification Positions
            </h1>
            <p className="text-[#968C83] text-sm mt-1">Certification, Tracker, Contracts & Declarations</p>
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
            onClick={() => setActiveTab('certification')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
              activeTab === 'certification' ? 'border-[#007680] text-[#007680]' : 'border-transparent text-[#968C83] hover:text-[#51534a] hover:border-[#968C83]/30'
            }`}
          >
            <ListChecks size={16} /> Certification
          </button>
          <button
            onClick={() => setActiveTab('tracker')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
              activeTab === 'tracker' ? 'border-[#007680] text-[#007680]' : 'border-transparent text-[#968C83] hover:text-[#51534a] hover:border-[#968C83]/30'
            }`}
          >
            <Users size={16} /> Certified Stock Tracker
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
            onClick={() => setActiveTab('declarations')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
              activeTab === 'declarations' ? 'border-[#007680] text-[#007680]' : 'border-transparent text-[#968C83] hover:text-[#51534a] hover:border-[#968C83]/30'
            }`}
          >
            <FileCheck size={16} /> Declarations
          </button>
        </div>

        {/* --- TAB CONTENT --- */}
        <main className="space-y-6">
          
          {/* Sub Navigation (Only for Certification Tab) */}
          {activeTab === 'certification' && (
            <div className="flex flex-col gap-4 pb-4 border-b border-[#968C83]/20">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
                  <div className="flex flex-col gap-2">
                     <span className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider">Certificates</span>
                     <FilterTabs tabs={CERTIFICATES_LIST} active={activeCert} onChange={setActiveCert} />
                  </div>
                  <div className="hidden sm:block w-px h-8 bg-[#D6D2C4] mb-1"></div>
                  <div className="flex flex-col gap-2">
                     <span className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider">Projects</span>
                     <FilterTabs tabs={PROJECTS_LIST} active={activeCert} onChange={setActiveCert} />
                  </div>
                </div>

                {/* View Mode Toggle */}
                <div className="flex bg-[#F5F5F3] p-1 rounded-lg border border-[#D6D2C4] shadow-sm">
                  <button
                    onClick={() => setPositionView('true_position')}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                      positionView === 'true_position' ? 'bg-[#007680] text-white shadow-sm' : 'text-[#968C83] hover:text-[#51534a]'
                    }`}
                  >
                    True Position
                  </button>
                  <button
                    onClick={() => setPositionView('crop_year')}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                      positionView === 'crop_year' ? 'bg-[#007680] text-white shadow-sm' : 'text-[#968C83] hover:text-[#51534a]'
                    }`}
                  >
                    Crop Year
                  </button>
                </div>
              </div>
              
              <div className="text-xs text-[#968C83] italic">
                Showing {positionView === 'crop_year' ? 'Current Season' : 'All-Time'} undeclared balances for {activeCert} {PROJECTS_LIST.includes(activeCert as any) ? 'project' : 'certificate'} strategies.
              </div>
            </div>
          )}

          {/* --- KPI CARDS (Certifications) --- */}
          {activeTab === 'certification' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 border-l-4 border-l-[#007680]">
                <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">
                  {activeCert} TOTAL STOCK
                </div>
                <div className="text-2xl font-bold text-[#51534a] mt-1">
                  {formatNumber(convertQty(kpis.stock, unit))} <span className="text-sm font-normal text-[#968C83]">{unitText(unit)}</span>
                </div>
                {(['RFA', 'CAFE', 'EUDR'].includes(activeCert)) && (
                  <div className="text-[10px] text-[#007680] mt-1.5 font-bold bg-[#A4DBE8]/30 border border-[#007680]/10 inline-block px-1.5 py-0.5 rounded">
                     Supply Chain (Kenyacof): {formatNumber(convertQty(kpis.supplyChainStock, unit))} {unitText(unit)}
                  </div>
                )}
              </Card>
              <Card className="p-4 border-l-4 border-l-[#5B3427]">
                <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">
                   {activeCert} TOTAL SHORTS
                </div>
                <div className="text-2xl font-bold text-[#5B3427] mt-1 flex items-center gap-2">
                  {formatNumber(convertQty(kpis.shorts, unit))} <span className="text-sm font-normal text-[#968C83]">{unitText(unit)}</span>
                  <TrendingDown size={18} className="text-[#B9975B]" />
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-l-[#007680]">
                <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">
                   {activeCert} NET POSITION
                </div>
                <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${kpis.net >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                  {kpis.net > 0 ? '+' : ''}{formatNumber(convertQty(kpis.net, unit))} <span className="text-sm font-normal text-[#968C83]">{unitText(unit)}</span>
                  {kpis.net >= 0 ? <TrendingUp size={18} className="text-[#97D700]" /> : <TrendingDown size={18} />}
                </div>
              </Card>
            </div>
          )}

          {/* --- POSITION TABLE (Certification Tab) --- */}
          {activeTab === 'certification' && (
            <Card className="overflow-hidden border-none shadow-md">
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-[#51534a] text-white font-medium sticky top-0 z-10 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="py-2 px-4 w-1/4">Strategy</th>
                      <th className="py-2 px-4 text-right">Available ({unit})</th>
                      {uniqueMonths.map(month => (
                        <th key={month} className="py-2 px-4 text-right bg-[#5B3427]">{month}</th>
                      ))}
                      <th className="py-2 px-4 text-right bg-[#B9975B]/20 border-l border-white/10">Total Shipment</th>
                      <th className="py-2 px-4 text-right bg-[#007680] border-l border-white/10">Net Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D6D2C4]">
                    {tableData.length > 0 ? tableData.map((row) => {
                      let runningAvailable = row.available; // Initialize running balance for inline deduction
                      
                      return (
                        <tr key={row.strategy} className="bg-white hover:bg-[#D6D2C4]/20 transition-colors group">
                          <td className="py-1.5 px-4 font-medium text-[#007680]">{row.strategy}</td>
                          <td className="py-1.5 px-4 text-right font-bold text-[#51534a] bg-[#F5F5F3]">{formatNumber(convertQty(row.available, unit))}</td>
                          {uniqueMonths.map(month => {
                            const val = row.shipmentsByMonth[month] || 0;
                            let colorClass = "text-[#968C83]";
                            
                            if (Math.abs(val) > 0.01) {
                              // Recursively deduct and assign colors based on availability
                              if (runningAvailable >= val) {
                                colorClass = "text-[#007680] font-medium"; // Green (Enough stock)
                              } else {
                                colorClass = "text-red-500 font-bold"; // Red (Not enough stock)
                              }
                              runningAvailable -= val;
                            }
                            
                            return <td key={month} className={`py-1.5 px-4 text-right ${colorClass}`}>{Math.abs(val) > 0.01 ? formatNumber(convertQty(val, unit)) : '-'}</td>;
                          })}
                          <td className="py-1.5 px-4 text-right font-medium text-[#5B3427] bg-[#B9975B]/5 border-l border-[#D6D2C4]/50">{formatNumber(convertQty(row.totalShipment, unit))}</td>
                          <td className={`py-1.5 px-4 text-right font-bold border-l border-[#D6D2C4]/50 bg-[#A4DBE8]/10 ${row.netPosition >= 0 ? 'text-[#007680]' : 'text-red-500'}`}>
                            {row.netPosition > 0 ? '+' : ''}{formatNumber(convertQty(row.netPosition, unit))}
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={uniqueMonths.length + 4} className="py-8 text-center text-[#968C83] italic">No {activeCert} positions found.</td></tr>
                    )}
                  </tbody>
                  {tableData.length > 0 && (
                     <tfoot className="bg-[#EFEFE9] sticky bottom-0 border-t-2 border-[#D6D2C4] shadow-inner font-bold text-[#51534a]">
                        <tr>
                           <td className="py-2 px-4">TOTALS</td>
                           <td className="py-2 px-4 text-right">{formatNumber(convertQty(kpis.stock, unit))}</td>
                           {uniqueMonths.map(month => {
                              const monthTotal = tableData.reduce((sum, row) => sum + (row.shipmentsByMonth[month] || 0), 0);
                              return <td key={month} className="py-2 px-4 text-right text-[#5B3427]">{Math.abs(monthTotal) > 0.01 ? formatNumber(convertQty(monthTotal, unit)) : '-'}</td>;
                           })}
                           <td className="py-2 px-4 text-right text-[#5B3427] border-l border-[#D6D2C4]/50">{formatNumber(convertQty(kpis.shorts, unit))}</td>
                           <td className={`py-2 px-4 text-right border-l border-[#D6D2C4]/50 ${kpis.net >= 0 ? 'text-[#007680]' : 'text-red-500'}`}>
                              {kpis.net > 0 ? '+' : ''}{formatNumber(convertQty(kpis.net, unit))}
                           </td>
                        </tr>
                     </tfoot>
                  )}
                  {tableData.length > 0 && (
                     <tfoot className="bg-[#EFEFE9] sticky bottom-0 border-t-2 border-[#D6D2C4] shadow-inner font-bold text-[#51534a]">
                        <tr>
                           <td className="py-2 px-4">TOTALS</td>
                           <td className="py-2 px-4 text-right">{formatNumber(convertQty(kpis.stock, unit))}</td>
                           {uniqueMonths.map(month => {
                              const monthTotal = tableData.reduce((sum, row) => sum + (row.shipmentsByMonth[month] || 0), 0);
                              return <td key={month} className="py-2 px-4 text-right text-[#5B3427]">{Math.abs(monthTotal) > 0.01 ? formatNumber(convertQty(monthTotal, unit)) : '-'}</td>;
                           })}
                           <td className="py-2 px-4 text-right text-[#5B3427] border-l border-[#D6D2C4]/50">{formatNumber(convertQty(kpis.shorts, unit))}</td>
                           <td className={`py-2 px-4 text-right border-l border-[#D6D2C4]/50 ${kpis.net >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                              {kpis.net > 0 ? '+' : ''}{formatNumber(convertQty(kpis.net, unit))}
                           </td>
                        </tr>
                     </tfoot>
                  )}
                </table>
              </div>
            </Card>
          )}

          {/* --- TRACKER TAB --- */}
          {activeTab === "tracker" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <div className="whitespace-nowrap text-sm font-bold text-[#51534a]">View Segment:</div>
                    <div className="mt-3 flex min-w-max flex-wrap items-center gap-4">
                      <Chip active={trackerCert === "ALL"} onClick={() => setTrackerCert("ALL")}>ALL</Chip>
                      
                      <div className="flex items-center gap-2 bg-[#F5F5F3] p-1.5 rounded-full border border-[#D6D2C4]/50">
                        <span className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider pl-2 pr-1">Certificates</span>
                        {CERTIFICATES_LIST.map((cert) => (
                          <Chip key={cert} active={trackerCert === cert} onClick={() => setTrackerCert(cert)}>
                            {cert}
                          </Chip>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 bg-[#F5F5F3] p-1.5 rounded-full border border-[#D6D2C4]/50">
                        <span className="text-[10px] font-bold text-[#968C83] uppercase tracking-wider pl-2 pr-1">Projects</span>
                        {PROJECTS_LIST.map((cert) => (
                          <Chip key={cert} active={trackerCert === cert} onClick={() => setTrackerCert(cert)}>
                            {cert}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#968C83]">Date from</label>
                      <input
                        type="date"
                        value={trackerDateStartDraft}
                        onChange={(e) => setTrackerDateStartDraft(e.target.value)}
                        className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#968C83]">Date to</label>
                      <input
                        type="date"
                        value={trackerDateEndDraft}
                        onChange={(e) => setTrackerDateEndDraft(e.target.value)}
                        className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTrackerDateStartFilter(trackerDateStartDraft);
                        setTrackerDateEndFilter(trackerDateEndDraft);
                      }}
                      disabled={!trackerDateStartDraft && !trackerDateEndDraft}
                      className="rounded-lg bg-[#007680] px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                    >
                      Apply Range
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTrackerDateStartDraft("");
                        setTrackerDateEndDraft("");
                        setTrackerDateStartFilter("");
                        setTrackerDateEndFilter("");
                      }}
                      disabled={!trackerDateStartFilter && !trackerDateEndFilter}
                      className="rounded-lg border border-[#D6D2C4] bg-white px-4 py-2 text-sm font-bold text-[#51534a] shadow-sm disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-xs text-[#968C83]">
                  Showing {trackerVisibleRecordCount} record{trackerVisibleRecordCount === 1 ? "" : "s"} for {trackerSelectedLabel} · {trackerVisibleDateLabel}
                </div>
              </div>

              <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(420px,0.95fr)_minmax(0,1.05fr)]">
                <div className="min-w-0 space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-bold text-[#51534a]">Expiring Soon</div>
                        <div className="mt-1 text-xs text-[#968C83]">Expiry status for the current tracker view</div>
                      </div>
                      <div className="rounded-full bg-[#A4DBE8]/30 px-3 py-1 text-xs font-bold text-[#007680]">
                        {trackerSelectedLabel}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                      <div className="rounded-2xl bg-[#F5F5F3] p-4">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#968C83]">Expiry counts</div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-xl bg-white p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#968C83]">Expired</div>
                            <div className="mt-1 text-2xl font-bold text-[#B9975B]">{trackerExpirySummary.expired}</div>
                          </div>
                          <div className="rounded-xl bg-white p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#968C83]">0-7 days</div>
                            <div className="mt-1 text-2xl font-bold text-[#007680]">{trackerExpirySummary.within7}</div>
                          </div>
                          <div className="rounded-xl bg-white p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#968C83]">8-30 days</div>
                            <div className="mt-1 text-2xl font-bold text-[#007680]">{trackerExpirySummary.within30}</div>
                          </div>
                          <div className="rounded-xl bg-white p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#968C83]">31-60 days</div>
                            <div className="mt-1 text-2xl font-bold text-[#007680]">{trackerExpirySummary.within60}</div>
                          </div>
                          <div className="rounded-xl bg-white p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#968C83]">61-90 days</div>
                            <div className="mt-1 text-2xl font-bold text-[#007680]">{trackerExpirySummary.within90}</div>
                          </div>
                          <div className="rounded-xl bg-white p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#968C83]">91-120 days</div>
                            <div className="mt-1 text-2xl font-bold text-[#007680]">{trackerExpirySummary.within120}</div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-2xl border border-[#D6D2C4] bg-[#FCF7EA] p-4 text-sm text-[#51534a]">
                        <div className="flex justify-between gap-3"><span>Total lots in view</span><span className="font-bold">{trackerVisibleRecordCount}</span></div>
                        <div className="flex justify-between gap-3"><span>Lots with expiry dates</span><span className="font-bold">{trackerExpirySummary.totalWithExpiry}</span></div>
                        <div className="flex justify-between gap-3"><span>Lots without expiry</span><span className="font-bold">{trackerExpirySummary.noExpiry}</span></div>
                        <div className="flex justify-between gap-3"><span>Next expiry lot</span><span className="font-bold">{trackerExpirySummary.nextExpiryLot}</span></div>
                        <div className="flex justify-between gap-3"><span>Next expiry date</span><span className="font-bold">{trackerExpirySummary.nextExpiryLabel}</span></div>
                        <div className="flex justify-between gap-3"><span>Next expiry status</span><span className="font-bold">{trackerExpirySummary.nextExpiryDays === null ? "—" : trackerExpirySummary.nextExpiryDays < 0 ? "Expired" : `${trackerExpirySummary.nextExpiryDays} days`}</span></div>
                        <div className="flex justify-between gap-3"><span>Average expiry days</span><span className="font-bold">{trackerExpirySummary.averageDays === null ? "—" : `${trackerExpirySummary.averageDays} days`}</span></div>
                        
                        {trackerExpirySummary.totalWithExpiry === 0 ? (
                          <div className="rounded-xl bg-white p-3 text-xs text-[#968C83]">
                            No expiry dates are available for this view. AAA allocations are tracked separately from the certificate expiry fields.
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {trackerCert === "ALL" ? (
                         CERT_FILTERS.map(cert => renderAllocationCard(cert, allocationSummary[cert as keyof typeof allocationSummary]))
                      ) : trackerCert === "AAA" ? (
                         <>
                           {renderAllocationCard("AAA", allocationSummary["AAA"])}
                           {renderAllocationCard("AAA/CP", allocationSummary["AAA/CP"])}
                         </>
                      ) : (
                         renderAllocationCard(trackerCert, allocationSummary[trackerCert as string])
                      )}
                    </div>

                    <div className="mt-5 rounded-2xl border border-[#D6D2C4] bg-[#F5F5F3] p-4">
                      <div className="mb-4 text-[11px] font-bold uppercase tracking-wider text-[#968C83]">Holder concentration</div>
                      <TrackerDonutChart 
                         data={trackerHolderRows.map((row, i) => ({ ...row, color: ["#007680", "#B9975B", "#51534a", "#968C83", "#A4DBE8", "#5B3427"][i % 6] }))} 
                         unit={unit} 
                      />
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <SectionCard
                    title="Certified Stock Tracker Data"
                    subtitle={`Records currently visible for ${trackerSelectedLabel}${trackerDateStartFilter || trackerDateEndFilter ? ` · ${trackerVisibleDateLabel}` : ""}`}
                    right={
                      <div ref={downloadWrapRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setDownloadOpen((prev) => !prev)}
                          className="flex items-center gap-2 rounded-lg bg-[#007680] px-4 py-2 text-sm font-bold text-white shadow-sm"
                        >
                          <Download size={16} /> Download
                        </button>
                        {downloadOpen ? (
                          <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                            <button type="button" onClick={() => downloadTrackerView("csv")} className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Download CSV</button>
                            <button type="button" onClick={() => downloadTrackerView("excel")} className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Download Excel</button>
                          </div>
                        ) : null}
                      </div>
                    }
                  >
                    <div className="overflow-x-auto rounded-xl border border-[#D6D2C4]">
                      <table className="min-w-[1400px] w-full text-xs">
                        <thead className="sticky top-0 bg-[#51534a] text-white">
                          <tr>
                            {trackerTableColumns.map((column) => (
                              <th key={column.key} className={`px-3 py-2 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}>{column.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {trackerVisibleRows.length > 0 ? trackerVisibleRows.map((row, idx) => (
                            <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-[#FCF7EA]"}>
                              {trackerTableColumns.map((column) => (
                                <td key={column.key} className={`px-3 py-2 ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}>
                                  {column.render(row)}
                                </td>
                              ))}
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan={trackerTableColumns.length} className="px-3 py-8 text-center italic text-[#968C83]">
                                No certified stock records match the selected certification or date range.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>
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
                          checked={showDeclaredContracts}
                          onChange={(e) => setShowDeclaredContracts(e.target.checked)}
                          className="w-4 h-4 text-[#007680] rounded focus:ring-[#007680]"
                      />
                      <span className="text-sm font-bold text-[#51534a]">Show All Contracts</span>
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
                        const isDeclared = bool(sale.certs_declared ?? (sale as any).certsDeclared);

                        return (
                          <tr key={sale.id} className={`bg-white hover:bg-[#D6D2C4]/20 transition-colors ${isEditing ? 'bg-[#F5F5F3]' : ''} ${isDeclared ? 'opacity-60' : ''}`}>
                            <td className="py-3 px-4 font-bold text-[#51534a]">
                                <div className="flex items-center gap-2">
                                  {isDeclared && (
                                     <span className="flex items-center justify-center text-[#007680]" title="Fully Declared">
                                         <CheckCircle size={14} />
                                     </span>
                                  )}
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
                                        <button onClick={() => handleEditClick(sale)} title="Edit Contract" className="p-1.5 text-[#968C83] hover:text-[#007680] hover:bg-[#A4DBE8]/20 rounded transition-colors">
                                            <Pencil size={14} />
                                        </button>
                                        <button 
                                            onClick={() => openDeclarationConfig(sale.id)} 
                                            title="Declare Certificates" 
                                            disabled={isDeclaringCertId === sale.id}
                                            className="p-1.5 text-[#968C83] hover:text-[#007680] hover:bg-[#A4DBE8]/20 rounded transition-colors disabled:opacity-50"
                                        >
                                            <FileCheck size={14} />
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

          {/* --- DECLARATIONS TAB --- */}
          {activeTab === "declarations" && (
            <SectionCard title="Active Declarations" subtitle="Overview of all contracts with registered stock declarations.">
              <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-[#51534a] text-white font-medium sticky top-0 z-10 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Contract</th>
                      <th className="py-3 px-4">Client</th>
                      <th className="py-3 px-4 text-right">Weight ({unitText(unit)})</th>
                      <th className="py-3 px-4">Ship Date</th>
                      <th className="py-3 px-4">Declared Certs</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D6D2C4]">
                    {declaredContractsSummary.length > 0 ? declaredContractsSummary.map((c, idx) => (
                      <tr key={c.contract_id} className={idx % 2 === 0 ? "bg-white" : "bg-[#FCF7EA] hover:bg-[#D6D2C4]/20 transition-colors"}>
                        <td className="py-3 px-4 font-bold text-[#007680]">{c.contract_number}</td>
                        <td className="py-3 px-4 text-[#51534a]">{c.client || '-'}</td>
                        <td className="py-3 px-4 text-right font-medium text-[#5B3427]">{formatQty(c.contract_weight, unit)}</td>
                        <td className="py-3 px-4 text-[#968C83]">{formatDateToMonthYear(c.shipping_date)}</td>
                        <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                                {Array.from(c.certs).map(cert => (
                                    <span key={cert as string} className="rounded-full bg-[#A4DBE8]/30 px-2 py-0.5 text-[10px] font-bold text-[#007680] border border-[#007680]/20">
                                        {cert as string}
                                    </span>
                                ))}
                            </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                            <button 
                                onClick={() => openDeclarationView(c.contract_id, Array.from(c.certs)[0] as string || "")} 
                                className="rounded-lg p-1.5 text-[#007680] hover:bg-[#007680]/10 transition-colors" 
                                title="View Declarations"
                            >
                                <Eye size={16} />
                            </button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="py-8 text-center text-[#968C83] italic">No declarations found in the database.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

        </main>
      </div>
    </div>
  );
}