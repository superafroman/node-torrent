
var bencode = require('../util/bencode'),
    crypto = require("crypto"),
    util = require('util'),
    BitField = require('../util/bitfield')
    EventEmitter = require('events').EventEmitter,
    BufferUtils = require('../util/bufferutils');

var LOGGER = require('log4js').getLogger('metadata/metadata.js');

var loaders = {
  'http:': require('./http'),
  'https:': require('./http'),
  'file:': require('./file'),
  'magnet:': require('./magnet')
};

function Metadata(metadata) {
  EventEmitter.call(this);
  this.bitfield = null;
  this._encodedMetadata = null;
  this._length = 0;
  this.setMetadata(metadata);
}
util.inherits(Metadata, EventEmitter);

Metadata.prototype.isComplete = function() {
  if (!this.bitfield || this.bitfield.length === 0) {
    return false;
  }
  return this.bitfield.cardinality() === this.bitfield.length;
};

Metadata.prototype.hasLength = function() {
  return this._length > 0;
};

Metadata.prototype.setLength = function(length) {
  this._length = length;
  this.bitfield = new BitField(Math.ceil(length / Metadata.BLOCK_SIZE));
  this._encodedMetadata = new Buffer(length);
};

Metadata.prototype.setMetadata = function(_metadata) {

  var metadata = this;
  metadata._metadata = _metadata;

  Object.keys(_metadata).forEach(function(key) {
    metadata[key] = _metadata[key];
  });

  if (this.files) {
    this._encodedMetadata = new Buffer(bencode.encode(_metadata));
    this.setLength(this._encodedMetadata.length);
    this.bitfield.setAll();
  } else {
    this.setLength(0);
  }

  if (!this.infoHash) {
    this.infoHash = new Buffer(crypto.createHash('sha1')
      .update(bencode.encode(_metadata.info))
      .digest(), 'binary');
  }
};

Metadata.prototype.setPiece = function(index, data) {
  if (this.bitfield.isSet(index)) {
    return;
  }
  LOGGER.debug('Setting piece at index %d with %d bytes', index, data.length);
  this.bitfield.set(index);
  data.copy(this._encodedMetadata, index * Metadata.BLOCK_SIZE, 0, data.length);
  if (this.isComplete()) {
    this.setMetadata(bencode.decode(this._encodedMetadata.toString('binary')));
  }
};

Metadata.loadMetadata = function(url, callback) {
  var parsedUrl = require('url').parse(url),
      protocol = parsedUrl.protocol || 'file:'
      loader = loaders[protocol];

  if (!loader) {
    callback(new Error('No metadata loader for given URL, URL = ' + url));
  } else {
    loader.load(url, function(error, metadata) {
      if (error) {
        callback(error);
      } else {
        callback(null, new Metadata(metadata));
      }
    });
  }
};

Metadata.BLOCK_SIZE = 16384;

module.exports = exports = Metadata;
