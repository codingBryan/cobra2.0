import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db';
import * as xlsx from 'xlsx';

// GET: Fetch all active declarations grouped by contract and stock lot
export async function GET(request: Request) {
    try {
        const sql = `
            SELECT 
                sc.id as contract_id,
                sc.contract_number,
                sc.client,
                sc.weight_kilos as contract_weight,
                sc.shipping_date,
                cst.id as stock_id,
                cst.lot_number,
                cst.grade,
                cst.strategy,
                cst.cooperative,
                cst.wet_mill,
                cst.purchased_weight as lot_purchased_weight,
                scsd.rfa_declared_weight,
                scsd.eudr_declared_weight,
                scsd.cafe_declared_weight,
                scsd.impact_declared_weight,
                scsd.aaa_declared_weight,
                scsd.netzero_declared_weight
            FROM sale_contract sc
            INNER JOIN sale_contract_stock_declaration scsd ON sc.id = scsd.sale_contract_id
            INNER JOIN certified_stock_tracker cst ON scsd.stock_tracker_id = cst.id
        `;
        const rows = await query({ query: sql }) as any[];
        return NextResponse.json({ success: true, data: rows });
    } catch (error) {
        console.error("Fetch Declarations Error:", error);
        return NextResponse.json({ error: 'Failed to fetch declarations' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { sale_contract_id, regions = [], grades = [] } = body;

        if (!sale_contract_id) {
            return NextResponse.json({ error: 'sale_contract_id is required' }, { status: 400 });
        }

        // 0. O(1) Reset: Instantly revert any existing declarations for this contract before re-allocating
        await query({
            query: `
                UPDATE certified_stock_tracker cst
                INNER JOIN sale_contract_stock_declaration scsd ON cst.id = scsd.stock_tracker_id
                SET 
                    cst.rfa_declared_weight = GREATEST(0, COALESCE(cst.rfa_declared_weight, 0) - COALESCE(scsd.rfa_declared_weight, 0)),
                    cst.eudr_declared_weight = GREATEST(0, COALESCE(cst.eudr_declared_weight, 0) - COALESCE(scsd.eudr_declared_weight, 0)),
                    cst.cafe_declared_weight = GREATEST(0, COALESCE(cst.cafe_declared_weight, 0) - COALESCE(scsd.cafe_declared_weight, 0)),
                    cst.impact_declared_weight = GREATEST(0, COALESCE(cst.impact_declared_weight, 0) - COALESCE(scsd.impact_declared_weight, 0)),
                    cst.aaa_declared_weight = GREATEST(0, COALESCE(cst.aaa_declared_weight, 0) - COALESCE(scsd.aaa_declared_weight, 0)),
                    cst.netzero_declared_weight = GREATEST(0, COALESCE(cst.netzero_declared_weight, 0) - COALESCE(scsd.netzero_declared_weight, 0))
                WHERE scsd.sale_contract_id = ?
            `,
            values: [sale_contract_id]
        });
        await query({
            query: `DELETE FROM sale_contract_stock_declaration WHERE sale_contract_id = ?`,
            values: [sale_contract_id]
        });

        // 1. Fetch Contract & Certificates in O(1) Trip
        const contractRows = await query({
            query: `
                SELECT sc.weight_kilos, c.certificate
                FROM sale_contract sc
                LEFT JOIN sale_contract_certification scc ON sc.id = scc.sale_contract_id
                LEFT JOIN certifications c ON scc.certification_id = c.id
                WHERE sc.id = ?
            `,
            values: [sale_contract_id]
        }) as any[];

        if (!contractRows || contractRows.length === 0) {
            return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
        }

        const volume_to_declare = parseFloat(contractRows[0].weight_kilos);
        const rawCerts = contractRows.map(r => r.certificate).filter(Boolean);
        
        // Normalize names: 'NET ZERO' -> 'netzero'
        const certificates_to_declare = Array.from(new Set(
            rawCerts.map(c => c.toLowerCase().replace(/\s/g, ''))
        ));

        const volume_declaration: Record<string, number> = {};

        // 3. Construct the Dynamic Stock Query (Pushing Filter Logic to SQL Engine)
        let stockQuery = 'SELECT * FROM certified_stock_tracker WHERE 1=1';
        const queryValues: any[] = [];

        if (regions && regions.length > 0) {
            stockQuery += ` AND county IN (${regions.map(() => '?').join(',')})`;
            queryValues.push(...regions);
        } else {
            stockQuery += ` AND 1=0`; // If no regions allowed, match nothing
        }
        
        if (grades && grades.length > 0) {
            stockQuery += ` AND grade IN (${grades.map(() => '?').join(',')})`;
            queryValues.push(...grades);
        } else {
            stockQuery += ` AND 1=0`; // If no grades allowed, match nothing
        }

        // Dual-Certification priority optimization
        const requiresBoth = certificates_to_declare.includes('aaa') && certificates_to_declare.includes('cafe');
        if (!requiresBoth) {
            stockQuery += ' AND NOT (aaa_project = 1 AND cafe_certified = 1)';
        }
        
        const allStocks = await query({ query: stockQuery, values: queryValues }) as any[];

        // Trackers for bulk database updates
        const trackerUpdatesMap = new Map<number, any>();
        const declarationInsertsMap = new Map<number, any>();
        const excelReportData: Record<string, any[]> = {};
        
        const successfulCertificates: string[] = [];
        const failedCertificates: string[] = [];

        // 4. Core Transactional Allocation Loop
        for (const cert of certificates_to_declare) {
            const isProject = cert === 'aaa' || cert === 'netzero';
            const certField = isProject ? `${cert}_project` : `${cert}_certified`;
            const declaredField = `${cert}_declared_weight`;
            const baseVolumeField = cert === 'aaa' ? 'aaa_volume' : 'purchased_weight';

            // Filter for applicable stock with available capacity
            const applicableStocks = allStocks.filter(s => 
                s[certField] == 1 && 
                parseFloat(s[declaredField] || 0) < parseFloat(s[baseVolumeField] || 0)
            );

            // OPTIMIZATION: Prioritize Kenyacof holders first, then Dual-Certified lots (if applicable)
            applicableStocks.sort((a, b) => {
                const aHolder = String(a[`${cert}_certificate_holder`] || a['cafe_certificate_holder'] || '').toLowerCase();
                const bHolder = String(b[`${cert}_certificate_holder`] || b['cafe_certificate_holder'] || '').toLowerCase();
                
                const aIsKenyacof = aHolder.includes('kenyacof') ? 1 : 0;
                const bIsKenyacof = bHolder.includes('kenyacof') ? 1 : 0;
                
                if (aIsKenyacof !== bIsKenyacof) return bIsKenyacof - aIsKenyacof;

                if (requiresBoth) {
                    const aIsDual = (a.aaa_project == 1 && a.cafe_certified == 1) ? 1 : 0;
                    const bIsDual = (b.aaa_project == 1 && b.cafe_certified == 1) ? 1 : 0;
                    return bIsDual - aIsDual; 
                }

                return 0;
            });

            // Transactional Dry Run (O(N))
            let currentAllocated = 0;
            const tempTrackerUpdates = new Map<number, any>();
            const tempDeclarationInserts = new Map<number, any>();
            const tempExcelRows: any[] = [];

            for (const stock of applicableStocks) {
                if (currentAllocated >= volume_to_declare) break;

                const baseVolume = parseFloat(stock[baseVolumeField] || 0);
                const alreadyDeclared = parseFloat(stock[declaredField] || 0);
                const difference = baseVolume - alreadyDeclared;

                const remainingNeeded = volume_to_declare - currentAllocated;
                const amountToAllocate = Math.min(difference, remainingNeeded);

                currentAllocated += amountToAllocate;
                
                // Track proposed changes
                tempTrackerUpdates.set(stock.id, { [declaredField]: alreadyDeclared + amountToAllocate });
                tempDeclarationInserts.set(stock.id, { [declaredField]: amountToAllocate });

                tempExcelRows.push({
                    'Certified Stock ID': stock.id,
                    'Season': stock.season || 'N/A',
                    'Sale Type': stock.sale_type || 'N/A',
                    'Outturn': stock.outturn || 'N/A',
                    'Lot Number': stock.lot_number || 'N/A',
                    'Cooperative': stock.cooperative || 'N/A',
                    'Wet Mill': stock.wet_mill || 'N/A',
                    'County': stock.county || 'N/A',
                    'Grade': stock.grade || 'N/A',
                    'Strategy': stock.strategy || 'N/A',
                    'Grower Code': stock.grower_code || 'N/A',
                    'Base Volume': baseVolume,
                    'Amount Allocated': amountToAllocate,
                    'Total Declared After': alreadyDeclared + amountToAllocate
                });
            }

            // Check if Dry Run Succeeded (Account for minor float precision)
            if (currentAllocated >= volume_to_declare - 0.01) {
                successfulCertificates.push(cert);
                volume_declaration[`certificate_${cert}_volume`] = currentAllocated;
                excelReportData[cert] = tempExcelRows;

                // Merge temporary maps into main transaction maps
                for (const [id, update] of tempTrackerUpdates.entries()) {
                    if (!trackerUpdatesMap.has(id)) trackerUpdatesMap.set(id, { id });
                    Object.assign(trackerUpdatesMap.get(id), update);
                    
                    // Update the in-memory array reference so subsequent independent certificates 
                    // see the latest reality if they check the exact same lot.
                    const stockRef = allStocks.find(s => s.id === id);
                    if (stockRef) stockRef[declaredField] = update[declaredField];
                }
                
                for (const [id, insert] of tempDeclarationInserts.entries()) {
                    if (!declarationInsertsMap.has(id)) declarationInsertsMap.set(id, { sale_contract_id, stock_tracker_id: id });
                    Object.assign(declarationInsertsMap.get(id), insert);
                }
            } else {
                // Record the exact shortfall amount for the toast message
                failedCertificates.push(`${cert}:${(volume_to_declare - currentAllocated).toFixed(2)}`);
            }
        }

        // Check for complete failure
        if (successfulCertificates.length === 0) {
             return NextResponse.json({ 
                 error: `Insufficient volume to fulfill contract. The requested certificates have been skipped. Allocation aborted.` 
             }, { status: 400 });
        }

        // 5. O(1) Database Sync (Batch Updates for Successful Certificates Only)
        const trackerValues = Array.from(trackerUpdatesMap.values());
        if (trackerValues.length > 0) {
            for (const update of trackerValues) {
                const keys = Object.keys(update).filter(k => k !== 'id');
                const setClause = keys.map(k => `${k} = ?`).join(', ');
                const values = keys.map(k => update[k]);
                
                await query({
                    query: `UPDATE certified_stock_tracker SET ${setClause} WHERE id = ?`,
                    values: [...values, update.id]
                });
            }
        }

        const declValues = Array.from(declarationInsertsMap.values());
        if (declValues.length > 0) {
            const allPossibleCols = ['rfa_declared_weight', 'eudr_declared_weight', 'cafe_declared_weight', 'impact_declared_weight', 'aaa_declared_weight', 'netzero_declared_weight'];
            
            for (const decl of declValues) {
                const insertCols = ['sale_contract_id', 'stock_tracker_id'];
                const insertVals = [decl.sale_contract_id, decl.stock_tracker_id];
                
                const updateStmts: string[] = []; 

                for (const col of allPossibleCols) {
                    if (decl[col] !== undefined) {
                        insertCols.push(col);
                        insertVals.push(decl[col]);
                        updateStmts.push(`${col} = VALUES(${col})`);
                    }
                }

                const placeholders = insertCols.map(() => '?').join(', ');
                
                const onDuplicateClause = updateStmts.length > 0 
                    ? `ON DUPLICATE KEY UPDATE ${updateStmts.join(', ')}` 
                    : '';
                
                await query({
                    query: `
                        INSERT INTO sale_contract_stock_declaration (${insertCols.join(', ')})
                        VALUES (${placeholders})
                        ${onDuplicateClause}
                    `,
                    values: insertVals
                });
            }
        }

        // Update certs_declared status based on success
        const isFullyDeclared = successfulCertificates.length === certificates_to_declare.length && certificates_to_declare.length > 0;
        await query({
            query: `UPDATE sale_contract SET certs_declared = ? WHERE id = ?`,
            values: [isFullyDeclared ? 1 : 0, sale_contract_id]
        });

        // 6. Generate Excel File (For Successful Certs Only)
        const workbook = xlsx.utils.book_new();

        Object.keys(excelReportData).forEach(cert => {
            const data = excelReportData[cert];
            const worksheet = xlsx.utils.json_to_sheet(data);
            
            worksheet['!cols'] = [
                { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 25 }, 
                { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, 
                { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 25 }
            ];
            
            xlsx.utils.book_append_sheet(workbook, worksheet, cert.toUpperCase());
        });

        const fileName = `Declaration_Contract_${sale_contract_id}_${Date.now()}.xlsx`;
        const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'X-Allocation-Data': JSON.stringify(volume_declaration),
                'X-Failed-Certificates': failedCertificates.join(',')
            }
        });

    } catch (error) {
        console.error("Allocation Error:", error);
        return NextResponse.json({ error: 'Failed to process allocation' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Contract ID is required' }, { status: 400 });
        }

        // 1. Revert weights in certified_stock_tracker using O(1) Bulk JOIN
        await query({
            query: `
                UPDATE certified_stock_tracker cst
                INNER JOIN sale_contract_stock_declaration scsd ON cst.id = scsd.stock_tracker_id
                SET 
                    cst.rfa_declared_weight = GREATEST(0, COALESCE(cst.rfa_declared_weight, 0) - COALESCE(scsd.rfa_declared_weight, 0)),
                    cst.eudr_declared_weight = GREATEST(0, COALESCE(cst.eudr_declared_weight, 0) - COALESCE(scsd.eudr_declared_weight, 0)),
                    cst.cafe_declared_weight = GREATEST(0, COALESCE(cst.cafe_declared_weight, 0) - COALESCE(scsd.cafe_declared_weight, 0)),
                    cst.impact_declared_weight = GREATEST(0, COALESCE(cst.impact_declared_weight, 0) - COALESCE(scsd.impact_declared_weight, 0)),
                    cst.aaa_declared_weight = GREATEST(0, COALESCE(cst.aaa_declared_weight, 0) - COALESCE(scsd.aaa_declared_weight, 0)),
                    cst.netzero_declared_weight = GREATEST(0, COALESCE(cst.netzero_declared_weight, 0) - COALESCE(scsd.netzero_declared_weight, 0))
                WHERE scsd.sale_contract_id = ?
            `,
            values: [id]
        });

        // 2. Delete the declaration records
        await query({
            query: `DELETE FROM sale_contract_stock_declaration WHERE sale_contract_id = ?`,
            values: [id]
        });

        // 3. Reset certs_declared status
        await query({
            query: `UPDATE sale_contract SET certs_declared = 0 WHERE id = ?`,
            values: [id]
        });

        return NextResponse.json({ success: true, message: "Declarations reverted successfully" });
    } catch (error) {
        console.error("Delete Declaration Error:", error);
        return NextResponse.json({ error: 'Failed to delete declaration' }, { status: 500 });
    }
}