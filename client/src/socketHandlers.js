import socket from './socket.js';
import { getState} from './clientstate.js';
import { joinRoom, updateDocument, loadSavedDocuments } from './utils.js';
import { setSocketID } from './clientstate.js';

export function setupSocketHandlers() {
    socket.on("connect", () => {
        setSocketID(socket.id);
        socket.emit("initialize-user", (roomId) => { 
            joinRoom(roomId);
        });
    });

    
    socket.on("receive-update-document", (documentId, title, text) => {
        if (documentId === getState().currentDocument.documentId) {

            updateDocument(documentId, title, text); // Update UI and state
        }
    });
    
    socket.on("pseudonym-updated", ({ socketId, pseudonym }) => {
        alert("pseudonym-updated")
        const userItem = document.querySelector(`[data-socket-id="${socketId}"]`);
        if (userItem) {
            userItem.textContent = pseudonym;
        }
    });

    socket.on("update-user-list", (users) => {
        const userList = document.getElementById("user-list");
        userList.innerHTML = ""; // Clear the current list
    
        const { socketID } = getState(); // Retrieve the client's socket ID
        const otherUsers = users.filter(user => user.socketId !== socketID); // Exclude self
    
        if (otherUsers.length > 0) {
            otherUsers.forEach(user => {
                const userItem = document.createElement("li");
                userItem.textContent = user.pseudonym || "Anonymous";
                userItem.setAttribute("data-socket-id", user.socketId); // Ensure proper tracking
                userList.appendChild(userItem);
            });
        } else {
            const noOneHereMessage = document.createElement("div");
            noOneHereMessage.textContent = "No one else is here...";
            userList.appendChild(noOneHereMessage);
        }
    });
    

    socket.on("load-saved-documents", (documents) => {
        loadSavedDocuments(documents); 
    });

    socket.on("saved-document-title-updated", (documentId, title) => {
        const buttonContainer = document.querySelector(`[data-document-id="${documentId}"]`);
        if (buttonContainer) {
            const documentButton = buttonContainer.querySelector(".document-button");
            if (documentButton) {
                documentButton.textContent = title; // Update the button text
            }
        }
    });
    
    socket.on("document-deleted", (documentId) => {
        const buttonContainer = document.querySelector(`[data-document-id="${documentId}"]`);
        if (buttonContainer) {
            buttonContainer.remove(); // Remove the document from the UI
        }
    });
}
