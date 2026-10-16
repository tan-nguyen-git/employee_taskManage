import { useState } from "react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function EmployeeCard({ employee, onEdit, onDelete, onChat }) {
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
