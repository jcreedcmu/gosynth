$(go);

function go() {
  var ws = new WebSocket("ws://" + window.location.host + "/ws");
  console.log("Hi");
  $("#master_vol").on("input", function() {
    var vol = 0.15 * ($("#master_vol").val() / 100);
    ws.send(JSON.stringify({action: "master_vol", fparam0: vol}));
  });
}
