import { getLatestWeeklyProcessSummary } from "@/lib/stock_movement_utils";
import { NextResponse } from "next/server";

// Powers the Processing page's "Processing Activities" card — always the most recent
// calendar_week in weekly_process_summary, regardless of the Summary tab's date filter.
export async function GET() {
  try {
    const data = await getLatestWeeklyProcessSummary();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Weekly Process Summary API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch weekly process summary" },
      { status: 500 }
    );
  }
}
