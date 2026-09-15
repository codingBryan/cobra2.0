import * as xlsx from "xlsx";

const findCell = (worksheet, searchText) => {
  if (!searchText) return null;
  for (const address in worksheet) {
    if (address[0] === '!') continue;
    const cell = worksheet[address];
    const cellText = cell ? (cell.w || cell.v) : undefined;
    if (cellText && String(cellText).trim().toLowerCase().includes(searchText.toLowerCase())) {
      return xlsx.utils.decode_cell(address);
    }
  }
  return null;
};

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

export function transformKenyaData(worksheet, country) {
  const { config } = country;
  const { anchor, unit } = config;
  const cleanData = [];

  const anchorCell = findCell(worksheet, anchor);
  if (!anchorCell) throw new Error(`Could not find anchor cell "${anchor}"`);

  const headerRowIndex = anchorCell.r;
  const stockColIndex = anchorCell.c;
  const gradeColIndex = stockColIndex - 1;

  const sheetRange = xlsx.utils.decode_range(worksheet['!ref']);
  const monthCols = [];
  for (let c = 0; c <= sheetRange.e.c; c++) {
    const header = getCellValue(worksheet, headerRowIndex, c);
    if (header && typeof header === 'string' && /^\d{4}\/\d{2}$/.test(header)) {
      const [year, month] = header.split('/');
      monthCols.push({ index: c, date: `${year}-${String(month).padStart(2, '0')}-01` });
    }
  }

  for (let r = headerRowIndex + 1; ; r++) {
    const grade = getCellValue(worksheet, r, gradeColIndex);
    if (!grade || String(grade).trim() === '') break;
    const gradeStr = String(grade).trim();
    if (gradeStr.toLowerCase().includes('total')) continue;

    const stock = parseNumber(getCellValue(worksheet, r, stockColIndex));
    if (stock !== 0) {
      cleanData.push({ country: country.name, grade: `${country.name.toUpperCase()} ${gradeStr}`, type: 'long', quantity: stock, unit: unit, date: null, coffeeType: 'Arabica' });
    }

    for (const monthCol of monthCols) {
      const sale = parseNumber(getCellValue(worksheet, r, monthCol.index));
      if (sale !== 0) {
        cleanData.push({ country: country.name, grade: `${country.name.toUpperCase()} ${gradeStr}`, type: 'short', quantity: sale, unit: unit, date: monthCol.date, coffeeType: 'Arabica' });
      }
    }
  }
  return cleanData;
}