import express from "express";
import Daraja  from "@lumierelabs/daraja";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

// Initialize Daraja SDK
const daraja = Daraja({
  consumerKey: process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.MPESA_CONSUMER_SECRET,
  shortcode: process.env.MPESA_SHORTCODE,
  passkey: process.env.MPESA_PASSKEY,
  // Key: must be the complete URL of the Vercel domain + callback route
  callbackUrl: process.env.CALLBACK_URL,
  environment: "sandbox", // change to "production" when going live
});

// Normalize phone number to 2547XXXXXXXX
function normalizePhone(phone) {
  let cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "254" + cleaned.slice(1);
  } else if (cleaned.startsWith("7") && cleaned.length === 9) {
    cleaned = "254" + cleaned;
  } else if (cleaned.startsWith("254") && cleaned.length === 12) {
    // already correct
  } else {
    throw new Error("Invalid Kenyan phone number");
  }
  return cleaned;
}

// STK Push endpoint
app.post("/api/pay", async (req, res) => {
  try {
    const { phone, amount } = req.body;

    // Validate amount as positive integer
    const intAmount = parseInt(amount, 10);
    if (!intAmount || intAmount < 1) {
      return res.status(400).json({ success: false, error: "Amount must be a positive integer" });
    }

    const normalizedPhone = normalizePhone(phone);

    const response = await daraja.stkPush({
      transactionType: "CustomerPayBillOnline",
      amount: intAmount,
      partyA: normalizedPhone,
      phoneNumber: normalizedPhone,
      accountReference: "MumboElectronics",
      transactionDesc: "Payment for order",
    });

    res.json({
      success: true,
      message: "STK Push sent",
      CheckoutRequestID: response.CheckoutRequestID,
      data: response,
    });
  } catch (error) {
    console.error("STK Push error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Callback endpoint (Safaricom sends the result here)
app.post("/api/callback", (req, res) => {
  // First respond to Safaricom to acknowledge receipt, to avoid retries due to timeout
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return;

    const { CheckoutRequestID, ResultCode, ResultDesc } = callback;

    if (ResultCode === 0) {
      const items = callback.CallbackMetadata?.Item || [];
      const metadata = Object.fromEntries(items.map(i => [i.Name, i.Value]));
      console.log("Payment success:", {
        CheckoutRequestID,
        amount: metadata.Amount,
        receipt: metadata.MpesaReceiptNumber,
        phone: metadata.PhoneNumber,
      });
      // TODO: update order status based on CheckoutRequestID
    } else {
      console.log("Payment failed:", CheckoutRequestID, ResultCode, ResultDesc);
    }
  } catch (error) {
    console.error("Callback processing error:", error);
  }
});

// Vercel Serverless export (if using Vercel, you don't need app.listen)
export default app;