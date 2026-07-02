import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const { blendName, targetBlend, targetClient, saleRef, compromisedSales, comparisonData, rebalancingNeededKg } = await req.json();

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    // Build Comparison Table with the Weight Variance (Kg) Column
    const compRows = comparisonData.map((c: any) => `
        <tr>
            <td style="padding:8px; border:1px solid #ddd;">${c.strategy}</td>
            <td style="padding:8px; border:1px solid #ddd;">${c.target}</td>
            <td style="padding:8px; border:1px solid #ddd;">${c.actual}</td>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold; color:${parseFloat(c.variance) < 0 ? 'red' : 'green'}">${c.variance}</td>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold; color:${parseFloat(c.weightVariance) < 0 ? 'red' : 'green'}">${c.weightVariance} Kg</td>
        </tr>`).join('');

    const salesRows = compromisedSales.length > 0 
      ? compromisedSales.map((c: any) => `
          <tr>
            <td style="padding:8px; border:1px solid #ddd;">${c.client || '-'}</td>
            <td style="padding:8px; border:1px solid #ddd;">${c.contract_number || '-'}</td>
            <td style="padding:8px; border:1px solid #ddd;">${c.weight_kilos || c.quantity || 0}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" style="padding:8px; text-align:center; color: #666;">No compromised sales found.</td></tr>';

    const parsedKg = parseFloat(rebalancingNeededKg || 0);
    const parsedBags = parsedKg / 60;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; color: #333;">
          <h2>New Blend Finalized: ${blendName}</h2>
          
          <h3>Comparison: ${targetBlend} (Target) vs Actual</h3>
          <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size: 14px;">
            <thead>
              <tr style="background-color:#f4f4f4;">
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Strategy</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Target</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Actual</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Variance (%)</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Weight Variance (Kg)</th>
              </tr>
            </thead>
            <tbody>${compRows}</tbody>
          </table>
          
          <h3>Affected Compromised Sales:</h3>
          <table style="width:100%; border-collapse:collapse; font-size: 14px;">
            <thead>
              <tr style="background-color:#f4f4f4;">
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Client</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Contract #</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Tonnage (Kg)</th>
              </tr>
            </thead>
            <tbody>${salesRows}</tbody>
          </table>

          <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-left: 5px solid #ffeeba; margin-top: 25px; border-radius: 4px;">
            <h3 style="margin-top: 0; color: #d9534f;">Re-Balancing Needed</h3>
            <p style="font-size: 1.1em; font-weight: bold; margin-bottom: 5px;">Total Re-Balance: ${parsedKg.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} Kg (${parsedBags.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} Bags)</p>
            <p style="margin-bottom: 0; font-size: 0.9em;"><em>Note: You might want to revisit the target blends for the contracts.</em></p>
          </div>
      </div>
    `;

    await transporter.sendMail({
      from: '"Blend Manager" <no-reply@yourdomain.com>',
      to: "brian.were@sucafina.com",
      subject: `Blend Notification & Re-Balancing Alert: ${blendName}`,
      html: htmlContent,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}