
var bencode = require('../util/bencode'),
    util = require('util');

var DHT = require('../dht'),
    DefaultRequestStrategy = require('../requeststrategy/default'),
    EventEmitter = require('events').EventEmitter,
    Metadata = require('../metadata'),
    MetadataRequestStrategy = require('../requeststrategy/metadata'),
    Peer = require('../peer'),
    Piece = require('../piece'),
    ProcessUtils = require('../util/processutils'),
    Tracker = require('../tracker');

var LOGGER = require('log4js').getLogger('torrent.js');

function Torrent(clientId, clientPort, metadataUrl, downloadPath) {
  EventEmitter.call(this);

  this.clientId = clientId;
  this.clientPort = clientPort;

  this.infoHash = null;
  this.name = null;
  
  this.stats = {};
  this.status = Torrent.STATUS_LOADING;
  this.peers = {};
  this.trackers = [];

  this._metadata = null;
  this._requestStrategy = null;
  this._files = [];
  this._pieces = [];

  var torrent = this;
  Metadata.loadMetadata(metadataUrl, function(error, metadata) {
    if (error) {
      torrent.emit('error', error);
      torrent.status = Torrent.STATUS_LOAD_ERROR;
    } else {
      torrent._metadata = metadata;
      torrent._initialise();
    }
  });   
}
util.inherits(Torrent, EventEmitter);

Torrent.prototype.start = function() {
  LOGGER.debug('Starting torrent.');
  var torrent = this;
  var callback = function(id, address, port) {torrent.addPeer(id, address, port)}; //this.addPeer.bind(this);
  DHT.advertise(this.infoHash, callback);
  this.trackers.forEach(function(tracker) {
    tracker.start(callback);
  });
};
    
Torrent.prototype.stop = function() {

};

Torrent.prototype.addPeer = function(/* peer | id, address, port */) {
  
  var peer = null,
      torrent = this;

  if (arguments.length === 1) {
    peer = arguments[0];
  } else {
    var id = arguments[0],
        address = arguments[1]
        port = arguments[2];
    
    peer = new Peer(id, address, port, this);
  }
  
  LOGGER.debug('Adding peer, id = ' + peer.getIdentifier());

  if (!(peer.getIdentifier() in this.peers)) {
    this.peers[peer.getIdentifier()] = peer;
    peer.once(Peer.CONNECT, function() {
      LOGGER.debug('CONNECT to ' + peer.getIdentifier());
      if (torrent.bitfield) {
        peer.sendMessage(new Message(Message.BITFIELD, torrent.bitfield.toBuffer()));
      }
    });
    peer.once(Peer.DISCONNECT, function() {
      LOGGER.debug('DISCONNECT from ' + peer.getIdentifier());
      torrent._requestStrategy.peerDisconnected(peer);
      peer.removeAllListeners(Peer.CHOKED);
      peer.removeAllListeners(Peer.CONNECT);
      peer.removeAllListeners(Peer.DISCONNECT);
      peer.removeAllListeners(Peer.READY);
      peer.removeAllListeners(Peer.UPDATED);
      delete torrent.peers[peer.getIdentifier()];
    });
    peer.on(Peer.READY, function() {
      torrent._requestStrategy.peerReady(peer);
    });
    peer.on(Peer.UPDATED, function() {
      var interested = !torrent.bitfield || (peer.bitfield.xor(peer.bitfield.and(torrent.bitfield)).setIndices().length > 0);
      LOGGER.debug('UPDATED: ' + (interested ? 'interested' : 'not interested') + ' in ' + peer.address + ':' + peer.port);
      peer.setAmInterested(interested);
    });
  }
};

Torrent.prototype._initialise = function() {

  this.name = this._metadata.info.name;
  this.infoHash = this._metadata.infoHash;
  this.trackers = createTrackers(this, this._metadata);
  
  if (this._metadata.isComplete()) {
    this._requestStrategy = new DefaultRequestStrategy();
    // TorrentUtils.createFiles(downloadPath, metadata, function(error, _files) {
    //   if (error) {
    //     torrent.emit('error', error);
    //     torrent.status = Torrent.STATUS_LOAD_ERROR;
    //   } else {         
    //     files = _files; 
    //   }
    // });
    // downloadStrategy = new RandomDownloadStrategy(torrent);
  } else {
    this._requestStrategy = new MetadataRequestStrategy(this._metadata);
    this._metadata.once('complete', function() {
      torrent._initialise();
    });
  }
  var torrent = this;
  ProcessUtils.nextTick(function() {
    torrent.emit('ready');
  });
};

