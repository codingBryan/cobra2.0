import { NextResponse } from 'next/server';
import pool from '@/lib/stock_movement_db';
import { RowDataPacket } from 'mysql2/promise';

// In Next.js 15/16, params is a Promise
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // We must await params before accessing properties
  const { id } = await params;

  try {
    if (!pool) throw new Error("Database pool not initialized");

    // Fetch Screen Size Breakdown
    const [screensize] = await pool.query<RowDataPacket[]>(
      `SELECT screen_size, percentage FROM screensize_breakdown WHERE analysis_id = ? ORDER BY screen_size ASC`,
      [id]
    );

    // Fetch Class by Screen Size
    const [classes] = await pool.query<RowDataPacket[]>(
      `SELECT screen_size, class, percentage FROM class_by_screensize WHERE analysis_id = ? ORDER BY screen_size ASC`,
      [id]
    );

    return NextResponse.json({ screensize, classes }, { status: 200 });
  } catch (error: any) {
    console.error("Fetch Details Error:", error);
    return NextResponse.json(
      { message: 'Failed to fetch details', error: error.message }, 
      { status: 500 }
    );
  }
}