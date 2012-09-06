
var dgram = require('dgram');

var BufferUtils = require('../util/bufferutils');

var CONNECTION_ID = BufferUtils.concat(
  BufferUtils.fromInt(0x417), 
  BufferUtils.fromInt(0x27101980));
  
var LOGGER = require('log4js').getLogger('udp.js');

// Actions
var Action = {
  CONNECT: 0,
  ANNOUNCE: 1,
  SCRAPE: 2,
  ERROR: 3
};

function generateTransactionId() {
  var id = new Buffer(4);
  id[0] = Math.random() * 255;
  id[1] = Math.random() * 255;
  id[2] = Math.random() * 255;
  id[3] = Math.random() * 255;
  return id;
}

function announce(socket, transactionId, tracker, data, event, cb) {
  LOGGER.debug('sending announce request to UDP tracker at ' + tracker.url.hostname + ':' + tracker.url.port);
  var packet = BufferUtils.concat(tracker.connectionId, 
    BufferUtils.fromInt(Action.ANNOUNCE), 
    transactionId, data['info_hash'], data['peer_id'],
    BufferUtils.fromInt(0), BufferUtils.fromInt(data['downloaded'] || 0), // int64, TODO: split data into two parts etc
    BufferUtils.fromInt(0), BufferUtils.fromInt(data['left'] || 0), // 64
    BufferUtils.fromInt(0), BufferUtils.fromInt(data['uploaded'] || 0), //64
    BufferUtils.fromInt(event),
    BufferUtils.fromInt(0), 
    BufferUtils.fromInt(Math.random() * 255),
    BufferUtils.fromInt(200),
    BufferUtils.fromInt16(data['port'])
    );
  socket.send(packet, 0, packet.length, tracker.url.port, tracker.url.hostname, function(err) {
    LOGGER.debug('announce sent');
    if (err) {
      cb(err);
    }
  });
}

function handleAnnounceResponse(msg, cb) {

  var trackerInfo = {
    interval: BufferUtils.readInt(msg, 8),
    leechers: BufferUtils.readInt(msg, 12),
    seeders: BufferUtils.readInt(msg, 16),
    peers: []
  };

  var i = 20;
  while (i < msg.length) {
    var ip = msg[i] + '.' + msg[i + 1] + '.' + msg[i + 2] + '.' + msg[i + 3];
    var port = msg[i + 4] << 8 | msg[i + 5];
    LOGGER.debug('Parsed peer with details: ' + ip + ':' + port);
    trackerInfo.peers.push({ip: ip, port: port});
    i += 6;
  }

  cb(trackerInfo);
}

function connect(socket, transactionId, tracker, data, event, cb) {
  LOGGER.debug('sending connect request to UDP tracker at ' + tracker.url.hostname + ':' + tracker.url.port);
  var packet = BufferUtils.concat(CONNECTION_ID, BufferUtils.fromInt(Action.CONNECT), transactionId);
  socket.send(packet, 0, packet.length, tracker.url.port, tracker.url.hostname, function(err) {
    LOGGER.debug('connect sent');
    if (err) {
      cb(err);
    }
  });
}

module.exports = function(tracker, data, event, cb) {

  var transactionId;

  var socket = dgram.createSocket('udp4', function(msg, rinfo) {
    var action = BufferUtils.readInt(msg);
    var serverTransactionId = BufferUtils.slice(msg, 4, 8);
    if (BufferUtils.equal(serverTransactionId, transactionId)) {
      switch (action) {
        case Action.CONNECT:
          tracker.connectionId = BufferUtils.slice(msg, 8, 16);
          LOGGER.debug('Received connectionId from server, id = ' + tracker.connectionId);
          transactionId = generateTransactionId();
          announce(socket, transactionId, tracker, data, event, cb);
          break;
        case Action.ANNOUNCE:
          LOGGER.debug('Received announce response.');
          handleAnnounceResponse(msg, cb);
          break;
        case Action.SCRAPE:
          break;
        case Action.ERROR:
          LOGGER.debug('Received error from server.');
          var message = BufferUtils.slice(msg, 8, msg.length);
          cb(new Error(message.toString('utf8')));
          break;
        default:
          LOGGER.warn('Unknown action received from server.  Action = ' + action);
      }
    } else {
      cb(new Error('Received invalid transactionId from server.'));
    }
  }).on('error', function(e) {
    cb(new Error(e.message));
  });

  transactionId = generateTransactionId();
  
  if (tracker.connectionId) {
    announce(socket, transactionId, tracker, data, event, cb);
  } else {
    connect(socket, transactionId, tracker, data, event, cb);
  }
};


