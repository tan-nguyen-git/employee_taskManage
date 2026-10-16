// Twilio Verify: sends and checks SMS one-time codes for the owner login.
function getTwilioConfig() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    throw new Error("Twilio Verify is not configured");
  }
  return { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID };
}

export async function callTwilioVerify(endpoint, fields) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = getTwilioConfig();
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields)
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("Twilio Verify request failed:", data.message || response.statusText);
    const error = new Error("Verification service request failed");
    error.twilioCode = data.code;
    error.httpStatus = response.status;
    throw error;
  }
  return data;
}

export const sendVerificationCode = (phoneNumber) => callTwilioVerify("Verifications", { To: phoneNumber, Channel: "sms" });
export const checkVerificationCode = (phoneNumber, code) => callTwilioVerify("VerificationCheck", { To: phoneNumber, Code: code });
