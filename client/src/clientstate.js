const clientState = {
    roomCode : "",
    socketID : "",
    pseudonym : "Anonymous",
    savedDocuments : new Set(), // {documentId, title}
    currentDocument : {documentId : "", title : "Untitled Document", text : "Begin typing..."}, 
    username : "",
};

export function setSocketID(id) {
    clientState.socketID = id;
}

export function setRoomCode(code) {
    clientState.roomCode = code;
}

export function setPseudonym(name) {
    clientState.pseudonym = name;
}

export function addSavedDocument(document) {
    clientState.savedDocuments.add(document);
}

export function removeSavedDocument(document) {
    clientState.savedDocuments.delete(document);
}

export function updateSavedDocument(document) {
    clientState.savedDocuments.delete(document);
    clientState.savedDocuments.add(document);
}

export function setCurrentDocument(document) {
    clientState.currentDocument = document;
}

export function setUsername(username) {
    clientState.username = username;
}

export function getState() {
    return clientState;
}