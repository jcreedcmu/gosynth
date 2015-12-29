var song_data = "5sbk5l00e0ft7a7g0fj7i0r1w8411f0010d0021c0200h0000v0000o4320b0000018Q5Dwid1pU4zgmu18i4x8Qd3gQcP8h51ki4h8p24zFDN0Mc6CDVlOQNVjhVP91dz4v5lSnsZDO78OBdzPbsTDuFPF1jgO4syDyGq_6nTDkYRFjlWkQYP2tcZa1GwkRY5cuqKTp8Gr7CjOaGX4Q_s3LV6nJYWWWPDepGXtBWCDC9r5eRkQI2cyLL4QuuqQGqKKijFDFgHcYfsmJIO-OIH1Voml9mU7-lCu6JC20HwGsH1RQTSnQxkNkjGBc58hwaCapqC2160pWC2hig4k9yhvqF0wsC1tnp8R4qydN6jONl0E1q2w41hhh0kkkmQkkv7rKKXGxj54-U0" // kin madje (the reasonable)

$(go);

function Remote() {}

Remote.prototype.open = function() {
  var ws = this.ws = new WebSocket("ws://" + window.location.hostname + ":8080/ws");
  ws.onopen = function() {
    console.log("open");
  }
  ws.onclose = function() {
    console.log("closed");
  }
  return this.ws;
}

Remote.prototype.send = function(action, args) {
  var ws = this.ws;
  if (ws == null || ws.readyState == ws.CLOSED) {
    ws = this.open();
    var old = ws.onopen;
    ws.onopen = function() {
      ws.send(JSON.stringify({action: action, args: args}));
      old();
    }
  }
  else {
    ws.send(JSON.stringify({action: action, args: args}));
  }
}

function go() {
  window.rem = new Remote();
  $("#load_but").on("click", function() {
    rem.send("load", {
      name: $("#ugen_name").val(),
      filename: $("#ugen_file").val(),
    });
  });
  $("#unload_but").on("click", function() {
    rem.send("unload", {
      name: $("#ugen_name").val(),
      filename: $("#ugen_file").val(),
    });
  });

  var odom = 100;

  $("#note_on").on("click", function() {
    var id = odom++;
    rem.send("note", {
      on: true,
      id: id,
      ugenName: "midi",
      vel: 10,
      pitch: Math.floor(Math.random() * 48 + 45),
    });
    setTimeout(function() {
      rem.send("note", {
        on: false,
        id: id,
      });
    }, 1000);
  });

  $("#play").on("click", function() {
    $.ajax({
      url : "/parse",
      type: "POST",
      contentType: "text/plain",
      processData: false,
      data: song_data,
      success: function(data, status, req) {
        playBeeps(data);
      },
      error: function (req, status, err) {
        console.log(err);
      }
    });
  });

}

var PAT_WIDTH = 50;
var w_scale = PAT_WIDTH / 32;
var PAT_HEIGHT = 80;
function playBeeps(data) {
  window.data = data;
  //console.log(data);
  var id_odom = 0;
  var agenda = [];

  var c = $("#c")[0];
  var d = c.getContext('2d');
  var w = c.width = 1000;
  var h = c.height = 500;
  d.fillRect(0,0,w,h);
  for (var chan = 0; chan < data.channelBars.length; chan++) {
    var bars = data.channelBars[chan];
    for (var bar = 0; bar < bars.length; bar++) {
      d.fillStyle = "white";
      d.strokeStyle = "blue";
      d.lineWidth = 1;
      d.fillText(bars[bar], bar * PAT_WIDTH + 5, chan * PAT_HEIGHT + 15);
      d.strokeRect(bar * PAT_WIDTH, chan * PAT_HEIGHT, PAT_WIDTH, PAT_HEIGHT);
      if (bars[bar] > 0) {
        d.fillStyle = ["red", "yellow", "green", "blue"][chan];
        data.channelPatterns[chan][bars[bar]-1].tones.forEach(function(tone) {
          tone.notes.forEach(function(note) {
            if (chan != 3) {
              agenda.push([bar * 32 + tone.start,
                           {action: "note",
                            args: {
                              on: true,
                              id: id_odom,
                              ugenName: "lead",
                              vel: 10,
                              pitch: note + 24,
                            }}]);
              agenda.push([bar * 32 + tone.end,
                           {action: "note",
                            args: {
                              on: false,
                              id: id_odom,
                            }}]);
              id_odom++;
            }
            d.fillRect(
              bar * PAT_WIDTH + tone.start * w_scale,
              chan * PAT_HEIGHT + 75 - note,
              (tone.end - tone.start) * w_scale,
              2
            );
          });
        });
      }
    }
  }
  agenda = _.sortBy(agenda, function(x) { return x[0]; });
  play_agenda(agenda, 0);
}

function play_agenda(agenda, ix) {
  var item = agenda[ix];
  var time = item[0];
  var cmd = item[1];
  rem.send(cmd.action, cmd.args);
  if (ix+1 < agenda.length) {
    var dt = agenda[ix+1][0] - time;
    setTimeout(function() {
      play_agenda(agenda, ix+1);
    }, dt * 75);
  }
}
