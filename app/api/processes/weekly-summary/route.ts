import { getWeeklyProcessSummary } from "@/lib/stock_movement_utils";
import { NextRequest, NextResponse } from "next/server";

// Powers the Processing page's "Processing Activities" card — defaults to the most recent
// calendar_week in weekly_process_summary, or a specific week via ?week=, regardless of the
// Summary tab's date filter.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const week = searchParams.get("week") || undefined;

    const data = await getWeeklyProcessSummary(week);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Weekly Process Summary API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch weekly process summary" },
      { status: 500 }
    );
  }
}
