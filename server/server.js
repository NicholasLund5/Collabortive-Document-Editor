const sqlite3 = require('sqlite3').verbose();

let sql;
const db = new sqlite3.Database('./documents.db', sqlite3.OPEN_READWRITE, (err) => {
  if (err) return console.error(err.message);
});

db.run(`CREATE TABLE IF NOT EXISTS rooms (
    room_id TEXT PRIMARY KEY,
    name TEXT,
    message TEXT
)`);
db.run(`CREATE TABLE IF NOT EXISTS bookmarks (
    user_id TEXT,
    room_id TEXT,
    PRIMARY KEY (user_id, room_id)
)`);
db.run(`CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT
)`);

const { v4: uuidv4 } = require('uuid');
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

const rooms = new Map(); 

io.on("connection", (socket) => {
    socket.data.user_id = null;

    socket.on("signup", (username, password, callback) => {
        const user_id = uuidv4();
        db.run("INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)",
            [user_id, username, password],
            function(err) {
                if (err) {
                    console.error(err);
                    return callback({ success: false, message: "Username already taken." });
                }
                socket.data.user_id = user_id;
                callback({ success: true, user_id });
            }
        );
    });

    socket.on("login", (username, password, callback) => {
        db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, row) => {
            if (err) {
                console.error(err);
                return callback({ success: false, message: "Error occurred." });
            }
            if (row) {
                socket.data.user_id = row.user_id;
    
                db.all(`
                    SELECT bookmarks.room_id, rooms.name
                    FROM bookmarks
                    JOIN rooms ON bookmarks.room_id = rooms.room_id
                    WHERE bookmarks.user_id = ?
                `, [row.user_id], (err, bookmarksRows) => {
                    if (err) {
                        console.error(err);
                        return callback({ success: true, user_id: row.user_id, bookmarks: [] });
                    }
    
                    callback({ success: true, user_id: row.user_id, bookmarks: bookmarksRows });
                });
    
            } else {
                callback({ success: false, message: "Invalid credentials." });
            }
        });
    });
    

    socket.on("set-name", (name, room) => {
        socket.data.username = name; 
        const roomInstance = rooms.get(room);
        if (roomInstance && roomInstance.connectedUsers[socket.id]) {
            roomInstance.connectedUsers[socket.id].name = name;
            updateUserList(room);
        }
    });

    socket.on("join-room", (room, firstRoom, cb) => {
        db.get("SELECT * FROM rooms WHERE room_id = ?", [room], (err, row) => {
            if (err) console.error(err);
    
            if (!firstRoom && !row) {
                socket.emit("failed-to-join");
                return;
            }
    
            let roomInstance;
            if (!row) {
                db.run("INSERT INTO rooms (room_id, name, message) VALUES (?, ?, ?)",
                    [room, "Untitled Document", "Begin editing..."],
                    (err) => { if (err) console.error(err); }
                );
                roomInstance = new Room();
                rooms.set(room, roomInstance);
            } else {
                roomInstance = rooms.get(room) || new Room(row.name, row.message);
                rooms.set(room, roomInstance);
            }
    
            const userName = socket.data.username || "Anonymous";
            roomInstance.addUser(socket.id, userName);
    
            socket.join(room);
            cb(roomInstance.message);
    
            updateUserList(room);
        });
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
            db.run("UPDATE rooms SET message = ? WHERE room_id = ?", [message, room], (err)=> {
                if (err) console.error(err);
            });
            socket.to(room).emit("receive-message", message);
        }
    });

    socket.on("edit-name", (name, room) => {
        const roomInstance = rooms.get(room);
        if (roomInstance) {
            roomInstance.name = name;
            db.run("UPDATE rooms SET name = ? WHERE room_id = ?", [name, room], (err)=> {
                if (err) console.error(err);
            });

            socket.to(room).emit("receive-name", name);

            db.all("SELECT user_id FROM bookmarks WHERE room_id = ?", [room], (err, rows) => {
                if (err) console.error(err);
                if (rows) {
                    rows.forEach((r) => {
                        io.to(r.user_id).emit("update-bookmark-name", { room, name });
                    });
                }
            });
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
        if (!socket.data.user_id) return;
        db.run("DELETE FROM bookmarks WHERE user_id = ? AND room_id = ?", [socket.data.user_id, room], (err) => {
            if (err) console.error(err);
        });
    });

    socket.on("save-room", (RoomId) => {
        if (!socket.data.user_id) return;
        db.run("INSERT OR IGNORE INTO bookmarks (user_id, room_id) VALUES (?,?)", [socket.data.user_id, RoomId], (err)=>{
            if (err) console.error(err);
        });
    });

    socket.on("request-user-list", (users) => {
        updateUserList(users);
    });
    
});

function cleanupRooms() {
    for (const [roomId, roomInstance] of rooms.entries()) {
        if (!roomInstance.hasUsers()) {
            rooms.delete(roomId);
        }
    }
}

function updateUserList(room) {
    const roomInstance = rooms.get(room);
    if (roomInstance) {
        const usersInRoom = Object.entries(roomInstance.connectedUsers)
            .map(([id, user]) => ({ id, name: user.name }));

        // Emit the updated user list to the room
        io.to(room).emit("update-user-list", usersInRoom);
    }
}


setInterval(cleanupRooms, 60000);
