import express from "express";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Messaging server is up and running...');
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

export default app;