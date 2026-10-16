import { useState } from "react";
import { api } from "../api.js";

//use useState
export default function SetupAccount({ setup, onDone }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) return setError("Passwords do not match");
    setBusy(true);
    try {
      const data = await api("/api/auth/employee-setup", {
        method: "POST",
        body: JSON.stringify({ employeeId: setup.id, token: setup.token, username, password })
      });
      window.history.replaceState({}, "", window.location.pathname);
      onDone(data.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="eyebrow">EMPLOYEE ACCOUNT</span>
        <h1>Set up your login</h1>
        <p className="muted">Choose a username and a password with at least 10 characters.</p>
        <form onSubmit={submit} className="stack-form">
          <label>Username<input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Password<input required type="password" minLength={10} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label>Confirm password<input required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          {error && <p className="error-text">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? "Setting up…" : "Create account"}</button>
        </form>
      </section>
    </main>
  );
}
