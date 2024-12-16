const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt'); // For password hashing
const SALT_ROUNDS = 10; // Define the number of salt rounds for bcrypt

const io = require("socket.io")(3000, {
    cors: { origin: ["http://localhost:8080", "https://admin.socket.io"] },
});

// Database setup
const db = new sqlite3.Database('./documents.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) return console.error(err.message);
});

db.run(`CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
db.run(`CREATE TABLE IF NOT EXISTS savedDocs (username TEXT, docID TEXT PRIMARY KEY)`);
db.run(`CREATE TABLE IF NOT EXISTS documents (docID TEXT PRIMARY KEY, title TEXT, content TEXT)`);



// Room structure
class Room {
    constructor(docID, title, content) {
        this.docID = docID;
        this.title = title || "Untitled Document";
        this.content = content || "";
        this.connectedUsers = {}; // {socketId: {pseudonym, username}}
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

function generateRandomRoomID() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let roomId = '';
    for (let i = 0; i < 10; i++) {
        roomId += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return roomId;
}

function generateUniqueRoomID(callback) {
    const checkRoomExists = (roomId) => {
        if (rooms.has(roomId)) {
            checkRoomExists(generateRandomRoomID());
        } else {
            callback(roomId);
        }
    };

    checkRoomExists(generateRandomRoomID());
}

io.on("connection", (socket) => {

    socket.data.username = null;

    socket.on("initialize-user", (callback) => {
        generateUniqueRoomID((uniqueRoomID) => {
            const room = new Room(uniqueRoomID);
            rooms.set(uniqueRoomID, room);
    
            if (typeof callback === 'function') {
                callback(uniqueRoomID);
            }
        });
    });

    socket.on("delete-document", (documentId, callback) => {
        if (!documentId) {
            console.error("Document ID is missing");
            return callback({ success: false, message: "Document ID is required." });
        }
    
        // Delete the document association for the user
        db.run(`DELETE FROM savedDocs WHERE docID = ? AND username = ?`, [documentId, socket.data.username], (err) => {
            if (err) {
                console.error("Error deleting saved document association:", err.message);
                return callback({ success: false, message: "Failed to delete document association." });
            }
    
            // Check if any users still have this document saved
            db.get(`SELECT COUNT(*) AS count FROM savedDocs WHERE docID = ?`, [documentId], (err, row) => {
                if (err) {
                    console.error("Error checking remaining document associations:", err.message);
                    return callback({ success: false, message: "Failed to check remaining associations." });
                }
    
                if (row.count === 0) {
                    // No associations left, delete the document
                    db.run(`DELETE FROM documents WHERE docID = ?`, [documentId], (err) => {
                        if (err) {
                            console.error("Error deleting document:", err.message);
                            return callback({ success: false, message: "Failed to delete the document." });
                        }
    
                        // Notify all clients
                        io.emit("document-deleted", documentId);
                        callback({ success: true, message: "Document deleted successfully." });
                    });
                } else {
                    console.log(`Document ${documentId} still saved by other users.`);
                    callback({ success: true, message: "Document association removed successfully." });
                }
            });
        });
    });
    
    
    socket.on("join-room", (roomId, pseudonym, username = null, callback) => {
        callback = typeof callback === "function" ? callback : () => {};
    
        console.log(`join-room called with roomId: ${roomId}, pseudonym: ${pseudonym}, username: ${username || "None"}`);
    
        if (!roomId) {
            console.log("Room ID is missing.");
            return callback({ success: false, message: "Room ID is required to join a room." });
        }
    
        // Fetch the room/document from the database
        db.get(`SELECT * FROM documents WHERE docID = ?`, [roomId], (err, document) => {
            if (err) {
                console.error("Error checking document existence:", err.message);
                return callback({ success: false, message: "Server error. Please try again." });
            }
    
            if (!document) {
                console.log(`Room ${roomId} does not exist. Creating a new room.`);
                const newTitle = "Untitled Document";
                const newContent = "";
    
                db.run(
                    `INSERT INTO documents (docID, title, content) VALUES (?, ?, ?)`,
                    [roomId, newTitle, newContent],
                    (err) => {
                        if (err) {
                            console.error("Error creating new document:", err.message);
                            return callback({ success: false, message: "Error creating a new document." });
                        }
    
                        // Create a new room in memory
                        const newRoom = new Room(roomId, newTitle, newContent);
                        newRoom.addUser(socket.id, pseudonym, username);
                        rooms.set(roomId, newRoom);
    
                        console.log(`New room ${roomId} created and joined by ${pseudonym}.`);
                        callback({
                            success: true,
                            documentId: roomId,
                            title: newTitle,
                            text: newContent,
                        });
                    }
                );
            } else {
                // If the room exists, add the user to the in-memory room
                let room = rooms.get(roomId);
                if (!room) {
                    room = new Room(document.docID, document.title, document.content);
                    rooms.set(roomId, room);
                }
                room.addUser(socket.id, pseudonym, username);
    
                console.log(`Socket ${socket.id} joined room ${document.docID}.`);
                callback({
                    success: true,
                    documentId: document.docID,
                    title: document.title,
                    text: document.content,
                });
            }
            socket.join(roomId);
            updateUserList(roomId, socket); 
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
                        console.error("Error inserting user:", err.message);
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
                        activeUsers.set(username, socket.id); // Track logged-in user
                        callback({ success: true });
                        socket.data.username = username;
    
                        // Load saved documents for this user
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

    socket.on("add-saved-document", (username, documentId, title, text, callback) => {
        if (!username || !documentId || !title || !text) {
            console.error("Missing parameters: username, documentId, title, or text");
            return callback({ success: false, message: "All parameters are required." });
        }
    
        // Update both documents and savedDocs tables with the new title
        db.run(
            `UPDATE documents SET title = ?, content = ? WHERE docID = ?`,
            [title, text, documentId],
            (err) => {
                if (err) {
                    console.error("Error updating document content:", err.message);
                    return callback({ success: false, message: "Error updating document content." });
                }

                db.run(
                    `INSERT OR REPLACE INTO savedDocs (username, docID) VALUES (?, ?)`,
                    [username, documentId],
                    (err) => {
                        if (err) {
                            console.error("Error saving document association:", err.message);
                            return callback({ success: false, message: "Error saving document association." });
                        }

                        console.log(`Document ${documentId} successfully saved/updated for user ${username}`);
                        callback({ success: true, message: "Document saved successfully." });
                    }
                );
            }
        );

        io.to(username).emit("new-document-added", { 
            docID: documentId, 
            title: title, 
            username: username 
        });
    });
    
    socket.on("send-update-document", (documentId, title, text) => {
        const room = rooms.get(documentId);
        if (!room) {
            console.error(`Room with documentId ${documentId} not found.`);
            return;
        }
    
        room.title = title;
        room.content = text;
    
        // Update the database
        db.run(`UPDATE documents SET title = ?, content = ? WHERE docID = ?`, [title, text, documentId], (err) => {
            if (err) {
                console.error("Error updating document in database:", err.message);
            }
        });
    
        // Emit to all clients in the room
        socket.to(documentId).emit("receive-update-document", documentId, title, text);
    
        // Notify all users with the document saved
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

        if (!rooms.has(roomId)) {
            console.error(`Room ${roomId} does not exist.`);
            return;
        }
    
        const room = rooms.get(roomId);
        console.log(`Room ${room}`);
        // Update the user's pseudonym in the room
        if (room.connectedUsers[socket.id]) {
            room.connectedUsers[socket.id].pseudonym = pseudonym;
            console.log(`User ${socket.id} updated pseudonym to: ${pseudonym}`);
            
            // Emit updated user list to all clients in the room
            updateUserList(roomId);
        } else {
            console.error(`User ${socket.id} not found in room ${roomId}`);
        }
    });

    socket.on("disconnect", () => {
        for (const [docID, room] of rooms.entries()) {
            if (room.connectedUsers[socket.id]) {
                room.removeUser(socket.id); 
                updateUserList(docID); 
    
                if (!room.hasUsers()) {
                    rooms.delete(docID);
                    console.log(`Room ${docID} deleted as it has no users.`);
                }
            }
        }


        const username = socket.data.username;
        if (username && activeUsers.has(username)) {
            activeUsers.delete(username);
            console.log(`User ${username} disconnected and removed from active users.`);
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

        io.to(roomId).emit("update-user-list", users); // Broadcast user list
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
                if (!rooms.has(docID)) { // Check if the document is not in an active room
                    db.run(`DELETE FROM documents WHERE docID = ?`, [docID], (err) => {
                        if (err) {
                            console.error(`Error deleting document ${docID}:`, err.message);
                        } else {
                            console.log(`Document ${docID} deleted because it is unused.`);
                        }
                    });
                }
            });
        }
    );
}, 3600000); // Run every hour