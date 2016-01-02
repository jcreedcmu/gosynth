var colors = [  "#00f", "black", "red", "black", "yellow", "orange",
                "black", "#0a0", "black", "magenta", "black", "#0ff"];
var names = [  "C", "C#", "D", "Eb", "E", "F",
               "F#", "G", "Ab", "A", "Bb", "B"];
var PIXEL = 1 / devicePixelRatio;

var fadedColors = colors.map(function(color) {
  return tinycolor.mix(color, "gray", 80).toHexString();
});

LEFT_MARGIN = 30;

var state = {
  song: {
    notes: [
      {start: 0, len: 5, pitch: 60},
      {start: 5, len: 3, pitch: 59},
      {start: 8, len: 2, pitch: 58},
      {start: 10, len: 0.5, pitch: 57},
      {start: 10.5, len: 0.5, pitch: 56},
    ],
    beatsPerBar: 32,
  },
  playhead: 5, // in beats
  pitchWindow: {start: 48, len: 24},
 }

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

  var adjust = function() {
    rem.send("set_params", {
      res_freq: 10 + 20 * $("#res_freq").val(),
      q: 0.1 + 0.1 * $("#q").val(),
    });
  }
  $("#res_freq").on("input", adjust);
  $("#q").on("input", adjust);

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
    startPlayback(state);
  });

  render(state, 1);
}

var PAT_WIDTH = 50;

var PAT_HEIGHT = 80;

function stopBeeps() {
  clearInterval(window.agenda_timeout);
  rem.send("halt", {});
}

// playhead in beats
function render(state) {
  var song = state.song;
  var playhead = state.playhead;
  var c = $("#c")[0];
  var d = c.getContext('2d');
  var w, h;
  c.width = (w = 1000) * devicePixelRatio;;
  c.height = (h = 500) * devicePixelRatio;
  c.style.width = w + "px";
  c.style.height = h + "px";
  d.save();
  d.scale(devicePixelRatio, devicePixelRatio);

  var h_scale = (w - LEFT_MARGIN) / song.beatsPerBar;
  var v_scale = h / state.pitchWindow.len;

// background
  for (var p = 0; p < state.pitchWindow.len; p++) {
    var pitchClass = (p + state.pitchWindow.start) % 12;
    d.save();
    d.fillStyle = fadedColors[pitchClass];
    d.fillRect(0, Math.floor(h - (p + 1) * v_scale), w,
               Math.floor(h - (p) * v_scale) - Math.floor(h - (p + 1) * v_scale));
    d.fillStyle = "white"
    d.globalAlpha = 0.5
    d.fillText(names[pitchClass], 10, Math.floor(h - (p + 0.35) * v_scale));
    d.restore();

  }

  for (var i = 0; i < song.notes.length; i++) {
    var note = song.notes[i];
    var pitchClass = note.pitch % 12;
    var p = note.pitch - state.pitchWindow.start;

    d.fillStyle = colors[pitchClass];
    d.fillRect(Math.floor(LEFT_MARGIN + note.start * h_scale),
               Math.floor(h - (p + 1) * v_scale),
               Math.floor(LEFT_MARGIN + (note.start + note.len) * h_scale) -
               Math.floor(LEFT_MARGIN + note.start * h_scale),
               Math.floor(h - (p) * v_scale) - Math.floor(h - (p + 1) * v_scale));
  }

  // grid
  for (var i = 0; i < song.beatsPerBar; i++) {
    var width = i % 8 == 0 ? 5 : i % 4 == 0 ? 3 : i % 2 == 0 ? 2 : 1
    var xpos = Math.floor(LEFT_MARGIN + i * h_scale) + width * PIXEL / 2;
    d.beginPath();
    d.moveTo(xpos,0);
    d.lineTo(xpos, h);
    d.strokeStyle = "black";
    d.lineWidth = width * PIXEL;
    d.stroke();
  }

  // d.fillStyle = "white";
  // d.strokeStyle = "blue";
  // d.lineWidth = 1;
  // d.fillText(bars[bar], bar * PAT_WIDTH + 5, chan * PAT_HEIGHT + 15);
  // d.strokeRect(bar * PAT_WIDTH, chan * PAT_HEIGHT, PAT_WIDTH, PAT_HEIGHT);
  // if (bars[bar] > 0) {
  //   d.fillStyle = ["red", "yellow", "green", "blue"][chan];
  //   data.channelPatterns[chan][bars[bar]-1].tones.forEach(function(tone) {
  //     tone.notes.forEach(function(note) {
  //       d.fillRect(
  //         bar * PAT_WIDTH + tone.start * w_scale,
  //         chan * PAT_HEIGHT + 75 - note,
  //         (tone.end - tone.start) * w_scale,
  //         2
  //       );
  //     });
  //   });


  if (playhead != null) {
    var xpos = Math.floor(LEFT_MARGIN + playhead * h_scale) + PIXEL / 2;
    d.beginPath();
    d.moveTo(xpos,0);
    d.lineTo(xpos, h);
    d.strokeStyle = "white";
    d.lineWidth = PIXEL;
    d.stroke();
  }
  d.restore();
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
