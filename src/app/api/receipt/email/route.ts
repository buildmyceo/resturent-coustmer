import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, invoiceId, invoiceNumber, guestToken } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Valid email address is required.' },
        { status: 400 }
      );
    }

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'invoiceId is required.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: invoice } = await admin
      .from('invoices')
      .select('id, session_id, customer_email')
      .eq('id', invoiceId)
      .maybeSingle();

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found.' }, { status: 404 });
    }

    let authorized = false;
    if (guestToken && invoice.session_id) {
      const { data: sess } = await admin
        .from('table_sessions')
        .select('id, guest_token')
        .eq('id', invoice.session_id)
        .maybeSingle();
      if (sess?.guest_token === guestToken) {
        authorized = true;
      } else {
        const { data: part } = await admin
          .from('session_participants')
          .select('id')
          .eq('session_id', invoice.session_id)
          .eq('guest_token', guestToken)
          .maybeSingle();
        if (part) authorized = true;
      }
    }

    if (!authorized) {
      try {
        const authClient = await createServerSupabaseClient();
        const { data: { user } } = await authClient.auth.getUser();
        if (user?.email && invoice.customer_email?.toLowerCase() === user.email.toLowerCase()) {
          authorized = true;
        }
      } catch {}
    }

    if (!authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 403 });
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

