import express from "express"


const app = express();
const PORT = 3000;
//middleware
app.use(express.json());


app.get("/", (req, res)=>{
    res.json({message:"Backend connected"})
});

app.listen(PORT, ()=>{
    console.log(`Server running at http://localhost:${PORT}`)
})