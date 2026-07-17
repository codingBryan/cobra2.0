import { NextResponse } from 'next/server';
import pool from '@/lib/stock_movement_db';
import { RowDataPacket } from 'mysql2/promise';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    if (!pool) throw new Error("Database pool not initialized");

    const [screensize] = await pool.query<RowDataPacket[]>(
      `SELECT screen_size, percentage FROM screensize_breakdown WHERE analysis_id = ? ORDER BY screen_size ASC`,
      [id]
    );

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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    if (!pool) throw new Error("Database pool not initialized");

    // Start by deleting associated child records to avoid foreign key constraint errors
    await pool.query(`DELETE FROM screensize_breakdown WHERE analysis_id = ?`, [id]);
    await pool.query(`DELETE FROM class_by_screensize WHERE analysis_id = ?`, [id]);
    
    // Delete the parent analysis record
    const [result] = await pool.query<any>(`DELETE FROM batch_analysis WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return NextResponse.json({ message: 'Analysis not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Analysis successfully deleted' }, { status: 200 });
  } catch (error: any) {
    console.error("Delete Analysis Error:", error);
    return NextResponse.json(
      { message: 'Failed to delete analysis', error: error.message }, 
      { status: 500 }
    );
  }
}