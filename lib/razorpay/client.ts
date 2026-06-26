import Razorpay from 'razorpay';

let _razorpay: Razorpay | null = null;

/**
 * Returns a lazily-initialized Razorpay SDK client from environment variables.
 *
 * @returns Configured Razorpay instance.
 * @throws Error when RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET are missing.
 */
export function getRazorpay(): Razorpay {
  if (!_razorpay) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials are not configured');
    }
    _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return _razorpay;
}
