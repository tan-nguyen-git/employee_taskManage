import express from "express"


const app = express();
const PORT = 3000;
//middleware
app.use(express.json());


app.get("/", (req, res)=>{
    res.json({message:"Backend connected"})
});

app.post("/api/owner/CreateNewAcessCode",(req, res)=>{
    const {phoneNumber} = req.body
    if (typeof phoneNumber !== "string" || !phoneNumber.trim()) {
        return res.status(400).json({
        message: "Phone number is required"
        });
    }

  console.log("Received phone number:", phoneNumber);

  res.json({
    message: "Frontend and backend connected"
  });


})
app.listen(PORT, ()=>{
    console.log(`Server running at http://localhost:${PORT}`)
})