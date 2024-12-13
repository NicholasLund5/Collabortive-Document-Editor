//npm run devStart
const io = require("socket.io")(3000, {
    cors: {
        origin: ["http://localhost:8080", "https://admin.socket.io"],
    },
});

class Room {
    constructor(name = "Untitled Document", message = "Begin editing...") {
        this.name = name;
        this.message = message;
        this.connectedUsers = {}; 
    }

    addUser(socketId, name = "Anonymous") {
        this.connectedUsers[socketId] = { name };
    }

    removeUser(socketId) {
        delete this.connectedUsers[socketId];
    }

}

const rooms = new Map(); 

io.on("connection", (socket) => {
    socket.on("set-name", (name, room) => {
        const roomInstance = rooms.get(room);
        if (roomInstance) {
            roomInstance.addUser(socket.id, name);
            updateUserList(room);
        }
    });

    socket.on("join-room", (room, firstRoom, cb) => {
        if (!firstRoom && !rooms.has(room)) {
            socket.emit("failed-to-join");
        } else {
            if (!rooms.has(room)) {
                rooms.set(room, new Room());
            }

            socket.join(room);
            const roomInstance = rooms.get(room);
            roomInstance.addUser(socket.id);

            cb(room);
            socket.emit("receive-message", roomInstance.message);
            socket.emit("receive-name", roomInstance.name);
            updateUserList(room);
        }
    });

    socket.on("leave-room", (room) => {
        const roomInstance = rooms.get(room);
        if (roomInstance) {
            roomInstance.removeUser(socket.id);
            socket.leave(room);
            socket.to(room).emit("remove-cursor", socket.id); 
            updateUserList(room);
        }
    });
    
    socket.on("disconnect", () => {
        for (const [roomId, roomInstance] of rooms.entries()) {
            if (roomInstance.connectedUsers[socket.id]) {
                roomInstance.removeUser(socket.id);
                socket.to(roomId).emit("remove-cursor", socket.id); 
                updateUserList(roomId);
                break;
            }
        }
    });

    socket.on("edit-message", (message, room) => {
        const roomInstance = rooms.get(room);
        if (roomInstance) {
            roomInstance.message = message;
            socket.to(room).emit("receive-message", message);
        }
    });

    socket.on("edit-name", (name, room) => {
        const roomInstance = rooms.get(room);
        if (roomInstance) {
            roomInstance.name = name;
            socket.to(room).emit("receive-name", name);
        }
    });

    socket.on("cursor-move", (caretPosition, room) => {
        socket.to(room).emit("cursor-update", { id: socket.id, position: caretPosition, room });
    });

    socket.on("remove-cursor", (room) => {
        const roomInstance = rooms.get(room);
        if (roomInstance && roomInstance.connectedUsers[socket.id]) {
            socket.to(room).emit("remove-cursor", socket.id); // Notify others to remove the cursor
        }
    });
    
});

function updateUserList(room) {
    const roomInstance = rooms.get(room);
    if (roomInstance) {
        const usersInRoom = Object.entries(roomInstance.connectedUsers).map(([id, user]) => ({ id, name: user.name }));
        io.to(room).emit("update-user-list", usersInRoom);
    }
}
