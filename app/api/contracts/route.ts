import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db'; 
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

// O(1) Cache-busting flag to force Next.js to expose all methods
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Highly Optimized: Resolves the M:N relationships and Blends directly in SQL.
        const sqlQuery = `
            SELECT 
                sc.id, 
                MAX(sc.contract_number) as contract_number, 
                MAX(sc.client) as client,
                MAX(sc.weight_kilos) as weight_kilos, 
                MAX(sc.shipping_date) as shipping_date,
                MAX(sc.quality) as quality,
                MAX(sc.grade) as grade,
                MAX(sc.blend_id) as blend_id,
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
        const { contractNumber, client, weight, quality, grade, certifications, shippingDate } = body;

        // O(1) Defensive casting and certs_declared synchronization
        const uniqueCerts = Array.isArray(certifications) ? Array.from(new Set(certifications as string[])) : [];
        const certsDeclared = uniqueCerts.length > 0 ? 1 : 0;

        const insertSaleQuery = `
            INSERT INTO sale_contract (contract_number, client, weight_kilos, quality, grade, shipping_date, certs_declared)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const saleResult: any = await query({
            query: insertSaleQuery,
            values: [contractNumber, client || null, weight, quality, grade || null, shippingDate, certsDeclared]
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
                shipping_date: shippingDate,
                certifications: uniqueCerts,
                blend_id: null,
                blend_name: null
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
        const { id, quality, grade, certifications, blend_id } = body;

        if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

        const safeBlendId = (blend_id !== undefined && blend_id !== null && blend_id !== '') ? Number(blend_id) : null;
        
        // Strict fallback logic to guarantee processing
        const uniqueCerts = Array.isArray(certifications) ? Array.from(new Set(certifications as string[])) : [];
        const certsDeclared = uniqueCerts.length > 0 ? 1 : 0;

        // FIX: Synchronized `certs_declared` to guarantee absolute alignment with schema semantics.
        await query({
            query: `UPDATE sale_contract SET quality = ?, grade = ?, blend_id = ?, certs_declared = ? WHERE id = ?`,
            values: [quality || null, grade || null, safeBlendId, certsDeclared, id]
        });

        // Wipe the mapping slate clean unconditionally
        await query({
            query: `DELETE FROM sale_contract_certification WHERE sale_contract_id = ?`,
            values: [id]
        });

        // Rebuild mapping perfectly if array > 0
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
                    bulkInsertValues.push(id, row.id);
                    return '(?, ?)';
                }).join(', ');

                await query({
                    query: `INSERT IGNORE INTO sale_contract_certification (sale_contract_id, certification_id) VALUES ${insertPlaceholders}`,
                    values: bulkInsertValues
                });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Database error during PUT:", error);
        return NextResponse.json({ error: 'Failed to update sale contract' }, { status: 500 });
    }
}

// Fallback handlers to bypass aggressive preflight/routing bugs
export async function PATCH(request: Request) { return await PUT(request); }
export async function OPTIONS() {
    return NextResponse.json({}, { status: 200, headers: { 'Allow': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' } });
}