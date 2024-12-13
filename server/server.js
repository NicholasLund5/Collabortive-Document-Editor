const io = require("socket.io")(3000, {
    cors: {
        origin: ["http://localhost:8080", "https://admin.socket.io"],
    },
});

const roomMessages = {};
const roomNames = {};
const rooms = [];
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

    socket.on("join-room", (room, firstRoom, cb) => {
        if (!firstRoom && !rooms.includes(room)) {
            socket.emit("failed-to-join");
        } else {
        socket.join(room);
        rooms.push(room);
        const currentMessage = roomMessages[room] || "Begin editing...";
        const currentName = roomNames[room] || "Untitled Document";
        connectedUsers[socket.id].room = room; 
        cb(room);
        socket.emit("receive-message", currentMessage);
        socket.emit("receive-name", currentName);
        const usersInRoom = Object.entries(connectedUsers)
            .filter(([id, user]) => user.room === room)
            .map(([id, user]) => ({ id, name: user.name }));
        io.to(room).emit("update-user-list", usersInRoom);
        }
    });

    socket.on("leave-room", (room) => {
        if (connectedUsers[socket.id]?.room === room) {
            socket.leave(room);
            connectedUsers[socket.id].room = null; 
    
            socket.to(room).emit("remove-cursor", socket.id);
    
            const usersInRoom = Object.entries(connectedUsers)
                .filter(([id, user]) => user.room === room)
                .map(([id, user]) => ({ id, name: user.name }));
            io.to(room).emit("update-user-list", usersInRoom);
    
            console.log(`Socket ${socket.id} left room: ${room}`);
        }
    });

    socket.on("edit-message", (message, room) => {
        roomMessages[room] = message;
        socket.to(room).emit("receive-message", message);
    });

    socket.on("edit-name", (message, room) => {
        roomNames[room] = message;
        socket.to(room).emit("receive-name", message);
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

    socket.on("cursor-move", (caretPosition, room) => {
        socket.to(room).emit("cursor-update", { id: socket.id, position: caretPosition, room });
    });
    
});
