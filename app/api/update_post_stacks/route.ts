import { process_post_stack_updates, update_post_trade_variables } from '@/lib/stack_pricing_utils';
import { updateUndefinedStrategies } from '@/lib/sti_processing_utils';
import { NextRequest, NextResponse } from 'next/server';
; // Adjust path as needed

// Define the expected sheet name constant here for clarity
const FILE_FORM_FIELD_NAME = 'current_stock'; 

/**
 * Handles POST requests to upload the Current Stock file and trigger the Post Stack update process.
 * * The request is expected to be multipart/form-data containing a file named 'current_stock_file'.
 */
export async function POST(request: NextRequest) {
    console.log(`[API] Received request to process ${FILE_FORM_FIELD_NAME}.`);
    
    try {
        // 1. Parse the multipart/form-data payload
        const formData = await request.formData();
        const test_details_summary:File = formData.get('test_details_summary_file') as File;
        await updateUndefinedStrategies(test_details_summary);

        // 2. Extract the file object
        const file = formData.get(FILE_FORM_FIELD_NAME);

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ 
                success: false, 
                message: `File upload failed. Expected '${FILE_FORM_FIELD_NAME}' file part.` 
            }, { status: 400 });
        }

        console.log(`[API] File received: ${file.name}, Type: ${file.type}`);

        // 3. Call the core processing function
        await process_post_stack_updates(file);

        // 4. Retry trade variables / PNL for any process that was stuck on an UNDEFINED output
        // strategy earlier in this same upload — that strategy was only just resolved by the
        // updateUndefinedStrategies call above (step 1), which runs AFTER debit_credit_processing
        // creates that batch's row, so it couldn't have been fixed in time for the earlier
        // update_post_trade_variables() call inside /api/create_summary. Re-running it here lets
        // those processes get priced same-day instead of sitting at trade_variables_updated = FALSE
        // until the next upload.
        const skipped_process_numbers = await update_post_trade_variables();
        console.log(`[API] Retried trade variables after post-stack update. Still skipped: ${skipped_process_numbers.length}`);

        // 5. Success response
        return NextResponse.json({
            success: true,
            message: `Post Stack updates initiated and completed successfully for file: ${file.name}`,
            skipped_process_numbers
        });

    } catch (error) {
        console.error("[API] Failed to process post stack file:", error);
        
        // 5. Error response
        return NextResponse.json({ 
            success: false, 
            message: 'Internal server error during post stack processing.',
            error: (error as Error).message || 'Unknown error'
        }, { status: 500 });
    }
}

