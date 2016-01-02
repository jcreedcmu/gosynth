var dark = "#444";
var colors = [  "#00f", dark, "red", dark, "yellow", "orange",
                dark, "#0a0", dark, "magenta", dark, "#0ff"];
var names = [  "C", "C#", "D", "Eb", "E", "F",
               "F#", "G", "Ab", "A", "Bb", "B"];
var PIXEL = 1 / devicePixelRatio;

var fadedColors = colors.map(function(color) {
  return tinycolor.mix(color, "#999", 80).toHexString();
});

LEFT_MARGIN = 30;

var state = {
  song: {
    notes: [
      {start: 0, len: 5, pitch: 60},
      {start: 5, len: 3, pitch: 59},
      {start: 8, len: 2, pitch: 58},
      {start: 10, len: 0.5, pitch: 57},
      {start: 10.5, len: 3.5, pitch: 62},
    ],
    beatsPerBar: 32,
  },
  playhead: 0, // in beats
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
    stopPlayback(state);
  });
  $("#play").on("click", function() {
    startPlayback(state);
  });

  render(state);
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

  // notes
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

  // playhead
  if (state.playing && playhead != null) {
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

  data.notes.forEach(function(note) {
    agenda.push([note.start,
                 {action: "note",
                  args: {
                    on: true,
                    id: id_odom,
                    ugenName: "midi",
                    vel: 10,
                    pitch: note.pitch,
                  }}]);
    agenda.push([note.start + note.len,
                 {action: "note",
                  args: {
                    on: false,
                    id: id_odom,
                  }}]);
    id_odom++;
  });
  return _.sortBy(agenda, function(x) { return x[0]; });
}

function stopPlayback(state) {
  rem.send("halt", {});
  state.playing = false;
  render(state);
}

function startPlayback(state) {
  var agenda = getAgenda(state.song)
  state.playing = true;
  var beatSamples = 0.15 * 44100;
  var cur_time;
  var i = 0; // position in agenda
  var start_time = 0; // samples

  function play_a_bit() {
    var cmds = [];
    if (i >= agenda.length) {
      state.playing = false;
      render(state);
      return;
    }
    for (; i < agenda.length && start_time + agenda[i][0] * beatSamples < cur_time + 10000; i++) {
      cmds.push({time: Math.floor(start_time + agenda[i][0] * beatSamples),
                  cmd: agenda[i][1]});
    }
    rem.send("schedule", {cmds: cmds}, function(data) {
      cur_time = data.time;
      state.playhead = (cur_time - start_time) / beatSamples;
      render(state);
    })
    setTimeout(function() {
      if (state.playing) play_a_bit();
    }, 50);
  }
  rem.send(
    "schedule", {},
    function(data) {
      start_time = data.time + 10000; // leave a little gap here to be sure we can start playing on time
      play_a_bit();
    })
}
