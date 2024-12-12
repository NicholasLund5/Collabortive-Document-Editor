//npm start

import { io } from "socket.io-client";

const usernameInput = document.getElementById("username-input");
const joinRoomButton = document.getElementById("room-button");
const roomInput = document.getElementById("room-input");
const alertContainer = document.getElementById("alert-container");
const messageContainer = document.getElementById("message-container");
messageContainer.setAttribute("contenteditable", "true");

const socket = io("http://localhost:3000");

let room = "";

socket.on('receive-message', message => {
    messageContainer.innerHTML  = message;
    console.log("Message updated from server:", message);
});

socket.on('connect', () => {
    const username = usernameInput.value.trim() || "Anonymous";
    room = socket.id
    displayAlert(`You connected with id: ${socket.id}`);
    socket.emit('set-name', username);
    socket.emit('start-room', room, message => {
        displayAlert(message); 
    });
});

socket.on("update-user-list", (users) => {
    updateUserList(users);
});

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


function emitMessageUpdate() {
    const updatedMessage = messageContainer.innerHTML; 
    socket.emit('edit-message', updatedMessage, room); 
}

joinRoomButton.addEventListener("click", () => {
    room = roomInput.value.trim(); 
    if (!room) {
        displayAlert("Room name cannot be empty.");
        return;
    }
    socket.emit('join-room', room, message => {
        displayAlert(message); 
    });
});

usernameInput.addEventListener("change", () => {
    const username = usernameInput.value.trim() || "Anonymous";
    socket.emit('set-name', username)
});

function displayAlert(message) {
    alertContainer.innerHTML += message + "<br>";
}


function updateUserList(users) {
    const userList = document.getElementById("user-list");
    userList.innerHTML = "";
    users.forEach(user => {
        const userItem = document.createElement("li");
        const nameText = document.createTextNode(user);
        userItem.appendChild(nameText);
        const lineBreak = document.createElement("br");
        userItem.appendChild(lineBreak);      
        userList.appendChild(userItem);
    });
}

