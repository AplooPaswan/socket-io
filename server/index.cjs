const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Replace with your front-end URL
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: "http://localhost:5173", // Replace with your front-end URL
  methods: ["GET", "POST"]
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const users = [];
const secretKey = 'your_secret_key';

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 8);
  users.push({ username, password: hashedPassword });
  res.sendStatus(201);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.sendStatus(401);
  }
  const token = jwt.sign({ username }, secretKey, { expiresIn: '1h' });
  res.json({ token });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  const imageUrl = `http://localhost:3001/uploads/${req.file.filename}`;
  res.send({ imageUrl });
});

app.get('/', (req, res) => {
  res.send('Real-time Chat Server');
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  jwt.verify(token, secretKey, (err, decoded) => {
    if (err) {
      return next(new Error('Authentication error'));
    }
    socket.username = decoded.username;
    next();
  });
});

const activeUsers = new Set();

io.on('connection', (socket) => {
  console.log(`${socket.username} connected`);
  activeUsers.add(socket.username);
  io.emit('active users', Array.from(activeUsers));

  socket.on('disconnect', () => {
    console.log(`${socket.username} disconnected`);
    activeUsers.delete(socket.username);
    io.emit('active users', Array.from(activeUsers));
  });

  socket.on('private message', ({ content, to, type, timestamp }) => {
    const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === to);
    if (targetSocket) {
      targetSocket.emit('private message', { content, from: socket.username, type, timestamp });
    }
  });

  socket.on('typing', ({ isTyping, to }) => {
    const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === to);
    if (targetSocket) {
      targetSocket.emit('typing', { isTyping, from: socket.username });
    }
  });

  socket.on('read message', ({ from, to }) => {
    const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === from);
    if (targetSocket) {
      targetSocket.emit('read message', { from: to });
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
