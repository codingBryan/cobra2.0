import { ResultSetHeader, RowDataPacket } from 'mysql2';
import * as XLSX from 'xlsx';

// Define the structure of an aggregated process object for type safety

interface ProcessDetail {
  process_number: string;
  process_type: string;
  instructed_date: Date | null; 
  processing_date: Date | null;
  input_item_names: Record<string, number>;
  input_strategies: Record<string, number>;
  output_item_names: Record<string, number>;
  output_strategies: Record<string, number>;
}


// Define the structure of a single row read from the Excel sheet
interface ProcessRow {
  'Process No.': string;
  'Process Name': string;
  'Issue Date': number | string | Date; // Excel date can be number or string
  'Receipt Date': number | string | Date; // Excel date can be number or string
  'Item Name': string;
  'Qty.': number;
  'Position Strategy Allocation': string;
  'Item Name_1': string;
  'Batch No._1': string;
  'Qty._1': number;
  [key: string]: any; // Allow other properties
}


/**
 * Converts an Excel serial date number to a JavaScript Date object.
 * Returns null if the input is not a positive number or results in an invalid date.
 * @param excelSerial The Excel date serial number.
 * @returns A Date object or null.
 */
function convertExcelDate(excelSerial: number | string): Date | null {
  // Ensure we are working with a positive number
  if (typeof excelSerial !== 'number' || excelSerial <= 0) {
    return null;
  }
  
  // 25569 is the number of days between the Excel epoch (1899-12-30) and JS epoch (1970-01-01).
  const daysSinceEpoch = excelSerial - 25569;
  
  // 86400000 is the number of milliseconds in a day.
  const milliseconds = daysSinceEpoch * 86400000;
  const date = new Date(milliseconds);

  // Check for validity
  return isNaN(date.getTime()) ? null : date;
}

function parseDate(dateValue: number | string | Date | any): Date | null {
  if (typeof dateValue === 'number') {
    return convertExcelDate(dateValue);
  } else if (typeof dateValue === 'string') {
    const parsedDate = new Date(dateValue);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
  } else if (dateValue instanceof Date) {
    return dateValue;
  }
  return null;
}

/**
 * Reads and processes the uploaded 'processing_analysis_file'.
 * * @param sinceDate The Date object to filter data after (e.g., last daily run date).
 * @param uploadedFile The browser's File object for the 'processing_analysis_file'.
 * @returns A promise that resolves to an array of aggregated ProcessDetail objects.
 */
