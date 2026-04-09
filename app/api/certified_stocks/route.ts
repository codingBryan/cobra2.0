import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db'; 

export async function GET() {
    try {
        // Added the missing _certificate_holder columns to the SELECT statement
        const sqlQuery = `
            SELECT 
                id, 
                lot_number, 
                strategy, 
                purchased_weight, 
                rfa_certified,
                rfa_certificate_holder,
                eudr_certified, 
                eudr_certificate_holder,
                cafe_certified,
                cafe_certificate_holder,
                impact_certified, 
                aaa_project, 
                netzero_project 
            FROM certified_stock_tracker
        `;
        
        const rows = await query({ query: sqlQuery });
        
        return NextResponse.json(rows);
    } catch (error) {
        console.error("Database error:", error);
        return NextResponse.json({ error: 'Failed to fetch certified stocks' }, { status: 500 });
    }
}