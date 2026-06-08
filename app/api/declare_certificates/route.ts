import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db';
import * as xlsx from 'xlsx';

export async function GET(request: Request) {
    try {
        const rows = await query({
            query: `
                SELECT 
                    scsd.sale_contract_id as contract_id,
                    sc.contract_number,
                    sc.client,
                    sc.weight_kilos as contract_weight,
                    sc.shipping_date,
                    scsd.stock_tracker_id as stock_id,
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
                    scsd.aaa_rs_declared_weight,
                    scsd.netzero_declared_weight
                FROM sale_contract_stock_declaration scsd
                JOIN sale_contract sc ON scsd.sale_contract_id = sc.id
                JOIN certified_stock_tracker cst ON scsd.stock_tracker_id = cst.id
            `
        });
        return NextResponse.json({ data: rows });
    } catch (error) {
        console.error("Fetch declarations error:", error);
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

        // 0. O(1) Reset: Revert existing declarations
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
                    cst.aaa_rs_declared_weight = GREATEST(0, COALESCE(cst.aaa_rs_declared_weight, 0) - COALESCE(scsd.aaa_rs_declared_weight, 0)),
                    cst.netzero_declared_weight = GREATEST(0, COALESCE(cst.netzero_declared_weight, 0) - COALESCE(scsd.netzero_declared_weight, 0))
                WHERE scsd.sale_contract_id = ?
            `,
            values: [sale_contract_id]
        });
        await query({
            query: `DELETE FROM sale_contract_stock_declaration WHERE sale_contract_id = ?`,
            values: [sale_contract_id]
        });

        // 1. Fetch Contract & Required Certificates
        const contractRows = await query({
            query: `
                SELECT sc.weight_kilos, sc.contract_number, c.certificate
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
        const contract_number = contractRows[0].contract_number || sale_contract_id;
        const rawCerts = contractRows.map(r => r.certificate).filter(Boolean);
        const certificates_to_declare = Array.from(new Set(
            rawCerts.map(c => c.toLowerCase().replace(/\s/g, ''))
        ));

        if (certificates_to_declare.length === 0) {
            await query({ query: `UPDATE sale_contract SET certs_declared = 1 WHERE id = ?`, values: [sale_contract_id] });
            return NextResponse.json({ message: 'No certificates required for this contract.' }, { status: 200 });
        }

        // 2. Load Filtered Stock Pool
        let stockQuery = 'SELECT * FROM certified_stock_tracker WHERE 1=1';
        const queryValues: any[] = [];

        if (regions.length > 0) {
            stockQuery += ` AND county IN (${regions.map(() => '?').join(',')})`;
            queryValues.push(...regions);
        }
        if (grades.length > 0) {
            stockQuery += ` AND grade IN (${grades.map(() => '?').join(',')})`;
            queryValues.push(...grades);
        }
        
        const allStocks = await query({ query: stockQuery, values: queryValues }) as any[];

        // 3. Define the Dynamic Rules & Base Volume requirements
        let baseVolumeField = 'purchased_weight';
        if (certificates_to_declare.includes('aaa')) {
            baseVolumeField = 'aaa_volume';
        } else if (certificates_to_declare.includes('aaars') || certificates_to_declare.includes('aaa-rs')) {
            baseVolumeField = 'aaa_rs_volume';
        }

        const certRules = certificates_to_declare.map(cert => {
            let certField = '', declaredField = '', expiryField = '';
            switch (cert) {
                case 'aaa':
                    certField = 'aaa_project'; declaredField = 'aaa_declared_weight'; break;
                case 'aaars':
                case 'aaa-rs':
                    certField = 'aaa_rs_volume'; declaredField = 'aaa_rs_declared_weight'; break;
                case 'netzero':
                    certField = 'netzero_project'; declaredField = 'netzero_declared_weight'; break;
                case 'rfa':
                    certField = 'rfa_certified'; declaredField = 'rfa_declared_weight'; expiryField = 'rfa_expiry_date'; break;
                case 'cafe':
                    certField = 'cafe_certified'; declaredField = 'cafe_declared_weight'; expiryField = 'cafe_expiry_date'; break;
                case 'eudr':
                    certField = 'eudr_certified'; declaredField = 'eudr_declared_weight'; expiryField = 'eudr_expiry_date'; break;
                case 'impact':
                    certField = 'impact_certified'; declaredField = 'impact_declared_weight'; expiryField = 'impact_expiry_date'; break;
                default:
                    certField = `${cert}_certified`; declaredField = `${cert}_declared_weight`; expiryField = `${cert}_expiry_date`; break;
            }
            return { cert, certField, declaredField, expiryField };
        });

        const currentDate = new Date();
        const isNespresso = certificates_to_declare.includes('aaa') && certificates_to_declare.includes('cafe');

        // 4. Intersection Filter: Ensure lot satisfies EVERY requested certificate
        const applicableStocks = allStocks.filter(s => {
            let lotCapacity = parseFloat(s[baseVolumeField] || 0);
            if (lotCapacity <= 0) return false;

            if (!isNespresso && s.aaa_project == 1 && s.cafe_certified == 1) {
                return false;
            }

            for (const rule of certRules) {
                if (rule.expiryField && s[rule.expiryField] && new Date(s[rule.expiryField]) <= currentDate) return false;

                if (rule.cert === 'aaa') {
                    if (s.aaa_project != 1) return false;
                } else if (rule.cert === 'aaars' || rule.cert === 'aaa-rs') {
                    if (parseFloat(s.aaa_rs_volume || 0) <= 0) return false;
                } else {
                    if (s[rule.certField] != 1) return false;
                }

                const alreadyDeclared = parseFloat(s[rule.declaredField] || 0);
                const certCapacity = parseFloat(s[baseVolumeField] || 0) - alreadyDeclared;
                
                if (certCapacity <= 0) return false;
                if (certCapacity < lotCapacity) lotCapacity = certCapacity;
            }

            s._lotCapacity = lotCapacity;
            return lotCapacity > 0;
        });

        // 5. Similarity Grouping
        applicableStocks.sort((a, b) => {
            const holderFields = ['rfa_certificate_holder', 'cafe_certificate_holder', 'eudr_certificate_holder'];
            const isAKenyacof = holderFields.some(f => String(a[f] || '').toLowerCase().includes('kenyacof')) ? 1 : 0;
            const isBKenyacof = holderFields.some(f => String(b[f] || '').toLowerCase().includes('kenyacof')) ? 1 : 0;
            if (isAKenyacof !== isBKenyacof) return isBKenyacof - isAKenyacof;

            const coopCmp = String(a.cooperative || '').localeCompare(String(b.cooperative || ''));
            if (coopCmp !== 0) return coopCmp;
            
            const countyCmp = String(a.county || '').localeCompare(String(b.county || ''));
            if (countyCmp !== 0) return countyCmp;
            
            const wetmillCmp = String(a.wet_mill || '').localeCompare(String(b.wet_mill || ''));
            if (wetmillCmp !== 0) return wetmillCmp;

            const gradeCmp = String(a.grade || '').localeCompare(String(b.grade || ''));
            if (gradeCmp !== 0) return gradeCmp;

            const outturnCmp = String(a.outturn || '').localeCompare(String(b.outturn || ''));
            if (outturnCmp !== 0) return outturnCmp;

            return new Date(a.recorded_date || 0).getTime() - new Date(b.recorded_date || 0).getTime();
        });

        // 6. Unified Allocation Loop
        let currentAllocated = 0;
        const trackerUpdatesMap = new Map<number, any>();
        const declarationInsertsMap = new Map<number, any>();
        
        const excelReportRows: any[] = [];
        const excelReportData: Record<string, any[]> = {};
        
        certificates_to_declare.forEach(cert => { excelReportData[cert] = []; });

        for (const stock of applicableStocks) {
            if (currentAllocated >= volume_to_declare) break;

            const amountToAllocate = Math.min(stock._lotCapacity, volume_to_declare - currentAllocated);
            currentAllocated += amountToAllocate;
            
            const updateObj: any = { id: stock.id };
            const insertObj: any = { sale_contract_id, stock_tracker_id: stock.id };
            const baseVol = parseFloat(stock[baseVolumeField] || 0);
            
            for (const rule of certRules) {
                const alreadyDeclared = parseFloat(stock[rule.declaredField] || 0);
                updateObj[rule.declaredField] = alreadyDeclared + amountToAllocate;
                insertObj[rule.declaredField] = amountToAllocate;
                
                excelReportData[rule.cert].push({
                    'Season': stock.season || '',
                    'Outturn': stock.outturn || '',
                    'Grower Code': stock.grower_code || '',
                    'Grade': stock.grade || '',
                    'Weight': baseVol,
                    'Wetmill': stock.wet_mill || '',
                    'County': stock.county || '',
                    'Cooperative': stock.cooperative || '',
                    'Purchased Weight': parseFloat(stock.purchased_weight || 0),
                    'Lot Number': stock.lot_number || '',
                    'Strategy': stock.strategy || '',
                    'Declared Weight': amountToAllocate,
                    'Balance': baseVol - (alreadyDeclared + amountToAllocate)
                });
            }

            trackerUpdatesMap.set(stock.id, updateObj);
            declarationInsertsMap.set(stock.id, insertObj);

            excelReportRows.push({
                'Season': stock.season || '',
                'Outturn': stock.outturn || '',
                'Grower Code': stock.grower_code || '',
                'Grade': stock.grade || '',
                'Weight': baseVol,
                'Wetmill': stock.wet_mill || '',
                'County': stock.county || '',
                'Cooperative': stock.cooperative || '',
                'Purchased Weight': parseFloat(stock.purchased_weight || 0),
                'Lot Number': stock.lot_number || '',
                'Strategy': stock.strategy || '',
                'Declared Weight': amountToAllocate,
                'Balance': stock._lotCapacity - amountToAllocate
            });
        }

        // 7. Validate holistic success
        if (currentAllocated < volume_to_declare - 0.01) {
            return NextResponse.json({ 
                error: `Insufficient identical volume to simultaneously fulfill ALL requested certificates. Needed ${volume_to_declare}, only found ${currentAllocated.toFixed(2)}.` 
            }, { status: 400 });
        }

        // 8. ⚡ O(1) Database Sync (Optimized Execution)
        const trackerValues = Array.from(trackerUpdatesMap.values());
        
        // Run tracker updates in parallel
        await Promise.all(trackerValues.map(update => {
            const keys = Object.keys(update).filter(k => k !== 'id');
            const setClause = keys.map(k => `${k} = ?`).join(', ');
            const values = keys.map(k => update[k]);
            
            return query({
                query: `UPDATE certified_stock_tracker SET ${setClause} WHERE id = ?`,
                values: [...values, update.id]
            });
        }));

        const declValues = Array.from(declarationInsertsMap.values());
        if (declValues.length > 0) {
            // Dynamic column mapping removes dependency on hardcoded arrays
            const insertCols = Object.keys(declValues[0]);
            
            const placeholders = `(${insertCols.map(() => '?').join(', ')})`;
            const allPlaceholders = declValues.map(() => placeholders).join(', ');
            
            const insertVals = declValues.flatMap(decl => insertCols.map(k => decl[k]));
            
            const updateStmts = insertCols
                .filter(col => col !== 'sale_contract_id' && col !== 'stock_tracker_id')
                .map(col => `${col} = VALUES(${col})`);

            const onDuplicateClause = updateStmts.length > 0 ? `ON DUPLICATE KEY UPDATE ${updateStmts.join(', ')}` : '';
            
            // Single O(1) Bulk Insert
            await query({
                query: `INSERT INTO sale_contract_stock_declaration (${insertCols.join(', ')}) VALUES ${allPlaceholders} ${onDuplicateClause}`,
                values: insertVals
            });
        }

        await query({
            query: `UPDATE sale_contract SET certs_declared = 1 WHERE id = ?`,
            values: [sale_contract_id]
        });

        // 9. Generate specific Excel File format
        const workbook = xlsx.utils.book_new();
        
        const combinedWorksheet = xlsx.utils.json_to_sheet(excelReportRows);
        if (excelReportRows.length > 0) {
            combinedWorksheet['!cols'] = Object.keys(excelReportRows[0]).map(key => ({ wch: Math.max(key.length + 5, 15) }));
        }
        xlsx.utils.book_append_sheet(workbook, combinedWorksheet, 'COMBINED DECLARATION');
        
        for (const cert of certificates_to_declare) {
            const certData = excelReportData[cert];
            const certWorksheet = xlsx.utils.json_to_sheet(certData);
            if (certData.length > 0) {
                certWorksheet['!cols'] = Object.keys(certData[0]).map(key => ({ wch: Math.max(key.length + 5, 15) }));
            }
            xlsx.utils.book_append_sheet(workbook, certWorksheet, cert.toUpperCase());
        }

        const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const cleanContractName = String(contract_number).replace(/[^a-zA-Z0-9!@#&()-_=+]/g, '_');

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Disposition': `attachment; filename="Declaration_${cleanContractName}.xlsx"`,
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        });

    } catch (error) {
        console.error("Allocation Error:", error);
        return NextResponse.json({ error: 'Failed to process allocation' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { sale_contract_id, old_stock_id, new_stock_ids } = body;

        if (!sale_contract_id || !old_stock_id || !new_stock_ids || new_stock_ids.length === 0) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // 1. Fetch exactly how much was declared on the old stock
        const oldDeclRows = await query({
            query: `SELECT * FROM sale_contract_stock_declaration WHERE sale_contract_id = ? AND stock_tracker_id = ?`,
            values: [sale_contract_id, old_stock_id]
        }) as any[];

        if (!oldDeclRows || oldDeclRows.length === 0) {
            return NextResponse.json({ error: 'Original declaration not found' }, { status: 404 });
        }

        const oldDecl = oldDeclRows[0];
        const activeCerts: string[] = [];
        let volumeToReplace = 0;
        const cols = ['rfa_declared_weight', 'eudr_declared_weight', 'cafe_declared_weight', 'impact_declared_weight', 'aaa_declared_weight', 'aaa_rs_declared_weight', 'netzero_declared_weight'];

        for (const col of cols) {
            const val = parseFloat(oldDecl[col] || 0);
            if (val > 0) {
                activeCerts.push(col);
                if (val > volumeToReplace) volumeToReplace = val;
            }
        }

        if (volumeToReplace <= 0) {
            return NextResponse.json({ error: 'No volume to replace found in the old lot.' }, { status: 400 });
        }

        // 2. O(1) Fetch all requested replacement lots
        const placeholders = new_stock_ids.map(() => '?').join(',');
        const newStocks = await query({
            query: `SELECT * FROM certified_stock_tracker WHERE id IN (${placeholders})`,
            values: new_stock_ids
        }) as any[];

        // 3. O(N) Calculate new allocation greedy approach
        let currentAllocated = 0;
        const updatesMap = new Map();
        const insertsMap = new Map();

        for (const stockId of new_stock_ids) {
            const stock = newStocks.find(s => s.id === stockId);
            if (!stock) continue;
            if (currentAllocated >= volumeToReplace) break;

            let baseVolumeField = 'purchased_weight';
            if (activeCerts.includes('aaa_declared_weight')) baseVolumeField = 'aaa_volume';
            else if (activeCerts.includes('aaa_rs_declared_weight')) baseVolumeField = 'aaa_rs_volume';

            let lotCap = parseFloat(stock[baseVolumeField] || 0);

            for (const col of activeCerts) {
                 const alreadyDeclared = parseFloat(stock[col] || 0);
                 const certCap = parseFloat(stock[baseVolumeField] || 0) - alreadyDeclared;
                 if (certCap < lotCap) lotCap = certCap;
            }

            if (lotCap <= 0) continue;

            const amountToAllocate = Math.min(lotCap, volumeToReplace - currentAllocated);
            currentAllocated += amountToAllocate;

            const stockUpdate: any = { id: stock.id };
            const declInsert: any = { sale_contract_id, stock_tracker_id: stock.id };

            for (const col of activeCerts) {
                stockUpdate[col] = parseFloat(stock[col] || 0) + amountToAllocate;
                declInsert[col] = amountToAllocate;
            }

            updatesMap.set(stock.id, stockUpdate);
            insertsMap.set(stock.id, declInsert);
        }

        if (currentAllocated < volumeToReplace - 0.01) {
            return NextResponse.json({ 
                error: `Selected lots have insufficient capacity. Needed ${volumeToReplace}, but could only allocate ${currentAllocated}.` 
            }, { status: 400 });
        }

        // 4. Execute DB Changes 
        
        // A. Free the old stock capacity
        const revertSetClause = activeCerts.map(col => `${col} = GREATEST(0, COALESCE(${col}, 0) - ?)`).join(', ');
        const revertValues = activeCerts.map(col => parseFloat(oldDecl[col] || 0));

        if (revertSetClause) {
            await query({
                query: `UPDATE certified_stock_tracker SET ${revertSetClause} WHERE id = ?`,
                values: [...revertValues, old_stock_id]
            });
        }

        // B. Delete the old declaration record entirely
        await query({
            query: `DELETE FROM sale_contract_stock_declaration WHERE sale_contract_id = ? AND stock_tracker_id = ?`,
            values: [sale_contract_id, old_stock_id]
        });

        // C. ⚡ Consume new stock capacities (Optimized parallel execution)
        const updatePromises = Array.from(updatesMap.values()).map(update => {
            const keys = Object.keys(update).filter(k => k !== 'id');
            const setClause = keys.map(k => `${k} = ?`).join(', ');
            const values = keys.map(k => update[k]);

            return query({
                query: `UPDATE certified_stock_tracker SET ${setClause} WHERE id = ?`,
                values: [...values, update.id]
            });
        });
        await Promise.all(updatePromises);

        // D. ⚡ Insert / Upsert the new declarations (Optimized bulk query)
        const newDeclValues = Array.from(insertsMap.values());
        if (newDeclValues.length > 0) {
            const insertCols = Object.keys(newDeclValues[0]);
            
            const insertPlaceholders = `(${insertCols.map(() => '?').join(', ')})`;
            const allPlaceholders = newDeclValues.map(() => insertPlaceholders).join(', ');
            
            const insertVals = newDeclValues.flatMap(decl => insertCols.map(k => decl[k]));
            
            const updateStmts = insertCols
                .filter(col => col !== 'sale_contract_id' && col !== 'stock_tracker_id')
                .map(col => `${col} = COALESCE(${col}, 0) + VALUES(${col})`);

            const onDuplicateClause = updateStmts.length > 0 ? `ON DUPLICATE KEY UPDATE ${updateStmts.join(', ')}` : '';

            await query({
                query: `INSERT INTO sale_contract_stock_declaration (${insertCols.join(', ')}) VALUES ${allPlaceholders} ${onDuplicateClause}`,
                values: insertVals
            });
        }

        return NextResponse.json({ success: true, replaced_weight: volumeToReplace });
    } catch (error) {
        console.error("Replacement error:", error);
        return NextResponse.json({ error: 'Failed to process replacement' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const contractId = searchParams.get('id');

        if (!contractId) {
            return NextResponse.json({ error: 'Contract ID required' }, { status: 400 });
        }

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
                    cst.aaa_rs_declared_weight = GREATEST(0, COALESCE(cst.aaa_rs_declared_weight, 0) - COALESCE(scsd.aaa_rs_declared_weight, 0)),
                    cst.netzero_declared_weight = GREATEST(0, COALESCE(cst.netzero_declared_weight, 0) - COALESCE(scsd.netzero_declared_weight, 0))
                WHERE scsd.sale_contract_id = ?
            `,
            values: [contractId]
        });

        await query({
            query: `DELETE FROM sale_contract_stock_declaration WHERE sale_contract_id = ?`,
            values: [contractId]
        });

        await query({
            query: `UPDATE sale_contract SET certs_declared = 0 WHERE id = ?`,
            values: [contractId]
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete declaration error:", error);
        return NextResponse.json({ error: 'Failed to revert allocations' }, { status: 500 });
    }
}