import express from "express";

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Messaging server is up and running...');
});

export default app;