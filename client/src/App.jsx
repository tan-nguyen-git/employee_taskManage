import { useEffect, useState } from "react";
import { api } from "./api.js";
import SetupAccount from "./components/SetupAccount.jsx";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";
import "./App.css";
//pick which screen to show


export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginNotice, setLoginNotice] = useState("");
  //read the URL and if there set up and token
  const setupParams = new URLSearchParams(window.location.search);
  const setupId = setupParams.get("setup");
  const setupToken = setupParams.get("token");
  //on mount
  //GET api me
  useEffect(() => {
    api("/api/me").then((data) => setUser(data.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }
  //choose which screen to show

  //there will 4 screen
  //loading
  //setup account from email
  //login for manager / employee
  //dash board
  
  if (loading) return <main className="loading-screen"><span className="loader"></span><p>Loading your workspace…</p></main>;
  if (setupId && setupToken) return <SetupAccount setup={{ id: setupId, token: setupToken }} onDone={(message) => setLoginNotice(message)} />;
  if (!user) return <Login onSignedIn={setUser} initialMessage={loginNotice} />;
  return <Dashboard user={user} onLogout={logout} onUserUpdated={setUser} />;
}
