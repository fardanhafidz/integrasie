import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

// Routes
import authRoutes from './modules/auth/auth.routes';
import intakeRoutes from './modules/intake/intake.routes';
import { qcRouter, pendingQCRouter } from './modules/qc/qc.routes';
import slottingRoutes from './modules/slotting/slotting.routes';
import temperatureRoutes from './modules/temperature/temperature.routes';
import auditRoutes from './modules/audit/audit.routes';
import notificationRoutes from './modules/notification/notification.routes';
import ppicRoutes from './modules/ppic/ppic.routes';

app.use('/api/auth', authRoutes);
app.use('/api/intakes', intakeRoutes);
app.use('/api/qc', qcRouter);
app.use('/api/lots', pendingQCRouter);
app.use('/api/slotting', slottingRoutes);
app.use('/api/temperature', temperatureRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ppic', ppicRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, httpServer, io };
