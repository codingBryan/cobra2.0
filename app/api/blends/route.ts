import { NextResponse } from 'next/server';
import { query } from '@/lib/stock_movement_db'; 

// GET: Fetch all blends
export async function GET() {
    try {
        const sqlQuery = `SELECT * FROM blends ORDER BY id DESC`;
        const rows = await query({ query: sqlQuery });
        
        return NextResponse.json(rows);
    } catch (error) {
        console.error("Database error (GET blends):", error);
        return NextResponse.json({ error: 'Failed to fetch blends' }, { status: 500 });
    }
}

// POST: Create a new blend
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, ...rest } = body;

        if (!name) {
            return NextResponse.json({ error: 'Blend name is required' }, { status: 400 });
        }

        // O(K) Optimization: Dynamically build query based only on provided fields
        const keys = ['name', ...Object.keys(rest)];
        const values = [name, ...Object.values(rest)];
        const placeholders = keys.map(() => '?').join(', ');

        const sql = `INSERT INTO blends (${keys.join(', ')}) VALUES (${placeholders})`;

        // Safely execute the query without strict generic casting to prevent undefined errors
        const dbResult: any = await query({ 
            query: sql, 
            values 
        });

        // Robust O(1) extraction: handles both raw object and array-wrapped returns
        const newId = dbResult?.insertId || dbResult?.[0]?.insertId;

        return NextResponse.json({ 
            success: true, 
            id: newId,
            message: "Blend created successfully"
        });
    } catch (error: any) {
        console.error("Database error (POST blends):", error);
        if (error.code === 'ER_DUP_ENTRY') {
            return NextResponse.json({ error: 'A blend with this name already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to create blend' }, { status: 500 });
    }
}

// PUT: Update an existing blend
export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Blend ID is required' }, { status: 400 });
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ success: true, message: "No changes provided" });
        }

        // O(K) Optimization: Dynamically build SET clause for only the fields being updated
        const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updates), id];

        const sql = `UPDATE blends SET ${setClause} WHERE id = ?`;
        
        await query({ 
            query: sql, 
            values 
        });

        return NextResponse.json({ success: true, message: "Blend updated successfully" });
    } catch (error: any) {
        console.error("Database error (PUT blends):", error);
        if (error.code === 'ER_DUP_ENTRY') {
            return NextResponse.json({ error: 'A blend with this name already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Failed to update blend' }, { status: 500 });
    }
}

// DELETE: Delete a blend (Safe because of ON DELETE SET NULL in schema)
export async function DELETE(request: Request) {
    try {
        // O(1) Memory: Extracting from URL params rather than parsing body
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Blend ID is required' }, { status: 400 });
        }

        await query({ 
            query: `DELETE FROM blends WHERE id = ?`, 
            values: [id] 
        });

        return NextResponse.json({ success: true, message: "Blend deleted successfully" });
    } catch (error) {
        console.error("Database error (DELETE blends):", error);
        return NextResponse.json({ error: 'Failed to delete blend' }, { status: 500 });
    }
}