var sampleRate = 44100;
var dark = "#444";
var colors = [  "#00f", dark, "red", dark, "yellow", "orange",
                dark, "#0a0", dark, "magenta", dark, "#0ff"];


var names = [  "C", "C#", "D", "Eb", "E", "F",
               "F#", "G", "Ab", "A", "Bb", "B"];

var hues = [  240, 120, 0, 190, 60, 30,
              0, 120, 330, 300, 270, 180];


var lights = [ 0.5, 0.25, 0.5, 0.25, 0.5, 0.5,
               0.25, 0.5, 0.25, 0.5, 0.25, 0.5];

var PIXEL = 1 / devicePixelRatio;
var playIntervalMs = 50;

var fadedColors = _.map(colors, function(color, ix) {
  console.log(ix);
  return tinycolor({h: hues[ix % 12], s: 0.1, l: lights[ix%12] / 2 });
});

var colors = _.map(colors, function(color, ix) {
  console.log(ix);
  return tinycolor({h: hues[ix % 12], s: 0.7, l: lights[ix%12]+0.25 });
});

var state = new Root({
  song: {
    notes: [
    ],
    tempo: 0.2, // duration of a beat in seconds
    beatsPerBar: 32,
  },
  playhead: 0, // in beats
  pitchWindow: {start: 36, len: 36},
});

state.stopPlayback = function() {
  rem.send("halt", {});
  this.val().playing = false;
  this.invalidate();
  render(state);
}

var id_odom = 0;
state.addNote = function(note) {
  note.id = id_odom++;
  this.val().song.notes.push(note);
  this.invalidate();
  render(state);
}

state.setMouseNote = function(mn) {
  this.val().mouseNote = mn;
  this.invalidate();
  render(state);
}

var scale = new Cell(function(get) {
  console.log(state.val());
  var st = get(state);

  var w = 1000;
  var h = 500;
  var LEFT_MARGIN = 30;
  return {
    w: w,
    h: h,
    LEFT_MARGIN: LEFT_MARGIN,
    beat_w: (w - LEFT_MARGIN) / st.song.beatsPerBar,
    pitch_h: h / st.pitchWindow.len,
  };
});

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
    state.stopPlayback();
  });
  $("#play").on("click", function() {
    startPlayback(state);
  });

  $("#c").on("mousedown", canvasMousedown);
  $("#c").on("mousemove", canvasMousemove);

  render_size(state);
  render(state);
}



// playhead in beats
function render_size(state) {
  var sc = scale.val();
  c.width = sc.w * devicePixelRatio;;
  c.height = sc.h * devicePixelRatio;
  c.style.width = sc.w + "px";
  c.style.height = sc.h + "px";
}

function render(state) {
  st = state.val();
  var song = st.song;
  var playhead = st.playhead;
  var c = $("#c")[0];
  var d = c.getContext('2d');

  d.save();
  d.scale(devicePixelRatio, devicePixelRatio);
  var sc = scale.val();
  var w = sc.w, h = sc.h;

  // background
  for (var p = 0; p < st.pitchWindow.len; p++) {
    var pitchClass = (p + st.pitchWindow.start) % 12;
    d.save();
    d.fillStyle = fadedColors[pitchClass];
    d.fillRect(0, Math.floor(h - (p + 1) * sc.pitch_h), w,
               Math.floor(h - (p) * sc.pitch_h) - Math.floor(h - (p + 1) * sc.pitch_h));
    d.fillStyle = "white"
    d.globalAlpha = 0.5
    d.fillText(names[pitchClass], 10, Math.floor(h - (p + 0.35) * sc.pitch_h));
    d.restore();

  }

  // notes
  for (var i = 0; i < song.notes.length; i++) {
    var note = song.notes[i];
    var pitchClass = note.pitch % 12;

    d.fillStyle = colors[pitchClass];
    if (st.playing && playhead >= note.start && playhead <= note.start + note.len + 1)
      d.fillStyle = "yellow";
    var r = noteToRect(sc, st.pitchWindow, note);
    d.fillRect.apply(d, r);
  }

  // grid
  for (var i = 0; i < song.beatsPerBar; i++) {
    var width = i % 8 == 0 ? 5 : i % 4 == 0 ? 3 : i % 2 == 0 ? 2 : 1
    var xpos = Math.floor(sc.LEFT_MARGIN + i * sc.beat_w) + width * PIXEL / 2;
    d.beginPath();
    d.moveTo(xpos,0);
    d.lineTo(xpos, h);
    d.strokeStyle = "black";
    d.lineWidth = width * PIXEL;
    d.stroke();
  }

  // playhead
  if (st.playing && playhead != null) {
    var xpos = Math.floor(sc.LEFT_MARGIN + playhead * sc.beat_w) + PIXEL / 2;
    d.beginPath();
    d.moveTo(xpos,0);
    d.lineTo(xpos, h);
    d.strokeStyle = "white";
    d.lineWidth = PIXEL;
    d.stroke();
  }

  // cursor
  if (st.mouseNote) {
    var m = st.mouseNote;
    d.save();
    d.strokeStyle = "white";
    d.lineWidth = 3 * PIXEL;
    var r = noteToRect(sc, st.pitchWindow, m)
    d.strokeRect.apply(d, r);
    d.restore();
  }
  d.restore();
}