export async function getProcessDetails(sinceDate: Date, uploadedFile: File): Promise<ProcessDetail[]> {
  try {
    if (!uploadedFile) {
      console.warn("No 'processing_analysis_file' was provided.");
      return [];
    }

    // --- STEP 1: Read the file using SheetJS in a browser-compatible way ---
    const buffer = await uploadedFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetName = 'Processing Analysis';
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Worksheet "${sheetName}" not found in the Excel file. Please check the sheet name for exact spelling and case.`);
    }

    // --- STEP 2: Convert sheet to an array of objects ---
    const allRows: ProcessRow[] = XLSX.utils.sheet_to_json<ProcessRow>(worksheet, { range: 1 });

    if (allRows.length === 0) {
      console.warn(`Worksheet "${sheetName}" is empty or headers could not be read.`);
      return [];
    }

    // --- STEP 3: Filter data by 'Receipt Date' ---
    let checkedDateFilter = false;
    const dateFilteredRows = allRows.filter((row: ProcessRow) => {
      const dateForComparison = parseDate(row['Receipt Date']);

      // Diagnostic logging (runs once)
      if (!checkedDateFilter && allRows.length > 0) {
        console.log(`\n--- Date Filter Diagnostic ---`);
        console.log(`Checking against sinceDate: ${sinceDate.toISOString()}`);
        console.log(`Original 'Receipt Date' in file:`, row['Receipt Date']);
        console.log(`Converted 'Receipt Date':`, dateForComparison ? dateForComparison.toISOString() : dateForComparison);
        console.log(`------------------------------\n`);
        checkedDateFilter = true;
      }

      // Check if it's a valid date object and meets the filter criteria
      return dateForComparison instanceof Date && dateForComparison > sinceDate;
    });

    // --- STEP 4: Get unique 'Process No.' values ---
    const uniqueProcessNumbers = [...new Set(dateFilteredRows.map(row => row['Process No.'].toString()))];

    if (uniqueProcessNumbers.length === 0) {
      console.warn('No processes found matching the date filter.');
      return [];
    }

    const processObjectsList: ProcessDetail[] = [];

    // --- STEP 5: Loop for each unique process number ---
    for (const processNo of uniqueProcessNumbers) {
      if (!processNo) continue;

      // Filter rows that have been date-filtered
      const matchingRows = dateFilteredRows.filter(row => row['Process No.'].toString() === processNo);

      if (matchingRows.length === 0) {
        continue;
      }

      const firstRow = matchingRows[0];

      // 6. Create the base process object utilizing the new date parser helper
      const process_object: ProcessDetail = {
        process_number: firstRow['Process No.'].toString(),
        process_type: firstRow['Process Name'],
        instructed_date: parseDate(firstRow['Issue Date']),
        processing_date: parseDate(firstRow['Receipt Date']),
        input_item_names: {},
        input_strategies: {},
        output_item_names: {},
        output_strategies: {}
      };

      // 7. Loop through all matching rows to aggregate data
      for (const row of matchingRows) {
        // --- Process Inputs ---
        const inputQty = parseFloat(row['Qty.'].toString() || '0');
        if (!isNaN(inputQty) && inputQty > 0) {
          
          const inputItemName = row['Item Name'];
          if (inputItemName) {
            process_object.input_item_names[inputItemName] = (process_object.input_item_names[inputItemName] || 0) + inputQty;
          }

          const inputStrategy = row['Position Strategy Allocation'];
          if (inputStrategy) {
            process_object.input_strategies[inputStrategy] = (process_object.input_strategies[inputStrategy] || 0) + inputQty;
          }
        }

        // --- Process Outputs ---
        const outputQty = parseFloat(row['Qty._1']?.toString() || '0');
        if (!isNaN(outputQty) && outputQty > 0) {
          
          const outputItemName = row['Item Name_1'];
          if (outputItemName) {
            process_object.output_item_names[outputItemName] = (process_object.output_item_names[outputItemName] || 0) + outputQty;
          }

          const outputBatchNumber = row['Batch No._1'];
          if (outputBatchNumber) {
            process_object.output_strategies[outputBatchNumber] = (process_object.output_strategies[outputBatchNumber] || 0) + outputQty;
          }
        }
      }

      // 8. Add the completed object to the list
      processObjectsList.push(process_object);
    }

    // 9. Return the final list
    return processObjectsList;

  } catch (error) {
    console.error(`Error in getProcessDetails: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}


/**
 * Types representing your database tables.
 * Extended with RowDataPacket to be fully compatible with your custom query function.
 */
export interface DailyStrategyProcessing extends RowDataPacket {
    id: number;
    process_id: number;
    date_in: Date;
    analysis_id: number;
    strategy: string;
    batch_number: string;
    input_qty: number;
    output_qty: number;
    processing_loss_gain_qty: number;
    input_differential: number;
    output_differential: number;
    input_hedge_level_usc_lb: number;
    output_hedge_level_usc_lb: number;
    input_cost_usd_50: number;
    output_cost_usd_50: number;
    batch_status: string;
}

export interface DailyProcess extends RowDataPacket {
    id: number;
    summary_id: number;
    processing_date: Date;
    process_type: string;
    process_number: string;
    input_qty: number;
    output_qty: number;
    milling_loss: number;
    processing_loss_gain_qty: number;
    input_value: number;
    output_value: number;
    pnl: number;
    trade_variables_updated: boolean;
}

export interface TraceabilityResult {
    targetBatch: string;
    batches: DailyStrategyProcessing[];
    processes: DailyProcess[];
    // Edges help easily visualize the flow in a UI (e.g., React Flow or Sankey)
    edges: {
        sourceId: string; // Can be a batch_number or process id string
        targetId: string; 
        type: 'batch_to_process' | 'process_to_batch';
    }[];
}

/**
 * Function signature representing your custom mysql2 pool query function
 */
export type QueryFunction = <T extends RowDataPacket[] | ResultSetHeader>(args: {
    query: string;
    values?: any;
}) => Promise<T | undefined>;

/**
 * Fetches the complete backward traceability history of a specific batch.
 * @param executeQuery Your custom db query function
 * @param targetBatchNumber The batch number to trace backwards
 * @returns Object containing all historical batches, processes, and flow edges
 */
export async function getBatchLineage(
    executeQuery: QueryFunction, 
    targetBatchNumber: string
): Promise<TraceabilityResult> {

    // 1. RECURSIVE CTE: Find every batch_number in the lineage tree.
    // This traverses backwards from Output -> Process -> Inputs recursively.
    const lineageQuery = `
        WITH RECURSIVE BatchLineage AS (
            -- Base Case: The target batch and the process that generated it
            SELECT 
                batch_number, 
                process_id
            FROM daily_strategy_processing
            WHERE batch_number = ? AND output_qty > 0

            UNION

            -- Recursive Step: Find input batches for the current process, 
            -- and identify the process that created those inputs
            SELECT 
                inputs.batch_number, 
                creator.process_id
            FROM BatchLineage bl
            JOIN daily_strategy_processing inputs
                ON inputs.process_id = bl.process_id 
                AND inputs.input_qty > 0
            LEFT JOIN daily_strategy_processing creator
                ON creator.batch_number = inputs.batch_number 
                AND creator.output_qty > 0
            WHERE inputs.batch_number IS NOT NULL
        )
        SELECT DISTINCT batch_number FROM BatchLineage;
    `;

    // Execute CTE using your custom query format
    const lineageResult = await executeQuery<RowDataPacket[]>({
        query: lineageQuery, 
        values: [targetBatchNumber]
    });
    
    // Safely fallback to empty array if undefined is returned
    const rows = lineageResult || [];
    const involvedBatchNumbers = rows.map(r => r.batch_number as string);

    // Guard clause: If batch not found or has no history, return empty
    if (involvedBatchNumbers.length === 0) {
        return { targetBatch: targetBatchNumber, batches: [], processes: [], edges: [] };
    }

    // 2. Fetch all data points for the involved batches
    const placeholders = involvedBatchNumbers.map(() => '?').join(',');
    const batchesSql = `SELECT * FROM daily_strategy_processing WHERE batch_number IN (${placeholders})`;
    
    const allBatchesResult = await executeQuery<DailyStrategyProcessing[]>({
        query: batchesSql, 
        values: involvedBatchNumbers
    });
    const allBatches = allBatchesResult || [];

    // 3. Extract unique process_ids involved and fetch their data points
    const involvedProcessIds = [...new Set(allBatches.map(b => b.process_id))].filter(id => id != null);
    
    let allProcesses: DailyProcess[] = [];
    if (involvedProcessIds.length > 0) {
        const processPlaceholders = involvedProcessIds.map(() => '?').join(',');
        const processesSql = `SELECT * FROM daily_processes WHERE id IN (${processPlaceholders})`;
        
        const allProcessesResult = await executeQuery<DailyProcess[]>({
            query: processesSql, 
            values: involvedProcessIds
        });
        allProcesses = allProcessesResult || [];
    }

    // 4. Construct Edges in-memory using the batches data 
    // (Since daily_strategy_processing naturally acts as an edge mapping table)
    const edges: TraceabilityResult['edges'] = [];

    allBatches.forEach(batchRow => {
        if (batchRow.input_qty > 0) {
            // Batch is going INTO a process
            edges.push({
                sourceId: `batch_${batchRow.batch_number}`,
                targetId: `process_${batchRow.process_id}`,
                type: 'batch_to_process'
            });
        }
        
        if (batchRow.output_qty > 0) {
            // Batch is coming OUT OF a process
            edges.push({
                sourceId: `process_${batchRow.process_id}`,
                targetId: `batch_${batchRow.batch_number}`,
                type: 'process_to_batch'
            });
        }
    });

    return {
        targetBatch: targetBatchNumber,
        batches: allBatches,
        processes: allProcesses,
        edges: edges
    };
}