import { dom } from './domSelectors.js';
import socket from './socket.js';
import { setUsername, getState, setPseudonym} from './clientstate.js';
import { joinRoom, loadSavedDocuments, saveDocument, insertNodeAtCaret } from './utils.js'

export function setupEventListeners() {
    document.addEventListener("DOMContentLoaded", () => {

        

        dom.loginForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const username = dom.loginUsername.value.trim();
            const password = dom.loginPassword.value.trim();
            socket.emit("login", username, password, (response) => {
                if (response.success) {
                    setUsername(username);
                    alert("Login successful!");
                    if (response.savedDocs && response.savedDocs.length > 0) {
                        loadSavedDocuments(response.savedDocs);
                    }
                } else {
                    alert(response.message);
                }
            });
        });

        dom.signupForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const username = dom.signupUsername.value.trim();
            const password = dom.signupPassword.value.trim();
            socket.emit("signup", username, password, (response) => {
                if (response.success) {
                    alert("Signup successful!");
                } else {
                    alert(response.message);
                }
            });
        });

        dom.pseudonymForm.addEventListener("submit", (e) => {
            e.preventDefault(); // Prevent the form from actually submitting
            
            const pseudonym = dom.pseudonymInput.value.trim() || "Anonymous";
            const { roomCode } = getState();
        
            if (!roomCode) {
                console.error("No roomCode found in state");
                return;
            }
        
            if (!pseudonym) {
                console.error("No pseudonym provided");
                return;
            }
        
            console.log(`Emitting set-pseudonym with pseudonym: ${pseudonym}, roomCode: ${roomCode}`);
            socket.emit("set-pseudonym", pseudonym, roomCode);
        
            setPseudonym(pseudonym); // Update pseudonym in client state
        });
        
        
        dom.joinRoomButton.addEventListener("click", () => {
            const newRoom = dom.roomInput.value.trim();
            if (!newRoom) {
                alert("Room name cannot be empty.");
                return;
            }
            const { roomCode } = getState();
            socket.emit("leave-room", roomCode); 
            joinRoom(newRoom);
        });

        dom.documentNameField.addEventListener("input", () => {
            const { currentDocument } = getState();
            const title = dom.documentNameField.innerHTML
            const body = dom.documentBodyField.innerHTML
            socket.emit('send-update-document', currentDocument.documentId, title, body);
        });

        dom.documentBodyField.addEventListener("input", () => {
            const { currentDocument } = getState();
            const title = dom.documentNameField.innerHTML
            const body = dom.documentBodyField.innerHTML
            socket.emit('send-update-document', currentDocument.documentId, title, body);
        });

        dom.documentNameField.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
            }
        });
        dom.generateRoomCode.addEventListener("click", () => {
            const { roomCode } = getState();
            dom.roomCodeField.textContent = roomCode;
        });

        dom.newDocument.addEventListener("click", () => {
            const { userRoom } = getState();
            socket.emit("leave-room", userRoom); 
            socket.emit("initialize-user", (roomId) => {
                joinRoom(roomId);
            }); 
        });

        dom.downloadButton.addEventListener("click", () => {
            const title = dom.documentNameField.innerText.trim() || "Untitled Document";
            const documentBlob = new Blob([dom.documentBodyField.innerText], { type: "text/plain" });
            const url = URL.createObjectURL(documentBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${title}.txt`; 
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        dom.saveButton.addEventListener("click", () => {
            const { username, userRoom, currentDocument } = getState();
            if (!username) {
                alert("You must be logged in to bookmark files.");
                return;
            }

            const documentId = currentDocument.documentId;
            const title = dom.documentNameField.innerText.trim() || "Untitled Document";
            const text = dom.documentBodyField.innerText.trim() || "Empty Document";
            saveDocument(documentId, title, text);
        });

        dom.themeButton.addEventListener("click", () => {
            const cssLink = document.getElementById("css");
            if (cssLink.getAttribute("href") === "lightmode.css") {
                cssLink.setAttribute("href", "darkmode.css");
            } else {
                cssLink.setAttribute("href", "lightmode.css");
            }
        });

        dom.documentBodyField.addEventListener("keydown", (event) => {
            if (event.key === "Tab") {
                event.preventDefault();
                insertNodeAtCaret("\u00A0\u00A0\u00A0\u00A0");
            }
            if (event.key === "Enter") {
                event.preventDefault();
                insertNodeAtCaret("br");
            }
        });

    });
}