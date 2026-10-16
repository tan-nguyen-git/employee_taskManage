import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { api } from "../api.js";
import TaskCard from "./TaskCard.jsx";
import EmployeeCard from "./EmployeeCard.jsx";
import ChatPanel from "./ChatPanel.jsx";

export default function Dashboard({ user, onLogout, onUserUpdated }) {
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
