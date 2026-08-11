import { NextResponse } from 'next/server';
import pool from '@/lib/stock_movement_db';
import { RowDataPacket } from 'mysql2/promise';

export async function GET(request: Request) {
  try {
    if (!pool) throw new Error("Database pool not initialized");

    // Extract search parameters from the URL
    const { searchParams } = new URL(request.url);
    const seasonsParam = searchParams.get('seasons'); 

    let query = `
      SELECT 
        id,
        season, 
        timestamp,
        sale_number, 
        weight, 
        certification, 
        certificate,
        fobbing, 
        hedge_level, 
        grade,
        cooperative,
        wetmill,
        strategy, 
        region, 
        buyer, 
        floor_price, 
        confirmed_price 
      FROM nce_transactions 
      WHERE weight > 0 AND season IS NOT NULL
    `;

    let queryParams: any[] = [];
    let initialLoadSeason = null;

    if (seasonsParam) {
      // 1. SELECTIVE LOAD: Client applied filters and requested specific seasons
      const seasons = seasonsParam.split(',');
      const placeholders = seasons.map(() => '?').join(',');
      query += ` AND season IN (${placeholders})`;
      queryParams.push(...seasons);
    } else {
      // 2. FIRST LOAD: Get the season of the row with the greatest ID
      const latestSeasonQuery = `SELECT season FROM nce_transactions WHERE season IS NOT NULL ORDER BY id DESC LIMIT 1`;
      const [latestRow] = await pool.query<RowDataPacket[]>(latestSeasonQuery);
      
      if (latestRow && latestRow.length > 0) {
        initialLoadSeason = latestRow[0].season;
        query += ` AND season = ?`;
        queryParams.push(initialLoadSeason);
        console.log(`Initial load detected. Filtering by latest uploaded season: ${initialLoadSeason}`);
      }
    }

    query += ` ORDER BY season DESC, sale_number ASC`;

    const [rows] = await pool.query<RowDataPacket[]>(query, queryParams);
    console.log(`Fetched ${rows.length} auction analysis records from the database.`);
    
    // 3. DISTINCT SEASONS: Get all available seasons to populate the frontend dropdown filter dynamically
    const distinctSeasonsQuery = `SELECT DISTINCT season FROM nce_transactions WHERE season IS NOT NULL ORDER BY season DESC`;
    const [seasonRows] = await pool.query<RowDataPacket[]>(distinctSeasonsQuery);
    const allSeasons = seasonRows.map(row => row.season);

    // Return the data, the automatically detected season, and the available distinct seasons
    return NextResponse.json({
        data: rows,
        initialSeasonDetected: initialLoadSeason,
        availableSeasons: allSeasons
    }, { status: 200 });

  } catch (error: any) {
    console.error("Fetch Auction Analysis Error:", error);
    return NextResponse.json({ 
      message: 'Failed to fetch auction data', 
      error: error.message 
    }, { status: 500 });
  }
}