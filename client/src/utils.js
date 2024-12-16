import { dom } from './domSelectors.js';
import socket from './socket.js';
import { getState } from './clientstate.js'
import { setRoomCode, setCurrentDocument } from './clientstate.js'

export function joinRoom(roomId) {
    let { pseudonym, username, roomCode } = getState();
    if (roomCode) {
        socket.emit('leave-room');
    }

    socket.emit('join-room', roomId, pseudonym, username, (response) => {
        if (!response || !response.success) {
            alert(response?.message || "Failed to join room. Please enter a valid room code.");
            return;
        }

        const { documentId, title, text } = response;
        setRoomCode(roomId);
        dom.roomCodeField.textContent = "";
        updateDocument(documentId, title, text);
    });

}
export function updateDocument(documentId, title, text) {
    dom.documentNameField.innerHTML = title;
    dom.documentBodyField.innerHTML = text;

    setCurrentDocument({ documentId, title, text });
}

export function addDocumentToList(documentId, title) {
    const documentList = document.getElementById("document-list");
    if (!documentList) return;

    let documentItem = document.querySelector(`[data-document-id="${documentId}"]`);

    if (!documentItem) {
        const buttonContainer = document.createElement("div");
        buttonContainer.className = "button-container";
        buttonContainer.dataset.documentId = documentId;

        const documentButton = document.createElement("button");
        documentButton.textContent = title;
        documentButton.className = "document-button";
        documentButton.addEventListener("click", () => {
            socket.emit("create-room", documentId, (documentId) => {
                joinRoom(documentId); 
            });
        });

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "X";
        deleteButton.className = "delete-button";
        deleteButton.addEventListener("click", () => {
            const documentItem = document.querySelector(`[data-document-id="${documentId}"]`);
            if (documentItem) {
                documentItem.remove(); 
            }
            socket.emit("delete-document", documentId);
        });

        buttonContainer.appendChild(documentButton);
        buttonContainer.appendChild(deleteButton);
        documentList.appendChild(buttonContainer);
    } else {
        const documentButton = documentItem.querySelector(".document-button");
        if (documentButton) {
            documentButton.textContent = title;
        }
    }
}