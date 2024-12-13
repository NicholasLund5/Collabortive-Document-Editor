const sqlite3 = require('sqlite3').verbose();

let sql;
// Connect to DB
const db = new sqlite3.Database('./documents.db', sqlite3.OPEN_READWRITE, (err) => {
  if (err) return console.error(err.message);  
});

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

    hasUsers() {
        return Object.keys(this.connectedUsers).length > 0;
    }
}

class User {
    constructor(id) {
        this.id = id; 
        this.savedFiles = new Set(); 
    }

    saveRoom(roomID) {
        this.savedFiles.add(roomID);
    }

    removeRoom(roomID) {
        this.savedFiles.delete(roomID);
    }

    getSavedRooms() {
        return Array.from(this.savedFiles);
    }
}

const users = new Map(); 
const rooms = new Map(); 
const allSavedRooms = new Map();

io.on("connection", (socket) => {
    const user = new User(socket.id);
    users.set(socket.id, user);

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
            socket.to(room).emit("remove-cursor", socket.id);
        }
    });

    socket.on("remove-saved", (room) => {
        const roomInstance = rooms.get(room);
        if (roomInstance) {
            allSavedRooms.delete(room);
        }
    });

    socket.on("get-saved-rooms", (id, callback) => {
    const user = users.get(id); 
    if (user) {
        const savedRooms = user.getSavedRooms().map((roomId) => {
            const roomInstance = rooms.get(roomId);
            return {
                documentName: roomInstance ? roomInstance.name : "Untitled Document",
                documentRef: roomId,
            };
        });
        callback(savedRooms);
    } else {
        callback([]); 
    }
});

    socket.on("remove-room", (RoomId) => {
        user.removeRoom(RoomId);
    });

    socket.on("save-room", (RoomId) => {
        const roomInstance = rooms.get(RoomId);
        user.saveRoom(RoomId);
        if (roomInstance) {
            allSavedRooms.set(RoomId, roomInstance);
        }
    });
});

function cleanupRooms() {
    for (const [roomId, roomInstance] of rooms.entries()) {
        if (!roomInstance.hasUsers() && !allSavedRooms.has(roomId)) {
            rooms.delete(roomId);
        }
    }
}

function updateUserList(room) {
    const roomInstance = rooms.get(room);
    if (roomInstance) {
        const usersInRoom = Object.entries(roomInstance.connectedUsers).map(([id, user]) => ({ id, name: user.name }));
        io.to(room).emit("update-user-list", usersInRoom);
    }
}

setInterval(cleanupRooms, 60000);
