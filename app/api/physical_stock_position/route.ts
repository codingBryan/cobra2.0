import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db';

export const dynamic = 'force-dynamic';

// Adjust this to match your Flask server URL
const FLASK_API_URL = process.env.FLASK_API_URL || 'http://127.0.0.1:8100/api/processing_forecast';

export async function POST(request: Request) {
    try {
        // 1. O(1) Memory Passthrough: Extract FormData stream directly from the client request
        const formData = await request.formData();

        // 2. Proxy the files to the Flask endpoint
        // (Fetch natively handles streaming the multipart boundary, so no manual headers are needed)
        const flaskResponse = await fetch(FLASK_API_URL, {
            method: 'POST',
            body: formData, 
        });

        if (!flaskResponse.ok) {
            const errBody = await flaskResponse.json().catch(() => ({}));
            console.error("Flask API failed:", errBody);
            return NextResponse.json(
                { error: 'Failed to process files via Flask engine', details: errBody }, 
                { status: flaskResponse.status }
            );
        }

        // 3. Dynamically set Theoretical Volumes from the Flask JSON response
        const THEORETICAL_VOLUMES: Record<string, number> = await flaskResponse.json();

        // 4. Highly Optimized O(1) Fetch: Resolves contracts and their respective blends 
        // in a single trip. Bypasses the need for recursive/iterative DB querying.
        const sqlQuery = `
            SELECT 
                sc.weight_kilos,
                sc.shipping_date,
                b.*
            FROM sale_contract sc
            INNER JOIN blends b ON sc.blend_id = b.id
            WHERE sc.executed = 0 AND sc.blend_id IS NOT NULL
        `;

        const rows = await query({ query: sqlQuery }) as any[];

        const stacks = Object.keys(THEORETICAL_VOLUMES);
        const gridMap = new Map();
        const monthsSet = new Set<string>();

        // Initialize the tracking grid with dynamic Flask values
        stacks.forEach(stack => {
            gridMap.set(stack, {
                stack: stack,
                theoretical_volume: THEORETICAL_VOLUMES[stack],
                months: {} as Record<string, number>,
                total_shorts: 0,
                net_position: THEORETICAL_VOLUMES[stack] // Starts exactly at theoretical volume
            });
        });

        // O(N) Iteration through all applicable unexecuted contracts
        rows.forEach(row => {
            const weight = parseFloat(row.weight_kilos) || 0;
            
            // Format shipment month safely to align with the frontend standards
            let monthStr = 'Unscheduled';
            if (row.shipping_date) {
                const d = new Date(row.shipping_date);
                if (!isNaN(d.getTime())) {
                    monthStr = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                }
            }
            monthsSet.add(monthStr);

            // Subtract composition percentages from respective post stacks
            stacks.forEach(stack => {
                const blendPercentage = parseFloat(row[stack]) || 0;
                
                if (blendPercentage > 0) {
                    // Calculation: Proportion% * Contract Weight
                    const proportionDeduction = (blendPercentage / 100) * weight;
                    
                    const record = gridMap.get(stack);
                    record.months[monthStr] = (record.months[monthStr] || 0) + proportionDeduction;
                    record.total_shorts += proportionDeduction;
                    record.net_position -= proportionDeduction; 
                }
            });
        });

        // Time sorting for month columns
        const sortedMonths = Array.from(monthsSet).sort((a, b) => {
            if (a === 'Unscheduled') return 1;
            if (b === 'Unscheduled') return -1;
            return new Date(a).getTime() - new Date(b).getTime();
        });

        // Compute aggregate KPIs specifically for Physical Tab
        let totalTheoretical = 0;
        let totalShorts = 0;
        let totalNet = 0;

        const gridData = Array.from(gridMap.values());
        gridData.forEach(row => {
            totalTheoretical += row.theoretical_volume;
            totalShorts += row.total_shorts;
            totalNet += row.net_position;
        });

        // O(1) History Snapshot Synchronization
        // Clear any existing entries for today to achieve the "override" requirement
        await query({
            query: `DELETE FROM physical_position_history WHERE recorded_date = CURDATE()`
        });

        // Perform a single batch insert for all calculated stacks
        if (gridData.length > 0) {
            const insertPlaceholders = gridData.map(() => '(?, ?, CURDATE())').join(', ');
            const insertValues = gridData.flatMap(row => [row.stack, row.net_position]);
            
            await query({
                query: `INSERT INTO physical_position_history (stack, position, recorded_date) VALUES ${insertPlaceholders}`,
                values: insertValues
            });
        }

        return NextResponse.json({
            gridData,
            months: sortedMonths,
            kpis: {
                totalTheoretical,
                totalShorts,
                totalNet
            }
        });

    } catch (error) {
        console.error("Database or Request error during Physical Positions fetch:", error);
        return NextResponse.json({ error: 'Failed to process physical positions' }, { status: 500 });
    }
}