"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Poppins } from "next/font/google";
import {
  AlertTriangle,
  Box,
  Check,
  ChevronRight,
  CloudUpload,
  Combine,
  Download,
  FileSpreadsheet,
  FileText,
  ListChecks,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
  X,
  Eye,
  FileCheck
} from "lucide-react";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const KG_TO_BAG = 60;
const CERT_FILTERS = ["RFA", "CAFE", "NET ZERO", "EUDR", "AAA"] as const;
const TRACKER_FILTERS = ["ALL", ...CERT_FILTERS] as const;
const MONTH_ORDER = ["Mar-26", "Apr-26", "May-26", "Jun-26", "Jul-26", "Aug-26"] as const;

type CertType = (typeof CERT_FILTERS)[number];
type TrackerCertType = CertType | "ALL";
type Unit = "kg" | "bag" | "mt";
type MainTab = "physical" | "certification" | "tracker" | "contracts" | "blends" | "declarations";
type UploadMode = "purchases" | "sales" | "manual";
type PopupState = { message: string; kind: "error" | "success" };

type CertifiedStock = {
  id: number;
  season?: string | null;
  sale_type?: string | null;
  outturn?: string | null;
  lot_number: string;
  strategy?: string | null;
  cooperative?: string | null;
  wet_mill?: string | null;
  county?: string | null;
  grade?: string | null;
  grower_code?: string | null;
  purchased_weight: number | string;
  rfa_certified?: boolean | number | string;
  rfa_expiry_date?: string | null;
  rfa_certificate_holder?: string | null;
  rfa_declared_weight?: number | string | null;
  eudr_certified?: boolean | number | string;
  eudr_expiry_date?: string | null;
  eudr_certificate_holder?: string | null;
  eudr_declared_weight?: number | string | null;
  cafe_certified?: boolean | number | string;
  cafe_expiry_date?: string | null;
  cafe_certificate_holder?: string | null;
  cafe_declared_weight?: number | string | null;
  impact_certified?: boolean | number | string;
  impact_expiry_date?: string | null;
  impact_declared_weight?: number | string | null;
  aaa_project?: boolean | number | string;
  aaa_volume?: number | string | null;
  geodata_available?: boolean | number | string;
  aaa_declared_weight?: number | string | null;
  netzero_project?: boolean | number | string;
  netzero_declared_weight?: number | string | null;
  fully_declared?: boolean | number | string;
  recorded_date?: string | null;
};

type SaleContract = {
  id: number;
  contract_number: string;
  client?: string | null;
  weight_kilos: number | string;
  shipping_date: string;
  strategy?: string | null;
  quality?: string | null;
  grade?: string | null;
  certifications: any;
  blend_id?: number | null;
  blend_name?: string | null;
};

type Blend = {
  id: number;
  name: string;
  client?: string | null;
  grade?: string | null;
  cup_profile?: string | null;
  blend_no?: string | null;
  [key: string]: any;
};

type PhysicalRow = {
  stack: string;
  theoretical: number;
  months: Record<string, number>;
  shorts: number;
  net: number;
};

type PhysicalDataState = {
  gridData: PhysicalRow[];
  months: string[];
  kpis: { totalTheoretical: number; totalShorts: number; totalNet: number };
};

type CertRow = {
  strategy: string;
  available: number;
  shipmentsByMonth: Record<string, number>;
  totalShipment: number;
  netPosition: number;
  tags: string[];
  linkedLots: number;
  linkedContracts: number;
};

type DeclarationRow = {
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
};

type BlendComponent = { key: string; label: string };
type BlendFormState = Record<string, string>;

const BLEND_COMPONENTS: BlendComponent[] = [
  { key: "finished", label: "Finished" },
  { key: "post_natural", label: "Post Natural" },
  { key: "post_specialty_washed", label: "Specialty Washed" },
  { key: "post_17_up_top", label: "17 Up Top" },
  { key: "post_16_top", label: "16 Top" },
  { key: "post_15_top", label: "15 Top" },
  { key: "post_pb_top", label: "PB Top" },
  { key: "post_17_up_plus", label: "17 Up Plus" },
  { key: "post_16_plus", label: "16 Plus" },
  { key: "post_15_plus", label: "15 Plus" },
  { key: "post_14_plus", label: "14 Plus" },
  { key: "post_pb_plus", label: "PB Plus" },
  { key: "post_17_up_faq", label: "17 Up FAQ" },
  { key: "post_16_faq", label: "16 FAQ" },
  { key: "post_15_faq", label: "15 FAQ" },
  { key: "post_14_faq", label: "14 FAQ" },
  { key: "post_pb_faq", label: "PB FAQ" },
  { key: "post_faq_minus", label: "FAQ Minus" },
  { key: "post_grinder_bold", label: "Grinder Bold" },
  { key: "post_grinder_light", label: "Grinder Light" },
  { key: "post_mh", label: "MH" },
  { key: "post_ml", label: "ML" },
  { key: "post_rejects_s", label: "Rejects S" },
  { key: "post_rejects_p", label: "Rejects P" },
];

const INITIAL_BLEND_FORM: BlendFormState = {
  name: "",
  client: "",
  grade: "",
  cup_profile: "",
  blend_no: "",
  ...Object.fromEntries(BLEND_COMPONENTS.map((c) => [c.key, ""])),
};

function asNumber(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function parseCerts(raw: any): string[] {
  if (Array.isArray(raw)) return Array.from(new Set(raw.map(String).filter(Boolean)));
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return Array.from(new Set(parsed.map(String).filter(Boolean)));
      if (parsed) return [String(parsed)];
    } catch {
      return Array.from(new Set(raw.split(",").map((s) => s.trim()).filter(Boolean)));
    }
  }
  return [];
}

function pickFirst(...values: unknown[]): any {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return undefined;
}

