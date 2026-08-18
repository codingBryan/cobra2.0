import { NextResponse } from 'next/server';
import pool from '@/lib/stock_movement_db';
import { RowDataPacket } from 'mysql2/promise';

export async function GET(request: Request) {
  try {
    if (!pool) throw new Error("Database pool not initialized");

    const { searchParams } = new URL(request.url);
    const seasonsParam = searchParams.get('seasons');

    let query = '';
    let params: any[] = [];
    let initialSeasonDetected = null;

    if (!seasonsParam) {
      // First Load Optimization: Get the latest inserted record's season
      const latestSeasonQuery = `
        SELECT season 
        FROM nce_transactions 
        WHERE season IS NOT NULL 
        ORDER BY id DESC 
        LIMIT 1
      `;
      const [latestRow] = await pool.query<RowDataPacket[]>(latestSeasonQuery);
      
      if (latestRow.length > 0) {
        initialSeasonDetected = latestRow[0].season;
        query = `
          SELECT * 
          FROM nce_transactions 
          WHERE weight > 0 AND season = ?
          ORDER BY sale_number ASC
        `;
        params.push(initialSeasonDetected);
      } else {
         // Fallback if table is empty but has weight > 0
         query = `
          SELECT * 
          FROM nce_transactions 
          WHERE weight > 0 AND season IS NOT NULL
          ORDER BY season DESC, sale_number ASC
        `;
      }
    } else {
      // Selective Loading: User provided specific seasons
      const seasons = seasonsParam.split(',');
      const placeholders = seasons.map(() => '?').join(',');
      query = `
        SELECT * 
        FROM nce_transactions 
        WHERE weight > 0 AND season IN (${placeholders})
        ORDER BY season DESC, sale_number ASC
      `;
      params = [...seasons];
    }

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    
    // Fetch available seasons for the dropdown
    const seasonsQuery = `SELECT DISTINCT season FROM nce_transactions WHERE season IS NOT NULL ORDER BY season DESC`;
    const [seasonRows] = await pool.query<RowDataPacket[]>(seasonsQuery);
    const availableSeasons = seasonRows.map(row => row.season);

    console.log(`Fetched ${rows.length} auction analysis records from the database.`);
    
    return NextResponse.json({
        data: rows,
        initialSeasonDetected,
        availableSeasons
    }, { status: 200 });

  } catch (error: any) {
    console.error("Fetch Auction Analysis Error:", error);
    return NextResponse.json({
      message: 'Failed to fetch auction data',
      error: error.message
    }, { status: 500 });
  }
}