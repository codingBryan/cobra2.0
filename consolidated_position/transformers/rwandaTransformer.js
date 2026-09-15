import * as xlsx from "xlsx";
import { normalizeRwandaGrade } from "../config/gradeMappings";

const getCellValue = (worksheet, r, c) => {
  const address = xlsx.utils.encode_cell({ r, c });
  const cell = worksheet[address];
  return cell ? (cell.w || cell.v) : undefined;
};

const getCellDate = (worksheet, r, c) => {
  const address = xlsx.utils.encode_cell({ r, c });
  const cell = worksheet[address];
  if (!cell) return null;
  // If xlsx was loaded with cellDates:true, dates come through as Date objects.
  if (cell.v instanceof Date) return cell.v;
  // Otherwise dates are Excel serial numbers on numeric cells.
  if (typeof cell.v === 'number' && cell.t === 'n') {
    const parsed = xlsx.SSF.parse_date_code(cell.v);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  return null;
};

const parseNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};

export function transformRwandaData(worksheet, country) {
  const { config } = country;
  const { layout, unit } = config;
  const allRecords = [];

  layout.longs.forEach(longConfig => {
    const longs = processLongs(worksheet, longConfig.startCell, longConfig.cropYear, unit);
    allRecords.push(...longs);
  });

  layout.shorts.forEach(shortConfig => {
    const shorts = processShorts(worksheet, shortConfig.startCell, shortConfig.monthHeaderRow, shortConfig.cropYear, unit);
    allRecords.push(...shorts);
  });

  return allRecords;
}

function processLongs(worksheet, startCell, cropYear, unit) {
  const longs = [];
  const start = xlsx.utils.decode_cell(startCell);
  const gradeCol = start.c;
  const stockCol = start.c + 1; // 'Physical' (Col C)
  // 'Undelivered' (Col D) will be stockCol + 1
  const sheetRange = xlsx.utils.decode_range(worksheet['!ref']);

  for (let r = start.r + 1; r <= sheetRange.e.r; r++) {
    const grade = getCellValue(worksheet, r, gradeCol);
    if (!grade || String(grade).trim() === '' || String(grade).toLowerCase().includes('total')) break;

    const physicalStock = parseNumber(getCellValue(worksheet, r, stockCol));
    const undeliveredStock = parseNumber(getCellValue(worksheet, r, stockCol + 1));
    const totalStock = physicalStock + undeliveredStock;

    if (totalStock !== 0) {
      const normalizedGrade = normalizeRwandaGrade(grade);
      longs.push({
        country: 'Rwanda',
        grade: `RWANDA ${normalizedGrade}`,
        type: 'long',
        quantity: totalStock,
        unit: unit,
        date: null,
        cropYear: cropYear,
        coffeeType: 'Arabica',
      });
    }
  }
  return longs;
}

function processShorts(worksheet, startCell, monthHeaderRow, cropYear, unit) {
  const shorts = [];
  const start = xlsx.utils.decode_cell(startCell);
  const gradeCol = start.c;
  const dataStartRow = start.r;
  const sheetRange = xlsx.utils.decode_range(worksheet['!ref']);

  // Build month columns by reading actual date values from the header row.
  // Each column's year derives from its own cell, so wraparounds (e.g. Dec-26 -> Jan-27) just work.
  const monthCols = [];
  for (let c = gradeCol + 1; c <= sheetRange.e.c; c++) {
    const date = getCellDate(worksheet, monthHeaderRow, c);
    if (date) {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      monthCols.push({ index: c, date: `${yyyy}-${mm}-01` });
    } else {
      // Non-date header (e.g. "Grand Total") signals end of month columns.
      const header = getCellValue(worksheet, monthHeaderRow, c);
      if (header && String(header).trim() !== '') break;
    }
  }

  let hasFoundFirstGrade = false;
  for (let r = dataStartRow; r <= sheetRange.e.r; r++) {
    const grade = getCellValue(worksheet, r, gradeCol);
    if (!grade || String(grade).trim() === '') {
      if (hasFoundFirstGrade) break;
      else continue;
    }
    hasFoundFirstGrade = true;
    if (String(grade).toLowerCase().includes('total')) continue;

    for (const monthCol of monthCols) {
      const sale = parseNumber(getCellValue(worksheet, r, monthCol.index));
      if (sale !== 0) {
        const normalizedGrade = normalizeRwandaGrade(grade);
        shorts.push({
          country: 'Rwanda',
          grade: `RWANDA ${normalizedGrade}`,
          type: 'short',
          quantity: -Math.abs(sale),
          unit: unit,
          date: monthCol.date,
          cropYear: cropYear,
          coffeeType: 'Arabica',
        });
      }
    }
  }
  return shorts;
}