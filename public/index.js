var replatch = "5sbk1l02e0ftaa7g0hjci0r1w1231f1000d1210c0100h0060v0001o3200b4zhmu1EQlDAi000id5pUCILg4zgielpUlDwi1xkl528y8yclp28FFzxgc0CvdgQPlMINU5U3F33hNCalRVKinGqT7Oiq_1eHEYW7yMBt3MQs2LakwFFWVaq6aC6zp8uQ1FBTpQ3wlenlQetw-0jjWjfCHxPI7o7eQ-5noxTePqD7X66HxPEpg1UiCzE-anxev3y6nyI3n01F3g7Kac-IldHQQmjkSvzg8hiaL6Noz60jFIu6Cu0CfaqLtdfWG3FMcF0Ou4AReY_0efjhYINV5SXFaCGOPLsHJjTBk7rwldbzhiNdjziUCFNIn-ZVTTyxGljzg-4kUOUXzkMXFV-iTGr6koWCNX6AChO5jnPkR9uL2oaoUoq0Q9xNhgb83g6z81A1O8q0V0aacz81A1O0kkkkk0EE3N4d0q0p6hA0O0Q1E3g79xE3g6wdwkM8Ei3yyyxf7zvv9bQz2C9Nlc2hk2F4Q4A2vXmM30sA6hA0OgQV0cDbLOYw5tld7aOacz81w6g30cw6phrgCC0k0dEEEh0yyyyyyyx82brruuIjcDeEXOyyzBAusEEES-oSadz8EEOx8Cjp9Xt556RN6NhIp550-8G00";

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
      data : replatch,
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
                              ugenName: "midi",
                              vel: 10,
                              pitch: note + 36,
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
    }, dt * 50);
  }
}
