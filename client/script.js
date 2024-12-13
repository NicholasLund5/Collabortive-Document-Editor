//npm start 
import { io } from "socket.io-client";

const usernameInput = document.getElementById("username-input");
const roomInput = document.getElementById("room-input");

const generateRoomCode = document.getElementById("generate-room-code");
const roomCodeField = document.getElementById("room-code");

const documentField = document.getElementById("document-name");
const messageContainer = document.getElementById("message-container");

const downloadButton = document.getElementById("download-button");
const saveButton = document.getElementById("bookmark-button");
const fileList = document.getElementById("file-list");
const newFile = document.getElementById("new-file");

const themeButton = document.getElementById("theme-button");

const generateUserId = document.getElementById("generate-user-id");
const userIdContainer = document.getElementById("user-id-container");

const loginButton = document.getElementById("login-button");
const idInput = document.getElementById("id-input");

const socket = io("http://localhost:3000");
const roomCode = makeid(); 

let userID = "";
let currentUsername = ""; 
let userRoom = roomCode; 

let savedDocuments = new Set();

// Socket Events
socket.on("connect", () => {
    userID = socket.id;
    joinRoom(roomCode, true);
});


socket.on("failed-to-join", () => {
    alert("Failed to join room. Please enter a valid room code.");
});

socket.on("receive-message", message => {
    messageContainer.innerHTML = message;
});

socket.on("receive-name", name => {
    documentField.innerHTML = name;
});

socket.on("update-user-list", (users) => {
    updateUserList(users);
});

socket.on("remove-cursor", (id) => {
    const cursor = document.getElementById(`cursor-${id}`);
    if (cursor) {
        cursor.remove();
    } 
});

socket.on("cursor-update", ({ id, position, room }) => {
    if (room !== userRoom) return;

    let cursor = document.getElementById(`cursor-${id}`);
    if (!cursor) {
        cursor = document.createElement("span");
        cursor.id = `cursor-${id}`;
        cursor.className = "remote-cursor";
        cursor.style.position = "absolute";
        cursor.style.width = "2px";
        cursor.style.height = "20px";
        cursor.style.backgroundColor = getRandomColor(); 
        document.body.appendChild(cursor);
    }

    const nodes = Array.from(messageContainer.childNodes);
    if (position.nodeIndex >= 0 && position.nodeIndex < nodes.length) {
        const targetNode = nodes[position.nodeIndex];
        const range = document.createRange();
        range.setStart(targetNode, position.start);
        range.setEnd(targetNode, position.start);

        const rect = range.getBoundingClientRect();
        cursor.style.top = `${rect.top + window.scrollY}px`;
        cursor.style.left = `${rect.left + window.scrollX}px`;
    }
});


// Input handlers
generateUserId.addEventListener("click", () => {
    userIdContainer.textContent = userID;
    console.log(`User Id: ${userID}`);
});

documentField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault(); // Prevent the default action of inserting a newline
    }
});

documentField.addEventListener("input", emitNameUpdate);
messageContainer.addEventListener("input", emitMessageUpdate);
messageContainer.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
        event.preventDefault();
        insertNodeAtCaret("\u00A0\u00A0\u00A0\u00A0");
    }
    if (event.key === "Enter") {
        event.preventDefault();
        insertNodeAtCaret("br");
    }
    updateCursor();
});

messageContainer.addEventListener("keyup", () => {
    updateCursor();
});
messageContainer.addEventListener("blur", () => {
    socket.emit("remove-cursor", userRoom);
});
generateRoomCode.addEventListener("click", () => {
    roomCodeField.textContent = userRoom || roomCode;
});

newFile.addEventListener("click", () => {
    socket.emit("leave-room", userRoom); 
    userRoom = makeid();
    joinRoom(userRoom, true);
    
    roomCodeField.textContent = "";
});

