var song_data = "5sbk3l00e0ft1a7g0fj7i0r0w5211f1130d1111c1100h0000v0011o3410b000id5pUlDwid18Q4zgid18Q4zgid5pU4hgh528z8ycp278FHyYBwpf1imFd4GOCmhFD-1ceo6CgjiQgpllc7j71FJAugJJd7IzOGqqH86CGKOWgUhOCosmCDPSWWo2KOSW-1FGVFjb0g3jbxc_g9xP0QOaqnocGGC3FzXj9mswXiqfF7BnQSTg5dltBIBMxwbceYXCHKmkRlSmTnM5diqvassrKQO0kNUFj3w6jjA0Pon81AQV0e9gCg39FO0oLtA0Oqsw74Ef81AQV0clKO0pdeg3CSV0cCD8190wMp6i39O0qCopgNV49i3rOqI2PJ9LObqgrujlwv67ihv8wWgrujlwecKAH1AmQwSYCH0Kc6Ay-hni3rOqI_6rilwObqgrujl1QpyTBYiFEwXcORcee9SpeyWKlUzbMyIPWoD3j0AxAzOi79M450cD9i0z81IV8a0peiO0Csw7pOgk0OsDycw6PAwE1JQkpk1tSxVFewd0q6o4pj80"; // himenepit

$(go);

function Remote() {}

Remote.prototype.send = function(action, args, cb) {
  $.ajax({
    url : "http://" + window.location.hostname + ":8080",
    type: "POST",
    contentType: "text/plain",
    dataType: "json",
    data: JSON.stringify({action: action, args: args}),
    success: cb,
    error: function (req, status, err) {
      console.log(err, req.responseText);
    }
  });
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

  $("#stop").on("click", function() {
    stopBeeps();
    window.playing = false;
  });
  $("#play").on("click", function() {
    $.ajax({
      url : "/parse",
      type: "POST",
      contentType: "text/plain",
      processData: false,
      data: song_data,
      success: function(data, status, req) {
        window.parsed_data = data;
        render(data);
        startPlayback(data, getAgenda(data));
      },
      error: function (req, status, err) {
        console.log(err);
      }
    });
  });

}

var PAT_WIDTH = 50;

var PAT_HEIGHT = 80;

function stopBeeps() {
  clearInterval(window.agenda_timeout);
  rem.send("halt", {});
}

// playhead in beats
function render(data, playhead) {
  var w_scale = PAT_WIDTH / beatsPerBar(data);
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
  if (playhead != null) {
    var xpos = playhead * w_scale;
    d.beginPath();
    d.moveTo(xpos,0);
    d.lineTo(xpos, h);
    d.strokeStyle = "white";
    d.lineWidth = 2;
    d.stroke();
  }
}

function beatsPerBar(data) {
  return data.parts * data.beats;
}

function getAgenda(data) {
  var id_odom = 0;
  var agenda = [];

  for (var chan = 0; chan < data.channelBars.length; chan++) {
    var bars = data.channelBars[chan];
    for (var bar = 0; bar < bars.length; bar++) {
      if (bars[bar] > 0) {
        data.channelPatterns[chan][bars[bar]-1].tones.forEach(function(tone) {
          tone.notes.forEach(function(note) {
            if (chan != 3) {
              agenda.push([bar * beatsPerBar(data) + tone.start,
                           {action: "note",
                            args: {
                              on: true,
                              id: id_odom,
                              ugenName: chan == 2 ? "lead" : "midi",
                              vel: 10,
                              pitch: note + 12,
                            }}]);
              agenda.push([bar * beatsPerBar(data) + tone.end,
                           {action: "note",
                            args: {
                              on: false,
                              id: id_odom,
                            }}]);
              id_odom++;
            }
          });
        });
      }
    }
  }
  return _.sortBy(agenda, function(x) { return x[0]; });
}

function stopPlayback() {

}
function startPlayback(songdata, agenda) {
  window.playing = true;
  var beatSamples = 0.15 * 44100;
  var play_head = 0; // samples
  var i = 0; // position in agenda
  var server_time = 0; // samples
  function play_a_bit() {
    render(songdata, (play_head - server_time) / beatSamples );
    var cmds = [];
    for (; i < agenda.length && server_time + agenda[i][0] * beatSamples < play_head + 10000; i++) {
      cmds.push({time: Math.floor(server_time + agenda[i][0] * beatSamples),
                  cmd: agenda[i][1]});
    }
    rem.send("schedule", {cmds: cmds}, function(data) {
      play_head = data.time;
    })
    setTimeout(function() {
      if (window.playing) play_a_bit();
    }, 100);
  }
  rem.send(
    "schedule", {},
    function(data) {
      server_time = data.time + 10000; // leave a little gap here to be sure we can start playing on time
      play_a_bit();
    })
}
