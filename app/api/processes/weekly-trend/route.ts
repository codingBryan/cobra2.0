import { getRecentWeeklyProcessingTrend } from "@/lib/stock_movement_utils";
import { NextResponse } from "next/server";

// Powers the Processing page's weekly trend chart — total processing loss and % work done per
// week, across the last N weeks (default 4) in weekly_process_summary.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weeksParam = Number(searchParams.get("weeks"));
    const weeks = Number.isFinite(weeksParam) && weeksParam > 0 ? weeksParam : 4;

    const data = await getRecentWeeklyProcessingTrend(weeks);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Weekly Processing Trend API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch weekly processing trend" },
      { status: 500 }
    );
  }
}
