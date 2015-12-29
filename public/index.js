var replatch = "5sbk1l02e0ftaa7g0hjci0r1w1231f1000d1210c0100h0060v0001o3200b4zhmu1EQlDAi000id5pUCILg4zgielpUlDwi1xkl528y8yclp28FFzxgc0CvdgQPlMINU5U3F33hNCalRVKinGqT7Oiq_1eHEYW7yMBt3MQs2LakwFFWVaq6aC6zp8uQ1FBTpQ3wlenlQetw-0jjWjfCHxPI7o7eQ-5noxTePqD7X66HxPEpg1UiCzE-anxev3y6nyI3n01F3g7Kac-IldHQQmjkSvzg8hiaL6Noz60jFIu6Cu0CfaqLtdfWG3FMcF0Ou4AReY_0efjhYINV5SXFaCGOPLsHJjTBk7rwldbzhiNdjziUCFNIn-ZVTTyxGljzg-4kUOUXzkMXFV-iTGr6koWCNX6AChO5jnPkR9uL2oaoUoq0Q9xNhgb83g6z81A1O8q0V0aacz81A1O0kkkkk0EE3N4d0q0p6hA0O0Q1E3g79xE3g6wdwkM8Ei3yyyxf7zvv9bQz2C9Nlc2hk2F4Q4A2vXmM30sA6hA0OgQV0cDbLOYw5tld7aOacz81w6g30cw6phrgCC0k0dEEEh0yyyyyyyx82brruuIjcDeEXOyyzBAusEEES-oSadz8EEOx8Cjp9Xt556RN6NhIp550-8G00";

$(go);

function send(ws, action, args) {
  ws.send(JSON.stringify({action: action, args: args}));
}

function go() {
  var ws = new WebSocket("ws://" + window.location.hostname + ":8080/ws");
  ws.onopen = function() {
    console.log("open");
  }
  ws.onclose = function() {
    console.log("closed");
  }
  $("#load_but").on("click", function() {
    send(ws, "load", {
      name: $("#ugen_name").val(),
      filename: $("#ugen_file").val(),
    });
  });
  $("#unload_but").on("click", function() {
    send(ws, "unload", {
      name: $("#ugen_name").val(),
      filename: $("#ugen_file").val(),
    });
  });

  var odom = 100;

  $("#note_on").on("click", function() {
    var id = odom++;
    send(ws, "note", {
      on: true,
      id: id,
      ugenName: "midi",
      vel: 10,
      pitch: Math.floor(Math.random() * 48 + 45),
    });
    setTimeout(function() {
      send(ws, "note", {
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
        console.log(data);
      },
      error: function (req, status, err) {
        console.log(err);
      }
    });
  });

}
