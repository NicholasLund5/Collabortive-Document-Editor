//npm run devStart

const io = require("socket.io")(3000, {
    cors: {
        origin: ["http://localhost:8080", "https://admin.socket.io"],
    },
});

const roomMessages = {};

io.on("connection", socket => {
    console.log(`${socket.id} connected`);

    socket.on('edit-message', (message, room) => {
        roomMessages[room] = message;

        socket.to(room).emit('receive-message', message);
    });

    socket.on('join-room', (room, cb) => {
        socket.join(room);

        const currentMessage = roomMessages[room] || "Begin editing...";
        cb(`Joined: ${room}`); 
        socket.emit('receive-message', currentMessage); 
    });
});
