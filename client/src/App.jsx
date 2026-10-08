import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

function SetupAccount({ setup, onDone }) {
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

function Login({ onSignedIn, initialMessage = "" }) {
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

function TaskCard({ task, manager, employees, onStatus, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(task.assignedEmployeeId || "");
  const status = task.status || "assigned";
  const priority = task.priority || "normal";

  async function save(event) {
    event.preventDefault();
    await onEdit(task.id, { title, description, dueDate, assignedEmployeeId });
    setEditing(false);
  }

  return (
    <article className="task-card">
      <div className="task-topline"><span className={`status-pill status-${status}`}>{status.replace("-", " ")}</span><span className={`priority priority-${priority}`}>{priority} priority</span></div>
      {editing ? <form className="stack-form" onSubmit={save}>
        <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label>Description<textarea rows="2" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
        <label>Assign to<select value={assignedEmployeeId} onChange={(event) => setAssignedEmployeeId(event.target.value)}><option value="">Unassigned</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.hasAccount ? "" : " (invited)"}</option>)}</select></label>
        <div className="button-row"><button className="primary-button">Save</button><button type="button" className="plain-button" onClick={() => setEditing(false)}>Cancel</button></div>
      </form> : <>
        <h3>{task.title}</h3>
        {task.description && <p>{task.description}</p>}
        <div className="task-meta"><span>Assigned to <strong>{task.assigneeName || "Unassigned"}</strong></span>{task.dueDate && <span>Due {task.dueDate}</span>}</div>
        <div className="task-actions">
          {manager && <button className="plain-button" onClick={() => setEditing(true)}>Edit</button>}
          {manager && <button className="danger-button" onClick={() => onDelete(task)}>Delete</button>}
          {manager && <select aria-label={`Status for ${task.title}`} value={status} onChange={(event) => onStatus(task.id, event.target.value)}><option value="assigned">Assigned</option><option value="in-progress">In progress</option><option value="done">Done</option></select>}
          {!manager && status !== "done" && <button className="primary-button small-button" onClick={() => onStatus(task.id, "done")}>Mark done</button>}
        </div>
      </>}
    </article>
  );
}

function EmployeeCard({ employee, onEdit, onDelete, onChat }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(employee.name);
  const [email, setEmail] = useState(employee.email);
  const [department, setDepartment] = useState(employee.department);
  const [phoneNumber, setPhoneNumber] = useState(employee.phoneNumber || "");
  const [days, setDays] = useState(employee.schedule?.days || []);
  const [start, setStart] = useState(employee.schedule?.start || "09:00");
  const [end, setEnd] = useState(employee.schedule?.end || "17:00");
  const daysLabel = days.length ? days.join(", ") : "No days set";

  async function save(event) {
    event.preventDefault();
    await onEdit(employee.id, { name, email, department, phoneNumber, schedule: { days, start, end } });
    setEditing(false);
  }

  function toggleDay(day) {
    setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : WEEKDAYS.filter((item) => [...current, day].includes(item)));
  }

  return (
    <article className="employee-card">
      <div className="employee-card-head"><div className="avatar">{employee.name?.charAt(0).toUpperCase()}</div><div><h3>{employee.name}</h3><p>{employee.department} · {employee.accountStatus}</p></div><span className={`account-pill ${employee.hasAccount ? "account-active" : "account-invited"}`}>{employee.hasAccount ? "Active" : "Invited"}</span></div>
      {editing ? <form className="stack-form employee-edit" onSubmit={save}>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Department<input value={department} onChange={(event) => setDepartment(event.target.value)} required /></label>
        <label>Phone<input type="tel" placeholder="+13331234567" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} /></label>
        <fieldset><legend>Work days</legend><div className="day-options">{WEEKDAYS.map((day) => <label key={day}><input type="checkbox" checked={days.includes(day)} onChange={() => toggleDay(day)} />{day}</label>)}</div></fieldset>
        <div className="time-row"><label>Start<input type="time" value={start} onChange={(event) => setStart(event.target.value)} required /></label><label>End<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} required /></label></div>
        <div className="button-row"><button className="primary-button">Save changes</button><button className="plain-button" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
      </form> : <>
        <div className="employee-details"><span>{employee.email}</span><span>{employee.phoneNumber || "No phone added"}</span><span>Schedule: {daysLabel} · {employee.schedule?.start || "—"}–{employee.schedule?.end || "—"}</span></div>
        <div className="button-row"><button className="plain-button" onClick={() => onChat(employee)}>Open chat</button><button className="plain-button" onClick={() => setEditing(true)}>Edit profile / schedule</button><button className="danger-button" onClick={() => onDelete(employee)}>Remove</button></div>
      </>}
    </article>
  );
}

