var express = require('express');
var bodyParser = require('body-parser');
var proc = require('child_process');
var song = require('./beepbox/song');

var mk = proc.spawn('make', process.argv.slice(2));
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
app.use(bodyParser.text({type: "text/plain"}));

app.use('/', express.static('public'));
app.use('/parse', function(req, res) {
  res.send(song.string_to_song(req.body));
  res.end(200);
});

var port = 8081
app.listen(port, '127.0.0.1');
console.log('Express started on port ' + port);
