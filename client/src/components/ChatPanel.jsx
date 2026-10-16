import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function ChatPanel({ user, employees, selectedEmployee, setSelectedEmployee, socket, messages, setMessages }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const employeeId = user.role === "employee" ? user.uid : selectedEmployee?.id;
  const chatEmployee = user.role === "employee" ? user : selectedEmployee;

  useEffect(() => {
    if (!employeeId) { setMessages([]); return; }
    let current = true;
    api(`/api/chats/${employeeId}/messages`).then((data) => current && setMessages(data.messages)).catch((requestError) => setError(requestError.message));
    socket?.emit("chat:join", employeeId);
    return () => { current = false; };
  }, [employeeId, socket, setMessages]);

  async function send(event) {
    event.preventDefault();
    if (!employeeId || !text.trim()) return;
    setError("");
    try {
      const data = await api(`/api/chats/${employeeId}/messages`, { method: "POST", body: JSON.stringify({ message: text }) });
      setMessages((current) => current.some((message) => message.id === data.message.id) ? current : [...current, data.message]);
      setText("");
    } catch (requestError) { setError(requestError.message); }
  }

  return <section className="panel chat-panel">
    <div className="panel-heading"><div><span className="eyebrow">MESSAGES</span><h2>{chatEmployee ? `Chat with ${user.role === "owner" ? chatEmployee.name : "the manager"}` : "Choose an employee"}</h2></div>
      {user.role === "owner" && <select value={selectedEmployee?.id || ""} onChange={(event) => setSelectedEmployee(employees.find((item) => item.id === event.target.value) || null)}><option value="">Select employee…</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>}
    </div>
    {chatEmployee ? <>
      <div className="message-list">{messages.length ? messages.map((message) => <div key={message.id} className={`message ${message.senderId === user.uid ? "message-mine" : ""}`}><span>{message.senderName}</span><p>{message.text}</p><time>{new Date(message.createdAt).toLocaleString()}</time></div>) : <p className="empty-state">No messages yet. Start the conversation.</p>}</div>
      <form className="message-form" onSubmit={send}><input value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} placeholder="Write a message…" aria-label="Message" /><button className="primary-button">Send</button></form>
    </> : <p className="empty-state">Select a teammate to open your real-time conversation.</p>}
    {error && <p className="error-text">{error}</p>}
  </section>;
}
