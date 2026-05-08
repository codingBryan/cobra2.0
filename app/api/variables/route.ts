import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db';

// O(1) Cache-busting flag to force dynamic fetches
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const vars = await query({ query: `SELECT name, value FROM variables` });
        return NextResponse.json(vars);
    } catch (error) {
        console.error("Database error during GET variables:", error);
        return NextResponse.json({ error: 'Failed to fetch variables' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { financingRate, financedCostPct, fixedFobbing } = body;

        // Highly optimized O(1) bulk update using CASE WHEN
        const sql = `
            UPDATE variables 
            SET value = CASE name 
                WHEN 'Financing Rate per Annum' THEN ?
                WHEN 'Financed cost percentage' THEN ?
                WHEN 'Fixed Fobbing Costs' THEN ?
                ELSE value
            END
            WHERE name IN ('Financing Rate per Annum', 'Financed cost percentage', 'Fixed Fobbing Costs')
        `;
        
        await query({
            query: sql,
            values: [financingRate, financedCostPct, fixedFobbing]
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Database error during PUT variables:", error);
        return NextResponse.json({ error: 'Failed to update variables' }, { status: 500 });
    }
}