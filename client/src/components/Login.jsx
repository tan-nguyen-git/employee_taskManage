import { useState } from "react";
import { api } from "../api.js";

//this is for the initial login account


export default function Login({ onSignedIn, initialMessage = "" }) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  
  async function sendCode(event) {
    event.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      const data = await api("/api/owner/CreateNewAccessCode", { method: "POST", body: JSON.stringify({ phoneNumber }) });
      setAccessCode(""); setCodeSent(true); setNotice(data.message);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function verifyCode(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const data = await api("/api/owner/ValidateAccessCode", { method: "POST", body: JSON.stringify({ phoneNumber, accessCode }) });
      onSignedIn(data.user);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function employeeLogin(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const data = await api("/api/auth/employee-login", { method: "POST", body: JSON.stringify({ username, password }) });
      onSignedIn(data.user);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-shell">
      <div className="auth-heading"><span className="eyebrow">TEAM WORKSPACE</span><h1>Employee Task Manager</h1><p>Sign in to see your team’s work and updates.</p></div>
      <div className="login-grid">
        <section className="auth-card">
          <span className="card-icon">M</span><h2>Manager sign in</h2>
          <p className="muted">Get a one-time code by SMS.</p>
          <form onSubmit={sendCode} className="stack-form">
            <label>Phone number<input type="tel" autoComplete="tel" placeholder="+13331234567" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} required /></label>
            <button className="secondary-button" disabled={busy}>{busy ? "Please wait…" : "Send access code"}</button>
          </form>
          <form onSubmit={verifyCode} className="stack-form code-form">
            <label>6-digit access code<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required disabled={!codeSent} /></label>
            <button className="primary-button" disabled={!codeSent || busy}>Verify and sign in</button>
          </form>
        </section>
        <section className="auth-card">
          <span className="card-icon employee-icon">E</span><h2>Employee sign in</h2>
          <p className="muted">Use the username and password you set up from your invitation.</p>
          <form onSubmit={employeeLogin} className="stack-form">
            <label>Username<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="primary-button" disabled={busy}>Sign in</button>
          </form>
        </section>
      </div>
      {(error || notice) && <p className={error ? "toast error-text" : "toast success-text"}>{error || notice}</p>}
    </main>
  );
}
