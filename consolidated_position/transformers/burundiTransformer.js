// transformers/burundiTransformer.js
import * as xlsx from "xlsx";
import { normalizeBurundiGrade } from "../config/gradeMappings";

// --- Helpers ---
const getCellValue = (worksheet, r, c) => {
  const address = xlsx.utils.encode_cell({ r, c });
  const cell = worksheet[address];
  return cell ? (cell.w || cell.v) : undefined;
};

const parseNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};

const parseMonthYear = (monYY) => {
  if (!monYY || typeof monYY !== 'string') return null;
  const match = monYY.trim().match(/^(\w{3})-(\d{2})$/i);
  if (!match) return null;

  const monthMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const monthName = match[1].toLowerCase();
  const year = `20${match[2]}`;

  if (monthMap[monthName]) {
    return `${year}-${monthMap[monthName]}-01`;
  }
  return null;
};

// --- Main Transform Function ---
export function transformBurundiData(recapSheet, scheduleSheet, country) {
  const { unit } = country.config;
  const allRecords = [];

  console.group("--- BURUNDI DEBUG START ---");

  // 1. Process "Burundi Schedule"
  const { shorts, exportedQuantities } = processSchedule(scheduleSheet, country.name, unit);
  allRecords.push(...shorts);

  // 2. Process "Burundi Recap"
  const productionQuantities = processRecap(recapSheet);

  // 3. Calculate Longs (Stock)
  console.group("Stock Calculation (Longs)");
  let totalStockCalculated = 0;

  // We iterate through production keys to find matching exports
  for (const [grade, production] of Object.entries(productionQuantities)) {
    const exported = exportedQuantities[grade] || 0;
    const stock = production - exported;

    if (stock !== 0) {
      console.log(`[Stock] Grade: ${grade} | Prod: ${production} - Export: ${exported} = Stock: ${stock}`);
      totalStockCalculated += stock;
      allRecords.push({
        country: country.name,
        grade: `${country.name.toUpperCase()} ${grade}`,
        type: 'long',
        quantity: stock,
        unit: unit,
        date: null,
        coffeeType: 'Arabica',
      });
    }
  }
  
  // Check for Exported grades that had NO Production entry
  for (const [grade, exported] of Object.entries(exportedQuantities)) {
    if (!(grade in productionQuantities)) {
      console.warn(`[Anomaly] Export found for ${grade} (${exported} MT) but NO corresponding production found in Recap.`);
    }
  }

  console.log(`[Final Audit] Total Long Stock Created: ${totalStockCalculated} ${unit}`);
  console.groupEnd();
  console.groupEnd();

  return allRecords;
}

// --- Schedule Sheet Processor ---
function processSchedule(worksheet, countryName, unit) {
  console.group("Processing Schedule Sheet");
  const shorts = [];
  const exportedQuantities = {};
  const headerRow = 5; 
  const sheetRange = xlsx.utils.decode_range(worksheet['!ref']);
  
  let totalExported = 0;
  let totalShorts = 0;

  for (let r = headerRow + 1; r <= sheetRange.e.r; r++) {
    const status = getCellValue(worksheet, r, 9); 
    const grade = getCellValue(worksheet, r, 2); 

    if (!grade || String(grade).trim() === '') continue;
    if (String(grade).toLowerCase().includes('total')) {
        console.log(`[Schedule] Stop triggered at row ${r+1} (Total row)`);
        break;
    }

    const normalizedGrade = normalizeBurundiGrade(grade);
    const quantity = parseNumber(getCellValue(worksheet, r, 3));

    if (!normalizedGrade) {
        if (quantity !== 0) console.warn(`[Schedule] Row ${r+1} SKIPPED: Grade "${grade}" could not be normalized (Qty: ${quantity})`);
        continue;
    }

    if (quantity === 0) continue;

    if (status && String(status).trim().toLowerCase() === 'exported') {
      exportedQuantities[normalizedGrade] = (exportedQuantities[normalizedGrade] || 0) + quantity;
      totalExported += quantity;
    } else {
      const monthStr = getCellValue(worksheet, r, 1);
      const date = parseMonthYear(monthStr);
      shorts.push({
        country: countryName,
        grade: `${countryName.toUpperCase()} ${normalizedGrade}`,
        type: 'short',
        quantity: -Math.abs(quantity),
        unit: unit,
        date: date,
        coffeeType: 'Arabica',
      });
      totalShorts += Math.abs(quantity);
    }
  }

  console.log(`[Schedule Summary] Total Exported: ${totalExported}, Total Shorts: ${totalShorts}`);
  console.groupEnd();
  return { shorts, exportedQuantities };
}

// --- Recap Sheet Processor ---
function processRecap(worksheet) {
  console.group("Processing Recap Sheet");
  const productionQuantities = {};
  const sheetRange = xlsx.utils.decode_range(worksheet['!ref']);
  let currentBurundiQuality = "";
  let totalProduction = 0;

  for (let r = 0; r <= sheetRange.e.r; r++) {
    const burundiQualityCell = getCellValue(worksheet, r, 1); 
    const gradeCell = getCellValue(worksheet, r, 3); 

    if (burundiQualityCell && String(burundiQualityCell).trim() !== '') {
      const qualityStr = String(burundiQualityCell).trim();
      
      if (qualityStr.includes('Current Pot (Lots)') || qualityStr.includes('SPBI Crosses') || qualityStr.includes('-33 55.42')) {
        console.log(`[Recap] Stop triggered at row ${r+1} due to stop-string: "${qualityStr}"`);
        break;
      }
      currentBurundiQuality = qualityStr;
    }

    if (gradeCell && String(gradeCell).trim() !== '' && currentBurundiQuality !== '') {
      if (String(gradeCell).toLowerCase().includes('total') || String(currentBurundiQuality).toLowerCase().includes('total')) {
          continue;
      }
      
      const concatenatedGrade = `${currentBurundiQuality} ${String(gradeCell).trim()}`;

      if (concatenatedGrade === 'Burundi Quality Grade') continue;
      
      const normalizedGrade = normalizeBurundiGrade(concatenatedGrade);
      const production = parseNumber(getCellValue(worksheet, r, 4));

      if (normalizedGrade) {
        if (production !== 0) {
          productionQuantities[normalizedGrade] = (productionQuantities[normalizedGrade] || 0) + production;
          totalProduction += production;
        }
      } else {
        if (production !== 0) {
            console.warn(`[Recap] Row ${r+1} SKIPPED: "${concatenatedGrade}" could not be normalized (Qty: ${production})`);
        }
      }
    }
  }
  
  console.log(`[Recap Summary] Total Production Scanned: ${totalProduction}`);
  console.groupEnd();
  return productionQuantities;
}