import * as xlsx from "xlsx";
import { normalizeUgandaGrade } from "../config/gradeMappings";

const getCellValue = (worksheet, r, c) => {
  const address = xlsx.utils.encode_cell({ r, c });
  const cell = worksheet[address];
  return cell ? (cell.w || cell.v) : undefined;
};

const parseNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const sValue = String(value).replace(/,/g, '').trim();
  if (sValue.startsWith('(') && sValue.endsWith(')')) {
    return -parseFloat(sValue.substring(1, sValue.length - 1));
  }
  const num = parseFloat(sValue);
  return isNaN(num) ? 0 : num;
};

// A simple, dedicated function for the "Net Shorts" table date format (e.g., Aug-25)
function findNetShortMonths(worksheet, config) {
    const monthMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const monthCols = {};
    const sheetRange = xlsx.utils.decode_range(worksheet['!ref']);
    const headerRowIndex = config.monthHeaderRow - 1;
    const startCol = xlsx.utils.decode_col(config.monthStartCol);

    for (let c = startCol; c <= sheetRange.e.c; c++) {
        const header = getCellValue(worksheet, headerRowIndex, c);
        if (header && typeof header === 'string') {
            const match = header.trim().match(/^(\w{3})-(\d{2})$/i);
            if (match) {
                const monthName = match[1].toLowerCase();
                const year = `20${match[2]}`;
                if (monthMap[monthName]) {
                    const dateKey = `${year}-${monthMap[monthName]}-01`;
                    monthCols[dateKey] = c;
                }
            } else if (Object.keys(monthCols).length > 0 && String(header).trim() !== '') {
                break;
            }
        }
    }
    return monthCols;
}

// [DELETED] The findPurchaseMonths function was removed as it was looking for the wrong header format.

function parsePurchases(worksheet, config) {
    console.log(`\n--- DIAGNOSING PURCHASES for startCell: "${config.startCell}" ---`);
    const purchaseData = {};
    const start = xlsx.utils.decode_cell(config.startCell);
    const gradeCol = xlsx.utils.decode_col(config.gradeCol);
    const sheetRange = xlsx.utils.decode_range(worksheet['!ref']);
    
    // --- THIS IS THE FIX ---
    // Changed findPurchaseMonths to findNetShortMonths, which matches the "Mon-YY" format
    // we saw in the screenshot for both Purchases and Net Shorts tables.
    const monthColMap = findNetShortMonths(worksheet, config);
    // --- END OF FIX ---

    console.log(`   - Found ${Object.keys(monthColMap).length} month columns in Purchases table.`);

    for (let r = start.r; r <= sheetRange.e.r; r++) {
        const grade = getCellValue(worksheet, r, gradeCol);
        if (!grade || String(grade).trim() === '' || String(grade).toLowerCase().includes('total')) break;
        
        const gradeStr = normalizeUgandaGrade(grade);
        purchaseData[gradeStr] = {};
        for (const [dateKey, colIndex] of Object.entries(monthColMap)) {
            const purchaseValue = parseNumber(getCellValue(worksheet, r, colIndex));
            if (purchaseValue !== 0) {
                purchaseData[gradeStr][dateKey] = purchaseValue;
            }
        }
    }
    console.log(`--- FINISHED DIAGNOSING PURCHASES ---`);
    return purchaseData;
}

export function transformUgandaData(worksheet, country) {
  const { config } = country;
  const { layout, unit } = config;
  
  const robustaPurchases = parsePurchases(worksheet, layout.purchasesRobusta);
  const arabicaPurchases = parsePurchases(worksheet, layout.purchasesArabica);
  
  const robustaRecords = processNetShorts(worksheet, layout.netShortsRobusta, robustaPurchases, country.name, 'Robusta', unit);
  const arabicaRecords = processNetShorts(worksheet, layout.netShortsArabica, arabicaPurchases, country.name, 'Arabica', unit);
  
  return [...robustaRecords, ...arabicaRecords];
}

function processNetShorts(worksheet, config, purchaseData, countryName, coffeeType, unit) {
    const records = [];
    const start = xlsx.utils.decode_cell(config.startCell);
    const gradeCol = xlsx.utils.decode_col(config.gradeCol);
    const stockCols = config.stockCols.map(c => xlsx.utils.decode_col(c));
    const sheetRange = xlsx.utils.decode_range(worksheet['!ref']);
    
    const monthColMap = findNetShortMonths(worksheet, config);

    for (let r = start.r; r <= sheetRange.e.r; r++) {
        const grade = getCellValue(worksheet, r, gradeCol);
        if (!grade || String(grade).trim() === '' || String(grade).toLowerCase().includes('total')) break;
        
        const gradeStr = normalizeUgandaGrade(grade);

        let totalStock = 0;
        stockCols.forEach(c => totalStock += parseNumber(getCellValue(worksheet, r, c)));

        if (totalStock !== 0) {
            records.push({ country: countryName, grade: `${countryName.toUpperCase()} ${gradeStr}`, type: 'long', quantity: totalStock, unit, date: null, coffeeType });
        }

        if (config.pastDueCol) {
            const pastDueValue = parseNumber(getCellValue(worksheet, r, xlsx.utils.decode_col(config.pastDueCol)));
            if (pastDueValue !== 0) {
                records.push({ country: countryName, grade: `${countryName.toUpperCase()} ${gradeStr}`, type: 'short', quantity: pastDueValue, unit, date: null, coffeeType });
            }
        }
        
        const shouldLog = (coffeeType === 'Arabica' && r < start.r + 3);
        if (shouldLog) {
             console.log(`\n--- Processing Grade: ${gradeStr} (Row ${r+1}) ---`);
        }

        for (const [dateKey, colIndex] of Object.entries(monthColMap)) {
            const netShort = parseNumber(getCellValue(worksheet, r, colIndex));
            const purchase = purchaseData[gradeStr] ? (purchaseData[gradeStr][dateKey] || 0) : 0;
            const trueShort = netShort - purchase;
            
            if ((netShort !== 0 || purchase !== 0) && shouldLog) {
                console.log(`  - Month ${dateKey}:`);
                console.log(`    - Net Short: ${netShort}`);
                console.log(`    - Purchase:  ${purchase} (from grade '${gradeStr}')`);
                console.log(`    - Calculation: ${netShort} - ${purchase} = ${trueShort}`);
            }
            
            if (trueShort !== 0) {
                records.push({ country: countryName, grade: `${countryName.toUpperCase()} ${gradeStr}`, type: 'short', quantity: trueShort, unit, date: dateKey, coffeeType });
            }
        }
    }
    return records;
}