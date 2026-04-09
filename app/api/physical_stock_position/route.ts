import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db';

export const dynamic = 'force-dynamic';

// 1. Defined Object Variable with Theoretical Volumes (in Kgs)
// You can adjust these base values as your real physical stock changes.
const THEORETICAL_VOLUMES: Record<string, number> = {
    finished: 150000,
    post_natural: 120000,
    post_specialty_washed: 80000,
    post_17_up_top: 50000,
    post_16_top: 45000,
    post_15_top: 40000,
    post_pb_top: 15000,
    post_17_up_plus: 30000,
    post_16_plus: 25000,
    post_15_plus: 20000,
    post_14_plus: 15000,
    post_pb_plus: 10000,
    post_17_up_faq: 20000,
    post_16_faq: 18000,
    post_15_faq: 15000,
    post_14_faq: 12000,
    post_pb_faq: 8000,
    post_faq_minus: 25000,
    post_grinder_bold: 10000,
    post_grinder_light: 8000,
    post_mh: 5000,
    post_ml: 5000,
    post_rejects_s: 2000,
    post_rejects_p: 100
};

export async function GET() {
    try {
        // Highly Optimized O(1) Fetch: Resolves contracts and their respective blends 
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

        // Initialize the tracking grid
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
        console.error("Database error during Physical Positions fetch:", error);
        return NextResponse.json({ error: 'Failed to fetch physical positions' }, { status: 500 });
    }
}