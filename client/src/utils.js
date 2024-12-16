
import { dom } from './domSelectors.js';

import socket from './socket.js';
import { getState, setPseudonym } from './clientstate.js'
import { setRoomCode, updateSavedDocument, setCurrentDocument } from './clientstate.js'
import { addSavedDocument, removeSavedDocument } from './clientstate.js';

export function joinRoom(roomId, document = null) {
    let { pseudonym, username } = getState();

    // Validate pseudonym
    if (typeof pseudonym !== "string" || !pseudonym.trim()) {
        pseudonym = "Anonymous";
        console.warn("Pseudonym is invalid or missing. Using default: Anonymous");
    }

    console.log(`Joining room with roomId: ${roomId}, pseudonym: ${pseudonym}, username: ${username || "None"}`);

    socket.emit('join-room', roomId, pseudonym, username, (response) => {
        console.log("join-room response:", response);
        if (!response || !response.success) {
            alert(response?.message || "Failed to join room. Please enter a valid room code.");
            return;
        }

        // Room exists, set up the document and state
        const { documentId, title, text } = response;
        setRoomCode(roomId);
        dom.roomCodeField.textContent = "";
        updateDocument(documentId, title, text);
    });
}


export function updateDocument(documentId, title, text) {
    // Update the DOM fields
    dom.documentNameField.innerHTML = title;
    dom.documentBodyField.innerHTML = text;

    const { savedDocuments } = getState();

    // Update saved documents if the document is already saved
    if (savedDocuments.has(documentId)) {
        addDocumentToList(documentId, title);
    }

    // Update the current document in clientState
    setCurrentDocument({ documentId, title, text });
}


// this function will be called when the save button is clicked
export function saveDocument(documentId, title, text) {
    alert(`${title} saved, ${documentId}`);
    addDocumentToList(documentId, title);
    const { username } = getState();
    socket.emit('add-saved-document', username, documentId, title, text, (response) => {
        if (response.success) {
            console.log("Document saved successfully!");
        } else {
            console.error(response.message);
        }
    });
}

// this saves a batch of documents
export function loadSavedDocuments(savedDocs) {
    for (const document of savedDocs) {
        const { docID, title } = document; 
        addDocumentToList(docID, title); 
    }
}


export function addDocumentToList(documentId, title) {
    const documentList = document.getElementById("document-list");
    if (!documentList) return;

    // Check if the document already exists in the list
    let documentItem = document.querySelector(`[data-document-id="${documentId}"]`);

    if (!documentItem) {
        // Create a new entry for the document
        const buttonContainer = document.createElement("div");
        buttonContainer.className = "button-container";
        buttonContainer.dataset.documentId = documentId;

        const documentButton = document.createElement("button");
        documentButton.textContent = title;
        documentButton.className = "document-button";
        documentButton.addEventListener("click", () => {
            joinRoom(documentId); // Join the room when clicked
        });

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "X";
        deleteButton.className = "delete-button";
        deleteButton.addEventListener("click", () => {
            removeDocumentFromList(documentId); // Emit delete request
        });

        buttonContainer.appendChild(documentButton);
        buttonContainer.appendChild(deleteButton);
        documentList.appendChild(buttonContainer);
    } else {
        // Update the title if the document already exists
        const documentButton = documentItem.querySelector(".document-button");
        if (documentButton) {
            documentButton.textContent = title;
        }
    }
}


export function insertNodeAtCaret(content) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
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

    const { currentDocument } = getState();
    const { documentId, title, text } = currentDocument;
    socket.emit('send-update-document', currentDocument.documentId, title, text);

};

function removeDocumentFromList(documentId) {
    const documentItem = document.querySelector(`[data-document-id="${documentId}"]`);
    if (documentItem) {
        documentItem.remove(); // Remove the document visually
    }

    // Emit the deletion request
    socket.emit("delete-document", documentId, (response) => {
        if (response.success) {
            console.log(`Document ${documentId} deleted successfully.`);
        } else {
            console.error(`Failed to delete document ${documentId}: ${response.message}`);
        }
    });
}
