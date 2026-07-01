import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const { blendName, targetBlend, targetClient, saleRef, compromisedSales, comparisonData } = await req.json();

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    // Build Comparison Table
    const compRows = comparisonData.map((c: any) => `
        <tr>
            <td style="padding:8px; border:1px solid #ddd;">${c.strategy}</td>
            <td style="padding:8px; border:1px solid #ddd;">${c.target}</td>
            <td style="padding:8px; border:1px solid #ddd;">${c.actual}</td>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold; color:${parseFloat(c.variance) < 0 ? 'red' : 'green'}">${c.variance}</td>
        </tr>`).join('');

    const salesRows = compromisedSales.length > 0 
      ? compromisedSales.map((c: any) => `
          <tr>
            <td style="padding:8px; border:1px solid #ddd;">${c.client}</td>
            <td style="padding:8px; border:1px solid #ddd;">${c.contract_number}</td>
            <td style="padding:8px; border:1px solid #ddd;">${c.quantity}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" style="padding:8px; text-align:center;">No compromised sales found.</td></tr>';

    const htmlContent = `
      <h2>New Blend Finalized: ${blendName}</h2>
      <h3>Comparison: ${targetBlend} (Target) vs Actual</h3>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <thead><tr style="background-color:#f4f4f4;"><th>Strategy</th><th>Target</th><th>Actual</th><th>Variance</th></tr></thead>
        <tbody>${compRows}</tbody>
      </table>
      
      <h3>Affected Compromised Sales:</h3>
      <table style="width:100%; border-collapse:collapse;">
        <thead><tr style="background-color:#f4f4f4;"><th>Client</th><th>Contract #</th><th>Tonnage</th></tr></thead>
        <tbody>${salesRows}</tbody>
      </table>
    `;

    await transporter.sendMail({
      from: '"Blend Manager" <no-reply@yourdomain.com>',
      to: "brian.were@sucafina.com",
      subject: `Blend Notification: ${blendName}`,
      html: htmlContent,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}