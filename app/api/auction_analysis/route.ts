import { NextResponse } from 'next/server';
import pool from '@/lib/stock_movement_db';
import { RowDataPacket } from 'mysql2/promise';

export async function GET() {
  try {
    if (!pool) throw new Error("Database pool not initialized");

    // Fetch the necessary columns to compute all aggregations and distributions on the frontend
    const query = `
      SELECT 
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
      ORDER BY season DESC, sale_number ASC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query);

    return NextResponse.json(rows, { status: 200 });
  } catch (error: any) {
    console.error("Fetch Auction Analysis Error:", error);
    return NextResponse.json({ 
      message: 'Failed to fetch auction data', 
      error: error.message 
    }, { status: 500 });
  }
}