import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db'; 

export async function GET() {
    try {
        // Highly Optimized: Resolves the M:N relationships directly in SQL.
        // Uses JSON_ARRAYAGG to pack multiple certifications into a single array per contract.
        // Joins the stock declaration table to inherit the strategy associated with the sale.
        const sqlQuery = `
            SELECT 
                sc.id, 
                sc.contract_number, 
                sc.weight_kilos, 
                sc.shipping_date,
                sc.quality,  -- ADD THIS LINE
                MAX(cst.strategy) as strategy,
                JSON_ARRAYAGG(c.certificate) as certifications
            FROM sale_contract sc
            LEFT JOIN sale_contract_certification scc ON sc.id = scc.sale_contract_id
            LEFT JOIN certifications c ON scc.certification_id = c.id
            LEFT JOIN sale_contract_stock_declaration scsd ON sc.id = scsd.sale_contract_id
            LEFT JOIN certified_stock_tracker cst ON scsd.stock_tracker_id = cst.id
            GROUP BY sc.id
        `;
        
        // Execute using the custom query wrapper
        const rows = await query({ query: sqlQuery });
        
        return NextResponse.json(rows);
    } catch (error) {
        console.error("Database error:", error);
        return NextResponse.json({ error: 'Failed to fetch sale contracts' }, { status: 500 });
    }
}


