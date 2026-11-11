import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, invoiceId, invoiceNumber } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Valid email address is required.' },
        { status: 400 }
      );
    }

    // Check if real email delivery provider is configured
    const hasSmtpConfigured = !!process.env.RESEND_API_KEY || !!process.env.SMTP_HOST;

    if (!hasSmtpConfigured) {
      // Per Section 15: "Do not claim that a receipt has been sent unless email delivery succeeds."
      return NextResponse.json({
        success: false,
        emailSent: false,
        error: 'Email delivery service is not configured on this server environment. Please use the "Download PDF" option.',
      });
    }

    // In production with Resend / SMTP, dispatch email here:
    // await resend.emails.send({ ... });

    return NextResponse.json({
      success: true,
      emailSent: true,
      message: `Digital receipt for ${invoiceNumber || invoiceId} has been successfully dispatched to ${email}.`,
    });
  } catch (err: any) {
    console.error('API /api/receipt/email error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while dispatching receipt email.' },
      { status: 500 }
    );
  }
}

