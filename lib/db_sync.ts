import { createPool, Pool, RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';

// Define types based on your schema
interface DailyProcessRow extends RowDataPacket {
    id: number;
    process_number: string;
    trade_variables_updated: number; // Boolean is tinyint(1)
}

interface StrategyProcessingRow extends RowDataPacket {
    id: number;
    process_id: number;
    batch_number: string;
    input_qty: number;
    output_qty: number;
    strategy: string;
    input_differential: number | null;
    output_differential: number | null;
    input_hedge_level_usc_lb: number | null;
    output_hedge_level_usc_lb: number | null;
    input_cost_usd_50: number | null;
    output_cost_usd_50: number | null;
}

// Configuration (Replace with your actual config/env vars)
const PROD_CONFIG = {
    host: process.env.PROD_MYSQL_HOST, user: process.env.PROD_MYSQL_USER, password: process.env.PROD_MYSQL_PASSWORD, database: process.env.PROD_MYSQL_DATABASE,
    waitForConnections: true, connectionLimit: 10, queueLimit: 0
};

const DEV_CONFIG = {
    host:process.env.DEV_MYSQL_HOST, user: process.env.DEV_MYSQL_USER, password: process.env.DEV_MYSQL_PASSWORD, database: process.env.DEV_MYSQL_DATABASE,
    waitForConnections: true, connectionLimit: 10, queueLimit: 0
};

// Optimization: Adapted user's query function to accept a specific pool instance
// This allows reusing the logic for both PROD and DEV pools dynamically.
async function executeQuery<T extends RowDataPacket[] | ResultSetHeader>(
    pool: Pool, 
    sql: string, 
    values?: any
): Promise<T> {
    let connection: PoolConnection | undefined;
    try {
        connection = await pool.getConnection();
        const [results] = await connection.query(sql, values);
        return results as T;
    } catch (error: any) {
        console.error("Error executing query:", {
            sql: error.sql,
            sqlMessage: error.sqlMessage,
        });
        throw error;
    } finally {
        if (connection) {

            connection.release();
        }
    }
}

export async function update_past_trade_variables() {
    console.log("Starting update_past_trade_variables (Database Sync Mode)...");
    
    const prodPool = createPool(PROD_CONFIG);
    const devPool = createPool(DEV_CONFIG);

    try {
        // --- STEP 1: Reset Production Status ---
        console.log("[Step 1] Resetting Production trade_variables_updated to FALSE...");
        const resetResult = await executeQuery<ResultSetHeader>(prodPool, 
            `UPDATE daily_processes SET trade_variables_updated = FALSE WHERE trade_variables_updated = TRUE`
        );
        console.log(`[Step 1] Reset complete. Affected rows: ${resetResult.affectedRows}`);

        // --- STEP 2: Fetch Unpriced Production Processes ---
        console.log("[Step 2] Fetching unpriced processes from Production...");
        const prodProcesses = await executeQuery<DailyProcessRow[]>(prodPool, 
            `SELECT id, process_number FROM daily_processes WHERE trade_variables_updated = FALSE`
        );

        if (prodProcesses.length === 0) {
            console.log("[Step 2] No unpriced processes found. Exiting.");
            return;
        }
        console.log(`[Step 2] Found ${prodProcesses.length} unpriced processes in Production.`);

        // Optimization: Extract process numbers for bulk lookup
        const processNumbers = prodProcesses.map(p => p.process_number);
        const prodProcessMap = new Map(prodProcesses.map(p => [p.process_number, p.id]));

        // --- STEP 3: Fetch Matching Updated Processes from Development ---
        console.log("[Step 3] Looking up matching updated processes in Development...");
        const devProcesses = await executeQuery<DailyProcessRow[]>(devPool,
            `SELECT id, process_number FROM daily_processes 
             WHERE process_number IN (?) AND trade_variables_updated = TRUE`,
            [processNumbers]
        );

        if (devProcesses.length === 0) {
            console.log("[Step 3] No matching updated processes found in Development. Exiting.");
            return;
        }
        console.log(`[Step 3] Found ${devProcesses.length} matching processes in Development ready for sync.`);

        const devProcessIds = devProcesses.map(p => p.id);
        
        // --- STEP 4: Fetch Strategy Data (Inputs & Outputs) ---
        console.log("[Step 4] Fetching detailed strategy records from both databases...");
        
        // A. Fetch ALL relevant Development Strategy Records
        const devStrategies = await executeQuery<StrategyProcessingRow[]>(devPool,
            `SELECT * FROM daily_strategy_processing WHERE process_id IN (?)`,
            [devProcessIds]
        );
        console.log(`[Step 4] Fetched ${devStrategies.length} strategy records from Development.`);

        // B. Fetch ALL relevant Production Strategy Records
        // We need to map the DEV process IDs back to PROD process IDs to fetch the correct prod strategies
        const matchedProdIds = devProcesses.map(dp => prodProcessMap.get(dp.process_number));
        
        const prodStrategies = await executeQuery<StrategyProcessingRow[]>(prodPool,
            `SELECT id, process_id, batch_number, input_qty, output_qty 
             FROM daily_strategy_processing WHERE process_id IN (?)`,
            [matchedProdIds]
        );
        console.log(`[Step 4] Fetched ${prodStrategies.length} strategy records from Production.`);

        // Optimization: Index Production Records for O(1) lookup
        const prodStrategyMap = new Map<string, number>();
        prodStrategies.forEach(row => {
            const type = row.input_qty > 0 ? 'IN' : 'OUT';
            prodStrategyMap.set(`${row.process_id}_${row.batch_number}_${type}`, row.id);
        });

        // --- STEP 5: Perform Updates ---
        console.log("[Step 5] Preparing and executing updates...");
        
        const updates: Promise<any>[] = [];
        
        // A. Update Production Process Headers
        console.log(`[Step 5a] Updating ${matchedProdIds.length} Production process headers to TRUE...`);
        updates.push(executeQuery(prodPool,
            `UPDATE daily_processes SET trade_variables_updated = TRUE WHERE id IN (?)`,
            [matchedProdIds]
        ));

        // B. Prepare Strategy Updates
        let updateCount = 0;
        for (const devRow of devStrategies) {
            const devProcess = devProcesses.find(dp => dp.id === devRow.process_id);
            if (!devProcess) continue;
            
            const prodProcessId = prodProcessMap.get(devProcess.process_number);
            const type = devRow.input_qty > 0 ? 'IN' : 'OUT';
            
            const prodStrategyId = prodStrategyMap.get(`${prodProcessId}_${devRow.batch_number}_${type}`);

            if (prodStrategyId) {
                updateCount++;
                if (type === 'IN') {
                    updates.push(executeQuery(prodPool,
                        `UPDATE daily_strategy_processing 
                         SET strategy = ?, input_differential = ?, input_hedge_level_usc_lb = ?, input_cost_usd_50 = ?
                         WHERE id = ?`,
                        [devRow.strategy, devRow.input_differential, devRow.input_hedge_level_usc_lb, devRow.input_cost_usd_50, prodStrategyId]
                    ));
                } else {
                    updates.push(executeQuery(prodPool,
                        `UPDATE daily_strategy_processing 
                         SET strategy = ?, output_differential = ?, output_hedge_level_usc_lb = ?, output_cost_usd_50 = ?
                         WHERE id = ?`,
                        [devRow.strategy, devRow.output_differential, devRow.output_hedge_level_usc_lb, devRow.output_cost_usd_50, prodStrategyId]
                    ));
                }
            }
        }

        console.log(`[Step 5b] Queued ${updateCount} strategy record updates. Executing...`);
        await Promise.all(updates);
        console.log(`[Success] Successfully synchronized ${matchedProdIds.length} processes and ${updateCount} strategy records.`);

    } catch (error) {
        console.error("[Error] Synchronization Failed:", error);
        throw error;
    } finally {
        console.log("[Cleanup] Closing database connections.");
        await prodPool.end();
        await devPool.end();
    }
}