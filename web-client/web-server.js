var http = require('http');
var fs = require('fs');
var util = require('util');


// var Client = require('node-torrent');
// var client = new Client({logLevel: 'DEBUG'});
// var torrent = client.addTorrent('a.torrent');

// when the torrent completes, move it's files to another area
// torrent.on('complete', function() {
//     console.log('complete!');
//     torrent.files.forEach(function(file) {
//         var newPath = '/new/path/' + file.path;
//         fs.rename(file.path, newPath);
//         // while still seeding need to make sure file.path points to the right place
//         file.path = newPath;
//     });
// });

http.createServer(function (req, res) {
	var self = this;

  	res.writeHead(200, {'Content-Type': 'text/html'});
  	var file = fs.createReadStream('Documents/GitHub/node-torrent/web-client/assets/index.html');
    file.on('data', res.write.bind(res));
    file.on('close', function() {
      res.end();
    });
    file.on('error', function(error) {
      res.end(error.message);
    });
}).listen(1337, "127.0.0.1");

console.log('Server running at http://127.0.0.1:1337/');