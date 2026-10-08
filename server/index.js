import express from "express"
import { db } from "./firebase.js";



const app = express();
const PORT = 3000;
//middleware
app.use(express.json());

const twilioConfig = () => {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    throw new Error("Twilio Verify is not configured");
  }
  return { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID };
};

async function callTwilioVerify(path, fields) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = twilioConfig();
  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams(fields)
    }
  );
  const data = await response.json();
  if (!response.ok) {
    console.error("Twilio Verify request failed:", data.message || response.statusText);
    throw new Error("Verification service request failed");
  }
  return data;
}

async function isOwnerPhone(phoneNumber) {
  const snapshot = await db.ref("owners/owner_001").get();
  const owner = snapshot.val();
  return Boolean(owner && owner.role === "owner" && owner.phoneNum === phoneNumber);
}


app.get("/", (req, res)=>{
    res.json({message:"Backend connected"})
});

app.post("/api/owner/CreateNewAcessCode", async (req, res) => {
  const phoneNumber = typeof req.body.phoneNumber === "string" ? req.body.phoneNumber.trim() : "";
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    return res.status(400).json({ message: "Enter a valid phone number in international format, such as +13331234567" });
  }

  try {
    if (!(await isOwnerPhone(phoneNumber))) {
      return res.status(401).json({ message: "Unable to send a code for this account" });
    }
    await callTwilioVerify("Verifications", { To: phoneNumber, Channel: "sms" });
    return res.json({ message: "A verification code was sent by SMS" });
  } catch (error) {
    console.error("Could not start owner verification:", error.message);
    return res.status(500).json({ message: "Could not send a verification code" });
  }
});

app.post("/api/owner/VerifyAccessCode", async (req, res) => {
  const phoneNumber = typeof req.body.phoneNumber === "string" ? req.body.phoneNumber.trim() : "";
  const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber) || !/^\d{4,10}$/.test(code)) {
    return res.status(400).json({ message: "Enter a valid phone number and verification code" });
  }

  try {
    if (!(await isOwnerPhone(phoneNumber))) {
      return res.status(401).json({ message: "Unable to verify this account" });
    }
    const result = await callTwilioVerify("VerificationCheck", { To: phoneNumber, Code: code });
    if (result.status !== "approved") {
      return res.status(401).json({ message: "The code is invalid or expired" });
    }
    return res.json({ message: "Phone number verified" });
  } catch (error) {
    console.error("Could not verify owner code:", error.message);
    return res.status(500).json({ message: "Could not verify the code" });
  }
});
app.listen(PORT, ()=>{
    console.log(`Server running at http://localhost:${PORT}`)
})
