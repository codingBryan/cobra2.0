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
  Combine,
  Users,
  Search,
  ChevronRight,
  Download,
  FileCheck
} from 'lucide-react';

// --- Constants & Types ---
const KG_TO_LB = 2.2046;
const KG_TO_BAG = 60;
type Unit = 'kg' | 'bag' | 'mt';
type MainTab = 'physical' | 'certification' | 'tracker' | 'contracts' | 'blends';
const CERT_FILTERS = ["RFA", "CAFE", "NET ZERO", "EUDR", "AAA"] as const;
const TRACKER_FILTERS = ["ALL", ...CERT_FILTERS] as const;

type CertType = (typeof CERT_FILTERS)[number];
type TrackerCertType = CertType | "ALL";

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
  { key: 'post_15_top', label: 'POST 16 TOP' },
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
}

interface PhysicalPositionRecord {
  stack: string;
  theoretical_volume: number;
  months: Record<string, number>;
  total_shorts: number;
  net_position: number;
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

function displayText(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

// ⚡ OPTIMIZATION: Core helper to dynamically route volume field (aaa_volume override)
function getEffectiveWeight(stock: CertifiedStock, cert: string) {
  if (cert === 'AAA') {
      return asNumber(stock.aaa_volume != null ? stock.aaa_volume : 0);
  }
  return asNumber(stock.purchased_weight);
}

function getAaaReservationLabelFromStock(stock: CertifiedStock) {
  return bool(stock.cafe_certified) || asNumber(stock.cafe_declared_weight) > 0 ? "AAA/CP" : "AAA";
}

function getAaaReservationLabelFromSale(sale: SaleContract) {
  const certs = parseCerts(sale.certifications).map((c) => c.toUpperCase());
  return certs.includes("CP") || certs.includes("CAFE") || certs.includes("AAA/CP") ? "AAA/CP" : "AAA";
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
    effective_weight: getEffectiveWeight(stock, cert), // Dynamic AAA weighting mapped here
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
      { key: "aaa_project", label: "AAA", align: "center", render: (row) => row.aaa_project ? "Yes" : "No", exportValue: (row) => (row.aaa_project ? "Yes" : "No") },
      { key: "aaa_volume", label: "AAA Vol.", align: "right", render: (row) => (row.aaa_volume != null ? `${formatQty(row.aaa_volume, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.aaa_volume != null ? formatQty(row.aaa_volume, unit) : "") },
      { key: "netzero_project", label: "Net Zero", align: "center", render: (row) => (row.netzero_project ? "Yes" : "No"), exportValue: (row) => (row.netzero_project ? "Yes" : "No") },
      { key: "netzero_declared_weight", label: "Net Zero Decl.", align: "right", render: (row) => (row.netzero_declared_weight != null ? `${formatQty(row.netzero_declared_weight, unit)} ${unitText(unit)}` : "—"), exportValue: (row) => (row.netzero_declared_weight != null ? formatQty(row.netzero_declared_weight, unit) : "") },
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

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManualSalesModalOpen, setIsManualSalesModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isAddBlendModalOpen, setIsAddBlendModalOpen] = useState(false);
  const [isUpdatePositionsModalOpen, setIsUpdatePositionsModalOpen] = useState(false);

  const [isDirectSale, setIsDirectSale] = useState(true);
  const [purchaseSaleNumber, setPurchaseSaleNumber] = useState('');

  // Declare Certificates loader state
  const [isDeclaringCertId, setIsDeclaringCertId] = useState<number | null>(null);

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

  // Blend states
  const [blendSearch, setBlendSearch] = useState("");
  const [selectedBlendId, setSelectedBlendId] = useState<number | null>(null);
  const [blendAllocContractId, setBlendAllocContractId] = useState<number | "">("");
  const [blendBusy, setBlendBusy] = useState(false);

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

  useEffect(() => {
    function onDownloadOutside(event: MouseEvent) {
      if (downloadWrapRef.current && !downloadWrapRef.current.contains(event.target as Node)) setDownloadOpen(false);
    }
    if (downloadOpen) document.addEventListener("mousedown", onDownloadOutside);
    return () => document.removeEventListener("mousedown", onDownloadOutside);
  }, [downloadOpen]);

  useEffect(() => {
    if (!selectedBlendId && blends.length > 0) setSelectedBlendId(blends[0].id);
  }, [blends, selectedBlendId]);

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

  const handleDeclareCertificates = async (contractId: number) => {
    setIsDeclaringCertId(contractId);
    try {
      const response = await fetch('/api/declare_certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_contract_id: contractId })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to declare certificates");
      }
      
      // Handle File Download securely
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
      
      alert("Certificates successfully declared and report downloaded!");
    } catch (error: any) {
      alert(`Error declaring certificates: ${error.message}`);
    } finally {
      setIsDeclaringCertId(null);
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
        // ⚡ Filter Out Dual Certified AAA/CAFE when querying specifically for AAA limits
        if (activeCert === 'AAA' && bool(stock.aaa_project) && bool(stock.cafe_certified)) {
          return; // Skip dual certs entirely
        }

        const strat = stock.strategy || 'Unassigned';
        if (!strategyMap.has(strat)) strategyMap.set(strat, { strategy: strat, available: 0, shipmentsByMonth: {}, totalShipment: 0 });
        
        const record = strategyMap.get(strat)!;
        
        // ⚡ Use new dynamic effective weight to respect AAA volume overloads
        const rawWeight = getEffectiveWeight(stock, activeCert); 
        const weight = Math.abs(rawWeight || 0); 
        
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

  // --- TRACKER TAB MEMOS ---
  const trackerVisibleStocks = useMemo(() => {
    return stocks
      .filter((stock) => matchesTrackerCert(stock, trackerCert))
      .filter((stock) => {
         // ⚡ Exclude Dual AAA/CAFE when looking exactly at AAA limits
         if (trackerCert === 'AAA' && bool(stock.aaa_project) && bool(stock.cafe_certified)) return false;
         return true;
      })
      .filter((stock) => (trackerDateStartFilter || trackerDateEndFilter ? isWithinDateRange(stock.recorded_date, trackerDateStartFilter, trackerDateEndFilter) : true));
  }, [stocks, trackerCert, trackerDateStartFilter, trackerDateEndFilter]);

  const trackerTableColumns = useMemo(() => getTrackerColumns(trackerCert, unit), [trackerCert, unit]);

  const trackerHolderRows = useMemo(() => {
    const holders = trackerVisibleStocks.reduce<Record<string, number>>((acc, stock) => {
      const holder = getTrackerHolderLabel(stock, trackerCert);
      // ⚡ Swapped to respect effective weighting correctly mapped by certification type
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
      totalWithExpiry: 0,
      expired: 0,
      within7: 0,
      within30: 0,
      within60: 0,
      within90: 0,
      within120: 0,
      noExpiry: 0,
      nextExpiryLabel: "—",
      nextExpiryDays: null as number | null,
      nextExpiryLot: "—",
      averageDays: null as number | null,
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

  const trackerVisibleTotalKg = useMemo(
    () => trackerVisibleStocks.reduce((sum, stock) => sum + getEffectiveWeight(stock, trackerCert), 0),
    [trackerVisibleStocks, trackerCert]
  );

  const trackerVisibleRecordCount = trackerVisibleStocks.length;
  const trackerVisibleDateLabel = formatRangeLabel(trackerDateStartFilter, trackerDateEndFilter);
  const trackerSelectedLabel = trackerCert === "ALL" ? "All certifications" : trackerCert;
  const trackerVisibleRows = useMemo(() => trackerVisibleStocks.map((stock) => buildTrackerRow(stock, trackerCert)), [trackerVisibleStocks, trackerCert]);

  const aaaAllocationSummary = useMemo(() => {
    // ⚡ Applies exact dual cert exclusion 
    const stocksForAaa = stocks.filter((stock) => bool(stock.aaa_project) && !(bool(stock.aaa_project) && bool(stock.cafe_certified)));
    const contractsForAaa = sales.filter((sale) => parseCerts(sale.certifications).some((c) => ["AAA", "AAA/CP", "CP"].includes(c.toUpperCase())));
    
    const bucket = (label: "AAA" | "AAA/CP") => {
      const lots = stocksForAaa.filter((stock) => getAaaReservationLabelFromStock(stock) === label);
      const salesForBucket = contractsForAaa.filter((sale) => getAaaReservationLabelFromSale(sale) === label);
      const lotKg = lots.reduce((sum, stock) => sum + getEffectiveWeight(stock, 'AAA'), 0); // Enforce aaa_volume calculation metric
      const declaredKg = salesForBucket.reduce((sum, sale) => sum + asNumber(sale.weight_kilos), 0);
      return { label, lotKg, lotCount: lots.length, declaredKg, contractCount: salesForBucket.length, balanceKg: lotKg - declaredKg };
    };
    return { aaa: bucket("AAA"), aaaCp: bucket("AAA/CP") };
  }, [sales, stocks]);

  // --- BLENDS TAB MEMOS ---
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
      // 1. Unlink existing contracts optimally
      await Promise.allSettled(
        linked.map(async (sale) => {
          try { await updateContractBlend(sale.id, null); } catch (error) {}
        })
      );
      
      // 2. Execute Backend Deletion via Query Params
      const response = await fetch(`/api/blends?id=${blendId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Backend database deletion failed");
      }

      // 3. Clean up the Frontend State ONLY after backend success
      setBlends((prev) => prev.filter((blend) => blend.id !== blendId));
      if (selectedBlendId === blendId) setSelectedBlendId(null);
      setSales((prev) => prev.map((sale) => (Number(sale.blend_id) === blendId ? { ...sale, blend_id: undefined, blend_name: undefined } : sale)));

      alert("Blend deleted successfully.");
    } catch (error) {
      console.error(error);
      alert("Failed to delete blend.");
    }
  }

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
              <p className="text-xs text-[#968C83] mb-2">Upload the required reports to calculate theoretical blend allocations.</p>
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
          <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#D6D2C4] bg-white">
              <div>
                <div className="text-lg font-bold text-[#51534a]">Create New Blend</div>
              </div>
              <button onClick={() => setIsAddBlendModalOpen(false)} className="text-[#968C83] hover:text-[#51534a] p-1.5 rounded-full hover:bg-[#D6D2C4]/30 transition-all">
                <X size={18} />
              </button>
            </div>
            
            <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-5">
              {Math.abs(blendCompositionTotal - 100) > 0.01 && blendCompositionTotal > 0 && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-sm">
                  {blendCompositionTotal > 100 ? `Blend composition is over 100% (${blendCompositionTotal.toFixed(2)}%). Reduce one or more components.` : `Blend composition is below 100% (${blendCompositionTotal.toFixed(2)}%). Add the remaining percentage before saving.`}
                </div>
              )}

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
              Positions
            </h1>
            <p className="text-[#968C83] text-sm mt-1">Physical, Certification Tracker, Contracts, and Blends</p>
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
            onClick={() => setActiveTab('tracker')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-4 transition-colors whitespace-nowrap ${
              activeTab === 'tracker' ? 'border-[#007680] text-[#007680]' : 'border-transparent text-[#968C83] hover:text-[#51534a] hover:border-[#968C83]/30'
            }`}
          >
            <Users size={16} /> Certification Tracker
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
          
          {/* Sub Navigation (Only for Certification Tab) */}
          {activeTab === 'certification' && (
            <div className="flex justify-between items-end">
              <FilterTabs tabs={CERT_FILTERS as unknown as string[]} active={activeCert} onChange={setActiveCert} />
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
                  {formatNumber(convertQty(activeTab === 'certification' ? kpis.stock : physicalData.kpis.totalTheoretical, unit))} <span className="text-sm font-normal text-[#968C83]">{unitText(unit)}</span>
                </div>
                {activeTab === 'certification' && (['RFA', 'CAFE', 'EUDR'].includes(activeCert)) && (
                  <div className="text-[10px] text-[#007680] mt-1.5 font-bold bg-[#A4DBE8]/30 border border-[#007680]/10 inline-block px-1.5 py-0.5 rounded">
                     Supply Chain (Kenyacof): {formatNumber(convertQty(kpis.supplyChainStock, unit))} {unitText(unit)}
                  </div>
                )}
              </Card>
              <Card className="p-4 border-l-4 border-l-[#5B3427]">
                <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">
                   {activeTab === 'certification' ? `${activeCert} TOTAL SHORTS` : 'PHYSICAL TOTAL BLEND SHORTS'}
                </div>
                <div className="text-2xl font-bold text-[#5B3427] mt-1 flex items-center gap-2">
                  {formatNumber(convertQty(activeTab === 'certification' ? kpis.shorts : physicalData.kpis.totalShorts, unit))} <span className="text-sm font-normal text-[#968C83]">{unitText(unit)}</span>
                  <TrendingDown size={18} className="text-[#B9975B]" />
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-l-[#007680]">
                <div className="text-[#968C83] text-xs font-uppercase font-bold tracking-wider">
                   {activeTab === 'certification' ? `${activeCert} NET POSITION` : 'PHYSICAL NET POSITION'}
                </div>
                <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${(activeTab === 'certification' ? kpis.net : physicalData.kpis.totalNet) >= 0 ? 'text-[#007680]' : 'text-[#B9975B]'}`}>
                  {(activeTab === 'certification' ? kpis.net : physicalData.kpis.totalNet) > 0 ? '+' : ''}{formatNumber(convertQty(activeTab === 'certification' ? kpis.net : physicalData.kpis.totalNet, unit))} <span className="text-sm font-normal text-[#968C83]">{unitText(unit)}</span>
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

          {/* --- TRACKER TAB --- */}
          {activeTab === "tracker" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <div className="whitespace-nowrap text-sm font-bold text-[#51534a]">Certification:</div>
                    <div className="mt-2 flex min-w-max flex-wrap gap-2">
                      {TRACKER_FILTERS.map((cert) => (
                        <Chip key={cert} active={trackerCert === cert} onClick={() => setTrackerCert(cert)}>
                          {cert}
                        </Chip>
                      ))}
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
                        <div className="rounded-xl bg-white p-3 text-xs text-[#007680]">
                          Use the certification chips to switch views, or clear the date range to view the full tracker again.
                        </div>
                        {trackerExpirySummary.totalWithExpiry === 0 ? (
                          <div className="rounded-xl bg-white p-3 text-xs text-[#968C83]">
                            No expiry dates are available for this view. AAA allocations are tracked separately from the certificate expiry fields.
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {trackerCert === "AAA" ? (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {([aaaAllocationSummary.aaa, aaaAllocationSummary.aaaCp] as const).map((bucket) => (
                          <div key={bucket.label} className="rounded-2xl border border-[#D6D2C4] bg-[#F5F5F3] p-4">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-[#968C83]">{bucket.label}</div>
                            <div className="mt-2 text-2xl font-bold text-[#51534a]">{formatQty(bucket.lotKg, unit)} {unitText(unit)}</div>
                            <div className="mt-2 flex items-center justify-between text-xs text-[#51534a]"><span>Stock lots</span><span className="font-bold">{bucket.lotCount}</span></div>
                            <div className="flex items-center justify-between text-xs text-[#51534a]"><span>Linked contracts</span><span className="font-bold">{bucket.contractCount}</span></div>
                            <div className="flex items-center justify-between text-xs text-[#51534a]"><span>Declared</span><span className="font-bold">{formatQty(bucket.declaredKg, unit)} {unitText(unit)}</span></div>
                            <div className="flex items-center justify-between text-xs text-[#51534a]"><span>Balance</span><span className={`font-bold ${bucket.balanceKg >= 0 ? "text-[#007680]" : "text-[#B9975B]"}`}>{bucket.balanceKg > 0 ? "+" : ""}{formatQty(bucket.balanceKg, unit)} {unitText(unit)}</span></div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-5 space-y-3">
                      <div className="text-xs font-bold uppercase tracking-wider text-[#968C83]">Holder concentration</div>
                      <div className="space-y-3">
                        {trackerHolderRows.length ? trackerHolderRows.map((holder) => (
                          <div key={holder.name} className="rounded-xl border border-[#D6D2C4] bg-[#F5F5F3] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-bold text-[#51534a]">{holder.name}</div>
                                <div className="text-[11px] text-[#968C83]">{formatQty(holder.value, unit)} {unitText(unit)}</div>
                              </div>
                              <div className="text-xs font-bold text-[#007680]">{trackerVisibleTotalKg ? ((holder.value / trackerVisibleTotalKg) * 100).toFixed(1) : "0.0"}%</div>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-[#D6D2C4]"><div className="h-2 rounded-full bg-[#007680]" style={{ width: `${trackerVisibleTotalKg ? Math.min(100, (holder.value / trackerVisibleTotalKg) * 100) : 0}%` }} /></div>
                          </div>
                        )) : <div className="text-sm italic text-[#968C83]">No holder data available for this view.</div>}
                      </div>
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
                                      <button 
                                          onClick={() => handleDeclareCertificates(sale.id)} 
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
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
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