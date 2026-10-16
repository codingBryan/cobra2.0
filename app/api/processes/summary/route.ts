import { getProcessSummaryMatrix } from "@/lib/stock_movement_utils";
import { NextResponse } from "next/server";

// Powers the Processing page's "Summary" tab — the Process Type Summary Matrix.
// Always scoped by processing_date (not instructed_date), per the matrix's definition.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("fromDate") || undefined;
    const toDate = searchParams.get("toDate") || undefined;

    const data = await getProcessSummaryMatrix(fromDate, toDate);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Process Summary API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch process summary" },
      { status: 500 }
    );
  }
}
