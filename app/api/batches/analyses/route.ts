import { NextResponse } from 'next/server';
import pool from '@/lib/stock_movement_db';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

interface BreakdownItem {
  [key: string]: [string, number][];
}

interface IncomingData {
  analysis_type: string;
  analysis_number: string;
  sale_number: string | null;
  grade: string | null;
  qc_quality?: string; 
  profile_print_score?: number;
  sca_defect_count: number;
  primary_defects_percentage: number;
  secondary_defects_percentage: number;
  moisture?: number; 
  grade_percentages: {
    grade_aa: number;
    grade_ab: number;
    grade_abc: number;
    grade_grinder: number;
  };
  screen_size_distribution: { [key: string]: number };
  defects_by_screensize_breakdown: BreakdownItem;
}

const process_shortcodes: { [key: string]: string } = {
    'Bulking': 'BULK',
    'Final-Bulking': 'FBULK',
    'Color Sorting': 'CS',
    'Regrading': 'RG',
    'Gravity Separation': 'GS',
    'Blowing': 'BLOW',
    'Hand Picking': 'HP',
    'Pre-Cleaning': 'PC',
    'Vacuum-Packing': 'VP',
    'Rebagging': 'REBAG' 
};

function extractOutturn(analysisNumber: string): string | null {
    const match = analysisNumber.match(/(\d{2}[a-zA-Z]{2}\d{4})/);
    if (match) {
        return match[0].toUpperCase();
    }
    return null;
}

function buildProcessNumber(shortcode: string, numStr: string): string {
    if (shortcode === 'HP' && numStr.includes('.')) {
        const parts = numStr.split('.');
        const part1 = parseInt(parts[0].replace(/\D/g, ''), 10);
        const part2 = parseInt(parts[1].replace(/\D/g, ''), 10);
        
        const p1Str = isNaN(part1) ? parts[0] : part1.toString().padStart(5, '0');
        const p2Str = isNaN(part2) ? parts[1] : part2.toString().padStart(3, '0');
        return `${shortcode}-${p1Str}.${p2Str}`;
    }
    
    const num = parseInt(numStr.replace(/\D/g, ''), 10); 
    if (isNaN(num)) return `${shortcode}-${numStr}`; 
    return `${shortcode}-${num.toString().padStart(5, '0')}`;
}


