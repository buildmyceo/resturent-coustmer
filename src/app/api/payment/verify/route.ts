import { NextRequest, NextResponse } from 'next/server';
import { verifyRazorpayPaymentSignature, fetchRazorpayPayment } from '@/lib/razorpay';
import { finalizeVerifiedPayment } from '@/lib/payment-finalization';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      purpose = 'session_bill',
      restaurantId,
      sessionId,
      orderId,
      bookingId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      customerDetails,
    } = body;

    if (!restaurantId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { success: false, error: 'Missing Razorpay verification parameters' },
        { status: 400 }
      );
    }

    const isValidSig = verifyRazorpayPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValidSig) {
      return NextResponse.json(
        { success: false, error: 'Invalid Razorpay payment signature' },
        { status: 400 }
      );
    }

    const rzpPayment = await fetchRazorpayPayment(razorpay_payment_id);
    if (rzpPayment.status !== 'captured' || rzpPayment.order_id !== razorpay_order_id) {
      return NextResponse.json(
        { success: false, error: 'Payment is not captured on Razorpay' },
        { status: 400 }
      );
    }

    const result = await finalizeVerifiedPayment({
      purpose,
      restaurantId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      amountPaise: Number(rzpPayment.amount),
      orderId: orderId || null,
      sessionId: sessionId || null,
      bookingId: bookingId || null,
      customerDetails,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Payment verification failed' }, { status: 500 });
  }
}
