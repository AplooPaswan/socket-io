require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Initialize SQLite3 Database
const db = new sqlite3.Database(':memory:', (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to in-memory SQLite database');
  }
});

db.serialize(() => {
  db.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT)");
  db.run("CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, from_user TEXT, to_user TEXT, content TEXT, type TEXT, timestamp DATETIME, read INTEGER)");
});

// Secret key
const secretKey = process.env.SECRET_KEY || 'your_secret_key';

app.use(cors({
  origin: "http://localhost:5173",
  methods: ["GET", "POST"]
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 8);

  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], function(err) {
    if (err) {
      return res.status(500).json({ error: "User already exists" });
    }
    res.sendStatus(201);
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
    if (err || !row || !bcrypt.compareSync(password, row.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ username }, secretKey, { expiresIn: '1h' });
    res.json({ token });
  });
});

app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  const imageUrl = `http://localhost:3001/uploads/${req.file.filename}`;
  res.send({ imageUrl });
});

app.get('/users', (req, res) => {
  db.all("SELECT username FROM users", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: "Database error" });
    } else {
      res.json(rows.map(row => row.username));
    }
  });
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
const unreadMessages = {};

io.on('connection', (socket) => {
  console.log(`${socket.username} connected`);
  activeUsers.add(socket.username);
  io.emit('active users', Array.from(activeUsers).filter(user => user !== socket.username));
  socket.emit('login message', socket.username);

  socket.on('disconnect', () => {
    console.log(`${socket.username} disconnected`);
    activeUsers.delete(socket.username);
    io.emit('active users', Array.from(activeUsers).filter(user => user !== socket.username));
  });

  socket.on('private message', ({ content, to, type, timestamp }) => {
    const message = {
      from: socket.username,
      to,
      content,
      type,
      timestamp: new Date(timestamp),
      read: false
    };

    db.run("INSERT INTO messages (from_user, to_user, content, type, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)",
      [message.from, message.to, message.content, message.type, message.timestamp.toISOString(), message.read ? 1 : 0], function(err) {
        if (err) {
          console.error(err);
          return;
        }
        const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === to);
        if (targetSocket) {
          targetSocket.emit('private message', message);
        } else {
          if (!unreadMessages[to]) {
            unreadMessages[to] = {};
          }
          if (!unreadMessages[to][socket.username]) {
            unreadMessages[to][socket.username] = 0;
          }
          unreadMessages[to][socket.username]++;
        }
      });
  });

  socket.on('typing', ({ isTyping, to }) => {
    const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === to);
    if (targetSocket) {
      targetSocket.emit('typing', { isTyping, from: socket.username });
    }
  });

  socket.on('read message', ({ from, to }) => {
    db.run("UPDATE messages SET read = 1 WHERE from_user = ? AND to_user = ? AND read = 0", [from, socket.username], function(err) {
      if (err) {
        console.error(err);
        return;
      }
      const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.username === from);
      if (targetSocket) {
        targetSocket.emit('read message', { from: to });
      }
      if (unreadMessages[socket.username] && unreadMessages[socket.username][from]) {
        delete unreadMessages[socket.username][from];
      }
    });
  });

  socket.on('get unread messages', (callback) => {
    callback(unreadMessages[socket.username] || {});
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