export async function POST(request: Request) {
  let connection: PoolConnection | undefined;
  
  // âš¡ OPTIMIZATION: Unified logger to return debugging info to the Python client
  const mappingLogs: string[] = [];
  const log = (msg: string) => {
      console.log(`[Mapping Diagnostic] ${msg}`);
      mappingLogs.push(msg);
  };

  try {
    const data: IncomingData | any = await request.json();

    if (!pool) throw new Error("Database pool not initialized");
    connection = await pool.getConnection();

    // --- SISTER LOT DUPLICATION LOGIC ---
    if (data.action === 'duplicate_sister') {
        await connection.beginTransaction();
        
        // 1. Fetch original analysis
        const [origRows] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM batch_analysis WHERE id = ? LIMIT 1`, 
            [data.original_id]
        );
        
        if (origRows.length === 0) throw new Error('Original analysis not found');
        const orig = origRows[0];

        // 2. Insert new parent with updated analysis_number
        const insertParentQuery = `
          INSERT INTO batch_analysis (
            analysis_type, sale_number, analysis_number, qc_grade, 
            profile_print_score, sca_defect_count, qc_quality, 
            primary_defects_percentage, secondary_defects_percentage, 
            moisture, forein_matter_percentage, grade_aa_percentage, 
            grade_ab_percentage, grade_abc_percentage, grade_grinder_percentage,
            mapped
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const parentValues = [
          orig.analysis_type,
          orig.sale_number,
          data.new_analysis_number, // The sister lot number
          orig.qc_grade,
          orig.profile_print_score,
          orig.sca_defect_count,
          orig.qc_quality,
          orig.primary_defects_percentage,
          orig.secondary_defects_percentage,
          orig.moisture,
          orig.forein_matter_percentage,
          orig.grade_aa_percentage,
          orig.grade_ab_percentage,
          orig.grade_abc_percentage,
          orig.grade_grinder_percentage,
          false // Sister lot starts unmapped
        ];

        const [parentResult] = await connection.query<ResultSetHeader>(insertParentQuery, parentValues);
        const newAnalysisId = parentResult.insertId;

        // 3. Duplicate screensize_breakdown
        const [screenRows] = await connection.query<RowDataPacket[]>(
            `SELECT screen_size, percentage FROM screensize_breakdown WHERE analysis_id = ?`, 
            [data.original_id]
        );
        if (screenRows.length > 0) {
            const breakdownValues = screenRows.map(r => [newAnalysisId, r.screen_size, r.percentage]);
            await connection.query(
                `INSERT INTO screensize_breakdown (analysis_id, screen_size, percentage) VALUES ?`, 
                [breakdownValues]
            );
        }

        // 4. Duplicate class_by_screensize
        const [classRows] = await connection.query<RowDataPacket[]>(
            `SELECT screen_size, class, percentage FROM class_by_screensize WHERE analysis_id = ?`, 
            [data.original_id]
        );
        if (classRows.length > 0) {
            const classValues = classRows.map(r => [newAnalysisId, r.screen_size, r.class, r.percentage]);
            await connection.query(
                `INSERT INTO class_by_screensize (analysis_id, screen_size, class, percentage) VALUES ?`, 
                [classValues]
            );
        }

        await connection.commit();
        return NextResponse.json({ message: 'Sister lot duplicated successfully', id: newAnalysisId }, { status: 201 });
    }

    // --- STANDARD INSERT LOGIC ---
    let foreignMatterTotal = 0.0;
    if (data.defects_by_screensize_breakdown) {
      Object.values(data.defects_by_screensize_breakdown).forEach((screenDefects: any) => {
        screenDefects.forEach(([defectName, percentage]: [string, number]) => {
          if (defectName.toLowerCase().includes('foreign m')) { 
            foreignMatterTotal += Number(percentage);
          }
        });
      });
    }

    const qcQuality = data.qc_quality || 'Standard'; 

    await connection.beginTransaction();

    const insertParentQuery = `
      INSERT INTO batch_analysis (
        analysis_type, sale_number, analysis_number, qc_grade, 
        profile_print_score, sca_defect_count, qc_quality, 
        primary_defects_percentage, secondary_defects_percentage, 
        moisture, forein_matter_percentage, grade_aa_percentage, 
        grade_ab_percentage, grade_abc_percentage, grade_grinder_percentage,
        mapped
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const parentValues = [
      data.analysis_type,
      data.sale_number || null,
      data.analysis_number,
      data.grade || null,
      data.profile_print_score || null,
      data.sca_defect_count || 0,
      qcQuality,
      data.primary_defects_percentage,
      data.secondary_defects_percentage,
      data.moisture || null, 
      foreignMatterTotal,
      data.grade_percentages.grade_aa,
      data.grade_percentages.grade_ab,
      data.grade_percentages.grade_abc,
      data.grade_percentages.grade_grinder,
      false
    ];

    const [parentResult] = await connection.query<ResultSetHeader>(insertParentQuery, parentValues);
    const analysisId = parentResult.insertId;

    const screenSizes = Object.entries(data.screen_size_distribution);
    if (screenSizes.length > 0) {
      const breakdownQuery = `INSERT INTO screensize_breakdown (analysis_id, screen_size, percentage) VALUES ?`;
      const breakdownValues = screenSizes.map(([size, pct]) => [analysisId, parseInt(size), pct]);
      await connection.query(breakdownQuery, [breakdownValues]);
    }

    const classRows: any[] = [];
    Object.entries(data.defects_by_screensize_breakdown).forEach(([screenSize, defects]: [string, any]) => {
      defects.forEach(([defectName, pct]: [string, number]) => {
        classRows.push([analysisId, parseInt(screenSize), defectName, pct]);
      });
    });

    if (classRows.length > 0) {
      const classQuery = `INSERT INTO class_by_screensize (analysis_id, screen_size, class, percentage) VALUES ?`;
      await connection.query(classQuery, [classRows]);
    }

    // --- 4. MAPPING LOGIC WITH LOGS ---
    let mapped = false;
    const analysisType = data.analysis_type;

    if (analysisType === 'Auction purchase' || analysisType === 'Direct Sale') {
        let updateCatalogueQuery = '';
        let updateParams: any[] = [];

        if (analysisType === 'Direct Sale') {
            const outturn = extractOutturn(data.analysis_number);
            log(`Direct Sale detected. Extracted outturn: ${outturn || 'NONE'}, Grade: ${data.grade || 'NONE'}`);
            if (outturn) {
                // âš¡ OPTIMIZATION: Added grade filter to increase index selectivity and guarantee exact matching.
                updateCatalogueQuery = `UPDATE catalogue_summary SET analysis_id = ? WHERE sale_type = 'DS' AND analysis_id IS NULL AND outturn = ? AND grade = ? LIMIT 1`;
                updateParams = [analysisId, outturn, data.grade];
            }
        } else if (analysisType === 'Auction purchase') {
            log(`Auction Sale detected. Targeting lot_number: ${data.analysis_number} in sale: ${data.sale_number}`);
            // âš¡ OPTIMIZATION: Database-level string matching using LIKE CONCAT
            updateCatalogueQuery = `UPDATE catalogue_summary SET analysis_id = ? WHERE sale_type = 'Auction' AND analysis_id IS NULL AND lot_number = ? AND sale_number LIKE CONCAT('%-', ?) LIMIT 1`;
            updateParams = [analysisId, data.analysis_number, data.sale_number];
        }

        if (updateCatalogueQuery) {
            const [catalogueResult] = await connection.query<ResultSetHeader>(updateCatalogueQuery, updateParams);
            if (catalogueResult.affectedRows > 0) {
                mapped = true;
                log(`Successfully mapped to catalogue_summary.`);
                
                // âš¡ OPTIMIZATION: Retrieve the batch_number using the newly assigned analysisId (O(1) lookup)
                const [catalogueRows] = await connection.query<RowDataPacket[]>(
                    `SELECT batch_number FROM catalogue_summary WHERE analysis_id = ? LIMIT 1`,
                    [analysisId]
                );

                if (catalogueRows.length > 0 && catalogueRows[0].batch_number) {
                    const mappedBatchNumber = catalogueRows[0].batch_number;
                    log(`Retrieved batch_number '${mappedBatchNumber}' from catalogue_summary.`);

                    // âš¡ OPTIMIZATION: Bulk update all matching processing rows. 
                    // 'AND analysis_id IS NULL' prevents redundant disk writes.
                    const [strategyResult] = await connection.query<ResultSetHeader>(
                        `UPDATE daily_strategy_processing 
                         SET analysis_id = ? 
                         WHERE batch_number = ? AND analysis_id IS NULL`,
                        [analysisId, mappedBatchNumber]
                    );
                    
                    log(`Propagated mapping to ${strategyResult.affectedRows} row(s) in daily_strategy_processing.`);
                } else {
                    log(`No batch_number found on the mapped catalogue_summary row. Skipping propagation.`);
                }
            } else {
                log(`Failed to map to catalogue_summary. Lot/Outturn/Sale not found or already mapped.`);
            }
        }
    } 
    else if (process_shortcodes && process_shortcodes.hasOwnProperty(analysisType)) {
        const shortcode = process_shortcodes[analysisType];
        const processNumber = buildProcessNumber(shortcode, data.analysis_number);
        
        log(`Processing Context: Shortcode=${shortcode}, Original_No=${data.analysis_number}`);
        log(`Calculated target Process Number: ${processNumber}`);

        const [processRows] = await connection.query<RowDataPacket[]>(
            `SELECT id FROM daily_processes WHERE process_number = ? LIMIT 1`, 
            [processNumber]
        );

        if (processRows.length > 0) {
            const processId = processRows[0].id;
            log(`Found match in daily_processes. ID: ${processId}`);

            const [candidateBatches] = await connection.query<RowDataPacket[]>(
                `SELECT id, batch_number FROM daily_strategy_processing 
                 WHERE process_id = ? AND output_qty > 0 AND analysis_id IS NULL`, 
                [processId]
            );

            log(`Found ${candidateBatches.length} available output batches waiting for mapping.`);
            
            let targetBatchNumber: string | null = null;

            if (candidateBatches.length === 1) {
                targetBatchNumber = candidateBatches[0].batch_number;
                log(`Single candidate resolved automatically: ${targetBatchNumber}`);
            } 
            else if (candidateBatches.length > 1) {
                if (data.grade) {
                    const gradeLower = data.grade.toLowerCase().trim();
                    log(`Multiple candidates found. Evaluating grade substrings against grade: '${gradeLower}'`);
                    
                    let matchedBatch;

                    if (shortcode === 'RG') {
                        if (gradeLower === 'above') {
                            matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('ABOVE'));
                        } else if (gradeLower === 'below') {
                            matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('BELOW'));
                        }
                    } 
                    else if (shortcode === 'CS') {
                        if (gradeLower === 'clean') {
                            matchedBatch = candidateBatches.find(b => 
                                !b.batch_number.toUpperCase().includes('REJECT') && 
                                !b.batch_number.toUpperCase().includes('ELEVATOR BALANCE')
                            );
                        } else if (gradeLower === 'reject') {
                            matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('REJECT'));
                        } else if (gradeLower === 'eb') {
                            matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('ELEVATOR BALANCE'));
                        }
                    } 
                    else if (shortcode === 'GS') {
                        if (gradeLower === 'heavy') {
                            matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('HEAVY'));
                        } else if (gradeLower === 'light') {
                            matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('LIGHT'));
                        }
                    } 
                    else if (shortcode === 'HP') {
                        if (gradeLower === 'clean') {
                            // Map to the batch that DOES NOT contain 'REJECT'
                            matchedBatch = candidateBatches.find(b => !b.batch_number.toUpperCase().includes('REJECT'));
                        } else if (gradeLower === 'reject') {
                            matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('REJECT'));
                        }
                    }

                    if (matchedBatch) {
                        targetBatchNumber = matchedBatch.batch_number;
                        log(`Grade Logic Success: Resolved to batch ${targetBatchNumber}`);
                    } else {
                        log(`Grade Logic Failure: Could not find a substring match for grade '${gradeLower}'. Available batches: ${candidateBatches.map(b => b.batch_number).join(', ')}`);
                    }
                } else {
                    log(`Grade Logic Failure: Multiple output candidates exist, but no 'grade' was provided to filter them.`);
                }
            } else {
                log(`Mapping failed: No output batches found for process ${processId} that haven't already been mapped.`);
            }

            if (targetBatchNumber) {
                const [updateResult] = await connection.query<ResultSetHeader>(
                    `UPDATE daily_strategy_processing 
                     SET analysis_id = ? 
                     WHERE process_id = ? AND batch_number = ?`, 
                    [analysisId, processId, targetBatchNumber]
                );
                if (updateResult.affectedRows > 0) {
                    mapped = true;
                    log(`Batch successfully mapped in daily_strategy_processing.`);
                } else {
                    log(`Update executed, but 0 rows were affected for batch ${targetBatchNumber}.`);
                }
            }
        } else {
            log(`Mapping Failed: Could not find a row in 'daily_processes' with process_number '${processNumber}'.`);
        }
    }

    if (mapped) {
        await connection.query(`UPDATE batch_analysis SET mapped = TRUE WHERE id = ?`, [analysisId]);
    }

    await connection.commit();

    // âš¡ OPTIMIZATION: Emit WebSocket event to connected clients.
    try {
        const payloadToBroadcast = {
            id: analysisId,
            analysis_number: data.analysis_number,
            analysis_type: data.analysis_type,
            qc_quality: qcQuality,
            mapped: mapped,
            qc_grade: data.grade,
            moisture: data.moisture || null
        };
    } catch (wsError) {
        console.error("Failed to broadcast new analysis", wsError);
    }

    return NextResponse.json({ 
      message: mapped ? 'Analysis saved and mapped successfully' : 'Analysis saved but not mapped', 
      id: analysisId,
      mapped: mapped,
      logs: mappingLogs
    }, { status: mapped ? 200 : 201 });

  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error("Save Analysis Error:", error);
    return NextResponse.json({ 
      message: 'Failed to save analysis', 
      error: error.message 
    }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}