Object.defineProperty(Torrent, 'STATUS_LOADING',     { value: 'loading',     enumerable: true });
Object.defineProperty(Torrent, 'STATUS_READY',       { value: 'ready',       enumerable: true });
Object.defineProperty(Torrent, 'STATUS_LOAD_ERROR',  { value: 'load_error',  enumerable: true });

module.exports = exports = Torrent;



/**
 * Create files defined in the given metadata.
 */
function createFiles(downloadPath, metadata, callback) {
  var processedFiles = [],
      length = 0;
  if (metadata.info.length) {
      length = metadata.info.length;
      processedFiles.push(new File(path.join(downloadPath, metadata.info.name), length, null, function(err) {
        if (err) {
          callback(new Error('Error creating file, err = ' + err));
        }
        callback(null, processedFiles, length);
      }));
  } else {
    var basePath = path.join(downloadPath, metadata.info.name);
    fs.exists(basePath, function(exists) {
      function doCreate() {
        var files = metadata.info.files,
            offset = 0;
        (function nextFile() {
          if (files.length === 0) {
            callback(null, processedFiles, length);
          } else {
            var file = files.shift();
            (function checkPath(curPath, pathArr) {
              if (pathArr.length == 1) {
                processedFiles.push(new File(path.join(curPath, pathArr[0]),
                  file.length, offset, function(err) {
                    if (err) {
                      return cb(new Error('Error creating file, err = ' + err));
                    }
                    length += file.length;
                    offset += file.length;
                    ProcessUtils.nextTick(nextFile);
                  }));
              }
              else {
                curPath = path.join(curPath, pathArr.shift());
                fs.exists(curPath, function(curPathExists) {
                  if (!curPathExists) {
                    fs.mkdir(curPath, 0777, function(err) {
                      if (err) {
                        return callback(new Error("Couldn't create directory. err = " + err));
                      }
                      checkPath(curPath, pathArr);
                    });
                  } else {
                    checkPath(curPath, pathArr);
                  }
                });
              }
            })(basePath, file.path.slice(0));
          }
        })();
      }
      if (!exists) {
        fs.mkdir(basePath, 0777, function(err) {
          if (err) {
            return callback(new Error("Couldn't create directory. err = " + err));
          }
          doCreate();
        });
      } else {
        doCreate();
      }
    });
  }
}

// function createPieces(self, hashes, cb) {
//   self.pieces = [];
//   var numPieces = hashes.length / 20;
//   var index = 0;
//   (function create() {
//     if (index === numPieces) {
//       LOGGER.debug('Finished validating pieces.  Number of valid pieces = '
//         + self.bitfield.cardinality()
//         + ' out of a total of '
//         + self.bitfield.length);
//       cb(self.bitfield.cardinality() === self.bitfield.length);
//     } else {
//       var hash = hashes.substr(index * 20, 20);
//       var pieceLength = self.pieceLength;
//       if (index == numPieces - 1) {
//         pieceLength = self.size % self.pieceLength;
//       }
//       var piece = new Piece(index, index * self.pieceLength, pieceLength, hash,
//         self.files, function(piece) {
//         if (piece.isComplete) {
//           self.bitfield.set(piece.index);
//         } else {
//           piece.once(Piece.COMPLETE, function() {
//             pieceComplete(self, piece);
//           });
//         }
//         index++;
//         create();
//       });
//       self.pieces[index] = piece;
//     }
//   })();
// }

function createTrackers(torrent, metadata) {

  var trackers = [],
      dedupeMap = {};

  var announceList = metadata['announce-list'] || [];
  if (metadata['announce']) {
    announceList.push(metadata['announce']);
  }

  for (var i = 0; i < announceList.length; i++) {
    dedupeMap[announceList[i]] = 0;
  }

  for (var j in dedupeMap) {
    trackers.push(new Tracker(j, torrent));
  }

  return trackers;
}
