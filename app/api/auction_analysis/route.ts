import { NextResponse } from 'next/server';
import pool from '@/lib/stock_movement_db';
import { RowDataPacket } from 'mysql2/promise';

export async function GET(request: Request) {
  try {
    if (!pool) throw new Error("Database pool not initialized");

    const { searchParams } = new URL(request.url);
    const seasonsParam = searchParams.get('seasons');
    const recentSalesParam = searchParams.get('recentSales');

    // Season-independent mode: the last N distinct (season, sale_number) sales, by recency,
    // regardless of which season(s) are selected in the sidebar filter. Used by the Season
    // Analysis tab's "last N sales" charts, which are meant to ignore the season filter entirely.
    if (recentSalesParam) {
      const n = Math.max(1, Math.min(52, parseInt(recentSalesParam, 10) || 4));

      const recentSalesQuery = `
        SELECT season, sale_number
        FROM nce_transactions
        WHERE weight > 0 AND season IS NOT NULL AND sale_number IS NOT NULL
        GROUP BY season, sale_number
        ORDER BY MAX(id) DESC
        LIMIT ?
      `;
      const [recentSaleRows] = await pool.query<RowDataPacket[]>(recentSalesQuery, [n]);

      if (recentSaleRows.length === 0) {
        return NextResponse.json({ data: [] }, { status: 200 });
      }

      const pairPlaceholders = recentSaleRows.map(() => '(season = ? AND sale_number = ?)').join(' OR ');
      const pairParams = recentSaleRows.flatMap(r => [r.season, r.sale_number]);
      const rowsQuery = `
        SELECT *
        FROM nce_transactions
        WHERE weight > 0 AND (${pairPlaceholders})
      `;
      const [rows] = await pool.query<RowDataPacket[]>(rowsQuery, pairParams);

      return NextResponse.json({ data: rows }, { status: 200 });
    }

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