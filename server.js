var express = require('express');
var ws = require('websocket');
var proc = require('child_process');

var mk = proc.spawn('make');
mk.on('message', function(x) {
  console.log(x);
});
mk.stdout.on('data', function (data) {
  data = data.toString().replace(/\n$/, '');
  console.log('OUT ' + data);
});
mk.stderr.on('data', function (data) {
  data = data.toString().replace(/\n$/, '');
  console.log('ERR ' + data);
});

var app = express();
app.use('/', express.static('public'));

var port = 8081
app.listen(port);
console.log('Express started on port ' + port);
