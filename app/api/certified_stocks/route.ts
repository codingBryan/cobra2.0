import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db'; 

export async function GET() {
    try {
        // Added the missing _certificate_holder columns to the SELECT statement
        const sqlQuery = `
            SELECT 
                id, 
                season,
                sale_type,
                outturn,
                lot_number,
                cooperative,
                wet_mill,
                county,
                grade,
                strategy,
                grower_code, 
                purchased_weight, 
                rfa_certified,
                rfa_expiry_date,
                rfa_certificate_holder,
                rfa_declared_weight,
                eudr_certified,
                eudr_expiry_date,
                eudr_certificate_holder,
                eudr_declared_weight,
                cafe_certified,
                cafe_expiry_date,
                cafe_certificate_holder,
                cafe_declared_weight,
                impact_certified,
                impact_expiry_date,
                impact_declared_weight,
                aaa_project,
                aaa_volume,
                geodata_available,
                aaa_declared_weight,
                netzero_project,
                netzero_declared_weight,
                fully_declared
            FROM certified_stock_tracker
        `;
        
        const rows = await query({ query: sqlQuery });
        
        return NextResponse.json(rows);
    } catch (error) {
        console.error("Database error:", error);
        return NextResponse.json({ error: 'Failed to fetch certified stocks' }, { status: 500 });
    }
}