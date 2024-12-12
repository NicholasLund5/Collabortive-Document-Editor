//npm run devStart

const io = require("socket.io")(3000, {
    cors: {
        origin: ["http://localhost:8080", "https://admin.socket.io"],
    },
});

const roomMessages = {};
const connectedUsers = {};


io.on("connection", socket => {
    connectedUsers[socket.id] = "Anonymous"

    socket.on("set-name", (name) => {
        connectedUsers[socket.id] = name;
        io.emit("update-user-list", Object.values(connectedUsers));
    });

    socket.on("disconnect", () => {
        delete connectedUsers[socket.id];
        io.emit("update-user-list", Object.values(connectedUsers));
    });

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

    socket.on('start-room', (room, cb) => {
        socket.join(room);
        const currentMessage = roomMessages[room] || "Welcome to room " + room;
        cb(`Started: ${room}`); 
    });
});