function displayText(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
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
    : cert === "RFA"
      ? [stock.rfa_expiry_date]
      : cert === "CAFE"
        ? [stock.cafe_expiry_date]
        : cert === "EUDR"
          ? [stock.eudr_expiry_date]
          : cert === "NET ZERO"
            ? []
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

function getEffectiveWeight(stock: CertifiedStock, cert: string) {
  if (cert === 'AAA') {
      return asNumber(stock.aaa_volume != null ? stock.aaa_volume : 0);
  }
  return asNumber(stock.purchased_weight);
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

function normalizeCertifiedStock(raw: any): CertifiedStock {
  const row = raw ?? {};
  const lotNumber = displayText(
    pickFirst(
      row.lot_number,
      row.lotNumber,
      row.lot_no,
      row.lotNo,
      row.batch_no,
      row.batchNumber,
      row.batch,
      row.name,
      row.stock_name,
      row.stockName,
    ),
    ""
  ).trim();

  return {
    id: asNumber(pickFirst(row.id, row.ID, row.stock_id, row.stockId, row.record_id, row.recordId)) || Date.now(),
    season: (pickFirst(row.season, row.crop_year, row.cropYear, row.harvest_season, row.harvestSeason) as string | undefined) || null,
    sale_type: (pickFirst(row.sale_type, row.saleType, row.market, row.channel, row.sale_channel) as string | undefined) || null,
    outturn: (pickFirst(row.outturn, row.out_turn, row.outturn_no, row.outturnNumber, row.outturn_ref) as string | undefined) || null,
    lot_number: lotNumber || `LOT-${asNumber(pickFirst(row.id, row.stock_id, row.record_id)) || Math.floor(Math.random() * 100000)}`,
    strategy: (pickFirst(row.strategy, row.position, row.grade_strategy, row.section, row.stack, row.stack_name, row.stackName) as string | undefined) || null,
    cooperative: (pickFirst(row.cooperative, row.coop, row.farmer_group, row.group_name, row.company_name, row.organization) as string | undefined) || null,
    wet_mill: (pickFirst(row.wet_mill, row.wetMill, row.mill, row.station, row.processing_center, row.processingCenter) as string | undefined) || null,
    county: (pickFirst(row.county, row.region, row.location, row.sub_county, row.subCounty, row.area) as string | undefined) || null,
    grade: (pickFirst(row.grade, row.classification, row.quality_grade, row.q_grade, row.grade_name) as string | undefined) || null,
    grower_code: (pickFirst(row.grower_code, row.growerCode, row.grower, row.farmer_code, row.farmerCode, row.code) as string | undefined) || null,
    purchased_weight: asNumber(pickFirst(row.purchased_weight, row.purchasedWeight, row.weight, row.weight_kilos, row.weightKilos, row.volume, row.available_weight, row.availableWeight, row.stock, row.stockWeight)),
    rfa_certified: pickFirst(row.rfa_certified, row.rfaCertified, row.rfa, row.RFA),
    rfa_expiry_date: (pickFirst(row.rfa_expiry_date, row.rfaExpiryDate, row.rfa_expiry, row.rfaExpiry) as string | undefined) || null,
    rfa_certificate_holder: (pickFirst(row.rfa_certificate_holder, row.rfaCertificateHolder, row.rfa_holder, row.rfaHolder) as string | undefined) || null,
    rfa_declared_weight: pickFirst(row.rfa_declared_weight, row.rfaDeclaredWeight, row.rfa_weight, row.rfaWeight),
    eudr_certified: pickFirst(row.eudr_certified, row.eudrCertified, row.eudr),
    eudr_expiry_date: (pickFirst(row.eudr_expiry_date, row.eudrExpiryDate, row.eudr_expiry, row.eudrExpiry) as string | undefined) || null,
    eudr_certificate_holder: (pickFirst(row.eudr_certificate_holder, row.eudrCertificateHolder, row.eudr_holder, row.eudrHolder) as string | undefined) || null,
    eudr_declared_weight: pickFirst(row.eudr_declared_weight, row.eudrDeclaredWeight, row.eudr_weight, row.eudrWeight),
    cafe_certified: pickFirst(row.cafe_certified, row.cafeCertified, row.cafe),
    cafe_expiry_date: (pickFirst(row.cafe_expiry_date, row.cafeExpiryDate, row.cafe_expiry, row.cafeExpiry) as string | undefined) || null,
    cafe_certificate_holder: (pickFirst(row.cafe_certificate_holder, row.cafeCertificateHolder, row.cafe_holder, row.cafeHolder) as string | undefined) || null,
    cafe_declared_weight: pickFirst(row.cafe_declared_weight, row.cafeDeclaredWeight, row.cafe_weight, row.cafeWeight),
    impact_certified: pickFirst(row.impact_certified, row.impactCertified, row.impact),
    impact_expiry_date: (pickFirst(row.impact_expiry_date, row.impactExpiryDate, row.impact_expiry, row.impactExpiry) as string | undefined) || null,
    impact_declared_weight: pickFirst(row.impact_declared_weight, row.impactDeclaredWeight, row.impact_weight, row.impactWeight),
    aaa_project: pickFirst(row.aaa_project, row.aaaProject, row.aaa),
    aaa_volume: pickFirst(row.aaa_volume, row.aaaVolume, row.aaa_volume_kg, row.aaaVolumeKg),
    geodata_available: pickFirst(row.geodata_available, row.geoDataAvailable, row.geodata, row.geo),
    aaa_declared_weight: pickFirst(row.aaa_declared_weight, row.aaaDeclaredWeight, row.aaa_weight, row.aaaWeight, row.aaa_reserved_weight),
    netzero_project: pickFirst(row.netzero_project, row.netzeroProject, row.net_zero_project, row.netZeroProject),
    netzero_declared_weight: pickFirst(row.netzero_declared_weight, row.netzeroDeclaredWeight, row.netzero_weight, row.netZeroWeight, row.net_zero_declared_weight),
    fully_declared: pickFirst(row.fully_declared, row.fullyDeclared, row.fully, row.declared_complete, row.declaredComplete),
    recorded_date: (pickFirst(row.recorded_date, row.recordedDate, row.created_at, row.createdAt, row.date) as string | undefined) || null,
  };
}

function normalizeSaleContract(raw: any): SaleContract {
  const row = raw ?? {};
  const certifications = parseCerts(pickFirst(row.certifications, row.certification, row.certs, row.certificate_list, row.certificateList));
  return {
    id: asNumber(pickFirst(row.id, row.ID, row.contract_id, row.contractId, row.record_id, row.recordId)) || Date.now(),
    contract_number: displayText(pickFirst(row.contract_number, row.contractNumber, row.contract_no, row.contractNo, row.reference, row.ref, row.name), ""),
    client: (pickFirst(row.client, row.customer, row.buyer, row.account) as string | undefined) || null,
    weight_kilos: asNumber(pickFirst(row.weight_kilos, row.weightKilos, row.weight, row.kilos, row.qty, row.quantity)),
    shipping_date: displayText(pickFirst(row.shipping_date, row.shippingDate, row.ship_date, row.shipDate, row.date), ""),
    strategy: (pickFirst(row.strategy, row.quality, row.grade_strategy, row.position) as string | undefined) || null,
    quality: (pickFirst(row.quality, row.quality_name, row.sale_type) as string | undefined) || null,
    grade: (pickFirst(row.grade, row.grade_name, row.classification) as string | undefined) || null,
    certifications,
    blend_id: pickFirst(row.blend_id, row.blendId) != null ? asNumber(pickFirst(row.blend_id, row.blendId)) : null,
    blend_name: (pickFirst(row.blend_name, row.blendName, row.blend?.name) as string | undefined) || null,
  };
}

function normalizeBlend(raw: any): Blend {
  const row = raw ?? {};
  const blend: Blend = {
    id: asNumber(pickFirst(row.id, row.ID, row.blend_id, row.blendId, row.record_id, row.recordId)) || Date.now(),
    name: displayText(pickFirst(row.name, row.blend_name, row.blendName, row.title), ""),
    client: (pickFirst(row.client, row.customer) as string | undefined) || null,
    grade: (pickFirst(row.grade, row.grade_name, row.classification) as string | undefined) || null,
    cup_profile: (pickFirst(row.cup_profile, row.cupProfile, row.profile) as string | undefined) || null,
    blend_no: (pickFirst(row.blend_no, row.blendNo, row.blend_number, row.blendNumber) as string | undefined) || null,
  };
  for (const comp of BLEND_COMPONENTS) {
    const value = asNumber(pickFirst(row[comp.key], row.components?.[comp.key], row.component?.[comp.key]));
    if (value > 0) (blend as any)[comp.key] = value;
  }
  return blend;
}

function normalizePhysicalRow(row: any): PhysicalRow {
  const source = row ?? {};
  return {
    stack: displayText(pickFirst(source.stack, source.position, source.name, source.strategy, source.label, source.stack_name, source.stackName), "unassigned"),
    theoretical: asNumber(pickFirst(source.theoretical, source.theoretical_volume, source.theoreticalVolume, source.available, source.available_volume, source.availableVolume, source.volume, source.stock, source.stock_kilos, source.stockKg, source.kg, source.quantity)),
    months: MONTH_ORDER.reduce((acc, month) => ({
      ...acc,
      [month]: asNumber(pickFirst(source?.months?.[month], source?.[month], source?.shipmentsByMonth?.[month], source?.stockByMonth?.[month], source?.allocations?.[month], source?.[month.toLowerCase()])),
    }), {} as Record<string, number>),
    shorts: asNumber(pickFirst(source.shorts, source.total_shorts, source.totalShorts, source.deficit, source.shortage, source.short)),
    net: asNumber(pickFirst(source.net, source.net_position, source.netPosition, source.balance, source.remaining, source.closing_balance)),
  };
}

function getAaaReservationLabelFromStock(stock: CertifiedStock) {
  return bool(stock.cafe_certified) || asNumber(stock.cafe_declared_weight) > 0 ? "AAA/CP" : "AAA";
}

function getAaaReservationLabelFromSale(sale: SaleContract) {
  const certs = parseCerts(sale.certifications).map((c) => c.toUpperCase());
  return certs.includes("CP") || certs.includes("CAFE") || certs.includes("AAA/CP") ? "AAA/CP" : "AAA";
}


type TrackerColumn = {
  key: string;
  label: string;
  align: "left" | "center" | "right";
  render: (row: Record<string, any>) => React.ReactNode;
  exportValue: (row: Record<string, any>) => string | number | boolean;
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
function formatMonth(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Unscheduled";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function convertQty(value: number, unit: Unit) {
  if (unit === "bag") return value / KG_TO_BAG;
  if (unit === "mt") return value / 1000;
  return value;
}

function unitText(unit: Unit) {
  return unit === "bag" ? "BAGS" : unit.toUpperCase();
}

function formatQty(value: number, unit: Unit, decimals?: number) {
  const nextDecimals = decimals ?? (unit === "mt" ? 2 : 0);
  const converted = convertQty(value, unit);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: nextDecimals, minimumFractionDigits: nextDecimals }).format(converted);
}

function stackLabel(stack: string) {
  return stack.replace(/_/g, " ");
}

function buildPhysicalData(rows: PhysicalRow[]): PhysicalDataState {
  const totalTheoretical = rows.reduce((sum, row) => sum + asNumber(row.theoretical), 0);
  const totalShorts = rows.reduce((sum, row) => sum + asNumber(row.shorts), 0);
  const totalNet = rows.reduce((sum, row) => sum + asNumber(row.net), 0);

  return {
    gridData: rows,
    months: [...MONTH_ORDER],
    kpis: {
      totalTheoretical,
      totalShorts,
      totalNet,
    },
  };
}

function getBlendCompositionRow(blend: Blend) {
  return BLEND_COMPONENTS
    .map((comp) => ({
      key: comp.key,
      label: comp.label,
      value: asNumber(blend?.[comp.key] ?? blend?.components?.[comp.key] ?? 0),
    }))
    .filter((item) => item.value > 0);
}

function normalizePhysicalPayload(data: any): PhysicalDataState {
  if (Array.isArray(data?.gridData)) {
    const rows = data.gridData.map(normalizePhysicalRow);
    const months = Array.isArray(data?.months) && data.months.length ? data.months : [...MONTH_ORDER];
    const kpis = data?.kpis && typeof data.kpis === "object"
      ? {
          totalTheoretical: asNumber(data.kpis.totalTheoretical),
          totalShorts: asNumber(data.kpis.totalShorts),
          totalNet: asNumber(data.kpis.totalNet),
        }
      : buildPhysicalData(rows).kpis;

    return { gridData: rows, months, kpis };
  }

  if (Array.isArray(data?.data)) return normalizePhysicalPayload({ gridData: data.data, months: data.months, kpis: data.kpis });
  if (Array.isArray(data?.rows)) return normalizePhysicalPayload({ gridData: data.rows, months: data.months, kpis: data.kpis });
  if (Array.isArray(data)) return buildPhysicalData(data.map(normalizePhysicalRow));
  return buildPhysicalData([]);
}

function normalizeBlendForm(form: BlendFormState): Partial<Blend> {
  return {
    name: form.name,
    client: form.client || undefined,
    grade: form.grade || undefined,
    cup_profile: form.cup_profile || undefined,
    blend_no: form.blend_no || undefined,
    ...Object.fromEntries(
      BLEND_COMPONENTS
        .map((comp): [string, number] => [comp.key, asNumber(form[comp.key])])
        .filter(([_, value]) => value > 0)
    ),
  };
}

function FileField({ label, accept, file, onFile }: { label: string; accept: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#968C83]">{label}</label>
      <div className="rounded-lg border border-dashed border-[#D6D2C4] bg-white p-3">
        <input type="file" accept={accept} onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="w-full text-sm text-[#51534a]" />
      </div>
      {file ? <div className="mt-1 text-[11px] font-bold text-[#007680]">{file.name}</div> : null}
    </div>
  );
}

function Popup({ text, onClose }: { text: PopupState | null; onClose: () => void }) {
  if (!text) return null;
  const isError = text.kind === "error";
  return (
    <div className={`fixed right-4 top-4 z-[80] max-w-md rounded-2xl border px-4 py-3 shadow-lg ${isError ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className={`mt-0.5 ${isError ? "text-red-600" : "text-emerald-600"}`} />
        <div className={`text-sm font-semibold ${isError ? "text-red-700" : "text-emerald-700"}`}>{text.message}</div>
        <button onClick={onClose} className={`ml-2 rounded-full p-1 ${isError ? "text-red-500 hover:bg-red-100" : "text-emerald-500 hover:bg-emerald-100"}`}><X size={14} /></button>
      </div>
    </div>
  );
}

function safeRows(data: any): Record<string, any>[] {
  if (Array.isArray(data)) return data;
  if (data?.data && Array.isArray(data.data)) return data.data;
  if (data?.rows && Array.isArray(data.rows)) return data.rows;
  return [];
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

function MetricCard({
  title,
  value,
  subtitle,
  tone = "default",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  tone?: "default" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-[#007680]"
      : tone === "warn"
      ? "text-[#B9975B]"
      : "text-[#51534a]";

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      {/* Title */}
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#968C83] truncate">
        {title}
      </div>

      {/* Value */}
      <div
        className={`mt-2 text-2xl md:text-3xl font-bold ${toneClass} break-word leading-tight`}
      >
        {value}
      </div>

      {/* Subtitle */}
      {subtitle ? (
        <div className="mt-1 text-xs text-[#968C83] truncate">
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm font-bold transition ${
        active
          ? "border-[#007680] bg-[#007680] text-white"
          : "border-[#D6D2C4] bg-white text-[#968C83] hover:border-[#007680] hover:text-[#007680]"
      }`}
    >
      {children}
    </button>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
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
}

// Map certification name to SQL schema field name
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

export default function Page() {
  const [activeTab, setActiveTab] = useState<MainTab>("physical");
  const [unit, setUnit] = useState<Unit>("kg");
  const [stocks, setStocks] = useState<CertifiedStock[]>([]);
  const [sales, setSales] = useState<SaleContract[]>([]);
  const [blends, setBlends] = useState<Blend[]>([]);
  const [declarations, setDeclarations] = useState<DeclarationRow[]>([]);

  const [physicalData, setPhysicalData] = useState<PhysicalDataState>({ gridData: [], months: [...MONTH_ORDER], kpis: { totalTheoretical: 0, totalShorts: 0, totalNet: 0 } });
  const [loading, setLoading] = useState(true);
  const [physicalLoading, setPhysicalLoading] = useState(false);
  const [hasFetchedPhysical, setHasFetchedPhysical] = useState(false);
  const [activeCert, setActiveCert] = useState<CertType>("RFA");
  const [trackerCert, setTrackerCert] = useState<TrackerCertType>("RFA");
  const [trackerDateStartDraft, setTrackerDateStartDraft] = useState("");
  const [trackerDateEndDraft, setTrackerDateEndDraft] = useState("");
  const [trackerDateStartFilter, setTrackerDateStartFilter] = useState("");
  const [trackerDateEndFilter, setTrackerDateEndFilter] = useState("");
  const [selectedBlendId, setSelectedBlendId] = useState<number | null>(null);
  const [blendSearch, setBlendSearch] = useState("");
  const [blendForm, setBlendForm] = useState<BlendFormState>({ ...INITIAL_BLEND_FORM });
  const [blendCreateOpen, setBlendCreateOpen] = useState(false);
  const [toast, setToast] = useState<PopupState | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [purchaseFile, setPurchaseFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [manualSale, setManualSale] = useState({ contract_number: "", client: "", weight_kilos: "", quality: "", grade: "", shipping_date: "", certifications: "" });
  const [editingContractId, setEditingContractId] = useState<number | null>(null);
  const [contractEdit, setContractEdit] = useState<{ quality: string; grade: string; certifications: string[]; blend_id: number | "" }>({ quality: "", grade: "", certifications: [], blend_id: "" });
  const [blendAllocContractId, setBlendAllocContractId] = useState<number | "">("");
  const [blendBusy, setBlendBusy] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>("purchases");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [isDeclaringCertId, setIsDeclaringCertId] = useState<number | null>(null);

  // Declaration View State
  const [viewingDeclarationContract, setViewingDeclarationContract] = useState<number | null>(null);
  const [declarationModalCert, setDeclarationModalCert] = useState<string>("");

  const recordsModalRef = useRef<HTMLDivElement | null>(null);
  const downloadWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [stocksRes, salesRes, blendsRes, declarationsRes] = await Promise.all([
          fetch("/api/certified_stocks", { cache: "no-store" }),
          fetch("/api/contracts", { cache: "no-store" }),
          fetch("/api/blends", { cache: "no-store" }),
          fetch("/api/declare_certificates", { cache: "no-store" }), 
        ]);

        if (stocksRes.ok) {
          const rows = safeRows(await stocksRes.json()).map(normalizeCertifiedStock) as CertifiedStock[];
          setStocks(rows);
        }

        if (salesRes.ok) {
          const rows = safeRows(await salesRes.json()).map(normalizeSaleContract) as SaleContract[];
          setSales(rows);
        }

        if (blendsRes.ok) {
          const rows = safeRows(await blendsRes.json()).map(normalizeBlend) as Blend[];
          setBlends(rows);
        }
        
        if (declarationsRes.ok) {
          const d = await declarationsRes.json();
          setDeclarations(d.data || []);
        }

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

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (recordsModalRef.current && !recordsModalRef.current.contains(event.target as Node)) setUploadOpen(false);
    }
    if (uploadOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [uploadOpen]);

  useEffect(() => {
    function onDownloadOutside(event: MouseEvent) {
      if (downloadWrapRef.current && !downloadWrapRef.current.contains(event.target as Node)) setDownloadOpen(false);
    }
    if (downloadOpen) document.addEventListener("mousedown", onDownloadOutside);
    return () => document.removeEventListener("mousedown", onDownloadOutside);
  }, [downloadOpen]);


  const certificationRows = useMemo(() => {
    const rows = new Map<string, CertRow>();
    const months = new Set<string>(MONTH_ORDER as unknown as string[]);
    const isAaaMode = activeCert === "AAA";

    const activeFlag = (stock: CertifiedStock) => {
      switch (activeCert) {
        case "RFA":
          return bool(stock.rfa_certified);
        case "CAFE":
          return bool(stock.cafe_certified);
        case "NET ZERO":
          return bool(stock.netzero_project);
        case "EUDR":
          return bool(stock.eudr_certified);
        case "AAA":
          return bool(stock.aaa_project);
      }
    };

    const getRowKeyFromStock = (stock: CertifiedStock) => {
      if (isAaaMode) return getAaaReservationLabelFromStock(stock);
      return displayText(stock.strategy || stock.grade || stock.cooperative || stock.lot_number || "Unassigned");
    };

    const getRowKeyFromSale = (sale: SaleContract) => {
      if (isAaaMode) return getAaaReservationLabelFromSale(sale);
      return displayText(sale.strategy || sale.quality || sale.grade || sale.client || "Unassigned");
    };

    const getOrCreateRow = (strategy: string) => {
      const current = rows.get(strategy);
      if (current) return current;
      const next: CertRow = { strategy, available: 0, shipmentsByMonth: {}, totalShipment: 0, netPosition: 0, tags: [], linkedLots: 0, linkedContracts: 0 };
      rows.set(strategy, next);
      return next;
    };

    stocks.filter(activeFlag).forEach((stock) => {
      // ⚡ Filter Out Dual Certified AAA/CAFE when querying specifically for AAA limits
      if (activeCert === 'AAA' && bool(stock.aaa_project) && bool(stock.cafe_certified)) {
        return; // Skip dual certs entirely
      }

      const strategy = getRowKeyFromStock(stock);
      const current = getOrCreateRow(strategy);
      
      const available = getEffectiveWeight(stock, activeCert); 
      current.available += available;
      current.netPosition += available;
      current.linkedLots += 1;
      current.tags = Array.from(new Set([...current.tags, ...(isAaaMode ? [strategy] : [])]));
    });

    sales.forEach((sale) => {
      const certs = parseCerts(sale.certifications).map((c) => c.toUpperCase());
      const matchesActive = activeCert === "AAA" ? certs.some((c) => ["AAA", "AAA/CP", "CP"].includes(c)) : certs.includes(activeCert);
      if (!matchesActive) return;
      const strategy = getRowKeyFromSale(sale);
      const current = getOrCreateRow(strategy);
      const month = formatMonth(sale.shipping_date);
      months.add(month);
      const shipment = asNumber(sale.weight_kilos);
      current.shipmentsByMonth[month] = (current.shipmentsByMonth[month] || 0) + shipment;
      current.totalShipment += shipment;
      current.netPosition -= shipment;
      current.tags = Array.from(new Set([...current.tags, ...certs]));
      current.linkedContracts += 1;
    });

    const tableData = Array.from(rows.values()).sort((a, b) => {
      if (!isAaaMode) return a.strategy.localeCompare(b.strategy);
      const order = { "AAA": 0, "AAA/CP": 1 } as Record<string, number>;
      const ao = order[a.strategy] ?? 99;
      const bo = order[b.strategy] ?? 99;
      if (ao !== bo) return ao - bo;
      return a.strategy.localeCompare(b.strategy);
    });

    const certMonths = Array.from(months).sort((a, b) => {
      const ai = MONTH_ORDER.indexOf(a as (typeof MONTH_ORDER)[number]);
      const bi = MONTH_ORDER.indexOf(b as (typeof MONTH_ORDER)[number]);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    const stock = tableData.reduce((sum, row) => sum + row.available, 0);
    const shorts = tableData.reduce((sum, row) => sum + row.totalShipment, 0);
    const net = tableData.reduce((sum, row) => sum + row.netPosition, 0);
    const supplyChainStock = stocks
      .filter((stockRow) => activeFlag(stockRow) && ["RFA", "CAFE", "EUDR"].includes(activeCert))
      .reduce((sum, stockRow) => sum + asNumber(stockRow.purchased_weight), 0);

    return { tableData, months: certMonths, kpis: { stock, shorts, net, supplyChainStock } };
  }, [activeCert, sales, stocks]);

  const activeCertLots = useMemo(() => stocks.filter((stock) => {
    // ⚡ Filter Out Dual Certified AAA/CAFE when querying specifically for AAA limits
    if (activeCert === 'AAA' && bool(stock.aaa_project) && bool(stock.cafe_certified)) return false;

    switch (activeCert) {
      case "RFA": return bool(stock.rfa_certified);
      case "CAFE": return bool(stock.cafe_certified);
      case "NET ZERO": return bool(stock.netzero_project);
      case "EUDR": return bool(stock.eudr_certified);
      case "AAA": return bool(stock.aaa_project);
    }
  }), [stocks, activeCert]);

  const activeCertContracts = useMemo(() => sales.filter((sale) => {
    const certs = parseCerts(sale.certifications).map((c) => c.toUpperCase());
    return activeCert === "AAA" ? certs.some((c) => ["AAA", "AAA/CP", "CP"].includes(c)) : certs.includes(activeCert);
  }), [sales, activeCert]);

  const certInsights = useMemo(() => {
    const certifiedKg = activeCertLots.reduce((sum, stock) => sum + getEffectiveWeight(stock, activeCert), 0);
    const declaredKg = activeCertContracts.reduce((sum, sale) => sum + asNumber(sale.weight_kilos), 0);
    return { certifiedKg, declaredKg, linkedContracts: activeCertContracts.length, coverage: certifiedKg > 0 ? (declaredKg / certifiedKg) * 100 : 0 };
  }, [activeCertLots, activeCertContracts, activeCert]);

  const aaaAllocationSummary = useMemo(() => {
    // Applies exact dual cert exclusion 
    const stocksForAaa = stocks.filter((stock) => bool(stock.aaa_project) && !(bool(stock.aaa_project) && bool(stock.cafe_certified)));
    const contractsForAaa = sales.filter((sale) => parseCerts(sale.certifications).some((c) => ["AAA", "AAA/CP", "CP"].includes(c.toUpperCase())));
    const bucket = (label: "AAA" | "AAA/CP") => {
      const lots = stocksForAaa.filter((stock) => getAaaReservationLabelFromStock(stock) === label);
      const salesForBucket = contractsForAaa.filter((sale) => getAaaReservationLabelFromSale(sale) === label);
      const lotKg = lots.reduce((sum, stock) => sum + getEffectiveWeight(stock, 'AAA'), 0); 
      const declaredKg = salesForBucket.reduce((sum, sale) => sum + asNumber(sale.weight_kilos), 0);
      return { label, lotKg, lotCount: lots.length, declaredKg, contractCount: salesForBucket.length, balanceKg: lotKg - declaredKg };
    };

    return { aaa: bucket("AAA"), aaaCp: bucket("AAA/CP") };
  }, [sales, stocks]);

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
    if (!blendCreateOpen || !entered) return "";
    if (Math.abs(blendCompositionTotal - 100) < 0.01) return "";
    return blendCompositionTotal > 100 ? `Blend composition is over 100% (${blendCompositionTotal.toFixed(2)}%). Reduce one or more components.` : `Blend composition is below 100% (${blendCompositionTotal.toFixed(2)}%). Add the remaining percentage before saving.`;
  }, [blendCreateOpen, blendCompositionTotal, blendForm]);

  // ⚡ OPTIMIZATION: O(N) Grouping for Declarations Tab
  const declaredContractsSummary = useMemo(() => {
    const map = new Map<number, {
       contract_id: number;
       contract_number: string;
       client: string;
       contract_weight: number;
       shipping_date: string;
       certs: Set<string>;
       lots: DeclarationRow[];
    }>();

    declarations.forEach((row) => {
       if (!map.has(row.contract_id)) {
           map.set(row.contract_id, {
               contract_id: row.contract_id,
               contract_number: row.contract_number,
               client: row.client,
               contract_weight: asNumber(row.contract_weight),
               shipping_date: row.shipping_date,
               certs: new Set<string>(),
               lots: []
           });
       }
       const c = map.get(row.contract_id)!;
       c.lots.push(row);
       
       // Flag which certificates actually have allocated volume for this contract
       if (asNumber(row.rfa_declared_weight) > 0) c.certs.add('RFA');
       if (asNumber(row.eudr_declared_weight) > 0) c.certs.add('EUDR');
       if (asNumber(row.cafe_declared_weight) > 0) c.certs.add('CAFE');
       if (asNumber(row.impact_declared_weight) > 0) c.certs.add('Impact');
       if (asNumber(row.aaa_declared_weight) > 0) c.certs.add('AAA');
       if (asNumber(row.netzero_declared_weight) > 0) c.certs.add('NET ZERO');
    });
    
    // Sort recently added/updated first based on ID
    return Array.from(map.values()).sort((a, b) => b.contract_id - a.contract_id);
  }, [declarations]);

  const openDeclarationView = (contractId: number, firstCert: string) => {
     setViewingDeclarationContract(contractId);
     setDeclarationModalCert(firstCert);
  };


  const physicalRows = physicalData;
  const physicalTop = physicalRows.gridData.slice().sort((a, b) => b.theoretical - a.theoretical)[0];
  const physicalMostShorts = physicalRows.gridData.slice().sort((a, b) => b.shorts - a.shorts)[0];

  const showToast = (message: string, kind: "error" | "success") => setToast({ message, kind });

  async function refreshPhysical() {
    try {
      setPhysicalLoading(true);
      const res = await fetch("/api/physical_stock_position", { cache: "no-store" });
      if (!res.ok) throw new Error("Physical position fetch failed");

      const data = await res.json();
      const normalized = normalizePhysicalPayload(data);
      setPhysicalData(normalized);
      setHasFetchedPhysical(true);
      showToast("Physical positions refreshed.", "success");
    } catch (error) {
      console.error("Error fetching physical positions:", error);
      setHasFetchedPhysical(true);
      showToast("Unable to refresh physical positions.", "error");
    } finally {
      setPhysicalLoading(false);
    }
  }

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
      
      // ⚡ Auto-Refetch Declarations so the new tab reflects the change instantly
      const decRes = await fetch("/api/declare_certificates", { cache: "no-store" });
      if (decRes.ok) {
         const d = await decRes.json();
         setDeclarations(d.data || []);
      }
      
      showToast("Certificates successfully declared and report downloaded!", "success");
    } catch (error: any) {
      showToast(`Error declaring certificates: ${error.message}`, "error");
    } finally {
      setIsDeclaringCertId(null);
    }
  };


  async function saveBlend() {
    if (!blendForm.name.trim()) {
      showToast("Blend name is required.", "error");
      return;
    }
    if (Math.abs(blendCompositionTotal - 100) > 0.01) {
      showToast(`Blend composition must equal exactly 100%. Current total: ${blendCompositionTotal.toFixed(2)}%.`, "error");
      return;
    }

    try {
      const payload = normalizeBlendForm(blendForm);
      const response = await fetch("/api/blends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Failed to create blend");
      const createdBlend: Blend = { id: data?.id ?? Date.now(), ...payload } as Blend;
      setBlends((prev) => [createdBlend, ...prev]);
      setSelectedBlendId(createdBlend.id);
      setBlendCreateOpen(false);
      setBlendForm({ ...INITIAL_BLEND_FORM });
      showToast("Blend saved successfully.", "success");
    } catch (error: any) {
      showToast(error?.message || "Failed to create blend.", "error");
    }
  }

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
    setSales((prev) => prev.map((sale) => (sale.id === contractId ? { ...sale, blend_id: blendId, blend_name: selected?.name ?? null } : sale)));
  }

  async function saveContractEdit() {
    if (editingContractId === null) return;
    try {
      const response = await fetch("/api/contracts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingContractId, quality: contractEdit.quality, grade: contractEdit.grade, certifications: contractEdit.certifications, blend_id: contractEdit.blend_id === "" ? null : contractEdit.blend_id }),
      });
      if (!response.ok) throw new Error("Failed to update contract");
      const selectedBlendForUpdate = blends.find((b) => b.id === Number(contractEdit.blend_id));
      setSales((prev) => prev.map((sale) => sale.id === editingContractId ? { ...sale, quality: contractEdit.quality, grade: contractEdit.grade, certifications: contractEdit.certifications, blend_id: contractEdit.blend_id === "" ? null : Number(contractEdit.blend_id), blend_name: selectedBlendForUpdate?.name ?? null } : sale));
      setEditingContractId(null);
      showToast("Contract updated.", "success");
    } catch {
      showToast("Failed to save contract changes.", "error");
    }
  }

  async function uploadPurchases() {
    if (!purchaseFile) return;
    try {
      const formData = new FormData();
      formData.append("xbs_file", purchaseFile);
      const res = await fetch("http://localhost:8100/api/xbs_purchase_upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      setUploadOpen(false);
      setPurchaseFile(null);
      showToast("Purchases uploaded successfully.", "success");
    } catch {
      showToast("Purchase upload failed.", "error");
    }
  }

  async function uploadSalesFile() {
    if (!salesFile) return;
    try {
      const formData = new FormData();
      formData.append("sol_file", salesFile);
      const res = await fetch("http://localhost:8100/api/upload_sol_report", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      setUploadOpen(false);
      setSalesFile(null);
      showToast("Sales uploaded successfully.", "success");
    } catch {
      showToast("Sales upload failed.", "error");
    }
  }

  async function saveManualSale(e: React.FormEvent) {
    e.preventDefault();
    try {
      const response = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractNumber: manualSale.contract_number, client: manualSale.client, weight: manualSale.weight_kilos, quality: manualSale.quality, grade: manualSale.grade, shippingDate: manualSale.shipping_date, certifications: parseCerts(manualSale.certifications) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Failed to add sale");
      if (data?.sale) setSales((prev) => [...prev, data.sale]);
      setManualSale({ contract_number: "", client: "", weight_kilos: "", quality: "", grade: "", shipping_date: "", certifications: "" });
      setUploadOpen(false);
      showToast("Sale added successfully.", "success");
    } catch {
      showToast("Failed to add sale.", "error");
    }
  }

  async function deleteBlend(blendId: number) {
    const linked = sales.filter((sale) => Number(sale.blend_id) === blendId);
    try {
      await Promise.allSettled(
        linked.map(async (sale) => {
          try {
            await updateContractBlend(sale.id, null);
          } catch (error) {
            console.warn("Unable to unlink contract from deleted blend:", sale.id, error);
          }
        })
      );

      setBlends((prev) => prev.filter((blend) => blend.id !== blendId));
      if (selectedBlendId === blendId) setSelectedBlendId(null);
      setSales((prev) => prev.map((sale) => (Number(sale.blend_id) === blendId ? { ...sale, blend_id: null, blend_name: null } : sale)));

      try {
        const response = await fetch("/api/blends", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: blendId }),
        });

        if (!response.ok && ![404, 405].includes(response.status)) {
          const detail = await response.text().catch(() => "");
          console.warn("Blend delete API returned a non-success status after local removal:", response.status, detail);
        }
      } catch (error) {
        console.warn("Blend delete API request failed after local removal:", error);
      }

      showToast("Blend deleted.", "success");
    } catch (error) {
      console.error("Delete blend failed:", error);
      showToast("Failed to delete blend.", "error");
    }
  }

  function openAddUpload(mode: UploadMode = "purchases") {
    setUploadMode(mode);
    setUploadOpen(true);
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
    showToast(`Tracker ${format.toUpperCase()} download started.`, "success");
  }

  if (loading) {
    return <div className={`${poppins.className} min-h-screen bg-[#D6D2C4] flex items-center justify-center text-[#51534a] font-bold`}>Loading position data…</div>;
  }

  return (
    <main className={`${poppins.className} min-h-screen bg-[#D6D2C4] text-[#51534a]`}>
      <Popup text={toast} onClose={() => setToast(null)} />

      {uploadOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div ref={recordsModalRef} className="w-full max-w-4xl overflow-hidden rounded-2xl bg-[#EFEFE9] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#D6D2C4] bg-white px-6 py-4">
              <div>
                <div className="text-lg font-bold text-[#51534a]">Add / Upload Records</div>
                <div className="text-xs text-[#968C83]">Purchases, sales, and manual records</div>
              </div>
              <button onClick={() => setUploadOpen(false)} className="rounded-full p-1.5 text-[#968C83] hover:bg-[#D6D2C4]/30 hover:text-[#51534a]"><X size={18} /></button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-[#D6D2C4] bg-white/60 px-5 py-3">
              {([["purchases", "Purchases"], ["sales", "Sales"], ["manual", "Manual Sale"]] as [UploadMode, string][]).map(([mode, label]) => (
                <Chip key={mode} active={uploadMode === mode} onClick={() => setUploadMode(mode)}>{label}</Chip>
              ))}
            </div>

            <div className="grid gap-0 md:grid-cols-3">
              <div className={`border-b border-[#D6D2C4] p-5 md:border-b-0 md:border-r ${uploadMode === "purchases" ? "bg-white" : "bg-white/60"} space-y-4`}>
                <div className="flex items-center gap-2 text-sm font-bold text-[#51534a]"><CloudUpload size={16} className="text-[#007680]" /> Upload Purchases</div>
                <FileField label="Purchase File" accept=".xls,.xlsx,.csv" file={purchaseFile} onFile={setPurchaseFile} />
                <button onClick={uploadPurchases} disabled={!purchaseFile} className="w-full rounded-lg bg-[#007680] px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50">Upload Purchases</button>
              </div>

              <div className={`border-b border-[#D6D2C4] p-5 md:border-b-0 md:border-r ${uploadMode === "sales" ? "bg-white" : "bg-white/60"} space-y-4`}>
                <div className="flex items-center gap-2 text-sm font-bold text-[#51534a]"><FileSpreadsheet size={16} className="text-[#B9975B]" /> Upload Sales</div>
                <FileField label="Sales File" accept=".xls,.xlsx,.csv" file={salesFile} onFile={setSalesFile} />
                <button onClick={uploadSalesFile} disabled={!salesFile} className="w-full rounded-lg bg-[#51534a] px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50">Upload Sales</button>
              </div>

              <form onSubmit={saveManualSale} className={`space-y-3 p-5 ${uploadMode === "manual" ? "bg-white" : "bg-white/60"}`}>
                <div className="flex items-center gap-2 text-sm font-bold text-[#51534a]"><Plus size={16} className="text-[#007680]" /> Manual Sale</div>
                <input required value={manualSale.contract_number} onChange={(e) => setManualSale((p) => ({ ...p, contract_number: e.target.value }))} placeholder="Contract Number" className="w-full rounded-lg border border-[#D6D2C4] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                <input value={manualSale.client} onChange={(e) => setManualSale((p) => ({ ...p, client: e.target.value }))} placeholder="Client" className="w-full rounded-lg border border-[#D6D2C4] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                <input required value={manualSale.weight_kilos} onChange={(e) => setManualSale((p) => ({ ...p, weight_kilos: e.target.value }))} placeholder="Weight (kg)" type="number" className="w-full rounded-lg border border-[#D6D2C4] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                <input required value={manualSale.shipping_date} onChange={(e) => setManualSale((p) => ({ ...p, shipping_date: e.target.value }))} type="date" className="w-full rounded-lg border border-[#D6D2C4] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                <input value={manualSale.quality} onChange={(e) => setManualSale((p) => ({ ...p, quality: e.target.value }))} placeholder="Quality" className="w-full rounded-lg border border-[#D6D2C4] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                <input value={manualSale.grade} onChange={(e) => setManualSale((p) => ({ ...p, grade: e.target.value }))} placeholder="Grade" className="w-full rounded-lg border border-[#D6D2C4] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                <input value={manualSale.certifications} onChange={(e) => setManualSale((p) => ({ ...p, certifications: e.target.value }))} placeholder="Certifications (comma-separated)" className="w-full rounded-lg border border-[#D6D2C4] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                <button type="submit" className="w-full rounded-lg bg-[#007680] px-4 py-2 text-sm font-bold text-white shadow-sm">Save Sale</button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {blendCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-[#EFEFE9] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#D6D2C4] bg-white px-6 py-4">
              <div>
                <div className="text-lg font-bold text-[#51534a]">Create New Blend</div>
                <div className="text-xs text-[#968C83]">Composition must equal exactly 100%</div>
              </div>
              <button onClick={() => setBlendCreateOpen(false)} className="rounded-full p-1.5 text-[#968C83] hover:bg-[#D6D2C4]/30 hover:text-[#51534a]"><X size={18} /></button>
            </div>

            <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-5">
              {blendValidationMessage ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-sm">
                  {blendValidationMessage}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <input value={blendForm.name} onChange={(e) => setBlendForm((p) => ({ ...p, name: e.target.value }))} placeholder="Blend Name *" className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                <input value={blendForm.client} onChange={(e) => setBlendForm((p) => ({ ...p, client: e.target.value }))} placeholder="Client" className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                <input value={blendForm.blend_no} onChange={(e) => setBlendForm((p) => ({ ...p, blend_no: e.target.value }))} placeholder="Blend No." className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                <input value={blendForm.grade} onChange={(e) => setBlendForm((p) => ({ ...p, grade: e.target.value }))} placeholder="Grade" className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                <input value={blendForm.cup_profile} onChange={(e) => setBlendForm((p) => ({ ...p, cup_profile: e.target.value }))} placeholder="Cup Profile" className="rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680] md:col-span-2 xl:col-span-4" />
              </div>

              <div className="mt-5 rounded-2xl border border-[#D6D2C4] bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[#51534a]">Composition</div>
                  <div className={Math.abs(blendCompositionTotal - 100) < 0.01 ? "font-bold text-[#007680]" : blendCompositionTotal > 100 ? "font-bold text-red-600" : "font-bold text-[#B9975B]"}>{blendCompositionTotal.toFixed(2)}%</div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#D6D2C4]"><div className="h-full rounded-full bg-[#007680]" style={{ width: `${Math.min(100, blendCompositionTotal)}%` }} /></div>
                <div className="mt-2 text-xs text-[#968C83]">Composition must equal exactly 100% before saving.</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {BLEND_COMPONENTS.map((comp) => (
                    <div key={comp.key}>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#968C83]">{comp.label}</label>
                      <input type="number" min="0" max="100" step="0.01" value={blendForm[comp.key]} onChange={(e) => setBlendForm((p) => ({ ...p, [comp.key]: e.target.value }))} className="w-full rounded-lg border border-[#D6D2C4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007680]" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button onClick={() => setBlendCreateOpen(false)} className="rounded-lg border border-[#D6D2C4] bg-white px-4 py-2 text-sm font-bold text-[#51534a]">Cancel</button>
                <button onClick={saveBlend} disabled={!blendForm.name.trim() || Math.abs(blendCompositionTotal - 100) > 0.01} className="rounded-lg bg-[#007680] px-5 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50">Save Blend</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* --- ⚡ DECLARATION VIEW MODAL --- */}
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
                          <button onClick={() => setViewingDeclarationContract(null)} className="text-[#968C83] hover:text-[#51534a] p-1.5 rounded-full hover:bg-[#D6D2C4]/50">
                              <X size={20} />
                          </button>
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

      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#007680] text-white shadow-sm"><ShieldCheck size={20} /></div>
              <div>
                <h1 className="text-2xl font-bold text-[#51534a]">Positions</h1>
                <p className="text-sm text-[#968C83]">Physical, Certification, Tracker, Contracts, Blends, & Declarations</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border border-[#968C83]/20 bg-white p-1 shadow-sm">
              {(["kg", "bag", "mt"] as Unit[]).map((u) => (
                <button key={u} onClick={() => setUnit(u)} className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${unit === u ? "bg-[#007680] text-white shadow-sm" : "text-[#968C83] hover:bg-[#D6D2C4]/30"}`}>{u.toUpperCase()}</button>
              ))}
            </div>
            <button onClick={() => openAddUpload("purchases")} className="flex items-center gap-2 rounded-lg bg-[#007680] px-4 py-2 text-sm font-bold text-white shadow-sm"><Upload size={16} /> Add / Upload</button>
          </div>
        </header>

        <div className="flex gap-2 overflow-x-auto border-b border-[#968C83]/30">
          <button onClick={() => setActiveTab("physical")} className={`flex items-center gap-2 whitespace-nowrap border-b-4 px-4 py-3 text-sm font-medium transition-colors ${activeTab === "physical" ? "border-[#007680] text-[#007680]" : "border-transparent text-[#968C83] hover:border-[#968C83]/30 hover:text-[#51534a]"}`}><Box size={16} /> Physical</button>
          <button onClick={() => setActiveTab("certification")} className={`flex items-center gap-2 whitespace-nowrap border-b-4 px-4 py-3 text-sm font-medium transition-colors ${activeTab === "certification" ? "border-[#007680] text-[#007680]" : "border-transparent text-[#968C83] hover:border-[#968C83]/30 hover:text-[#51534a]"}`}><FileText size={16} /> Certification</button>
          <button onClick={() => setActiveTab("tracker")} className={`flex items-center gap-2 whitespace-nowrap border-b-4 px-4 py-3 text-sm font-medium transition-colors ${activeTab === "tracker" ? "border-[#007680] text-[#007680]" : "border-transparent text-[#968C83] hover:border-[#968C83]/30 hover:text-[#51534a]"}`}><Users size={16} /> Certification Tracker</button>
          <button onClick={() => setActiveTab("contracts")} className={`flex items-center gap-2 whitespace-nowrap border-b-4 px-4 py-3 text-sm font-medium transition-colors ${activeTab === "contracts" ? "border-[#007680] text-[#007680]" : "border-transparent text-[#968C83] hover:border-[#968C83]/30 hover:text-[#51534a]"}`}><FileSpreadsheet size={16} /> Contracts</button>
          <button onClick={() => setActiveTab("blends")} className={`flex items-center gap-2 whitespace-nowrap border-b-4 px-4 py-3 text-sm font-medium transition-colors ${activeTab === "blends" ? "border-[#007680] text-[#007680]" : "border-transparent text-[#968C83] hover:border-[#968C83]/30 hover:text-[#51534a]"}`}><Combine size={16} /> Blends</button>
          <button onClick={() => setActiveTab("declarations")} className={`flex items-center gap-2 whitespace-nowrap border-b-4 px-4 py-3 text-sm font-medium transition-colors ${activeTab === "declarations" ? "border-[#007680] text-[#007680]" : "border-transparent text-[#968C83] hover:border-[#968C83]/30 hover:text-[#51534a]"}`}><FileCheck size={16} /> Declarations</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <MetricCard 
              title={activeTab === "certification" ? `${activeCert} Total Stock` : activeTab === "physical" ? "Physical Theoretical Stock" : activeTab === "tracker" ? "Active Certification" : activeTab === "declarations" ? "Total Declarations" : "Total Sales"} 
              value={activeTab === "certification" ? formatQty(certificationRows.kpis.stock, unit) : activeTab === "physical" ? formatQty(physicalRows.kpis.totalTheoretical, unit) : activeTab === "tracker" ? trackerSelectedLabel : activeTab === "declarations" ? String(declaredContractsSummary.length) : formatQty(sales.reduce((s, sale) => s + asNumber(sale.weight_kilos), 0), unit)} 
              subtitle={activeTab === "tracker" ? "Applies to tracker table and download" : activeTab === "declarations" ? "Contracts fully declared" : "Displayed in selected unit"} 
          />
          <MetricCard title={activeTab === "certification" ? `${activeCert} Shorts` : activeTab === "physical" ? "Physical Shorts" : activeTab === "tracker" ? "Visible Records" : "Linked Blends"} value={activeTab === "certification" ? formatQty(certificationRows.kpis.shorts, unit) : activeTab === "physical" ? formatQty(physicalRows.kpis.totalShorts, unit) : activeTab === "tracker" ? String(trackerVisibleRecordCount) : String(sales.filter((s) => s.blend_id).length)} tone={activeTab === "certification" || activeTab === "physical" ? "warn" : "default"} subtitle={activeTab === "tracker" ? trackerVisibleDateLabel : "Filtered from current view"} />
          <MetricCard title={activeTab === "certification" ? `${activeCert} Net Position` : activeTab === "physical" ? "Physical Net Position" : activeTab === "tracker" ? "Visible Volume" : "Open Contracts"} value={activeTab === "certification" ? formatQty(certificationRows.kpis.net, unit) : activeTab === "physical" ? formatQty(physicalRows.kpis.totalNet, unit) : activeTab === "tracker" ? formatQty(trackerVisibleTotalKg, unit) : String(sales.filter((s) => !s.blend_id).length)} tone="good" subtitle={activeTab === "tracker" ? "Current filtered tracker stock" : "Positive or negative balance"} />
          <MetricCard title="Current Unit" value={unitText(unit)} subtitle="Applies across the page" />
        </div>

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
                      <td className="py-3 px-4 text-[#968C83]">{formatMonth(c.shipping_date)}</td>
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

        {activeTab === "physical" && (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <SectionCard title="Physical Stock Position" subtitle="Theoretical, shorts, and net balances" right={<button onClick={refreshPhysical} disabled={physicalLoading} className="rounded-lg bg-[#007680] px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50">{physicalLoading ? "Refreshing..." : "Refresh Physical"}</button>}>
              {!hasFetchedPhysical && physicalRows.gridData.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#D6D2C4] bg-[#F5F5F3] p-10 text-center text-sm text-[#968C83]">
                  No physical stock position has been loaded yet. Click Refresh Physical to fetch the current data.
                </div>
              ) : physicalRows.gridData.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#D6D2C4] bg-[#F5F5F3] p-10 text-center text-sm text-[#968C83]">
                  No physical rows were returned by the data source.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] w-full text-sm">
                    <thead className="sticky top-0 bg-[#51534a] text-xs uppercase tracking-wider text-white">
                      <tr>
                        <th className="px-4 py-3 text-left">Post Stack</th>
                        <th className="px-4 py-3 text-right">Theoretical ({unitText(unit)})</th>
                        {physicalRows.months.map((m) => <th key={m} className="px-4 py-3 text-right">{m}</th>)}
                        <th className="px-4 py-3 text-right">Total Shorts</th>
                        <th className="px-4 py-3 text-right">Net Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {physicalRows.gridData.map((row, idx) => (
                        <tr key={row.stack} className={idx % 2 === 0 ? "bg-white" : "bg-[#FCF7EA]"}>
                          <td className="px-4 py-3 font-medium text-[#007680]">{stackLabel(row.stack)}</td>
                          <td className="px-4 py-3 text-right font-bold">{formatQty(row.theoretical, unit)}</td>
                          {physicalRows.months.map((m) => <td key={m} className="px-4 py-3 text-right text-[#968C83]">{row.months[m] != null ? formatQty(row.months[m], unit) : "-"}</td>)}
                          <td className="px-4 py-3 text-right font-medium text-[#5B3427]">{formatQty(row.shorts, unit)}</td>
                          <td className={`px-4 py-3 text-right font-bold ${row.net >= 0 ? "text-[#007680]" : "text-[#B9975B]"}`}>{row.net > 0 ? "+" : ""}{formatQty(row.net, unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-[#EFEFE9] font-bold text-[#51534a]">
                      <tr>
                        <td className="px-4 py-3">TOTALS</td>
                        <td className="px-4 py-3 text-right">{formatQty(physicalRows.kpis.totalTheoretical, unit)}</td>
                        {physicalRows.months.map((m) => <td key={m} className="px-4 py-3 text-right">{formatQty(physicalRows.gridData.reduce((s, r) => s + (r.months[m] ?? 0), 0), unit)}</td>)}
                        <td className="px-4 py-3 text-right">{formatQty(physicalRows.kpis.totalShorts, unit)}</td>
                        <td className={`px-4 py-3 text-right ${physicalRows.kpis.totalNet >= 0 ? "text-[#007680]" : "text-[#B9975B]"}`}>{physicalRows.kpis.totalNet > 0 ? "+" : ""}{formatQty(physicalRows.kpis.totalNet, unit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </SectionCard>

            <div className="space-y-4 min-w-0">
              <SectionCard title="Physical Insights" subtitle="Quick operational readout">
                <div className="space-y-3 text-sm text-[#51534a]">
                  <div className="flex justify-between"><span>Largest stack</span><span className="font-bold">{physicalTop?.stack ? stackLabel(physicalTop.stack) : "—"}</span></div>
                  <div className="flex justify-between"><span>Most shorts</span><span className="font-bold">{physicalMostShorts?.stack ? stackLabel(physicalMostShorts.stack) : "—"}</span></div>
                  <div className="flex justify-between"><span>Positive stacks</span><span className="font-bold">{physicalRows.gridData.filter((r) => r.net >= 0).length}</span></div>
                  <div className="flex justify-between"><span>Negative stacks</span><span className="font-bold">{physicalRows.gridData.filter((r) => r.net < 0).length}</span></div>
                </div>
              </SectionCard>
              <SectionCard title="Physical Data Status" subtitle="Refresh is safe against bad API shapes">
                <div className="text-sm leading-6 text-[#968C83]">The refresh flow normalizes values and only uses the data returned by the API, avoiding NaN issues and avoiding fallback sample values unless the endpoint is unavailable.</div>
              </SectionCard>
            </div>
          </div>
        )}

        {activeTab === "certification" && (
          <div className="grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
            <SectionCard title="Certification Position" subtitle={`Viewing ${activeCert} positions and certification-linked sales`}>
              <div className="mb-4 flex flex-wrap gap-2">{CERT_FILTERS.map((cert) => <Chip key={cert} active={activeCert === cert} onClick={() => setActiveCert(cert)}>{cert}</Chip>)}</div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-5">
                <MetricCard title="Certified Stock" value={formatQty(certificationRows.kpis.stock, unit)} subtitle="Current certification-linked stock" />
                <MetricCard title="Linked Sales" value={formatQty(certificationRows.kpis.shorts, unit)} tone="warn" subtitle="Sales carrying the selected certification" />
                <MetricCard title="Net Position" value={formatQty(certificationRows.kpis.net, unit)} tone="good" subtitle="Stock minus linked sales" />
                <MetricCard title="Coverage" value={certificationRows.kpis.stock > 0 ? `${((certificationRows.kpis.shorts / certificationRows.kpis.stock) * 100).toFixed(1)}%` : "0.0%"} subtitle="Sales as a share of stock" />
              </div>
              {activeCert === "AAA" && aaaAllocationSummary ? (
                <div className="mb-5 grid gap-3 sm:grid-cols-2">
                  {([aaaAllocationSummary.aaa, aaaAllocationSummary.aaaCp] as const).map((bucket) => (
                    <div key={bucket.label} className="rounded-2xl border border-[#D6D2C4] bg-[#F5F5F3] p-4">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-[#968C83]">{bucket.label} allocation</div>
                      <div className="mt-2 text-2xl font-bold text-[#51534a]">{formatQty(bucket.lotKg, unit)} {unitText(unit)}</div>
                      <div className="mt-2 space-y-1 text-xs text-[#51534a]">
                        <div className="flex justify-between gap-2"><span>Stock lots</span><span className="font-bold">{bucket.lotCount}</span></div>
                        <div className="flex justify-between gap-2"><span>Linked contracts</span><span className="font-bold">{bucket.contractCount}</span></div>
                        <div className="flex justify-between gap-2"><span>Declared</span><span className="font-bold">{formatQty(bucket.declaredKg, unit)} {unitText(unit)}</span></div>
                        <div className="flex justify-between gap-2"><span>Balance</span><span className="font-bold">{bucket.balanceKg >= 0 ? "+" : ""}{formatQty(bucket.balanceKg, unit)} {unitText(unit)}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="min-w-[1150px] w-full text-sm">
                  <thead className="sticky top-0 bg-[#51534a] text-xs uppercase tracking-wider text-white">
                    <tr>
                      <th className="px-4 py-3 text-left">Strategy</th>
                      <th className="px-4 py-3 text-right">Available ({unitText(unit)})</th>
                      {certificationRows.months.map((month) => <th key={month} className="px-4 py-3 text-right">{month}</th>)}
                      <th className="px-4 py-3 text-right">Shipment Total</th>
                      <th className="px-4 py-3 text-right">Net Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificationRows.tableData.length > 0 ? certificationRows.tableData.map((row, idx) => (
                      <tr key={row.strategy} className={idx % 2 === 0 ? "bg-white" : "bg-[#FCF7EA]"}>
                        <td className="px-4 py-3 font-medium text-[#007680]"><span className="inline-flex items-center gap-2"><ChevronRight size={14} className="text-[#968C83]" />{row.strategy}</span></td>
                        <td className="px-4 py-3 text-right font-bold">{formatQty(row.available, unit)}</td>
                        {certificationRows.months.map((month) => <td key={month} className="px-4 py-3 text-right text-[#968C83]">{row.shipmentsByMonth[month] != null ? formatQty(row.shipmentsByMonth[month], unit) : "-"}</td>)}
                        <td className="px-4 py-3 text-right font-medium text-[#5B3427]">{formatQty(row.totalShipment, unit)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${row.netPosition >= 0 ? "text-[#007680]" : "text-[#B9975B]"}`}>{row.netPosition > 0 ? "+" : ""}{formatQty(row.netPosition, unit)}</td>
                      </tr>
                    )) : <tr><td colSpan={certificationRows.months.length + 4} className="px-4 py-8 text-center italic text-[#968C83]">No certification rows found.</td></tr>}
                  </tbody>
                  <tfoot className="bg-[#EFEFE9] font-bold text-[#51534a]">
                    <tr>
                      <td className="px-4 py-3">TOTALS</td>
                      <td className="px-4 py-3 text-right">{formatQty(certificationRows.kpis.stock, unit)}</td>
                      {certificationRows.months.map((month) => <td key={month} className="px-4 py-3 text-right">{formatQty(certificationRows.tableData.reduce((sum, r) => sum + (r.shipmentsByMonth[month] ?? 0), 0), unit)}</td>)}
                      <td className="px-4 py-3 text-right">{formatQty(certificationRows.kpis.shorts, unit)}</td>
                      <td className={`px-4 py-3 text-right ${certificationRows.kpis.net >= 0 ? "text-[#007680]" : "text-[#B9975B]"}`}>{certificationRows.kpis.net > 0 ? "+" : ""}{formatQty(certificationRows.kpis.net, unit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </SectionCard>

            <div className="space-y-4">
              <SectionCard title="Certification Links" subtitle="Linked stock lots and linked contracts for the active certification" right={<span className="rounded-full bg-[#A4DBE8]/30 px-3 py-1 text-xs font-bold text-[#007680]">{activeCert}</span>}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-[#F5F5F3] p-3"><div className="text-[11px] font-bold uppercase tracking-wider text-[#968C83]">Stock lots</div><div className="mt-1 text-xl font-bold text-[#51534a]">{activeCertLots.length}</div></div>
                  <div className="rounded-2xl bg-[#F5F5F3] p-3"><div className="text-[11px] font-bold uppercase tracking-wider text-[#968C83]">Contracts</div><div className="mt-1 text-xl font-bold text-[#51534a]">{activeCertContracts.length}</div></div>
                  <div className="rounded-2xl bg-[#F5F5F3] p-3"><div className="text-[11px] font-bold uppercase tracking-wider text-[#968C83]">Coverage</div><div className="mt-1 text-xl font-bold text-[#007680]">{certInsights.coverage.toFixed(1)}%</div></div>
                  <div className="rounded-2xl bg-[#F5F5F3] p-3"><div className="text-[11px] font-bold uppercase tracking-wider text-[#968C83]">Net</div><div className={`mt-1 text-xl font-bold ${certificationRows.kpis.net >= 0 ? "text-[#007680]" : "text-[#B9975B]"}`}>{certificationRows.kpis.net > 0 ? "+" : ""}{formatQty(certificationRows.kpis.net, unit)}</div></div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#968C83]">Linked lots</div>
                  <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                    {activeCertLots.length > 0 ? activeCertLots.map((lot) => (
                      <div key={lot.id} className="rounded-xl border border-[#D6D2C4] bg-[#F5F5F3] px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-bold text-[#007680]">{lot.lot_number}</div>
                            <div className="text-xs text-[#968C83]">{displayText(lot.cooperative || lot.strategy || lot.grade || lot.wet_mill || lot.outturn || "Unassigned")}</div>
                          </div>
                          <div className="text-xs font-bold text-[#51534a]">{formatQty(asNumber(lot.purchased_weight), unit)} {unitText(unit)}</div>
                        </div>
                        <div className="mt-1 text-[11px] text-[#51534a]">Holder: <span className="font-semibold">{activeCert === "RFA" ? displayText(lot.rfa_certificate_holder || lot.cooperative || lot.wet_mill) : activeCert === "CAFE" ? displayText(lot.cafe_certificate_holder || lot.cooperative || lot.wet_mill) : activeCert === "EUDR" ? displayText(lot.eudr_certificate_holder || lot.cooperative || lot.wet_mill) : displayText(getAaaReservationLabelFromStock(lot) === "AAA/CP" ? (lot.cafe_certificate_holder || lot.cooperative || lot.wet_mill) : (lot.cooperative || lot.wet_mill))}</span>{activeCert === "AAA" ? <span className="ml-2 rounded-full bg-[#A4DBE8]/30 px-2 py-0.5 font-semibold text-[#007680]">{getAaaReservationLabelFromStock(lot)}</span> : null}</div>
                      </div>
                    )) : <div className="text-sm italic text-[#968C83]">No linked lots for this certification.</div>}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#968C83]">Linked contracts</div>
                  <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
                    {activeCertContracts.length > 0 ? activeCertContracts.map((sale) => (
                      <div key={sale.id} className="rounded-xl border border-[#D6D2C4] bg-white px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-bold text-[#007680]">{sale.contract_number}</div>
                            <div className="text-xs text-[#968C83]">{displayText(sale.client, "No client")} · {displayText(sale.strategy || sale.quality || sale.grade || "Unassigned")}</div>
                          </div>
                          <div className="text-xs font-bold text-[#51534a]">{formatQty(asNumber(sale.weight_kilos), unit)} {unitText(unit)}</div>
                        </div>
                      </div>
                    )) : <div className="text-sm italic text-[#968C83]">No contracts linked to this certification.</div>}
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        )}

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

        {activeTab === "contracts" && (
          <SectionCard title="Contracts" subtitle="Edit certifications and blend allocations directly from the table" right={<button onClick={() => openAddUpload("sales")} className="rounded-lg bg-[#007680] px-4 py-2 text-sm font-bold text-white shadow-sm"><Plus size={16} className="mr-2 inline-block" />Add Sales</button>}>
            <div className="overflow-x-auto">
              <table className="min-w-[1200px] w-full text-sm">
                <thead className="bg-[#51534a] text-xs uppercase tracking-wider text-white">
                  <tr>
                    <th className="px-4 py-3 text-left">Contract</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-right">Weight ({unitText(unit)})</th>
                    <th className="px-4 py-3 text-left">Ship Date</th>
                    <th className="px-4 py-3 text-left">Quality</th>
                    <th className="px-4 py-3 text-left">Grade</th>
                    <th className="px-4 py-3 text-left">Certifications</th>
                    <th className="px-4 py-3 text-left">Blend</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale, idx) => {
                    const editing = editingContractId === sale.id;
                    const displayCerts = parseCerts(sale.certifications);

                    return (
                      <tr key={sale.id} className={idx % 2 === 0 ? "bg-white" : "bg-[#FCF7EA]"}>
                        <td className="px-4 py-3 font-bold text-[#007680]">{sale.contract_number}</td>
                        <td className="px-4 py-3">{sale.client || "-"}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatQty(asNumber(sale.weight_kilos), unit)}</td>
                        <td className="px-4 py-3 text-[#968C83]">{formatMonth(sale.shipping_date)}</td>
                        <td className="px-4 py-3">{editing ? <input value={contractEdit.quality} onChange={(e) => setContractEdit((p) => ({ ...p, quality: e.target.value }))} className="w-full rounded-lg border border-[#D6D2C4] px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[#007680]" /> : <span>{sale.quality || sale.strategy || "-"}</span>}</td>
                        <td className="px-4 py-3">{editing ? <input value={contractEdit.grade} onChange={(e) => setContractEdit((p) => ({ ...p, grade: e.target.value }))} className="w-full rounded-lg border border-[#D6D2C4] px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[#007680]" /> : <span>{sale.grade || "-"}</span>}</td>
                        <td className="px-4 py-3">
                          {editing ? (
                            <div className="min-w-[220px] space-y-2">
                              <select value="" onChange={(e) => { const val = e.target.value; if (val === "UNCERTIFIED") setContractEdit((p) => ({ ...p, certifications: [] })); else if (val && !contractEdit.certifications.includes(val)) setContractEdit((p) => ({ ...p, certifications: [...p.certifications, val] })); }} className="w-full rounded-lg border border-[#D6D2C4] px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[#007680]">
                                <option value="" disabled>Add certification…</option>
                                <option value="UNCERTIFIED">Uncertified (Clear All)</option>
                                {CERT_FILTERS.map((c) => <option key={c} value={c} disabled={contractEdit.certifications.includes(c)}>{c}</option>)}
                              </select>
                              <div className="flex flex-wrap gap-1">{contractEdit.certifications.map((cert) => <span key={cert} className="inline-flex items-center gap-1 rounded-full bg-[#A4DBE8]/30 px-2 py-1 text-[10px] font-bold text-[#007680]"><button type="button" onClick={() => setContractEdit((p) => ({ ...p, certifications: p.certifications.filter((c) => c !== cert) }))} className="leading-none">×</button>{cert}</span>)}</div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1">{displayCerts.length ? displayCerts.map((cert) => <span key={cert} className="rounded-full bg-[#D6D2C4]/30 px-2 py-0.5 text-[10px] font-bold text-[#51534a]">{cert}</span>) : <span className="text-xs italic text-[#968C83]">Uncertified</span>}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">{editing ? <select value={contractEdit.blend_id} onChange={(e) => setContractEdit((p) => ({ ...p, blend_id: e.target.value ? Number(e.target.value) : "" }))} className="w-full rounded-lg border border-[#D6D2C4] px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[#007680]"><option value="">No Blend</option>{blends.map((blend) => <option key={blend.id} value={blend.id}>{blend.name}</option>)}</select> : <span>{sale.blend_name || <span className="italic text-[#968C83]">Unassigned</span>}</span>}</td>
                        <td className="px-4 py-3 text-center">
                          {editing ? (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={saveContractEdit} className="rounded-lg bg-[#007680] p-1.5 text-white shadow-sm"><Check size={14} /></button>
                              <button onClick={() => setEditingContractId(null)} className="rounded-lg bg-[#B9975B] p-1.5 text-white shadow-sm"><X size={14} /></button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                                <button onClick={() => { setEditingContractId(sale.id); setContractEdit({ quality: sale.quality || sale.strategy || "", grade: sale.grade || "", certifications: parseCerts(sale.certifications), blend_id: sale.blend_id || "" }); }} className="rounded-lg p-1.5 text-[#007680] hover:bg-[#007680]/10"><Pencil size={14} /></button>
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
          </SectionCard>
        )}

        {activeTab === "blends" && (
          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <SectionCard title="Blend Directory" subtitle="Only non-zero post stacks are shown in the summary" right={<button onClick={() => setBlendCreateOpen(true)} className="rounded-lg bg-[#007680] px-4 py-2 text-sm font-bold text-white shadow-sm"><Plus size={16} className="mr-2 inline-block" />Create Blend</button>}>
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

      </div>
    </main>
  );
}