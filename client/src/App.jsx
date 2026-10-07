import {useState} from "react"
import './App.css'

function App() {
  const [phoneNumber, setPhoneNumber] = useState("")
  const [accessCode, setAccessCode] = useState("")

  function handleSendCode(event){
    event.preventDefault();
    console.log("Send code to:", phoneNumber);
  }
  function handleVerifyCode(event) {
    event.preventDefault();
    console.log("Verify:", phoneNumber, accessCode);
  }

  return (
    <main>
      <h1>Owner Login</h1>

      <form onSubmit={handleSendCode}>
        <label htmlFor="phoneNumber">Phone number</label>
        <input
          id="phoneNumber"
          type="tel"
          placeholder="+13331234567"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          required
        />
        <button type="submit">Send Code</button>
      </form>

      <form onSubmit={handleVerifyCode}>
        <label htmlFor="accessCode">Access code</label>
        <input
          id="accessCode"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          required
        />
        <button type="submit">Verify Code</button>
      </form>
    </main>
  );
}

export default App
