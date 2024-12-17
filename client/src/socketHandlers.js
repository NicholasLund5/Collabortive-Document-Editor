import socket from './socket.js';
import { getState} from './clientstate.js';
import { joinRoom, addDocumentToList, updateDocument } from './utils.js';

export function setupSocketHandlers() {
    socket.on("connect", () => {
        socket.emit("get-new-room-code", (roomId) => { 
            joinRoom(roomId);
        });
    });
    
    socket.on("receive-update-document", (documentId, title, text) => {
        if (documentId === getState().currentDocument.documentId) {
            updateDocument(documentId, title, text); 
        }
    });
    
    socket.on("update-user-list", (users) => {
        const userList = document.getElementById("user-list");
        userList.innerHTML = ""; 
        const otherUsers = users.filter(user => user.socketId !== socket.id); 
    
        if (otherUsers.length > 0) {
            otherUsers.forEach(user => {
                const userItem = document.createElement("li");
                userItem.textContent = user.pseudonym || "Anonymous";
                userItem.setAttribute("data-socket-id", user.socketId); 
                userList.appendChild(userItem);
            });
        } else {
            const noOneHereMessage = document.createElement("div");
            noOneHereMessage.textContent = "No one else is here...";
            userList.appendChild(noOneHereMessage);
        }
    });
    

    socket.on("load-saved-documents", (documents) => {
        for (const document of documents) {
                const { docID, title } = document; 
                addDocumentToList(docID, title); 
            }
    });

    socket.on("saved-document-title-updated", (documentId, title) => {
        const buttonContainer = document.querySelector(`[data-document-id="${documentId}"]`);
        if (buttonContainer) {
            const documentButton = buttonContainer.querySelector(".document-button");
            if (documentButton) {
                if (title === "<br>") {
                    title = "Untitled Document"
                }
                documentButton.textContent = title; 
            }
        }
    });
}