function beatsPerBar(data) {
  return data.parts * data.beats;
}

function getAgenda(data) {
}

// start : samples as measured from start of the song
// len : samples (the start+len interval is closed left, open right)
// offset : number of samples to add to ever event, in practice it's
// going to be a server time of the start of the song
function getEventsInTimeRange(song, start, len, offset) {
  var agenda = [];
  var beatSamples = song.tempo * sampleRate;
  function maybe_add(note) {
    var song_samples = note.time_beats * beatSamples;
    if (song_samples >= start && song_samples < start+len) {
      agenda.push({time: song_samples + offset, cmd: note.cmd});
    }
  };
  song.notes.forEach(function(note) {
    maybe_add({time_beats: note.start,
               cmd: {action: "note",
                     args: {
                       on: true,
                       id: note.id,
                       ugenName: note.inst || "midi",
                       vel: 10,
                       pitch: note.pitch,
                     }}});
    maybe_add({time_beats: note.start + note.len,
               cmd: {action: "note",
                     args: {
                       on: false,
                       id: note.id,
                     }}});
  });
  return _.sortBy(agenda, function(x) { return x[0]; });
}

function startPlayback(state) {
  var st = state.val();
  var beatSamples = st.song.tempo * sampleRate;
  st.playing = true;
  var cur_time; // server samples
  var i = 0; // position in agenda
  var start_time = 0; // server samples

  // we have already scheduled events up to (not including) this many
  // samples from the start of the song
  var watermark = 0;

  // send to the backend all the events we haven't sent yet, up to
  // 10,000 samples from now.
  function play_a_bit() {
    var cmds = getEventsInTimeRange(
      st.song,
      watermark,
      cur_time - start_time + 10000,
      start_time
    );
    watermark = cur_time - start_time + 10000;

    rem.send("schedule", {cmds: cmds}, function(data) {
      cur_time = data.time;
      st.playhead = (cur_time - start_time) / beatSamples;
      render(state);
    })

    setTimeout(function() {
      if (st.playing) play_a_bit();
    }, playIntervalMs);
  }
  rem.send(
    "schedule", {},
    function(data) {
      cur_time = data.time;
      start_time = data.time + 5000; // leave a little gap here to be sure we can start playing on time
      play_a_bit();
    })
}

function canvasMousedown(e) {
  var st = state.val();
  var sc = scale.val();
  var parentOffset = $(this).offset();
  var relX = e.pageX - parentOffset.left;
  var relY = e.pageY - parentOffset.top;
  var mouseNote = {start: xToBeat(sc, relX),
                   len: 1,
                   pitch: yToPitch(sc, st.pitchWindow, relY),
                   inst: "midi",
                  };
  state.addNote(mouseNote);
}

function canvasMousemove(e) {
  var st = state.val();
  var sc = scale.val();
  var parentOffset = $(this).offset();
  var relX = e.pageX - parentOffset.left;
  var relY = e.pageY - parentOffset.top;
  var mouseNote = {start: xToBeat(sc, relX),
                   len: 1,
                   pitch: yToPitch(sc, st.pitchWindow, relY),
                  };
  if (!st.mouseNote ||
      st.mouseNote.start != mouseNote.start ||
      st.mouseNote.pitch != mouseNote.pitch) {
    state.setMouseNote(mouseNote);
  }
}

function yToPitch(scale, pitchWindow, y) {
  return pitchWindow.len + pitchWindow.start - 1 - Math.floor(y / scale.pitch_h);
}

function xToBeat(scale, x) { // probably want to include a scroll term here too
  return Math.floor((x - scale.LEFT_MARGIN) / scale.beat_w);
}

// returns [x, y, w, h] suitable for fillrect or strokerect
function noteToRect(scale, pitchWindow, note) {
  var p = note.pitch - pitchWindow.start;
  return [Math.floor(scale.LEFT_MARGIN + note.start * scale.beat_w),
          Math.floor(scale.h - (p + 1) * scale.pitch_h),
          Math.floor(scale.LEFT_MARGIN + (note.start + note.len) * scale.beat_w) -
          Math.floor(scale.LEFT_MARGIN + note.start * scale.beat_w),
          Math.floor(scale.h - (p) * scale.pitch_h) - Math.floor(scale.h - (p + 1) * scale.pitch_h)];
}
