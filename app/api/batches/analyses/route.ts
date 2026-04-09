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
  moisture?: number; // Added moisture field
  grade_percentages: {
    grade_aa: number;
    grade_ab: number;
    grade_abc: number;
    grade_grinder: number;
  };
  screen_size_distribution: { [key: string]: number };
  defects_by_screensize_breakdown: BreakdownItem;
}

// Maps Analysis Type Name (from Python) -> Shortcode (for DB Process Number)
const process_shortcodes: { [key: string]: string } = {
    'Bulking': 'BULK',
    'Final - Bulking': 'FBULK',
    'Color Sorting': 'CS',
    'Regrading': 'RG',
    'Gravity Separation': 'GS',
    'Blowing': 'BLOW',
    'Hand Picking': 'HP',
    'Pre-Cleaning': 'PC',
    'Vacuum-Packing': 'VP',
    'Rebagging': 'REBAG' 
};

// Helper to extract Outturn from Analysis Number (e.g., "12KN0004" from "SomeString12KN0004")
function extractOutturn(analysisNumber: string): string | null {
    // Regex: 2 digits, 2 letters, 4 digits (case insensitive)
    const match = analysisNumber.match(/(\d{2}[a-zA-Z]{2}\d{4})/);
    if (match) {
        return match[0].toUpperCase();
    }
    return null;
}

// Helper to pad number to 5 digits
function padCounter(numStr: string): string {
    // Extract numeric part if string contains non-numeric chars
    const num = parseInt(numStr.replace(/\D/g, ''), 10); 
    if (isNaN(num)) return numStr; // Fallback
    return num.toString().padStart(5, '0');
}


export async function POST(request: Request) {
  let connection: PoolConnection | undefined;

  try {
    const data: IncomingData = await request.json();

    let foreignMatterTotal = 0.0;
    if (data.defects_by_screensize_breakdown) {
      Object.values(data.defects_by_screensize_breakdown).forEach((screenDefects) => {
        screenDefects.forEach(([defectName, percentage]) => {
          if (defectName.toLowerCase().includes('foreign m')) { 
            foreignMatterTotal += Number(percentage);
          }
        });
      });
    }

    const qcQuality = data.qc_quality || 'Standard'; 

    if (!pool) throw new Error("Database pool not initialized");
    connection = await pool.getConnection();

    await connection.beginTransaction();

    // --- 2. Insert into batch_analysis (Including Moisture) ---
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
      data.sale_number,
      data.analysis_number,
      data.grade,
      data.profile_print_score || null,
      data.sca_defect_count || 0,
      qcQuality,
      data.primary_defects_percentage,
      data.secondary_defects_percentage,
      data.moisture || null, // Moisture value
      foreignMatterTotal,
      data.grade_percentages.grade_aa,
      data.grade_percentages.grade_ab,
      data.grade_percentages.grade_abc,
      data.grade_percentages.grade_grinder,
      false
    ];

    const [parentResult] = await connection.query<ResultSetHeader>(insertParentQuery, parentValues);
    const analysisId = parentResult.insertId;

    // --- 3. Insert Breakdowns ---
    const screenSizes = Object.entries(data.screen_size_distribution);
    if (screenSizes.length > 0) {
      const breakdownQuery = `INSERT INTO screensize_breakdown (analysis_id, screen_size, percentage) VALUES ?`;
      const breakdownValues = screenSizes.map(([size, pct]) => [analysisId, parseInt(size), pct]);
      await connection.query(breakdownQuery, [breakdownValues]);
    }

    const classRows: any[] = [];
    Object.entries(data.defects_by_screensize_breakdown).forEach(([screenSize, defects]) => {
      defects.forEach(([defectName, pct]) => {
        classRows.push([analysisId, parseInt(screenSize), defectName, pct]);
      });
    });

    if (classRows.length > 0) {
      const classQuery = `INSERT INTO class_by_screensize (analysis_id, screen_size, class, percentage) VALUES ?`;
      await connection.query(classQuery, [classRows]);
    }

    // --- 4. MAPPING LOGIC ---
    let mapped = false;
    const analysisType = data.analysis_type;

    if (analysisType === 'Auction' || analysisType === 'Direct Sale') {
        let updateCatalogueQuery = '';
        let updateParams: any[] = [];

        if (analysisType === 'Direct Sale') {
            const outturn = extractOutturn(data.analysis_number);
            if (outturn) {
                updateCatalogueQuery = `
                    UPDATE catalogue_summary 
                    SET analysis_id = ? 
                    WHERE sale_type = 'DS' AND analysis_id IS NULL AND outturn = ? LIMIT 1
                `;
                updateParams = [analysisId, outturn];
            }
        } else if (analysisType === 'Auction') {
            updateCatalogueQuery = `
                UPDATE catalogue_summary 
                SET analysis_id = ? 
                WHERE sale_type = 'Auction' AND analysis_id IS NULL AND lot_number = ? LIMIT 1
            `;
            updateParams = [analysisId, data.analysis_number];
        }

        if (updateCatalogueQuery) {
            const [catalogueResult] = await connection.query<ResultSetHeader>(updateCatalogueQuery, updateParams);
            if (catalogueResult.affectedRows > 0) mapped = true;
        }
    } 
    else if (process_shortcodes.hasOwnProperty(analysisType)) {
        const shortcode = process_shortcodes[analysisType];
        const counterCode = padCounter(data.analysis_number);
        const processNumber = `${shortcode}-${counterCode}`;

        const findBatchesQuery = `
            SELECT id, batch_number FROM daily_strategy_processing 
            WHERE batch_number LIKE CONCAT(?, '%') AND output_qty > 0 AND analysis_id IS NULL
        `;
        
        const [candidateBatches] = await connection.query<RowDataPacket[]>(findBatchesQuery, [processNumber]);
        let targetBatchNumber: string | null = null;

        if (candidateBatches.length === 1) {
            targetBatchNumber = candidateBatches[0].batch_number;
        } else if (candidateBatches.length > 1 && data.grade) {
            const matchedBatch = candidateBatches.find(b => 
                b.batch_number.toUpperCase().includes(data.grade!.toUpperCase())
            );
            if (matchedBatch) targetBatchNumber = matchedBatch.batch_number;
        }

        if (targetBatchNumber) {
            const [updateResult] = await connection.query<ResultSetHeader>(
                `UPDATE daily_strategy_processing SET analysis_id = ? WHERE batch_number = ?`, 
                [analysisId, targetBatchNumber]
            );
            if (updateResult.affectedRows > 0) mapped = true;
        }
    }

    if (mapped) {
        await connection.query(`UPDATE batch_analysis SET mapped = TRUE WHERE id = ?`, [analysisId]);
    }

    await connection.commit();

    // Logic for Status 200 (Mapped) vs 201 (Created but not mapped)
    return NextResponse.json({ 
      message: mapped ? 'Analysis saved and mapped successfully' : 'Analysis saved but not mapped', 
      id: analysisId,
      mapped: mapped 
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


export async function GET() {
  try {
    if (!pool) throw new Error("Database pool not initialized");

    // Fetch the 100 most recent records based on ID
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM batch_analysis ORDER BY id DESC LIMIT 100`
    );

    return NextResponse.json(rows, { status: 200 });
  } catch (error: any) {
    console.error("Fetch Analysis Error:", error);
    return NextResponse.json({ 
      message: 'Failed to fetch analyses', 
      error: error.message 
    }, { status: 500 });
  }
}