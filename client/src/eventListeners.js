import { dom } from './domSelectors.js';
import socket from './socket.js';
import { setUsername, getState, setPseudonym} from './clientstate.js';
import { joinRoom, addDocumentToList } from './utils.js'

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
            e.preventDefault(); 
            
            const pseudonym = dom.pseudonymInput.value.trim() || "Anonymous";
            const { roomCode } = getState();
        
            if (!roomCode) {
                console.error("No roomCode found in state");
                return;
            }
        
            socket.emit("set-pseudonym", pseudonym, roomCode);
        
            setPseudonym(pseudonym);
        });
        
        
        dom.joinRoomButton.addEventListener("click", () => {
            const newRoom = dom.roomInput.value.trim();
            if (!newRoom) {
                alert("Room name cannot be empty.");
                return;
            }
            joinRoom(newRoom);
        });

        dom.documentNameField.addEventListener("input", sendDocumentUpdate);
        dom.documentBodyField.addEventListener("input", sendDocumentUpdate);

        
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
            socket.emit("get-new-room-code", (roomId) => {
                joinRoom(roomId);
            }); 
        });

        dom.downloadButton.addEventListener("click", () => {
            const title = (dom.documentNameField.innerText.trim() || "Untitled Document") + ".txt";
            const content = dom.documentBodyField.innerText;
            const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
            
            const a = Object.assign(document.createElement("a"), {
                href: url,
                download: title,
            });
            
            a.click();
            URL.revokeObjectURL(url);
        });

        dom.saveButton.addEventListener("click", () => {
            const { username, currentDocument } = getState();
            if (!username) {
                alert("You must be logged in to bookmark files.");
                return;
            }
        
            const documentId = currentDocument.documentId;
            const title = dom.documentNameField.innerText.trim() || "Untitled Document";
            const text = dom.documentBodyField.innerText.trim() || "";
                    
            addDocumentToList(documentId, title);
            socket.emit("add-saved-document", username, documentId, title, text);
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
            let content = ""
            if (event.key === "Tab") {
                event.preventDefault();
                content = "\u00A0\u00A0\u00A0\u00A0";
            }
            if (event.key === "Enter") {
                event.preventDefault();
                content = "br";
            }
            if (content) {
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

                sendDocumentUpdate();
            }
        });

        function sendDocumentUpdate() {
            const { currentDocument } = getState();
            const title = dom.documentNameField.innerHTML
            const body = dom.documentBodyField.innerHTML
            socket.emit('send-update-document', currentDocument.documentId, title, body);
        };
    });
}