const io = require("socket.io")(3000, {
    cors: {
        origin: ["http://localhost:8080", "https://admin.socket.io"],
    },
});

const roomMessages = {};
const connectedUsers = {};

io.on("connection", socket => {
    connectedUsers[socket.id] = { name: "Anonymous", room: null };

    socket.on("set-name", (name, room) => {
        connectedUsers[socket.id] = { name, room };
        const usersInRoom = Object.entries(connectedUsers)
            .filter(([id, user]) => user.room === room)
            .map(([id, user]) => ({ id, name: user.name }));
        io.to(room).emit("update-user-list", usersInRoom);
    });

    socket.on("join-room", (room, cb) => {
        socket.join(room);
        const currentMessage = roomMessages[room] || "Begin editing...";
        connectedUsers[socket.id].room = room; 
        cb(`Joined: ${room}`);
        socket.emit("receive-message", currentMessage);

        const usersInRoom = Object.entries(connectedUsers)
            .filter(([id, user]) => user.room === room)
            .map(([id, user]) => ({ id, name: user.name }));
        io.to(room).emit("update-user-list", usersInRoom);
    });

    socket.on("edit-message", (message, room) => {
        roomMessages[room] = message;
        socket.to(room).emit("receive-message", message);
    });

    socket.on("disconnect", () => {
        const { room } = connectedUsers[socket.id] || {};
        delete connectedUsers[socket.id];
        if (room) {
            const usersInRoom = Object.entries(connectedUsers)
                .filter(([id, user]) => user.room === room)
                .map(([id, user]) => ({ id, name: user.name }));
            io.to(room).emit("update-user-list", usersInRoom);
        }
    });
});
