import { useState } from "react";

export default function TaskCard({ task, manager, employees, onStatus, onEdit, onDelete }) {
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
