const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../public')));
app.get('/room/:id', (req, res) => res.sendFile(path.join(__dirname, '../public/room.html')));

// rooms: { roomId: Set<socketId> }
const rooms = {};

io.on('connection', (socket) => {
  socket.on('join-room', (roomId, callback) => {
    if (!rooms[roomId]) rooms[roomId] = new Set();

    // Remove stale sockets
    for (const id of rooms[roomId]) {
      if (!io.sockets.sockets.has(id)) rooms[roomId].delete(id);
    }

    const peers = [...rooms[roomId]];
    rooms[roomId].add(socket.id);
    socket.join(roomId);
    socket.data.roomId = roomId;

    callback({ ok: true, peers });
    socket.to(roomId).emit('peer-joined', { peerId: socket.id });
    console.log(`[${roomId}] ${socket.id} joined (${rooms[roomId].size} total)`);
  });

  // Relay with target routing
  socket.on('offer',         ({ to, offer })      => io.to(to).emit('offer',         { from: socket.id, offer }));
  socket.on('answer',        ({ to, answer })     => io.to(to).emit('answer',        { from: socket.id, answer }));
  socket.on('ice-candidate', ({ to, candidate })  => io.to(to).emit('ice-candidate', { from: socket.id, candidate }));

  // Media state (mute/unmute)
  socket.on('media-state', (state) => {
    if (socket.data.roomId) socket.to(socket.data.roomId).emit('peer-media', { peerId: socket.id, ...state });
  });

  // Chat
  socket.on('chat', ({ text }) => {
    if (!socket.data.roomId || !text?.trim()) return;
    io.to(socket.data.roomId).emit('chat', { from: socket.id, text: text.trim().slice(0, 500), time: Date.now() });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].delete(socket.id);
    if (rooms[roomId].size === 0) delete rooms[roomId];
    else socket.to(roomId).emit('peer-left', { peerId: socket.id });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
