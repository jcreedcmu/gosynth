var song_data = "5sbk2l00e0ft8a7g0fjfi1r1w11312511f10300100d10111011c01000000h06000000v00000000o3210b28p2CexaBIqVY0y28p2CewW4GmM8wy6gFzEexaBI6cwNA688ix248wp2fCkRYzj7gFwqpa1AGGGRoNVVQv49M6SSG0wqrrV5TI-hA96hB86GKNPsW-0wo5ceGsGCGFjhWOqBcc30FDNKTOcz8kRJtc3vlltvlll0RlSnLi60RSSRlSmOs2W1Dp-0U31gk2FNBRnMMs8kMdcD0OtlluIpssqny4U3rrl0gddJYzVQPDOcx8OcF0RlSqCJNWmVY30gc3lllllGsq6inBl-6xX7DkpahAp2CLHFwoeGGW-GGG1GHIL-Qc1HJJGHIJAU5Y05eceePZ1M62wE5e-256VxwxwwGGxeoYjgsyq8llgaGEmll1OGE2e1Q854Qb8CwVlkgGGwllgIyq3Ajg4tUtwFGxpdk7aGy5lk2CG5ARgsGG0xpxy99xPCu2GNmpApfwGElGejyqgaX59_ApQwFY2fvE85lkbyGEehd4a9E54Qb8CwVcQ179q62GG5Ajgsyq8lrgaGEmjl1OGE2CvCg422GG5IjgsyqjgWOaE5lkbqGwVlk1UX8XMkjgJyq3Bln5p5k2GG5Ijgsyq0Y1p0twFGxrdk7aGKaOaE5dkbpGwVlk1j74WxbKsPMlmCnKrKNA-2GJPehSsji1nuZyMmNwcwFI3U1tangaGEntlgsyqYaOqE54QboCwVcQ1U1NjG1ll2S9EbCOAjg0FzE4okzihF8Jh6IzihF8IIhx2d96AyO96MzshI8IyhI8QAqib9Ao8yDNYB6CzZF1a9DSC7ln5YllNv5lv2v0YDMgsllNv5lsnNlnMJMgim3RVtunUMY3VAHw-9OC3UBbp-9uHpYBwRunnBYOof9qfNliuf91N5v12P3GGY05cjAwdj0H04g8OczydDqPIgJESdLzcTycz8UzpSITdJEkP89EaYsNRdt5dd5dbB0PeoEWT8Uz8ESIyyzo1NmNhNmhN6hhJp553Isg3bOasHoEUD8EES0snIkslArRulhKpRRzN6TNSrN6hAshIr6hAkkr6NN6hN6hAshIXmrCSQ0000";

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
        startPlayback(getAgenda(data));
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

function stopBeeps() {
  clearInterval(window.agenda_timeout);
  rem.send("halt", {});
}

function render(data) {
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
}

function getAgenda(data) {
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
  return _.sortBy(agenda, function(x) { return x[0]; });
}

function stopPlayback() {

}
function startPlayback(agenda) {
  window.playing = true;
  var beatSamples = 0.075 * 44100;
  var play_head = 0; // samples
  var i = 0; // position in agenda
  var server_time = 0; // samples
  function play_a_bit() {
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
