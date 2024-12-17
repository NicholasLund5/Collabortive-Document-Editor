const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt'); 
const SALT_ROUNDS = 10; 

const io = require("socket.io")(3000, {
    cors: { origin: ["http://localhost:8080", "https://admin.socket.io"] },
});

// Database setup
const db = new sqlite3.Database('./database.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) return console.error(err.message);
});

db.run(`CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS savedDocs (username TEXT, docID TEXT, PRIMARY KEY (username, docID))`);
db.run(`CREATE TABLE IF NOT EXISTS documents (docID TEXT PRIMARY KEY, title TEXT, content TEXT)`);

// Room structure
class Room {
    constructor(docID, title, content) {
        this.docID = docID;
        this.title = title || "Untitled Document";
        this.content = content || "Begin Typing...";
        this.connectedUsers = {}; 
    }

    addUser(socketId, pseudonym, username = null) {
        this.connectedUsers[socketId] = { pseudonym, username };
    }

    removeUser(socketId) {
        delete this.connectedUsers[socketId];
    }

    hasUsers() {
        return Object.keys(this.connectedUsers).length > 0;
    }
}

const rooms = new Map();
const activeUsers = new Map();

io.on("connection", (socket) => {
    socket.data.username = null;

    socket.on("get-new-room-code", (callback) => {
        const generateRoomId = () => {
            const base64 = Buffer.from(uuidv4().replace(/-/g, ''), 'hex').toString('base64');
            return base64.replace(/[/+=]/g, '').slice(0, 20);
        };
    
        const findUniqueRoomId = (callback) => {
            let roomId = generateRoomId();
            db.get(`SELECT docID FROM documents WHERE docID = ?`, [roomId], (err, row) => {
                if (row || rooms.has(roomId)) {
                    return findUniqueRoomId(callback); 
                }
    
                callback(roomId); 
            });
        };
    
        findUniqueRoomId((roomId) => {
            if (!roomId) {
                return callback(null); 
            }
    
            const room = new Room(roomId); 
            rooms.set(roomId, room); 
            callback(roomId); 
        });
    });
    

    socket.on("create-room", (roomId, callback) => {
        if (rooms.has(roomId)) {
            console.log(`[Server] Room ${roomId} already exists. Returning existing room.`);
            callback(roomId); 
        } else {
            console.log(`[Server] Creating new room with ID: ${roomId}`);
            const room = new Room(roomId);
            rooms.set(roomId, room);
            callback(roomId);
        }
    });

    socket.on("join-room", (roomId, pseudonym, username = null, callback) => {
        db.get(`SELECT * FROM documents WHERE docID = ?`, [roomId], (err, document) => {
            if (err) {
                console.error("Error checking document existence:", err.message);
                return callback({ success: false, message: "Server error. Please try again." });
            }
    
            if (!document && !rooms.has(roomId)) {
                return callback({ success: false, message: "Room does not exist. Please enter a valid room code." });
            } else if (!document) {
                const newTitle = "Untitled Document";
                const newContent = "Begin Typing...";
    
                db.run(
                    `INSERT INTO documents (docID, title, content) VALUES (?, ?, ?)`,
                    [roomId, newTitle, newContent],
                    (err) => {
                        if (err) {
                            console.error("Error creating new document:", err.message);
                            return callback({ success: false, message: "Error creating a new document." });
                        }
    
                        const newRoom = new Room(roomId, newTitle, newContent);
                        newRoom.addUser(socket.id, pseudonym, username);
                        rooms.set(roomId, newRoom);
    
                        callback({
                            success: true,
                            documentId: roomId,
                            title: newTitle,
                            text: newContent,
                        });
    
                        socket.join(roomId);
                        updateUserList(roomId);
                    }
                );
            } else {
                let room = rooms.get(roomId);
                if (!room) {
                    room = new Room(document.docID, document.title, document.content);
                    rooms.set(roomId, room);
                }
                room.addUser(socket.id, pseudonym, username);
    
                callback({
                    success: true,
                    documentId: document.docID,
                    title: document.title,
                    text: document.content,
                });
    
                socket.join(roomId);
                updateUserList(roomId);
            }
        });
    });
    

    socket.on("signup", (username, password, callback) => {
        if (!username || !password) {
            return callback({ success: false, message: "Username and password are required." });
        }

        bcrypt.hash(password, SALT_ROUNDS, (err, hashedPassword) => {
            if (err) {
                console.error("Error hashing password:", err);
                return callback({ success: false, message: "Server error. Please try again." });
            }

            db.run(
                `INSERT INTO users (user_id, username, password) VALUES (?, ?, ?)`,
                [uuidv4(), username, hashedPassword],
                (err) => {
                    if (err) {
                        if (err.message.includes("UNIQUE constraint")) {
                            return callback({ success: false, message: "Username already exists." });
                        }
                        return callback({ success: false, message: "Server error. Please try again." });
                    }
                    callback({ success: true });
                }
            );
        });
    });

    socket.on("login", (username, password, callback) => {
        if (!username || !password) {
            return callback({ success: false, message: "Username and password are required." });
        }
    
        if (activeUsers.has(username)) {
            return callback({ success: false, message: "This account is already logged in." });
        }
    
        db.get(
            `SELECT * FROM users WHERE username = ?`,
            [username],
            (err, user) => {
                if (err) {
                    console.error("Error retrieving user:", err.message);
                    return callback({ success: false, message: "Server error. Please try again." });
                }
    
                if (!user) {
                    return callback({ success: false, message: "Invalid username or password." });
                }
    
                bcrypt.compare(password, user.password, (err, result) => {
                    if (err) {
                        console.error("Error comparing passwords:", err.message);
                        return callback({ success: false, message: "Server error. Please try again." });
                    }
    
                    if (result) {
                        activeUsers.set(username, socket.id); 
                        callback({ success: true });
                        socket.data.username = username;
    
                        db.all(
                            `SELECT d.docID, d.title 
                             FROM savedDocs s 
                             JOIN documents d ON s.docID = d.docID 
                             WHERE s.username = ?`,
                            [username],
                            (err, savedDocs) => {
                                if (err) {
                                    console.error("Error retrieving saved documents:", err.message);
                                    return;
                                }
                                socket.emit("load-saved-documents", savedDocs);
                            }
                        );
                    } else {
                        callback({ success: false, message: "Invalid username or password." });
                    }
                });
            }
        );
    });

    socket.on("delete-document", (documentId) => {
        db.run(
            `DELETE FROM savedDocs WHERE docID = ? AND username = ?`,
            [documentId, socket.data.username],
            (err) => {
                if (err) {
                    console.error("Error deleting saved document association:", err.message);
                }
                db.get(
                    `SELECT COUNT(*) AS count FROM savedDocs WHERE docID = ?`,
                    [documentId],
                    (err, row) => {
                        if (err) {
                            console.error("Error checking remaining document associations:", err.message);
                        }
                        if (row.count === 0) {
                            db.run(
                                `DELETE FROM documents WHERE docID = ?`,
                                [documentId],
                                (err) => {
                                    if (err) {
                                        console.error("Error deleting document:", err.message);
                                    }
                                }
                            );
                        } 
                    }
                );
            }
        );
    });
    
    
    socket.on("add-saved-document", (username, documentId, title, text) => {
        db.run(
            `UPDATE documents SET title = ?, content = ? WHERE docID = ?`,
            [title, text, documentId],
            function (err) {
                if (err) {
                    console.error("Error updating document content:", err.message);
                }    

                db.run(
                    `INSERT OR IGNORE INTO savedDocs (username, docID) VALUES (?, ?)`,
                    [username, documentId],
                    function (err) {
                        if (err) {
                            console.error("Error saving document association:", err.message);
                        }

                        io.to(username).emit("new-document-added", {
                            docID: documentId,
                            title: title,
                            username: username,
                        });
                    }
                );
            }
        );
    });
    
    
    socket.on("send-update-document", (documentId, title, text) => {
        const room = rooms.get(documentId);
        room.title = title || "Untitled Document";
        room.content = text || "Begin Typing...";
    
        db.run(`UPDATE documents SET title = ?, content = ? WHERE docID = ?`, [title, text, documentId], (err) => {
            if (err) {
                console.error("Error updating document in database:", err.message);
            }
        });
    
        socket.to(documentId).emit("receive-update-document", documentId, title, text);
    
        db.all(`SELECT username FROM savedDocs WHERE docID = ?`, [documentId], (err, rows) => {
            if (err) {
                console.error("Error retrieving saved document users:", err.message);
                return;
            }
    
            rows.forEach(({ username }) => {
                const userSocketId = activeUsers.get(username);
                if (userSocketId) {
                    io.to(userSocketId).emit("saved-document-title-updated", documentId, title);
                }
            });
        });
    });
    
    socket.on("set-pseudonym", (pseudonym, roomId) => {
        const room = rooms.get(roomId);
        if (room.connectedUsers[socket.id]) {
            room.connectedUsers[socket.id].pseudonym = pseudonym;
            updateUserList(roomId);
        } 
    });

    
    socket.on("disconnect", () => {
        for (const [docID, room] of rooms.entries()) {
            if (room.connectedUsers[socket.id]) {
                room.removeUser(socket.id); 
                updateUserList(docID); 
    
                if (!room.hasUsers()) {
                    rooms.delete(docID);
                }
            }
        }

        const username = socket.data.username;
        if (username && activeUsers.has(username)) {
            activeUsers.delete(username);
        }
    });
    
    socket.on("leave-room", () => {
        for (const [docID, room] of rooms.entries()) { 
            if (room.connectedUsers[socket.id]) {
                room.removeUser(socket.id); 
                updateUserList(docID); 
    
                if (!room.hasUsers()) {
                    rooms.delete(docID);
                }
            }
        }
    });
});

function updateUserList(roomId) {
    const room = rooms.get(roomId);
    if (room) {
        const users = Object.entries(room.connectedUsers).map(([id, user]) => ({
            socketId: id,
            pseudonym: user.pseudonym || "Anonymous",
            username: user.username,
        }));

        io.to(roomId).emit("update-user-list", users);
    }
}

setInterval(() => {
    db.all(
        `SELECT docID FROM documents WHERE docID NOT IN (SELECT docID FROM savedDocs)`,
        (err, rows) => {
            if (err) {
                console.error("Error retrieving unused documents:", err.message);
                return;
            }

            rows.forEach(({ docID }) => {
                if (!rooms.has(docID)) { 
                    db.run(`DELETE FROM documents WHERE docID = ?`, [docID], (err) => {
                        if (err) {
                            console.error(`Error deleting document ${docID}:`, err.message);
                        } 
                    });
                }
            });
        }
    );
}, 3600000);