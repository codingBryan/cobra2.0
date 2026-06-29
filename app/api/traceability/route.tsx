import { getBatchLineage } from '@/custom_utilities/stock_movement_utilities';
import { query } from '@/lib/stock_movement_db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        // Extract the batch number from the URL search parameters (e.g., /api/traceability?batchNumber=123)
        const searchParams = request.nextUrl.searchParams;
        const batchNumber = searchParams.get('batchNumber');

        if (!batchNumber) {
            return NextResponse.json(
                { error: "Missing 'batchNumber' query parameter" }, 
                { status: 400 }
            );
        }

        // Call our optimized CTE-powered function
        const lineageData = await getBatchLineage(query, batchNumber);

        console.log("Lineage data")
        console.log(lineageData)

        // Return the structured nodes and edges
        return NextResponse.json(lineageData, { status: 200 });

    } catch (error) {
        console.error("Error fetching batch lineage endpoint:", error);
        return NextResponse.json(
            { error: "Internal Server Error while resolving batch history" }, 
            { status: 500 }
        );
    }
}

