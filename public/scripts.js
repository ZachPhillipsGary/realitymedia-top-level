let socket = io()
window.addEventListener("message", messageHandler, false);
if (!window.ALLOWED_DOMAINS) {
  window.ALLOWED_DOMAINS = ["https://localhost:8080"]
}

function messageHandler(event) {

  alert(JSON.stringify(event))

  if (!window.ALLOWED_DOMAINS || !window.ALLOWED_DOMAINS.includes(event.origin)) {
    if (socket) {
      socket.send("ERROR", {
        type: "invalid_origin",
        event,
      });
    }
    return
  }

  const {
    action,
    key,
    value
  } = event.data

  if (action === "save") {
    window.localStorage.setItem(key, JSON.stringify(value))
    if (socket) {
      try {
        socket.emit("save", value)
      } catch (e) {
        alert(e)
      }
    }
  } else if (action === "get") {
    event.source.postMessage({
      action: 'returnData',
      key,
      message: JSON.parse(window.localStorage.getItem(key))
    }, 'https://localhost:3001');
  }
}

window.onload = () => {
  if (socket) {
    socket.on("connection", () => {
      console.log("connected to server");
    });
    const credentials = window.localStorage.getItem("credentials");
    if (credentials) {
      socket.emit("save", credentials);
    }
    socket.on("ERROR", error => alert(error));
  }
}