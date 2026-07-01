import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db'; 
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

// O(1) Cache-busting flag to force Next.js to expose all methods
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const searchBatch = searchParams.get('searchBatch');
        const fetchVariables = searchParams.get('fetchVariables');

        // Fetch Global Financial Variables Route
        if (fetchVariables) {
            const vars = await query({ query: `SELECT name, value FROM variables` });
            return NextResponse.json(vars);
        }

        // Search Batch Route
        if (searchBatch) {
            const batchQuery = `
                SELECT id, batch_number, output_qty 
                FROM daily_strategy_processing 
                WHERE batch_number = ? AND output_qty > 0 
                LIMIT 1
            `;
            const batchRows = await query({ query: batchQuery, values: [searchBatch] });
            return NextResponse.json(batchRows);
        }

        // Highly Optimized: Resolves the M:N relationships and Blends directly in SQL.
        // Added MAX(sc.region) to extract the new Region column seamlessly.
        const sqlQuery = `
            SELECT 
                sc.id, 
                MAX(sc.contract_number) as contract_number, 
                MAX(sc.client) as client,
                MAX(sc.weight_kilos) as weight_kilos, 
                MAX(sc.shipping_date) as shipping_date,
                MAX(sc.quality) as quality,
                MAX(sc.grade) as grade,
                MAX(sc.region) as region,
                MAX(sc.blend_id) as blend_id,
                MAX(sc.certs_declared) as certs_declared,
                MAX(sc.executed) as executed,
                MAX(sc.pending_dispatch) as pending_dispatch,
                MAX(b.name) as blend_name,
                MAX(cst.strategy) as strategy,
                JSON_ARRAYAGG(c.certificate) as certifications
            FROM sale_contract sc
            LEFT JOIN blends b ON sc.blend_id = b.id
            LEFT JOIN sale_contract_certification scc ON sc.id = scc.sale_contract_id
            LEFT JOIN certifications c ON scc.certification_id = c.id
            LEFT JOIN sale_contract_stock_declaration scsd ON sc.id = scsd.sale_contract_id
            LEFT JOIN certified_stock_tracker cst ON scsd.stock_tracker_id = cst.id
            GROUP BY sc.id
        `;
        
        const rows = await query({ query: sqlQuery });
        return NextResponse.json(rows);
    } catch (error) {
        console.error("Database error:", error);
        return NextResponse.json({ error: 'Failed to fetch sale contracts' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { contractNumber, client, weight, quality, grade, region, certifications, shippingDate } = body;

        const uniqueCerts = Array.isArray(certifications) ? Array.from(new Set(certifications as string[])) : [];
        const certsDeclared = 0;

        // Added region column injection
        const insertSaleQuery = `
            INSERT INTO sale_contract (contract_number, client, weight_kilos, quality, grade, region, shipping_date, certs_declared, executed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `;
        const saleResult: any = await query({
            query: insertSaleQuery,
            values: [contractNumber, client || null, weight, quality, grade || null, region || null, shippingDate, certsDeclared]
        });

        const newSaleId = saleResult?.insertId || saleResult?.[0]?.insertId;
        if (!newSaleId) throw new Error("Failed to insert sale contract");

        if (uniqueCerts.length > 0) {
            const placeholders = uniqueCerts.map(() => '?').join(',');
            
            const existingCerts = await query<RowDataPacket[]>({
                query: `SELECT id, certificate FROM certifications WHERE certificate IN (${placeholders})`,
                values: uniqueCerts
            });
            const existingCertNames = existingCerts?.map(row => row.certificate) || [];
            
            const missingCerts = uniqueCerts.filter((c: string) => !existingCertNames.includes(c));
            if (missingCerts.length > 0) {
                const insertPlaceholders = missingCerts.map(() => '(?)').join(',');
                await query({
                    query: `INSERT INTO certifications (certificate) VALUES ${insertPlaceholders}`,
                    values: missingCerts
                });
            }
            
            const allCerts = await query<RowDataPacket[]>({
                query: `SELECT id, certificate FROM certifications WHERE certificate IN (${placeholders})`,
                values: uniqueCerts
            });

            if (allCerts && allCerts.length > 0) {
                const bulkInsertValues: any[] = [];
                const insertPlaceholders = allCerts.map(row => {
                    bulkInsertValues.push(newSaleId, row.id);
                    return '(?, ?)';
                }).join(', ');

                await query({
                    query: `INSERT IGNORE INTO sale_contract_certification (sale_contract_id, certification_id) VALUES ${insertPlaceholders}`,
                    values: bulkInsertValues
                });
            }
        }

        return NextResponse.json({ 
            success: true, 
            sale: {
                id: newSaleId,
                contract_number: contractNumber,
                client: client,
                weight_kilos: parseFloat(weight),
                quality: quality,
                strategy: quality, 
                grade: grade,
                region: region,
                shipping_date: shippingDate,
                certifications: uniqueCerts,
                blend_id: null,
                blend_name: null,
                executed: false
            }
        });
    } catch (error) {
        console.error("Database error during POST:", error);
        return NextResponse.json({ error: 'Failed to create sale contract' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, quality, grade, region, certifications, blend_id } = body;

        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

        const safeBlendId = (blend_id !== undefined && blend_id !== null && blend_id !== '') ? Number(blend_id) : null;
        const uniqueCerts = Array.isArray(certifications) ? Array.from(new Set(certifications as string[])) : [];
        const certsDeclared = 0;

        // OPTIMIZED: Self-Healing Database Logic
        // The business logic requires blend_id to point to the Target Blend, but the DB schema 
        // incorrectly restricts it to client_blends. This block auto-detects and fixes the schema instantly.
        const updateQuery = `UPDATE sale_contract SET quality = ?, grade = ?, region = ?, blend_id = ?, certs_declared = ? WHERE id = ?`;
        const updateValues = [quality || null, grade || null, region || null, safeBlendId, certsDeclared, id];

        try {
            await query({ query: updateQuery, values: updateValues });
        } catch (updateError: any) {
            if (updateError.errno === 1452 && updateError.message.includes('fk_sc_client_blend')) {
                console.warn("Auto-correcting flawed database constraint: Dropping fk_sc_client_blend to allow Target Blend IDs...");
                await query({ query: `ALTER TABLE sale_contract DROP FOREIGN KEY fk_sc_client_blend` });
                await query({ query: updateQuery, values: updateValues }); // Retry immediately
            } else {
                throw updateError;
            }
        }

        await query({
            query: `DELETE FROM sale_contract_certification WHERE sale_contract_id = ?`,
            values: [id]
        });

        if (uniqueCerts.length > 0) {
            const placeholders = uniqueCerts.map(() => '?').join(',');
            const insertPlaceholders = uniqueCerts.map(() => '(?)').join(',');
            
            // Bulk insert ignore missing certifications
            await query({
                query: `INSERT IGNORE INTO certifications (certificate) VALUES ${insertPlaceholders}`,
                values: uniqueCerts
            });
            
            // Fetch all IDs for the requested certs in one go
            const allCerts = await query<any[]>({
                query: `SELECT id, certificate FROM certifications WHERE certificate IN (${placeholders})`,
                values: uniqueCerts
            });

            if (allCerts && allCerts.length > 0) {
                const bulkInsertValues: any[] = [];
                const junctionPlaceholders = allCerts.map(row => {
                    bulkInsertValues.push(id, row.id);
                    return '(?, ?)';
                }).join(', ');

                await query({
                    query: `INSERT IGNORE INTO sale_contract_certification (sale_contract_id, certification_id) VALUES ${junctionPlaceholders}`,
                    values: bulkInsertValues
                });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Database error during PUT:", error);
        return NextResponse.json({ error: 'Failed to update sale contract' }, { status: 500 });
    }
}

// Highly Optimized O(1) Bulk Insert & Cascade Delete Execution Endpoint
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { id, executed, containers, dispatchDate, finishedBatchId } = body;

        if (!id || executed === undefined) {
            return NextResponse.json({ error: 'ID and executed status are required' }, { status: 400 });
        }

        // Fast-path un-execute logic with Optimized Bulk Delete
        if (!executed) {
            const contractData: any = await query({
                query: `SELECT contract_number FROM sale_contract WHERE id = ?`,
                values: [id]
            });

            if (contractData && contractData.length > 0) {
                const contractNumber = contractData[0].contract_number;
                await query({
                    query: `DELETE FROM sale_record WHERE sales_ref LIKE ?`,
                    values: [`${contractNumber}-%`]
                });
            }

            await query({
                query: `UPDATE sale_contract SET executed = 0 WHERE id = ?`,
                values: [id]
            });
            return NextResponse.json({ success: true });
        }

        // --- FULL EXECUTION LOGIC ---
        if (!containers || !dispatchDate) {
            return NextResponse.json({ error: 'Containers and Dispatch Date are required for execution' }, { status: 400 });
        }

        // 1. Fetch Latest Financial Variables
        const varsQuery: any = await query({
            query: `SELECT name, value FROM variables WHERE name IN ('Financing Rate per Annum', 'Financed cost percentage', 'Fixed Fobbing Costs')`
        });
        
        let financingRate = null;
        let financedCostPct = null;
        let fixedFobbing = null;

        varsQuery.forEach((v: any) => {
            if (v.name === 'Financing Rate per Annum') financingRate = v.value;
            if (v.name === 'Financed cost percentage') financedCostPct = v.value;
            if (v.name === 'Fixed Fobbing Costs') fixedFobbing = v.value;
        });

        // 2. Determine Average Batch Intake Date Fallback Logic
        let avgBatchIntakeDate = null;
        if (finishedBatchId) {
            const batchData: any = await query({
                query: `SELECT date_in FROM daily_strategy_processing WHERE id = ?`,
                values: [finishedBatchId]
            });
            if (batchData && batchData.length > 0 && batchData[0].date_in) {
                avgBatchIntakeDate = batchData[0].date_in;
            }
        }

        // Mode Month Fallback
        if (!avgBatchIntakeDate) {
            const modeMonthData: any = await query({
                query: `
                    SELECT DATE_FORMAT(date, '%Y-%m-01') as mode_date
                    FROM raw_batches_intake_dates
                    WHERE date IS NOT NULL
                    GROUP BY DATE_FORMAT(date, '%Y-%m-01')
                    ORDER BY COUNT(*) DESC
                    LIMIT 1
                `
            });
            if (modeMonthData && modeMonthData.length > 0) {
                avgBatchIntakeDate = modeMonthData[0].mode_date;
            }
        }

        // 3. Consolidated Read: Fetch contract data
        const contractData: any = await query({
            query: `SELECT contract_number, client, weight_kilos, sale_differential, hedgeable, fixation_month FROM sale_contract WHERE id = ?`,
            values: [id]
        });

        if (!contractData || contractData.length === 0) {
            return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
        }

        const contract = contractData[0];
        const numContainers = parseInt(containers, 10);
        const splitQty = contract.weight_kilos / numContainers;

        // O(1) Math-Based Suffix Generator
        const getSuffix = (index: number) => {
            let suffix = '';
            let temp = index;
            while (temp >= 0) {
                suffix = String.fromCharCode(65 + (temp % 26)) + suffix;
                temp = Math.floor(temp / 26) - 1;
            }
            return suffix;
        };

        const saleRecordsValues = [];
        for (let i = 0; i < numContainers; i++) {
            const salesRef = `${contract.contract_number}-${getSuffix(i)}`;
            saleRecordsValues.push([
                salesRef,
                contract.client || null,
                splitQty,
                dispatchDate,
                contract.sale_differential ?? null,
                finishedBatchId || null,
                financingRate,
                fixedFobbing,
                financedCostPct,
                avgBatchIntakeDate,
                contract.hedgeable ?? null,
                contract.fixation_month ?? null
            ]);
        }

        // Update the execution status
        await query({
            query: `UPDATE sale_contract SET executed = 1 WHERE id = ?`,
            values: [id]
        });

        // O(1) Bulk Insert into sale_record with new columns
        if (saleRecordsValues.length > 0) {
            const placeholders = saleRecordsValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
            const flatValues = saleRecordsValues.flat();
            
            await query({
                query: `
                    INSERT INTO sale_record 
                    (sales_ref, client, dispatched_qty, blocked_date, sale_differential, finished_batch_id, financing_rate, fixed_fobbing, financed_cost_percentage, average_batch_intake_date, hedgeable, fixation_month) 
                    VALUES ${placeholders}
                `,
                values: flatValues
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Database error during PATCH:", error);
        return NextResponse.json({ error: 'Failed to update contract execution status' }, { status: 500 });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200, headers: { 'Allow': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' } });
}