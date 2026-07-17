import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db'; 

export async function GET() {
    try {
        // Fetch all client blends and eager-load their associated batches using JSON aggregation
        const rows: any = await query({
            query: `
            SELECT 
                cb.id, cb.name, cb.client, cb.blend_no, cb.target_blend, cb.creation_on,cb.target_weight,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'batch_id', bb.batch_id, 
                        'use_kg', bb.use_kg,
                        'cost_usd_50', bb.cost_usd_50,
                        'hedge_usc_lb', bb.hedge_usc_lb,
                        'diff_usc_lb', bb.diff_usc_lb,
                        'strategy', bb.strategy
                    )
                ) as blended_batches
            FROM client_blends cb
            LEFT JOIN blended_batches bb ON cb.id = bb.client_blend_id
            GROUP BY cb.id
            ORDER BY cb.creation_on DESC, cb.id DESC
        `});

        // Handle cases where there are no batches (JSON_ARRAYAGG might return [null])
        const formattedRows = rows.map((row: any) => ({
            ...row,
            blended_batches: row.blended_batches[0]?.batch_id == null ? [] : row.blended_batches
        }));

        return NextResponse.json(formattedRows);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, client, blend_no, target_blend, target_weight, batches } = body;

        const blendResult: any = await query({
            query: `
            INSERT INTO client_blends (name, client, blend_no, target_blend, target_weight, creation_on)
            VALUES (?, ?, ?, ?, ?, CURRENT_DATE())
            `,
            values: [name, client, blend_no, target_blend, target_weight]
        });

        const newBlendId = blendResult.insertId;

        // 2. Optimized Bulk Insert for batches O(1) DB call
        if (batches && batches.length > 0) {
            const batchValues = batches.flatMap((b: any) => [
                newBlendId, b.batch_id, b.use_kg, b.cost_usd_50, b.hedge_usc_lb, b.diff_usc_lb, b.strategy
            ]);
            const placeholders = batches.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
            
            await query({
                query: `
                INSERT INTO blended_batches (client_blend_id, batch_id, use_kg, cost_usd_50, hedge_usc_lb, diff_usc_lb, strategy)
                VALUES ${placeholders}
                `,
                values: batchValues
            });
        }

        await query({ query: 'COMMIT' });
        return NextResponse.json({ success: true, id: newBlendId });
    } catch (error: any) {
        await query({ query: 'ROLLBACK' });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, name, client, blend_no, target_blend, target_weight, batches } = body;
        if (!id) throw new Error("ID is required for updating");

        await query({ query: 'START TRANSACTION' });


        await query({
            query: `
            UPDATE client_blends 
            SET name = ?, client = ?, blend_no = ?, target_blend = ?, target_weight = ?
            WHERE id = ?
            `,
            values: [name, client, blend_no, target_blend, target_weight, id]
        });

        // 2. Delete old batch relationships
        await query({
            query: `DELETE FROM blended_batches WHERE client_blend_id = ?`,
            values: [id]
        });

        // 3. Optimized Bulk Insert for updated batches
        if (batches && batches.length > 0) {
            const batchValues = batches.flatMap((b: any) => [
                id, b.batch_id, b.use_kg, b.cost_usd_50, b.hedge_usc_lb, b.diff_usc_lb, b.strategy
            ]);
            const placeholders = batches.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
            
            await query({
                query: `
                INSERT INTO blended_batches (client_blend_id, batch_id, use_kg, cost_usd_50, hedge_usc_lb, diff_usc_lb, strategy)
                VALUES ${placeholders}
                `,
                values: batchValues
            });
        }

        await query({ query: 'COMMIT' });
        return NextResponse.json({ success: true, id });
    } catch (error: any) {
        await query({ query: 'ROLLBACK' });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        
        if (!id) throw new Error("ID is required for deletion");

        await query({ query: 'START TRANSACTION' });

        // Delete child batch records first to maintain relational integrity
        await query({
            query: `DELETE FROM blended_batches WHERE client_blend_id = ?`,
            values: [id]
        });

        // Delete parent blend record
        await query({
            query: `DELETE FROM client_blends WHERE id = ?`,
            values: [id]
        });

        await query({ query: 'COMMIT' });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        await query({ query: 'ROLLBACK' });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


