$(go);
var reverb = true;

function send(ws, action, args) {
  ws.send(JSON.stringify({action: action, args: args}));
}

function go() {
  var ws = new WebSocket("ws://" + window.location.hostname + ":8080/ws");
  ws.onopen = function() {
    console.log("open");
  }
  ws.onclose = function() {
    console.log("closed");
  }
  $("#load_but").on("click", function() {
    send(ws, "load", {
      name: $("#ugen_name").val(),
      filename: $("#ugen_file").val(),
    });
  });
  $("#unload_but").on("click", function() {
    send(ws, "unload", {
      name: $("#ugen_name").val(),
      filename: $("#ugen_file").val(),
    });
  });

  var odom = 100;

  $("#note_on").on("click", function() {
    var id = odom++;
    send(ws, "note", {
      on: true,
      id: id,
      ugenName: "midi",
      vel: 10,
      pitch: Math.floor(Math.random() * 48 + 45),
    });
    setTimeout(function() {
      send(ws, "note", {
        on: false,
        id: id,
      });
    }, 1000);
  });

}
