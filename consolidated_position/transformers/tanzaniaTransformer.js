import * as xlsx from "xlsx";

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

// Main function loops through the tables defined in the config
export function transformTanzaniaData(worksheet, country) {
  const { config } = country;
  const allRecords = [];

  console.log("\n--- TANZANIA TRANSFORMER DIAGNOSTIC ---");

  config.tables.forEach(tableConfig => {
    console.log(`-> Processing table for: ${tableConfig.coffeeType}`);
    const tableData = processTable(worksheet, country, tableConfig);
    allRecords.push(...tableData);
    console.log(`   - Found ${tableData.length} records.`);
  });

  console.log("--- END DIAGNOSTIC ---");
  return allRecords;
}

// Helper function to process a single table (Arabica or Robusta)
function processTable(worksheet, country, tableConfig) {
  const records = [];
  const { coffeeType, startCell, gradeCol, stockCol, pastDueCol, monthStartCol } = tableConfig;
  const { unit } = country.config;

  const start = xlsx.utils.decode_cell(startCell);
  const startRow = start.r;
  const headerRowIndex = startRow - 1;

  const gradeColIndex = xlsx.utils.decode_col(gradeCol);
  const stockColIndex = xlsx.utils.decode_col(stockCol);
  const pastDueColIndex = pastDueCol ? xlsx.utils.decode_col(pastDueCol) : null;
  const firstMonthColIndex = xlsx.utils.decode_col(monthStartCol);

  const sheetRange = xlsx.utils.decode_range(worksheet['!ref']);
  const monthCols = [];
  for (let c = firstMonthColIndex; c <= sheetRange.e.c; c++) {
    const header = getCellValue(worksheet, headerRowIndex, c);
    const trimmedHeader = header ? String(header).trim() : '';
    if (trimmedHeader && /^\d{4}-\d{2}$/.test(trimmedHeader)) {
      const [year, month] = trimmedHeader.split('-');
      monthCols.push({ index: c, date: `${year}-${String(month).padStart(2, '0')}-01` });
    } else if (trimmedHeader !== '' && monthCols.length > 0) {
      break;
    }
  }
  console.log(`   - Found ${monthCols.length} month columns.`);

  for (let r = startRow; r <= sheetRange.e.r; r++) {
    const grade = getCellValue(worksheet, r, gradeColIndex);
    if (!grade || String(grade).trim() === '' || String(grade).toLowerCase().includes('total')) {
      console.log(`   - Analysis stopped at row ${r + 1}.`);
      break;
    }
    const gradeStr = String(grade).trim();

    const stock = parseNumber(getCellValue(worksheet, r, stockColIndex));
    if (stock !== 0) {
      records.push({ country: country.name, grade: `${country.name.toUpperCase()} ${gradeStr}`, type: 'long', quantity: stock, unit, date: null, coffeeType });
    }

    if (pastDueColIndex !== null) {
      const pastDue = parseNumber(getCellValue(worksheet, r, pastDueColIndex));
      if (pastDue !== 0) {
        records.push({ country: country.name, grade: `${country.name.toUpperCase()} ${gradeStr}`, type: 'short', quantity: pastDue, unit, date: null, coffeeType });
      }
    }

    if (r === startRow) {
        console.log(`   - Reading first data row (${r+1}): Grade="${gradeStr}", Stock=${stock}`);
    }

    for (const monthCol of monthCols) {
      const sale = parseNumber(getCellValue(worksheet, r, monthCol.index));
      if (sale !== 0) {
        records.push({ country: country.name, grade: `${country.name.toUpperCase()} ${gradeStr}`, type: 'short', quantity: sale, unit, date: monthCol.date, coffeeType });
      }
    }
  }
  return records;
}