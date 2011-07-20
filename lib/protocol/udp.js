
var dgram = require('dgram');

var BufferUtils = require('../util/bufferutils');

var CONNECTION_ID = BufferUtils.concat(BufferUtils.fromInt(0x417), BufferUtils.fromInt(0x27101980));
var LOGGER = require('log4js').getLogger('udp.js');

// Actions
var Action = {
  CONNECT: 0,
  ANNOUNCE: 1,
  SCRAPE: 2,
  ERROR: 3
};

function generateTransactionId() {
  var transactionId = new Buffer(4);
  transactionId[0] = Math.random() * 255;
  transactionId[1] = Math.random() * 255;
  transactionId[2] = Math.random() * 255;
  transactionId[3] = Math.random() * 255;
  return transactionId;
}

module.exports = function(tracker, data, cb) {

  var port = tracker.url.port;
  var host = tracker.url.host;

  var connectionId;
  var transactionId;

  var socket = dgram.createSocket('udp4', function(msg, peer) {
    var action = BufferUtils.readInt(msg);
    var serverTransactionId = BufferUtils.readInt(msg, 4);
    if (serverTransactionId === transactionId) {
      switch (action) {
        case Action.CONNECT:
          connectionId = BufferUtils.subBuffer(msg, 8, 16);
//          announce();
          break;
        case Action.ANNOUNCE:
          break;
        case Action.SCRAPE:
          break;
        case Action.ERROR:
          var message = BufferUtils.subBuffer(msg, 8, msg.length);
          cb(new Error(message.toString('utf8')));
          break;
        default:
          LOGGER.warn('Unknown action received from server.  Action = ' + action);
      }
    } else {
      cb(new Error('Received invalid transactionId from server.'));
    }
  });

  transactionId = generateTransactionId();
  
  var packet = BufferUtils.concat(CONNECTION_ID, BufferUtils.fromInt(Action.CONNECT), transactionId);
  socket.send(packet, 0, packet.length, port, host);
}

