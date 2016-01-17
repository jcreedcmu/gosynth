Math.fmod = function (a,b) { return a - (Math.floor(a / b) * b); };

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
  return tinycolor({h: hues[ix % 12], s: 0.1, l: lights[ix%12] / 2 });
});

var colors = _.map(colors, function(color, ix) {
  return tinycolor({h: hues[ix % 12], s: 0.7, l: lights[ix%12]+0.25 });
});

var pachelbel = [{"start":0,"len":1,"pitch":48,"inst":"lead","id":7},{"start":3,"len":1,"pitch":48,"inst":"lead","id":8},{"start":4,"len":1,"pitch":43,"inst":"lead","id":9},{"start":7,"len":1,"pitch":43,"inst":"lead","id":10},{"start":8,"len":1,"pitch":45,"inst":"lead","id":11},{"start":11,"len":1,"pitch":45,"inst":"lead","id":12},{"start":12,"len":1,"pitch":40,"inst":"lead","id":14},{"start":15,"len":1,"pitch":40,"inst":"lead","id":15},{"start":16,"len":1,"pitch":41,"inst":"lead","id":16},{"start":19,"len":1,"pitch":41,"inst":"lead","id":17},{"start":20,"len":1,"pitch":36,"inst":"lead","id":18},{"start":23,"len":1,"pitch":36,"inst":"lead","id":19},{"start":24,"len":1,"pitch":41,"inst":"lead","id":20},{"start":27,"len":1,"pitch":41,"inst":"lead","id":21},{"start":28,"len":1,"pitch":43,"inst":"lead","id":22},{"start":31,"len":1,"pitch":43,"inst":"lead","id":23},{"start":1,"len":1,"pitch":60,"inst":"lead","id":0},{"start":2,"len":1,"pitch":64,"inst":"lead","id":1},{"start":2,"len":1,"pitch":67,"inst":"lead","id":3},{"start":5,"len":1,"pitch":55,"inst":"lead","id":4},{"start":6,"len":1,"pitch":59,"inst":"lead","id":5},{"start":6,"len":1,"pitch":62,"inst":"lead","id":6},{"start":9,"len":1,"pitch":57,"inst":"lead","id":7},{"start":10,"len":1,"pitch":60,"inst":"lead","id":8},{"start":10,"len":1,"pitch":64,"inst":"lead","id":9},{"start":13,"len":1,"pitch":52,"inst":"lead","id":10},{"start":14,"len":1,"pitch":55,"inst":"lead","id":11},{"start":14,"len":1,"pitch":59,"inst":"lead","id":12},{"start":17,"len":1,"pitch":53,"inst":"lead","id":13},{"start":18,"len":1,"pitch":57,"inst":"lead","id":14},{"start":18,"len":1,"pitch":60,"inst":"lead","id":15},{"start":21,"len":1,"pitch":48,"inst":"lead","id":16},{"start":22,"len":1,"pitch":52,"inst":"lead","id":17},{"start":22,"len":1,"pitch":55,"inst":"lead","id":18},{"start":25,"len":1,"pitch":53,"inst":"lead","id":19},{"start":26,"len":1,"pitch":57,"inst":"lead","id":20},{"start":26,"len":1,"pitch":60,"inst":"lead","id":21},{"start":29,"len":1,"pitch":55,"inst":"lead","id":22},{"start":30,"len":1,"pitch":59,"inst":"lead","id":23},{"start":30,"len":1,"pitch":62,"inst":"lead","id":24}];

var state = new Root({
  song: {
    notes: sanitize_ids(pachelbel),
    tempo: 0.3, // duration of a beat in seconds
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
function sanitize_ids(notes) {
  id_odom = 0;
  for (var i = 0; i < notes.length; i++) {
    console.log(id_odom);
    notes[i].id = id_odom++;
  }
  return notes;
}

state.addNote = function(note) {
  note.id = id_odom++;
  this.val().song.notes.push(note);
  this.invalidate();
  render(state);
}

state.toggleNote = function(note) {
  var song = this.val().song;
  var existing = _.find(song.notes, function(x) {
    return x.start == note.start && x.pitch == note.pitch });
  if (existing) {
    song.notes = _.without(song.notes, existing);
    this.invalidate();
    render(state);
  }
  else {
    this.addNote(note);
  }
}

state.setMouseNote = function(mn) {
  this.val().mouseNote = mn;
  this.invalidate();
  render(state);
}

var scale = new Cell(function(get) {
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
      ugenName: "lead",
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
      var item = {time: song_samples + offset, cmd: note.cmd};
      agenda.push(item);
    }
  };
  function add_loop(at) {
    song.notes.forEach(function(note) {
      maybe_add({time_beats: at + note.start,
                 cmd: {action: "note",
                       args: {
                         on: true,
                         id: note.id,
                         ugenName: note.inst || "lead2",
                         vel: 10,
                         pitch: note.pitch,
                       }}});
      maybe_add({time_beats: at + note.start + note.len,
                 cmd: {action: "note",
                       args: {
                         on: false,
                         id: note.id,
                       }}});
    });
  }

  // We're going to render to loop iterations to make sure we cover
  // the query interval. This should be pretty robust as long as the
  // query interval is much smaller than one loop iteration.

  // The beginning of the earlier of the two iterations we render:
  var beat_pos = start / (sampleRate * song.tempo);
  var earlier = (Math.round(beat_pos / song.beatsPerBar) - 1) * song.beatsPerBar;
  add_loop(earlier);
  add_loop(earlier + song.beatsPerBar);
  return agenda;
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
      cur_time - start_time - watermark + 10000,
      start_time
    );
    watermark = cur_time - start_time + 10000;

    rem.send("schedule", {cmds: cmds}, function(data) {
      cur_time = data.time;
      st.playhead = Math.fmod((cur_time - start_time) / beatSamples, st.song.beatsPerBar);
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
                   inst: "lead",
                  };
  state.toggleNote(mouseNote);
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