export async function GET(request: Request) {
  try {
    if (!pool) throw new Error("Database pool not initialized");

    const { searchParams } = new URL(request.url);
    const fetchTypes = searchParams.get('fetchTypes');

    // 1. Return ONLY the distinct types if specifically requested by the frontend
    if (fetchTypes === 'true') {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT DISTINCT analysis_type FROM batch_analysis WHERE analysis_type IS NOT NULL AND analysis_type != '' ORDER BY analysis_type ASC`
      );
      return NextResponse.json(rows.map(r => r.analysis_type), { status: 200 });
    }

    // 2. Otherwise, return the filtered table data
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || '';

    let query = `SELECT * FROM batch_analysis`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (search) {
      conditions.push(`(analysis_number LIKE ? OR analysis_type LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    if (type) {
      conditions.push(`analysis_type = ?`);
      params.push(type);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY id DESC LIMIT 1000`;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    return NextResponse.json(rows, { status: 200 });
  } catch (error: any) {
    console.error("Fetch Analysis Error:", error);
    return NextResponse.json({ 
      message: 'Failed to fetch analyses', 
      error: error.message 
    }, { status: 500 });
  }
}
export async function PATCH(request: Request) {
  let connection: PoolConnection | undefined;
  try {
    const { id, moisture } = await request.json();
    
    if (!id || moisture === undefined) {
      return NextResponse.json({ message: 'Missing id or moisture value' }, { status: 400 });
    }

    if (!pool) throw new Error("Database pool not initialized");
    connection = await pool.getConnection();

    await connection.query(
      `UPDATE batch_analysis SET moisture = ? WHERE id = ?`,
      [moisture, id]
    );

    return NextResponse.json({ message: 'Moisture updated successfully' }, { status: 200 });

  } catch (error: any) {
    console.error("Update Moisture Error:", error);
    return NextResponse.json({ message: 'Failed to update moisture', error: error.message }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// -----------------------------------------------------------------------------------------
// âš¡ NEW ENDPOINT: PUT handles manual "Try Remap" commands utilizing the same routing logic
// -----------------------------------------------------------------------------------------
export async function PUT(request: Request) {
    let connection: PoolConnection | undefined;
    const mappingLogs: string[] = [];
    const log = (msg: string) => {
        console.log(`[Remap Diagnostic] ${msg}`);
        mappingLogs.push(msg);
    };
  
    try {
      const { id } = await request.json();
      if (!id) return NextResponse.json({ message: 'Missing analysis ID to remap' }, { status: 400 });
  
      if (!pool) throw new Error("Database pool not initialized");
      connection = await pool.getConnection();
  
      // Fetch existing unmapped record from the database
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM batch_analysis WHERE id = ? LIMIT 1`, [id]
      );
  
      if (rows.length === 0) return NextResponse.json({ message: 'Analysis not found' }, { status: 404 });
      
      const data = rows[0];
      if (data.mapped) {
        return NextResponse.json({ message: 'This analysis is already mapped', mapped: true, logs: mappingLogs }, { status: 200 });
      }
  
      let mapped = false;
      const analysisId = data.id;
      const analysisType = data.analysis_type;
      const grade = data.qc_grade;
      
      // Duplicated mapping logic ensuring consistency with POST endpoint
      if (analysisType === 'Auction purchase' || analysisType === 'Direct Sale') {
          let updateCatalogueQuery = '';
          let updateParams: any[] = [];
  
          if (analysisType === 'Direct Sale') {
              const outturn = extractOutturn(data.analysis_number);
              log(`Direct Sale detected. Extracted outturn: ${outturn || 'NONE'}, Grade: ${grade || 'NONE'}`);
              if (outturn) {
                  updateCatalogueQuery = `UPDATE catalogue_summary SET analysis_id = ? WHERE sale_type = 'DS' AND analysis_id IS NULL AND outturn = ? AND grade = ? LIMIT 1`;
                  updateParams = [analysisId, outturn, grade];
              }
          } else if (analysisType === 'Auction purchase') {
              log(`Auction Sale detected. Targeting lot_number: ${data.analysis_number} in sale: ${data.sale_number}`);
              updateCatalogueQuery = `UPDATE catalogue_summary SET analysis_id = ? WHERE sale_type = 'Auction' AND analysis_id IS NULL AND lot_number = ? AND sale_number LIKE CONCAT('%-', ?) LIMIT 1`;
              updateParams = [analysisId, data.analysis_number, data.sale_number];
          }
  
          if (updateCatalogueQuery) {
              const [catalogueResult] = await connection.query<ResultSetHeader>(updateCatalogueQuery, updateParams);
              if (catalogueResult.affectedRows > 0) {
                  mapped = true;
                  log(`Successfully mapped to catalogue_summary.`);
                  
                  const [catalogueRows] = await connection.query<RowDataPacket[]>(
                      `SELECT batch_number FROM catalogue_summary WHERE analysis_id = ? LIMIT 1`,
                      [analysisId]
                  );
  
                  if (catalogueRows.length > 0 && catalogueRows[0].batch_number) {
                      const mappedBatchNumber = catalogueRows[0].batch_number;
                      log(`Retrieved batch_number '${mappedBatchNumber}' from catalogue_summary.`);
  
                      const [strategyResult] = await connection.query<ResultSetHeader>(
                          `UPDATE daily_strategy_processing SET analysis_id = ? WHERE batch_number = ? AND analysis_id IS NULL`,
                          [analysisId, mappedBatchNumber]
                      );
                      
                      log(`Propagated mapping to ${strategyResult.affectedRows} row(s) in daily_strategy_processing.`);
                  } else {
                      log(`No batch_number found on the mapped catalogue_summary row. Skipping propagation.`);
                  }
              } else {
                  log(`Failed to map to catalogue_summary. Lot/Outturn/Sale not found or already mapped.`);
              }
          }
      } 
      else if (process_shortcodes && process_shortcodes.hasOwnProperty(analysisType)) {
          const shortcode = process_shortcodes[analysisType];
          const processNumber = buildProcessNumber(shortcode, data.analysis_number);
          
          log(`Processing Context: Shortcode=${shortcode}, Original_No=${data.analysis_number}`);
          log(`Calculated target Process Number: ${processNumber}`);
  
          const [processRows] = await connection.query<RowDataPacket[]>(
              `SELECT id FROM daily_processes WHERE process_number = ? LIMIT 1`, 
              [processNumber]
          );
  
          if (processRows.length > 0) {
              const processId = processRows[0].id;
              log(`Found match in daily_processes. ID: ${processId}`);
  
              const [candidateBatches] = await connection.query<RowDataPacket[]>(
                  `SELECT id, batch_number FROM daily_strategy_processing 
                   WHERE process_id = ? AND output_qty > 0 AND analysis_id IS NULL`, 
                  [processId]
              );
  
              log(`Found ${candidateBatches.length} available output batches waiting for mapping.`);
              let targetBatchNumber: string | null = null;
  
              if (candidateBatches.length === 1) {
                  targetBatchNumber = candidateBatches[0].batch_number;
                  log(`Single candidate resolved automatically: ${targetBatchNumber}`);
              } 
              else if (candidateBatches.length > 1) {
                  if (grade) {
                      const gradeLower = grade.toLowerCase().trim();
                      log(`Multiple candidates found. Evaluating grade substrings against grade: '${gradeLower}'`);
                      let matchedBatch;
  
                      if (shortcode === 'RG') {
                          if (gradeLower === 'above') matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('ABOVE'));
                          else if (gradeLower === 'below') matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('BELOW'));
                      } 
                      else if (shortcode === 'CS') {
                          if (gradeLower === 'clean') matchedBatch = candidateBatches.find(b => !b.batch_number.toUpperCase().includes('REJECT') && !b.batch_number.toUpperCase().includes('ELEVATOR BALANCE'));
                          else if (gradeLower === 'reject') matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('REJECT'));
                          else if (gradeLower === 'eb') matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('ELEVATOR BALANCE'));
                      } 
                      else if (shortcode === 'GS') {
                          if (gradeLower === 'heavy') matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('HEAVY'));
                          else if (gradeLower === 'light') matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('LIGHT'));
                      } 
                      else if (shortcode === 'HP') {
                          if (gradeLower === 'clean') matchedBatch = candidateBatches.find(b => !b.batch_number.toUpperCase().includes('REJECT'));
                          else if (gradeLower === 'reject') matchedBatch = candidateBatches.find(b => b.batch_number.toUpperCase().includes('REJECT'));
                      }
  
                      if (matchedBatch) {
                          targetBatchNumber = matchedBatch.batch_number;
                          log(`Grade Logic Success: Resolved to batch ${targetBatchNumber}`);
                      } else {
                          log(`Grade Logic Failure: Could not find a substring match for grade '${gradeLower}'.`);
                      }
                  } else {
                      log(`Grade Logic Failure: Multiple output candidates exist, but no 'grade' was provided to filter them.`);
                  }
              } else {
                  log(`Mapping failed: No output batches found for process ${processId} that haven't already been mapped.`);
              }
  
              if (targetBatchNumber) {
                  const [updateResult] = await connection.query<ResultSetHeader>(
                      `UPDATE daily_strategy_processing SET analysis_id = ? WHERE process_id = ? AND batch_number = ?`, 
                      [analysisId, processId, targetBatchNumber]
                  );
                  if (updateResult.affectedRows > 0) {
                      mapped = true;
                      log(`Batch successfully mapped in daily_strategy_processing.`);
                  }
              }
          } else {
              log(`Mapping Failed: Could not find a row in 'daily_processes' with process_number '${processNumber}'.`);
          }
      }
  
      if (mapped) {
          await connection.query(`UPDATE batch_analysis SET mapped = TRUE WHERE id = ?`, [analysisId]);
      }
  
      return NextResponse.json({ 
        message: mapped ? 'Analysis successfully remapped' : 'Analysis could not be mapped (No matching batch found)', 
        mapped: mapped,
        logs: mappingLogs
      }, { status: 200 });
  
    } catch (error: any) {
      console.error("Remapping Error:", error);
      return NextResponse.json({ message: 'Failed during remapping process', error: error.message }, { status: 500 });
    } finally {
      if (connection) connection.release();
    }
  }