function ChatPanel({ user, employees, selectedEmployee, setSelectedEmployee, socket, messages, setMessages }) {
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

function Dashboard({ user, onLogout, onUserUpdated }) {
  const [section, setSection] = useState("tasks");
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [taskForm, setTaskForm] = useState({ title: "", description: "", assignedEmployeeId: "", dueDate: "", priority: "normal" });
  const [employeeForm, setEmployeeForm] = useState({ name: "", email: "", department: "", phoneNumber: "" });
  const isManager = user.role === "owner";
  const sections = useMemo(() => isManager ? ["tasks", "employees", "chat"] : ["tasks", "chat", "profile"], [isManager]);

  const loadTasks = useCallback(async () => {
    const data = await api("/api/tasks"); setTasks(data.tasks);
  }, []);
  const loadEmployees = useCallback(async () => {
    if (!isManager) return;
    const data = await api("/api/employees"); setEmployees(data.employees);
  }, [isManager]);

  useEffect(() => {
    const clientSocket = io();
    setSocket(clientSocket);
    const refresh = () => { loadTasks().catch(() => {}); };
    const refreshEmployees = () => { loadEmployees().catch(() => {}); refresh(); };
    clientSocket.on("tasks:changed", refresh);
    clientSocket.on("employees:changed", refreshEmployees);
    clientSocket.on("chat:message", (message) => setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]));
    clientSocket.on("chat:closed", () => setNotice("This employee account was removed."));
    return () => clientSocket.close();
  }, [loadTasks, loadEmployees]);

  useEffect(() => {
    loadTasks().catch((requestError) => setError(requestError.message));
    loadEmployees().catch((requestError) => setError(requestError.message));
  }, [loadTasks, loadEmployees]);

  async function updateTask(taskId, updates) {
    try { await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(updates) }); await loadTasks(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function createTask(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/tasks", { method: "POST", body: JSON.stringify(taskForm) });
      setTaskForm({ title: "", description: "", assignedEmployeeId: "", dueDate: "", priority: "normal" });
      await loadTasks(); setNotice("Task created and assigned.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function createEmployee(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const data = await api("/api/employees", { method: "POST", body: JSON.stringify(employeeForm) });
      setEmployeeForm({ name: "", email: "", department: "", phoneNumber: "" });
      await loadEmployees(); setNotice(`Invitation sent. Employee ID: ${data.employeeId}`);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function editEmployee(employeeId, updates) {
    try { await api(`/api/employees/${employeeId}`, { method: "PATCH", body: JSON.stringify(updates) }); await loadEmployees(); setNotice("Employee details updated."); }
    catch (requestError) { setError(requestError.message); }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    try { await api(`/api/tasks/${task.id}`, { method: "DELETE" }); await loadTasks(); setNotice("Task deleted."); }
    catch (requestError) { setError(requestError.message); }
  }

  async function deleteEmployee(employee) {
    if (!window.confirm(`Remove ${employee.name}? Their chat will be deleted and their tasks will become unassigned.`)) return;
    try { await api(`/api/employees/${employee.id}`, { method: "DELETE" }); await loadEmployees(); await loadTasks(); setNotice(`${employee.name} was removed.`); }
    catch (requestError) { setError(requestError.message); }
  }

  async function saveProfile(event) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await api(`/api/employees/${user.uid}`, { method: "PATCH", body: JSON.stringify({ name: form.get("name"), email: form.get("email"), phoneNumber: form.get("phoneNumber") }) });
      onUserUpdated({ ...user, name: data.employee.name, email: data.employee.email, phoneNumber: data.employee.phoneNumber });
      setNotice("Profile saved.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function openChat(employee) { setSelectedEmployee(employee); setSection("chat"); }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-mark">ET</span><span>Taskflow<small>TEAM WORKSPACE</small></span></a>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{sections.map((item) => <button key={item} className={`nav-item ${section === item ? "nav-active" : ""}`} onClick={() => setSection(item)}><span className="nav-symbol">{{ tasks: "▣", employees: "♙", chat: "◉", profile: "◌" }[item]}</span>{item === "tasks" ? "Tasks" : item === "employees" ? "Employees" : item === "chat" ? "Messages" : "My profile"}{item === "tasks" && <span className="nav-count">{tasks.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="signed-user"><span className="avatar small-avatar">{(user.name || "U").charAt(0).toUpperCase()}</span><span><strong>{user.name}</strong><small>{isManager ? "Manager" : "Employee"}</small></span></div><button className="signout-button" onClick={onLogout}>Sign out</button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><span className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span><h1>{section === "tasks" ? "Task board" : section === "employees" ? "People" : section === "chat" ? "Messages" : "My profile"}</h1></div><div className="connection"><span></span>Live updates on</div></header>
      {(error || notice) && <div className={`app-alert ${error ? "alert-error" : "alert-success"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}>×</button></div>}

      {section === "tasks" && <>
        <section className="stats-row"><div className="stat-card"><span>Total tasks</span><strong>{tasks.length}</strong></div><div className="stat-card"><span>In progress</span><strong>{tasks.filter((task) => task.status === "in-progress").length}</strong></div><div className="stat-card"><span>Completed</span><strong>{tasks.filter((task) => task.status === "done").length}</strong></div>{isManager && <div className="stat-card"><span>Team members</span><strong>{employees.length}</strong></div>}</section>
        {isManager && <section className="panel create-panel"><div className="panel-heading"><div><span className="eyebrow">MANAGER TOOL</span><h2>Create a task</h2></div></div>
          <form className="task-create-form" onSubmit={createTask}>
            <label>Task title<input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} required maxLength={140} placeholder="What needs to get done?" /></label>
            <label>Description<textarea rows="2" value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} maxLength={2000} placeholder="Add a few details" /></label>
            <div className="form-grid"><label>Assign to<select value={taskForm.assignedEmployeeId} onChange={(event) => setTaskForm({ ...taskForm, assignedEmployeeId: event.target.value })}><option value="">Unassigned</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.hasAccount ? "" : " (invited)"}</option>)}</select></label><label>Due date<input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm({ ...taskForm, dueDate: event.target.value })} /></label><label>Priority<select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label></div>
            <button className="primary-button" disabled={busy}>Create task</button>
          </form>
        </section>}
        <div className="section-title"><div><span className="eyebrow">WORK OVERVIEW</span><h2>{isManager ? "All team tasks" : "My assigned tasks"}</h2></div><span className="results-count">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</span></div>
        {tasks.length ? <div className="task-grid">{tasks.map((task) => <TaskCard key={task.id} task={task} manager={isManager} employees={employees} onStatus={(id, status) => updateTask(id, { status })} onEdit={updateTask} onDelete={deleteTask} />)}</div> : <div className="empty-panel"><span className="empty-art">✓</span><h3>No tasks here yet</h3><p>{isManager ? "Create a task above and assign it to a teammate." : "Your manager’s assigned work will appear here."}</p></div>}
      </>}

      {section === "employees" && isManager && <>
        <section className="panel create-panel"><div className="panel-heading"><div><span className="eyebrow">TEAM DIRECTORY</span><h2>Invite an employee</h2></div><span className="subtle-note">They’ll get a secure account setup link by email.</span></div>
          <form className="employee-create-form" onSubmit={createEmployee}><label>Full name<input value={employeeForm.name} onChange={(event) => setEmployeeForm({ ...employeeForm, name: event.target.value })} required /></label><label>Work email<input type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })} required /></label><label>Department<input value={employeeForm.department} onChange={(event) => setEmployeeForm({ ...employeeForm, department: event.target.value })} required /></label><label>Phone number<input type="tel" placeholder="+13331234567" value={employeeForm.phoneNumber} onChange={(event) => setEmployeeForm({ ...employeeForm, phoneNumber: event.target.value })} /></label><button className="primary-button" disabled={busy}>Add employee & send invite</button></form>
        </section>
        <div className="section-title"><div><span className="eyebrow">EMPLOYEE LIST</span><h2>Your team</h2></div><span className="results-count">{employees.length} people</span></div>
        {employees.length ? <div className="employee-grid">{employees.map((employee) => <EmployeeCard key={employee.id} employee={employee} onEdit={editEmployee} onDelete={deleteEmployee} onChat={openChat} />)}</div> : <div className="empty-panel"><h3>No employees yet</h3><p>Add a teammate above to send an account setup invitation.</p></div>}
      </>}

      {section === "chat" && <ChatPanel user={user} employees={employees} selectedEmployee={selectedEmployee} setSelectedEmployee={setSelectedEmployee} socket={socket} messages={messages} setMessages={setMessages} />}

      {section === "profile" && !isManager && <section className="panel profile-panel"><span className="eyebrow">YOUR INFORMATION</span><h2>My profile</h2><p className="muted">Update the contact details shown to your manager.</p><form className="stack-form profile-form" onSubmit={saveProfile}><label>Name<input name="name" defaultValue={user.name} required /></label><label>Email<input type="email" name="email" defaultValue={user.email} required /></label><label>Phone number<input name="phoneNumber" type="tel" placeholder="+13331234567" defaultValue={user.phoneNumber} /></label><button className="primary-button" disabled={busy}>Save profile</button></form></section>}
    </main>
  </div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginNotice, setLoginNotice] = useState("");
  const setupParams = new URLSearchParams(window.location.search);
  const setupId = setupParams.get("setup");
  const setupToken = setupParams.get("token");

  useEffect(() => {
    api("/api/me").then((data) => setUser(data.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }

  if (loading) return <main className="loading-screen"><span className="loader"></span><p>Loading your workspace…</p></main>;
  if (setupId && setupToken) return <SetupAccount setup={{ id: setupId, token: setupToken }} onDone={(message) => setLoginNotice(message)} />;
  if (!user) return <Login onSignedIn={setUser} initialMessage={loginNotice} />;
  return <Dashboard user={user} onLogout={logout} onUserUpdated={setUser} />;
}
