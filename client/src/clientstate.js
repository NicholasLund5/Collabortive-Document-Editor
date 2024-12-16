const clientState = {
    roomCode : "",
    pseudonym : "Anonymous",
    currentDocument : {documentId : "", title : "Untitled Document", text : "Begin typing..."}, 
    username : "",
};

export function setRoomCode(code) {
    clientState.roomCode = code;
}

export function setPseudonym(name) {
    clientState.pseudonym = name;
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