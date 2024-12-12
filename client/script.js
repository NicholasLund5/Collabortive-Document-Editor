import { io } from "socket.io-client";

const usernameInput = document.getElementById("username-input");
const joinRoomButton = document.getElementById("room-button");
const roomInput = document.getElementById("room-input");
const alertContainer = document.getElementById("alert-container");
const messageContainer = document.getElementById("message-container");
const generateRoomCode = document.getElementById("generate-room-code");
const roomCodeField = document.getElementById("room-code");
const downloadButton = document.getElementById("download-button");


const socket = io("http://localhost:3000");

let currentUserId = "";
let currentUsername = ""; 
let room = ""; 
const roomCode = makeid(); 

// Socket Events

socket.on("connect", () => {
    currentUserId = socket.id;
    joinRoom(roomCode, false);
});

socket.on("receive-message", message => {
    messageContainer.innerHTML = message;
    console.log("Message updated from server:", message);
});

socket.on("update-user-list", (users) => {
    updateUserList(users);
});

// Input handlers

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
});

generateRoomCode.addEventListener("click", () => {
    console.log(roomCode)
    roomCodeField.textContent = roomCode;
});

downloadButton.addEventListener("click", () => {
    const blob = new Blob([messageContainer.innerText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "message.txt"; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});


joinRoomButton.addEventListener("click", () => {
    const newRoom = roomInput.value.trim();
    if (!newRoom) {
        displayAlert("Room name cannot be empty.");
        return;
    }
    room = newRoom;
    joinRoom(room, true);
});

usernameInput.addEventListener("change", () => {
    currentUsername = usernameInput.value.trim() || "Anonymous";
    socket.emit("set-name", currentUsername, room);
});


//Helper Functions

function emitMessageUpdate() {
    const updatedMessage = messageContainer.innerHTML;
    socket.emit("edit-message", updatedMessage, room);
}

function joinRoom(room, joiningRoom) {
    socket.emit("join-room", room, message => {
        if (joiningRoom) {
            displayAlert(message);
        }
        socket.emit("set-name", usernameInput.value.trim() || "Anonymous", room);
    }); 
}

function displayAlert(message) {
    alertContainer.innerHTML = message + "<br>";
}

function updateUserList(users) {
    const userList = document.getElementById("user-list");
    userList.innerHTML = ""; 
    users
        .filter(user => user.id !== currentUserId) 
        .forEach(user => {
            const userItem = document.createElement("li");
            const nameText = document.createTextNode(user.name);
            userItem.appendChild(nameText);
            userList.appendChild(userItem);
        });
        console.log(users.length);
    if (users.length === 1) {
        console.log('here')
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