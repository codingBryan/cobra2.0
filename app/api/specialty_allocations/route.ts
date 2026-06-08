import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Optimization: Single flat JOIN query to fetch all required UI data at once
        const allocations = await query({
            query: `
                SELECT 
                    sla.id as allocation_id, 
                    sla.lot_id, 
                    sla.contract_id, 
                    sla.allocated_weight, 
                    sla.allocation_date, 
                    slt.lot_number, 
                    slt.grade, 
                    sc.contract_number, 
                    sc.client 
                FROM specialty_lot_allocations sla 
                JOIN specialty_lots_tracker slt ON sla.lot_id = slt.id 
                JOIN sale_contract sc ON sla.contract_id = sc.id
                ORDER BY sla.allocation_date DESC
            `
        });
        return NextResponse.json(allocations);
    } catch (error: any) {
        console.error("Error fetching allocations:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { contract_id, allocations } = body;

        if (!contract_id || !Array.isArray(allocations) || allocations.length === 0) {
            return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
        }

        // --- Optimization: Fetch contract details to prevent over-allocation spillage ---
        const contractData = await query({
            query: `SELECT weight_kilos FROM sale_contract WHERE id = ?`,
            values: [contract_id]
        }) as any[];

        if (contractData.length === 0) {
            return NextResponse.json({ success: false, error: 'Contract not found' }, { status: 404 });
        }

        const targetWeight = Number(contractData[0].weight_kilos);

        const existingAllocations = await query({
            query: `SELECT SUM(allocated_weight) as current_allocated FROM specialty_lot_allocations WHERE contract_id = ?`,
            values: [contract_id]
        }) as any[];

        const currentAllocated = Number(existingAllocations[0].current_allocated || 0);
        let remainingNeeded = targetWeight - currentAllocated;

        if (remainingNeeded <= 0) {
            return NextResponse.json({ success: false, error: 'Contract is already fully allocated' }, { status: 400 });
        }

        // --- Cap the allocations to exactly what the contract needs ---
        const cappedAllocations = [];
        for (const alloc of allocations) {
            if (remainingNeeded <= 0) break; // Stop if contract is filled
            
            const requestedWeight = Number(alloc.allocated_weight);
            const actualToAllocate = Math.min(requestedWeight, remainingNeeded);
            
            cappedAllocations.push({
                lot_id: alloc.lot_id,
                allocated_weight: actualToAllocate
            });
            
            remainingNeeded -= actualToAllocate;
        }

        // --- Optimization: O(1) Bulk Insert into Junction Table ---
        const allocationValues = cappedAllocations.map((a: any) => [
            a.lot_id, 
            contract_id, 
            a.allocated_weight
        ]);
        
        const insertPlaceholders = allocationValues.map(() => '(?, ?, ?)').join(', ');
        const flatInsertValues = allocationValues.flat();

        await query({
            query: `
                INSERT INTO specialty_lot_allocations (lot_id, contract_id, allocated_weight) 
                VALUES ${insertPlaceholders}
            `,
            values: flatInsertValues
        });

        // --- Optimization: Bulk Update lot totals via Temporary Table logic ---
        // Instead of running `N` separate UPDATE statements, we construct a 
        // fast CASE block to add the new weights simultaneously in 1 query hit.
        let lotIds: number[] = [];
        let caseStatements = '';
        
        cappedAllocations.forEach((a: any) => {
            lotIds.push(a.lot_id);
            // Construct CASE statements for dynamic updating
            caseStatements += `WHEN id = ${a.lot_id} THEN allocated_weight + ${a.allocated_weight} `;
        });

        const idListStr = lotIds.join(',');

        // Update allocated weights AND auto-trigger the 'fully_allocated' boolean
        await query({
            query: `
                UPDATE specialty_lots_tracker 
                SET 
                    allocated_weight = CASE 
                        ${caseStatements} 
                        ELSE allocated_weight 
                    END,
                    fully_allocated = CASE 
                        WHEN allocated_weight >= purchased_weight THEN 1 
                        ELSE 0 
                    END
                WHERE id IN (${idListStr})
            `
        });

        return NextResponse.json({ success: true, message: 'Allocation successful' });
        
    } catch (error: any) {
        console.error("Error saving specialty lot allocations:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { lotIds, action } = body;

        if (!Array.isArray(lotIds) || lotIds.length === 0) {
            return NextResponse.json({ success: false, error: 'No lots provided' }, { status: 400 });
        }

        const idListStr = lotIds.map(id => Number(id)).join(',');

        if (action === 'move_to_commercial') {
            // 1. Fetch eligible lots FIRST to ensure we don't re-move lots already marked commercial
            // and so the Excel export contains ONLY the truly newly moved lots.
            const eligibleLots = await query({
                query: `
                    SELECT * FROM specialty_lots_tracker 
                    WHERE id IN (${idListStr}) 
                    AND fully_allocated = 0 
                    AND (to_commercial = 0 OR to_commercial IS NULL)
                `
            }) as any[];

            if (!eligibleLots || eligibleLots.length === 0) {
                return NextResponse.json({ 
                    success: true, 
                    message: 'No eligible lots found to move.',
                    affectedRows: 0,
                    movedLots: [] 
                });
            }

            const validIdStr = eligibleLots.map(lot => lot.id).join(',');

            // 2. Perform the bulk update only on the validated lots
            const updateResult = await query({
                query: `
                    UPDATE specialty_lots_tracker 
                    SET to_commercial = 1 
                    WHERE id IN (${validIdStr})
                `
            }) as any;

            return NextResponse.json({ 
                success: true, 
                message: 'Moved to commercial',
                affectedRows: updateResult.affectedRows,
                movedLots: eligibleLots 
            });
            
        } else if (action === 'move_to_specialty') {
            // Optimization: Apply an efficient O(1) bulk IN update
            const eligibleLots = await query({
                query: `
                    SELECT * FROM specialty_lots_tracker 
                    WHERE id IN (${idListStr}) 
                    AND to_commercial = 1
                `
            }) as any[];

            if (!eligibleLots || eligibleLots.length === 0) {
                return NextResponse.json({ 
                    success: true, 
                    message: 'No eligible lots found to move back.',
                    affectedRows: 0
                });
            }

            const validIdStr = eligibleLots.map(lot => lot.id).join(',');

            const updateResult = await query({
                query: `
                    UPDATE specialty_lots_tracker 
                    SET to_commercial = 0 
                    WHERE id IN (${validIdStr})
                `
            }) as any;

            return NextResponse.json({ 
                success: true, 
                message: 'Moved back to specialty',
                affectedRows: updateResult.affectedRows
            });
        }

        return NextResponse.json({ success: false, error: 'Invalid action provided' }, { status: 400 });
    } catch (error: any) {
        console.error("Error updating lots:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const url = new URL(request.url);
        const contract_id = url.searchParams.get('contract_id');
        const allocation_id = url.searchParams.get('allocation_id'); // If deleting specific lot

        if (!contract_id && !allocation_id) {
            return NextResponse.json({ success: false, error: 'Missing identifiers' }, { status: 400 });
        }

        let condition = '';
        let values: any[] = [];

        if (allocation_id) {
            condition = 'id = ?';
            values.push(allocation_id);
        } else if (contract_id) {
            condition = 'contract_id = ?';
            values.push(contract_id);
        }

        // 1. Fetch weights being deleted so we can add them back to the tracker
        const rowsToRestore = await query({
            query: `SELECT lot_id, allocated_weight FROM specialty_lot_allocations WHERE ${condition}`,
            values: values
        }) as any[];

        if (rowsToRestore.length > 0) {
            // 2. Optimization: Single bulk CASE update to deduct weights and reset fully_allocated
            let caseStatements = '';
            let lotIds: number[] = [];
            
            rowsToRestore.forEach(r => {
                lotIds.push(r.lot_id);
                caseStatements += `WHEN id = ${r.lot_id} THEN allocated_weight - ${r.allocated_weight} `;
            });

            const idListStr = lotIds.join(',');

            await query({
                query: `
                    UPDATE specialty_lots_tracker 
                    SET 
                        allocated_weight = CASE 
                            ${caseStatements} 
                            ELSE allocated_weight 
                        END,
                        fully_allocated = 0 
                    WHERE id IN (${idListStr})
                `
            });

            // 3. Delete the allocation records
            await query({
                query: `DELETE FROM specialty_lot_allocations WHERE ${condition}`,
                values: values
            });
        }

        return NextResponse.json({ success: true, message: 'Allocation deleted successfully' });
    } catch (error: any) {
        console.error("Error deleting allocation:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}