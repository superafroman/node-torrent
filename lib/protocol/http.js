var http = require('http');

module.exports = function(tracker, data, cb) {

  var query = '?info_hash=' + escape(data['info_hash'].toString('binary')) +
              '&peer_id=' + escape(data['peer_id'].toString('binary')) +
              '&port=' + data['port'] +
              '&uploaded=' + data['uploaded'] +
              '&downloaded=' + data['downloaded'] +
              '&left=' + data['left'] +
              '&compact=1' +
              '&numwant=200' +
              '&event=' + event || 'empty';
  
  if (torrent.trackerId) {
    query += '&trackerid=' + torrent.trackerId;
  }

  var options = {
      host: torrent.url.hostname,
      path: torrent.url.pathname + query,
      port: torrent.url.port
  };

  var req = http.get(options, function(res) {
    var buffers = [];
    var length = 0;
    res.on('data', function(chunk) {
      buffers.push(chunk);
      length += chunk.length;
    });
    res.on('end', function() {
      var body = new Buffer(length);
      var pos = 0;
      for (var i = 0; i < buffers.length; i++) {
        body.write(buffers[i].toString('binary'), pos, 'binary');
        pos += buffers[i].length;
      }
      var response = bencode.decode(body.toString('binary'));
      if (response['failure reason']) {
        cb(new Error(response['failure reason']));
      } else {
        var trackerInfo = {
          trackerId: response['tracker id'],
          interval: response['interval'],
          seeders: response.complete,
          leechers: response.leechers,
          peers: []
        };

        if (response.peers) {
          var peers = new Buffer(response.peers, 'binary');
          for (var i = 0; i < peers.length; i += 6) {
            var ip = peers[i] + '.' + peers[i + 1] + '.' + peers[i + 2] + '.' + peers[i + 3];
            var port = peers[i + 4] << 8 | peers[i + 5];
            trackerInfo.peers.push({
              ip: ip,
              port: port
            });
          }
        }   
        cb(trackerInfo);
      }
    });
  });
  req.on('error', function(e) {
    cb(new Error(e.message));
  });
};

