$(go);
var reverb = true;

function go() {
  var ws = new WebSocket("ws://" + window.location.host + "/ws");
  ws.onopen = function() {
    console.log("open");
  }
  ws.onclose = function() {
    console.log("closed");
  }
  $("#master_vol").on("input", function() {
    var vol = 0.15 * ($("#master_vol").val() / 100);
    ws.send(JSON.stringify({action: "master_vol", fparam0: vol}));
  });
  $("#res_freq").on("input", function() {
    var val = $("#res_freq").val() / 100;
    ws.send(JSON.stringify({action: "res_freq", fparam0: 10 + val * 3000}));
  });
  $("#reverb").on("click", function() {
    reverb = !reverb;
    ws.send(JSON.stringify({action: (reverb ? "reverb" : "no_reverb")}));
  });
}