downloadButton.addEventListener("click", () => {
    const documentName = documentField.innerText.trim() || "Untitled Document";
    const documentBlob = new Blob([messageContainer.innerText], { type: "text/plain" });
    const url = URL.createObjectURL(documentBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${documentName}.txt`; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

saveButton.addEventListener("click", () => {
    const documentName = documentField.innerText.trim() || "Untitled Document";
    const documentRef = userRoom;
    bookmarkDoc(documentName, documentRef, false)
});

themeButton.addEventListener("click", () => {
    if (document.getElementById("css").getAttribute("href") === "lightmode.css") {
        document.getElementById("css").setAttribute("href", "darkmode.css");
    } else {
        document.getElementById("css").setAttribute("href", "lightmode.css");
    }
});

roomInput.addEventListener("change", () => {
    const newRoom = roomInput.value.trim();
    if (!newRoom) {
        alert("Room name cannot be empty.");
        return;
    }
    userRoom = newRoom;
    joinRoom(userRoom, false);
});

usernameInput.addEventListener("change", () => {
    currentUsername = usernameInput.value.trim() || "Anonymous";
    socket.emit("set-name", currentUsername, userRoom);
});

loginButton.addEventListener("click", () => {
    const id = idInput.value.trim() || socket.id;
    loadSavedDocuments(id);
});

document.querySelector("#name-form").addEventListener("submit", function(event) {
    event.preventDefault();
});
document.querySelector("#room-form").addEventListener("submit", function(event) {
    event.preventDefault();
});



//Helper Functions
function emitNameUpdate() {
    const updatedName = documentField.innerHTML;
    if (savedDocuments.has(userRoom)) {
        bookmarkDoc(updatedName, userRoom, true)
    }
    socket.emit("edit-name", updatedName, userRoom);
}

function emitMessageUpdate() {
    const updatedMessage = messageContainer.innerHTML;
    socket.emit("edit-message", updatedMessage, userRoom);
}


function joinRoom(room, firstRoom) {
    if (!firstRoom && userRoom && userRoom !== room) {
        Array.from(document.querySelectorAll(".remote-cursor")).forEach((cursor) => {
            cursor.remove();
        });

        socket.emit("leave-room", userRoom); 
    } 

    userRoom = room; 

    socket.emit("join-room", room, firstRoom, (message) => {
        messageContainer.innerHTML = message; 
    });
}


function updateUserList(users) {
    const userList = document.getElementById("user-list");
    userList.innerHTML = ""; 
    users
        .filter(user => user.id !== userID) 
        .forEach(user => {
            const userItem = document.createElement("li");
            const nameText = document.createTextNode(user.name);
            userItem.appendChild(nameText);
            userList.appendChild(userItem);
        });
    if (users.length === 1) {
        const userItem = document.createElement("div");
        const nameText = document.createTextNode('No one else, loner!');
        userItem.appendChild(nameText);
        userList.appendChild(userItem);
    }

}

function insertNodeAtCaret(content) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);

    let node;
    if (content === "br") {
        node = document.createElement("br");
    } else {
        node = document.createTextNode(content);
    }

    range.insertNode(node);

    range.setStartAfter(node);
    range.setEndAfter(node);
    selection.removeAllRanges();
    selection.addRange(range);

    emitMessageUpdate();
}

function makeid(length = 16) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
      counter += 1;
    }
    return result;
}

function getRandomColor() {
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

function updateCursor() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const caretPosition = {
        start: range.startOffset,
        end: range.endOffset,
        nodeIndex: Array.from(messageContainer.childNodes).indexOf(range.startContainer),
    };

    socket.emit("cursor-move", caretPosition, userRoom);
}

function loadSavedDocuments(id) {
    socket.emit("get-saved-rooms", id, (savedRooms) => {
        if (!Array.isArray(savedRooms)) {
            console.error("Invalid savedRooms data received:", savedRooms);
            return;
        }

        // Clear the file list
        fileList.innerHTML = "";

        // Populate the file list with saved rooms
        savedRooms.forEach(({ documentName, documentRef }) => {
            const userItem = document.createElement("button");
            userItem.dataset.ref = documentRef;
            userItem.textContent = documentName;

            userItem.addEventListener("click", () => {
                joinRoom(documentRef, false);
            });

            fileList.appendChild(userItem);

            const deleteButton = document.createElement("button");
            deleteButton.textContent = "X";

            deleteButton.addEventListener("click", () => {
                socket.emit("remove-saved", documentRef);
                fileList.removeChild(deleteButton);
                fileList.removeChild(userItem);
            });

            fileList.appendChild(deleteButton);
        });
    });
}

function bookmarkDoc(documentName, documentRef, updateStatus) {
    if (savedDocuments.has(documentRef) && updateStatus === false) {
        alert("Document already bookmarked.");
    } else if (!updateStatus) {
        savedDocuments.add(documentRef);

        const buttonContainer = document.createElement("div");
        buttonContainer.className = "button-container";

        const userItem = document.createElement("button");
        userItem.dataset.ref = documentRef;
        userItem.textContent = documentName;

        userItem.addEventListener("click", () => {
            joinRoom(documentRef, false);
        });

        // Create the delete button
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "X";
        deleteButton.className = "delete-button";

        deleteButton.addEventListener("click", () => {
            socket.emit("remove-saved", documentRef);
            savedDocuments.delete(documentRef);
            socket.emit("remove-file", documentRef);
            fileList.removeChild(buttonContainer);
        });

        buttonContainer.appendChild(userItem);
        buttonContainer.appendChild(deleteButton);

        fileList.appendChild(buttonContainer);

        socket.emit("save-room", documentRef);
    } else {
        const buttonContainer = Array.from(fileList.children).find(
            (child) => child.firstElementChild && child.firstElementChild.dataset.ref === documentRef
        );
        if (buttonContainer) {
            const userItem = buttonContainer.querySelector("button[data-ref]");
            if (userItem) {
                userItem.textContent = documentName;
            }
        }
        socket.emit("save-room", documentRef);
    }
}
