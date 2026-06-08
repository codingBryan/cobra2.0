import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db';

// O(1) Cache-busting flag to force Next.js to expose all methods
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Fetching all records. 
        // Note: As the table grows, we should add pagination or specific date-range parameters here.
        const rows = await query({
            query: 'SELECT * FROM specialty_lots_tracker ORDER BY purchase_date DESC, id DESC'
        });
        
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error("Error fetching specialty lots:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { ids, updates } = body;

        // Validation
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ success: false, error: 'No lot IDs provided' }, { status: 400 });
        }
        if (!updates || Object.keys(updates).length === 0) {
            return NextResponse.json({ success: false, error: 'No update data provided' }, { status: 400 });
        }

        // Prevent SQL injection by restricting updateable columns
        const validColumns = ['hedge_level', 'price_usd_50', 'allocated', 'client', 'to_commercial', 'fobbing_cost'];
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        for (const [key, value] of Object.entries(updates)) {
            if (validColumns.includes(key)) {
                updateFields.push(`${key} = ?`);
                updateValues.push(value);
            }
        }

        if (updateFields.length === 0) {
             return NextResponse.json({ success: false, error: 'Invalid update fields' }, { status: 400 });
        }

        // --- Optimization: O(1) Bulk Update Strategy ---
        // We construct a single SQL statement applying the update to all selected IDs at once.
        const placeholders = ids.map(() => '?').join(',');
        const sqlQuery = `UPDATE specialty_lots_tracker SET ${updateFields.join(', ')} WHERE id IN (${placeholders})`;
        
        // Combine values: [...SET_values, ...WHERE_IN_values]
        const finalValues = [...updateValues, ...ids];

        const result = await query({
            query: sqlQuery,
            values: finalValues
        });

        return NextResponse.json({ success: true, message: 'Lots updated successfully', result });
    } catch (error: any) {
        console.error("Error updating specialty lots:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}